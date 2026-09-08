import { prisma } from '../../../core/database/prisma.js';
import { enqueueLedgerPosting } from '../../../core/queue/ledgerPostingQueue.js';
import { ledgerPostingProcessor } from '../../../workers/ledgerPostingProcessor.js';
import {
  UnbalancedEntryError,
  ValidationError,
  NotFoundError,
} from '../../../core/errors/index.js';
import type {
  JournalEntry,
  JournalLine,
  VoucherType,
  EntrySource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Input Types ──────────────────────────────────────────────────────────

export interface JournalLineInput {
  accountId: string;
  debitAmount: number | string;
  creditAmount: number | string;
}

export interface CreateJournalEntryInput {
  date: string | Date;
  narration: string;
  voucherType: VoucherType;
  source?: EntrySource;
  lines: JournalLineInput[];
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: (JournalLine & { account: { id: string; name: string; type: string } })[];
}

export interface LedgerRow {
  date: Date;
  narration: string;
  voucherType: string;
  debitAmount: Decimal;
  creditAmount: Decimal;
  runningBalance: Decimal;
  journalEntryId: string;
}

// ─── Journal Entry Model (Fat — owns the BALANCE INVARIANT) ──────────────

export const JournalEntryModel = {
  /**
   * Create a new journal entry with its lines.
   *
   * THIS IS THE CRITICAL METHOD. The balance invariant is enforced here:
   *   SUM(debitAmount) === SUM(creditAmount)
   *
   * An entry that doesn't balance is NEVER committed.
   *
   * Flow:
   * 1. Validate all lines' accounts belong to the user
   * 2. Check balance invariant IN MEMORY (before any DB write)
   * 3. Validate each line has exactly one of debit/credit > 0
   * 4. Atomic write: JournalEntry + all JournalLines in one transaction
   * 5. Enqueue ledger-posting job (Phase B)
   * 6. Return the created entry
   */
  async create(
    userId: string,
    input: CreateJournalEntryInput
  ): Promise<JournalEntryWithLines> {
    const { date, narration, voucherType, source = 'MANUAL', lines } = input;

    // ── Validate inputs ──────────────────────────────────────────────

    if (!lines || lines.length < 2) {
      throw new ValidationError('A journal entry requires at least 2 lines', {
        lines: ['Minimum 2 lines required'],
      });
    }

    if (!narration || narration.trim().length === 0) {
      throw new ValidationError('Narration is required', {
        narration: ['Cannot be empty'],
      });
    }

    // Parse amounts to Decimal safely
    const parsedLines = lines.map((line, i) => {
      if (!line.accountId || typeof line.accountId !== 'string' || line.accountId.trim().length === 0) {
        throw new ValidationError(`Line ${i + 1}: accountId is required`, {
          [`lines[${i}]`]: ['accountId is required and must be a valid string'],
        });
      }

      let debit: Decimal;
      let credit: Decimal;
      try {
        debit = line.debitAmount !== undefined && line.debitAmount !== null && line.debitAmount !== ''
          ? new Decimal(line.debitAmount)
          : new Decimal(0);
        credit = line.creditAmount !== undefined && line.creditAmount !== null && line.creditAmount !== ''
          ? new Decimal(line.creditAmount)
          : new Decimal(0);
      } catch {
        throw new ValidationError(`Line ${i + 1}: debit and credit amounts must be valid numbers`, {
          [`lines[${i}]`]: ['Must be valid numeric values'],
        });
      }

      if (debit.isNaN() || !debit.isFinite() || credit.isNaN() || !credit.isFinite()) {
        throw new ValidationError(`Line ${i + 1}: amounts must be finite numbers`, {
          [`lines[${i}]`]: ['Amounts cannot be NaN or Infinity'],
        });
      }

      // Each line must have exactly one of debit or credit > 0
      if (debit.gt(0) && credit.gt(0)) {
        throw new ValidationError(
          `Line ${i + 1}: cannot have both debit and credit amounts`,
          { [`lines[${i}]`]: ['Only one of debitAmount or creditAmount can be positive'] }
        );
      }

      if (!debit.gt(0) && !credit.gt(0)) {
        throw new ValidationError(
          `Line ${i + 1}: must have either a debit or credit amount`,
          { [`lines[${i}]`]: ['One of debitAmount or creditAmount must be positive'] }
        );
      }

      if (debit.isNegative() || credit.isNegative()) {
        throw new ValidationError(
          `Line ${i + 1}: amounts cannot be negative`,
          { [`lines[${i}]`]: ['Amounts must be zero or positive'] }
        );
      }

      if (debit.gt('1000000000000') || credit.gt('1000000000000')) {
        throw new ValidationError(
          `Line ${i + 1}: amount exceeds maximum allowed limit`,
          { [`lines[${i}]`]: ['Cannot exceed 1,000,000,000,000'] }
        );
      }

      return {
        accountId: line.accountId.trim(),
        debitAmount: debit,
        creditAmount: credit,
      };
    });

    // ── BALANCE INVARIANT CHECK (in memory, before any write) ────────

    const totalDebits = parsedLines.reduce(
      (sum, line) => sum.plus(line.debitAmount),
      new Decimal(0)
    );
    const totalCredits = parsedLines.reduce(
      (sum, line) => sum.plus(line.creditAmount),
      new Decimal(0)
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new UnbalancedEntryError(
        undefined,
        totalDebits.toString(),
        totalCredits.toString()
      );
    }

    // ── Validate all accounts belong to this user ────────────────────

    const accountIds = [...new Set(parsedLines.map((l) => l.accountId))];
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: accountIds },
        userId,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map((a) => a.id));
      const missingIds = accountIds.filter((id) => !foundIds.has(id));
      throw new ValidationError('One or more accounts not found or not owned by user', {
        accounts: missingIds.map((id) => `Account ${id} not found`),
      });
    }

    // ── Phase A: Atomic write (Journal Entry + Lines) ────────────────

    const entry = await prisma.$transaction(async (tx) => {
      const journalEntry = await tx.journalEntry.create({
        data: {
          userId,
          date: new Date(date),
          narration: narration.trim(),
          voucherType,
          source,
          lines: {
            create: parsedLines.map((line) => ({
              accountId: line.accountId,
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
            })),
          },
        },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, name: true, type: true },
              },
            },
          },
        },
      });

      return journalEntry;
    });

    // ── Enqueue Phase B (ledger posting with fault-tolerant fallback) ──
    try {
      await enqueueLedgerPosting(entry.id);
    } catch (queueErr) {
      console.warn(`[JournalEntryModel] Queue enqueue failed for entry ${entry.id}, falling back to inline processor:`, queueErr);
      try {
        await ledgerPostingProcessor({ data: { journalEntryId: entry.id } } as any);
      } catch (fallbackErr) {
        console.error(`[JournalEntryModel] Inline posting fallback failed for entry ${entry.id}:`, fallbackErr);
      }
    }

    return entry as JournalEntryWithLines;
  },

  /**
   * Get a single journal entry with its lines.
   */
  async getById(
    entryId: string,
    userId: string
  ): Promise<JournalEntryWithLines> {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, userId },
      include: {
        lines: {
          include: {
            account: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundError('Journal Entry', entryId);
    }

    return entry as JournalEntryWithLines;
  },

  /**
   * List journal entries for a user, optionally filtered by date range.
   */
  async list(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      voucherType?: VoucherType;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ entries: JournalEntryWithLines[]; total: number }> {
    const { startDate, endDate, voucherType, page = 1, pageSize = 25 } = options;

    const where = {
      userId,
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(voucherType ? { voucherType } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, name: true, type: true },
              },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return {
      entries: entries as JournalEntryWithLines[],
      total,
    };
  },

  /**
   * Get the ledger (journal lines) for a specific account,
   * in date order, with running balance.
   */
  async getAccountLedger(
    accountId: string,
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ rows: LedgerRow[]; total: number; openingBalance: Decimal }> {
    const { startDate, endDate, page = 1, pageSize = 50 } = options;

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundError('Account', accountId);
    }

    // Calculate opening balance (sum of all lines before startDate)
    let openingBalance = new Decimal(0);
    if (startDate) {
      const priorResult = await prisma.journalLine.aggregate({
        where: {
          accountId,
          journalEntry: {
            userId,
            date: { lt: startDate },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const priorDebits = priorResult._sum.debitAmount ?? new Decimal(0);
      const priorCredits = priorResult._sum.creditAmount ?? new Decimal(0);
      openingBalance = priorDebits.minus(priorCredits);
    }

    // Build date filter
    const dateFilter = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };

    // Get lines with pagination
    const where = {
      accountId,
      journalEntry: {
        userId,
        ...(startDate || endDate ? { date: dateFilter } : {}),
      },
    };

    const [lines, total] = await Promise.all([
      prisma.journalLine.findMany({
        where,
        include: {
          journalEntry: {
            select: {
              date: true,
              narration: true,
              voucherType: true,
              id: true,
            },
          },
        },
        orderBy: {
          journalEntry: { date: 'asc' },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.journalLine.count({ where }),
    ]);

    // Build running balance with cross-page continuity
    let balance = openingBalance;
    const skipCount = (page - 1) * pageSize;

    if (skipCount > 0) {
      const priorPageLines = await prisma.journalLine.findMany({
        where,
        select: {
          debitAmount: true,
          creditAmount: true,
        },
        orderBy: {
          journalEntry: { date: 'asc' },
        },
        take: skipCount,
      });

      for (const pl of priorPageLines) {
        balance = balance
          .plus(pl.debitAmount ?? new Decimal(0))
          .minus(pl.creditAmount ?? new Decimal(0));
      }
    }

    const rows: LedgerRow[] = lines.map((line) => {
      const debit = line.debitAmount ?? new Decimal(0);
      const credit = line.creditAmount ?? new Decimal(0);
      balance = balance.plus(debit).minus(credit);

      return {
        date: line.journalEntry.date,
        narration: line.journalEntry.narration,
        voucherType: line.journalEntry.voucherType,
        debitAmount: debit,
        creditAmount: credit,
        runningBalance: balance,
        journalEntryId: line.journalEntry.id,
      };
    });

    return { rows, total, openingBalance };
  },
};
