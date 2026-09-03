import type { ApiResponse } from '../../../core/types/index.js';
import type { JournalEntryWithLines, LedgerRow } from '../models/JournalEntryModel.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Ledger View — serializes journal entries and account ledger data
 * into clean JSON for the frontend.
 */
export const LedgerView = {
  journalEntry(
    entry: JournalEntryWithLines
  ): ApiResponse {
    return {
      success: true,
      data: {
        id: entry.id,
        date: entry.date,
        narration: entry.narration,
        voucherType: entry.voucherType,
        source: entry.source,
        postedAt: entry.postedAt,
        createdAt: entry.createdAt,
        lines: entry.lines.map((line) => ({
          id: line.id,
          accountId: line.accountId,
          accountName: line.account.name,
          accountType: line.account.type,
          debitAmount: line.debitAmount.toString(),
          creditAmount: line.creditAmount.toString(),
        })),
        totals: {
          debit: entry.lines
            .reduce((sum, l) => sum.plus(l.debitAmount), new Decimal(0))
            .toString(),
          credit: entry.lines
            .reduce((sum, l) => sum.plus(l.creditAmount), new Decimal(0))
            .toString(),
        },
      },
    };
  },

  journalEntryList(result: {
    entries: JournalEntryWithLines[];
    total: number;
  }): ApiResponse {
    return {
      success: true,
      data: result.entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        narration: entry.narration,
        voucherType: entry.voucherType,
        source: entry.source,
        postedAt: entry.postedAt,
        createdAt: entry.createdAt,
        lines: entry.lines.map((line) => ({
          id: line.id,
          accountId: line.accountId,
          accountName: line.account.name,
          accountType: line.account.type,
          debitAmount: line.debitAmount.toString(),
          creditAmount: line.creditAmount.toString(),
        })),
      })),
      meta: {
        total: result.total,
      },
    };
  },

  accountLedger(result: {
    rows: LedgerRow[];
    total: number;
    openingBalance: Decimal;
  }): ApiResponse {
    return {
      success: true,
      data: {
        openingBalance: result.openingBalance.toString(),
        rows: result.rows.map((row) => ({
          date: row.date,
          narration: row.narration,
          voucherType: row.voucherType,
          debitAmount: row.debitAmount.toString(),
          creditAmount: row.creditAmount.toString(),
          runningBalance: row.runningBalance.toString(),
          journalEntryId: row.journalEntryId,
        })),
      },
      meta: {
        total: result.total,
      },
    };
  },
};
