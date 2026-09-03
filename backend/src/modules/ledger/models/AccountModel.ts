import { prisma } from '../../../core/database/prisma.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../../core/errors/index.js';
import type {
  Account,
  AccountType,
  AccountSubtype,
  CashFlowCategory,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Input Types ──────────────────────────────────────────────────────────

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  personId?: string;
  cashFlowCategory?: CashFlowCategory;
}

export interface AccountWithBalance extends Account {
  liveBalance?: Decimal;
}

// ─── Account Model (Fat — owns chart-of-accounts business rules) ─────────

export const AccountModel = {
  /**
   * Create a new account in the chart of accounts.
   * Validates uniqueness per user and ensures person accounts
   * have a linked person.
   */
  async create(
    userId: string,
    input: CreateAccountInput
  ): Promise<Account> {
    // Validate person linkage
    if (input.subtype === 'PERSON' && !input.personId) {
      throw new ValidationError('Person accounts require a personId', {
        personId: ['Required for PERSON subtype accounts'],
      });
    }

    if (input.subtype !== 'PERSON' && input.personId) {
      throw new ValidationError('Only PERSON subtype accounts can have a personId', {
        personId: ['Not allowed for this account subtype'],
      });
    }

    // Check uniqueness
    const existing = await prisma.account.findUnique({
      where: { userId_name: { userId, name: input.name } },
    });
    if (existing) {
      throw new ConflictError(`Account "${input.name}" already exists`);
    }

    return prisma.account.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        subtype: input.subtype,
        personId: input.personId,
        cashFlowCategory: input.cashFlowCategory ?? 'NONE',
      },
    });
  },

  /**
   * List accounts for a user, optionally filtered by type/subtype.
   */
  async list(
    userId: string,
    filters?: { type?: AccountType; subtype?: AccountSubtype }
  ): Promise<Account[]> {
    return prisma.account.findMany({
      where: {
        userId,
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.subtype ? { subtype: filters.subtype } : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { person: true },
    });
  },

  /**
   * Get a single account with its balance.
   * If the cached balance might be stale, computes a live balance
   * from journal_lines as fallback.
   */
  async getWithBalance(
    accountId: string,
    userId: string
  ): Promise<AccountWithBalance> {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      include: { person: true },
    });

    if (!account) {
      throw new NotFoundError('Account', accountId);
    }

    // Check if there are unposted entries affecting this account
    const unpostedCount = await prisma.journalLine.count({
      where: {
        accountId,
        journalEntry: { postedAt: null },
      },
    });

    if (unpostedCount > 0) {
      // Compute live balance from journal_lines
      const result = await prisma.journalLine.aggregate({
        where: {
          accountId,
          journalEntry: { userId },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const debitSum = result._sum.debitAmount ?? new Decimal(0);
      const creditSum = result._sum.creditAmount ?? new Decimal(0);

      return {
        ...account,
        liveBalance: debitSum.minus(creditSum),
      };
    }

    return account;
  },

  /**
   * Get chart of accounts grouped by type.
   */
  async getChartOfAccounts(userId: string): Promise<Record<string, Account[]>> {
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { person: true },
    });

    const grouped: Record<string, Account[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      INCOME: [],
      EXPENSE: [],
    };

    for (const account of accounts) {
      grouped[account.type].push(account);
    }

    return grouped;
  },

  /**
   * Get account by ID, verifying it belongs to the user.
   */
  async getById(accountId: string, userId: string): Promise<Account> {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      include: { person: true },
    });

    if (!account) {
      throw new NotFoundError('Account', accountId);
    }

    return account;
  },

  /**
   * Get accounts by subtype (e.g., all CASH_BANK accounts for a user).
   */
  async getBySubtype(
    userId: string,
    subtype: AccountSubtype
  ): Promise<Account[]> {
    return prisma.account.findMany({
      where: { userId, subtype },
      orderBy: { name: 'asc' },
    });
  },
};
