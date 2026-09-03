import { prisma } from '../../../core/database/prisma.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../../core/errors/index.js';
import type { Person, Account } from '@prisma/client';

// ─── Input Types ──────────────────────────────────────────────────────────

export interface CreatePersonInput {
  name: string;
  phone?: string;
  address?: string;
  label?: string;
}

export interface PersonWithAccount extends Person {
  accounts: Account[];
}

// ─── Person Model ─────────────────────────────────────────────────────────

export const PersonModel = {
  /**
   * Create a new person (contact/counterparty).
   * Automatically creates a linked account (type=ASSET, subtype=PERSON).
   * The sign of the account's balance determines debtor vs creditor:
   *   - Positive (debit > credit) → they owe the user (Sundry Debtor)
   *   - Negative (credit > debit) → the user owes them (Sundry Creditor)
   */
  async create(
    userId: string,
    input: CreatePersonInput
  ): Promise<PersonWithAccount> {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Person name is required', {
        name: ['Cannot be empty'],
      });
    }

    // Check if an account with this person's name already exists
    const existingAccount = await prisma.account.findUnique({
      where: { userId_name: { userId, name: input.name.trim() } },
    });
    if (existingAccount) {
      throw new ConflictError(
        `An account named "${input.name.trim()}" already exists`
      );
    }

    // Atomic: create person + linked account
    const person = await prisma.$transaction(async (tx) => {
      const newPerson = await tx.person.create({
        data: {
          userId,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          label: input.label?.trim() || null,
        },
      });

      // Create the linked person account
      await tx.account.create({
        data: {
          userId,
          name: input.name.trim(),
          type: 'ASSET', // Default type; sign determines debtor/creditor
          subtype: 'PERSON',
          personId: newPerson.id,
          cashFlowCategory: 'INVESTING', // Person transactions are investing cash flows
        },
      });

      // Return with the account included
      return tx.person.findUniqueOrThrow({
        where: { id: newPerson.id },
        include: { accounts: true },
      });
    });

    return person;
  },

  /**
   * Find people by name (for disambiguation).
   * Returns all matches — the caller decides how to disambiguate.
   */
  async findByName(
    userId: string,
    name: string
  ): Promise<PersonWithAccount[]> {
    return prisma.person.findMany({
      where: {
        userId,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: { accounts: true },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * List all people for a user.
   */
  async list(userId: string): Promise<PersonWithAccount[]> {
    return prisma.person.findMany({
      where: { userId },
      include: { accounts: true },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Get a single person by ID.
   */
  async getById(
    personId: string,
    userId: string
  ): Promise<PersonWithAccount> {
    const person = await prisma.person.findFirst({
      where: { id: personId, userId },
      include: { accounts: true },
    });

    if (!person) {
      throw new NotFoundError('Person', personId);
    }

    return person;
  },
};
