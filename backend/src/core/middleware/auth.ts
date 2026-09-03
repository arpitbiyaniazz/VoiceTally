import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthenticationError } from '../errors/index.js';
import type { AuthenticatedRequest } from '../types/index.js';

interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from the Authorization header,
 * then attaches userId and userEmail to the request object.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthenticationError('Missing token');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    // Attach user info to request
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).userEmail = decoded.email;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
      return;
    }
    next(error);
  }
}
