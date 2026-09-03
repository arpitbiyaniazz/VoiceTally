import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../../core/database/prisma.js';
import { config } from '../../../core/config/index.js';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '../../../core/errors/index.js';
import type { User, Session } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

// ─── Default accounts created for every new user ──────────────────────────
const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'ASSET' as const, subtype: 'CASH_BANK' as const, cashFlowCategory: 'NONE' as const },
  { name: 'Bank', type: 'ASSET' as const, subtype: 'CASH_BANK' as const, cashFlowCategory: 'NONE' as const },
  { name: 'Opening Capital', type: 'EQUITY' as const, subtype: 'EQUITY_CAPITAL' as const, cashFlowCategory: 'NONE' as const },
];

// ─── Token Pair ───────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserWithoutPassword {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

// ─── User Model (Fat — owns auth business rules) ─────────────────────────

export const UserModel = {
  /**
   * Register a new user.
   * Creates the user + 3 default accounts (Cash, Bank, Opening Capital)
   * in a single atomic transaction.
   */
  async register(
    email: string,
    password: string,
    name: string
  ): Promise<UserWithoutPassword> {
    // Validate
    if (!email || !email.includes('@')) {
      throw new ValidationError('Invalid email', { email: ['Must be a valid email address'] });
    }
    if (!password || password.length < 8) {
      throw new ValidationError('Invalid password', {
        password: ['Must be at least 8 characters'],
      });
    }
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Invalid name', { name: ['Name is required'] });
    }

    // Check uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Atomic: create user + default accounts
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: name.trim(),
        },
      });

      // Create default accounts
      await tx.account.createMany({
        data: DEFAULT_ACCOUNTS.map((acc) => ({
          userId: newUser.id,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          cashFlowCategory: acc.cashFlowCategory,
        })),
      });

      return newUser;
    });

    return sanitizeUser(user);
  },

  /**
   * Authenticate a user by email + password.
   * Returns the user object if credentials are valid.
   */
  async authenticate(
    email: string,
    password: string
  ): Promise<UserWithoutPassword> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid email or password');
    }

    return sanitizeUser(user);
  },

  /**
   * Create a new session (access token + refresh token).
   * Refresh token is stored in the sessions table with a 7-day expiry.
   */
  async createSession(userId: string): Promise<TokenPair> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Generate access token (short-lived)
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: parseExpiry(config.jwtAccessExpiry) }
    );

    // Generate refresh token (long-lived, stored in DB)
    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  },

  /**
   * Refresh an expired access token using a valid refresh token.
   * Rotates the refresh token (old one is invalidated).
   */
  async refreshSession(refreshToken: string): Promise<TokenPair> {
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } });
      throw new AuthenticationError('Refresh token expired');
    }

    // Rotate: delete old session, create new one
    const newRefreshToken = uuidv4();
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    await prisma.$transaction([
      prisma.session.delete({ where: { id: session.id } }),
      prisma.session.create({
        data: {
          userId: session.userId,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    const accessToken = jwt.sign(
      { userId: session.user.id, email: session.user.email },
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiry }
    );

    return { accessToken, refreshToken: newRefreshToken };
  },

  /**
   * Revoke a session (logout).
   */
  async revokeSession(refreshToken: string): Promise<void> {
    await prisma.session.deleteMany({ where: { refreshToken } });
  },

  /**
   * Get user by ID (without password hash).
   */
  async getById(userId: string): Promise<UserWithoutPassword | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user ? sanitizeUser(user) : null;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitizeUser(user: User): UserWithoutPassword {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

/**
 * Parse expiry string (e.g. '15m', '7d', '1h') to seconds.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15 minutes
  const value = parseInt(match[1]);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
}
