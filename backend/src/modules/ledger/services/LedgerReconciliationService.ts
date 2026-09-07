import { prisma } from '../../../core/database/prisma.js';
import { ledgerPostingProcessor } from '../../../workers/ledgerPostingProcessor.js';
import { Decimal } from '@prisma/client/runtime/library';

export interface UnpostedReconciliationResult {
  totalUnposted: number;
  reconciledCount: number;
  errorCount: number;
  entryIds: string[];
}

export interface DiscrepancyDetail {
  accountId: string;
  accountName: string;
  previousBalance: string;
  correctedBalance: string;
  discrepancy: string;
}

export interface BalanceAuditResult {
  totalAccounts: number;
  discrepanciesRepaired: number;
  isBalanced: boolean;
  details: DiscrepancyDetail[];
}

export const LedgerReconciliationService = {
  /**
   * Scans for any unposted journal entries (postedAt == null) and posts them.
   * Ensures eventual consistency if workers or background queues experienced temporary network faults.
   */
  async reconcileUnpostedEntries(userId?: string): Promise<UnpostedReconciliationResult> {
    const unposted = await prisma.journalEntry.findMany({
      where: {
        postedAt: null,
        ...(userId ? { userId } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let reconciledCount = 0;
    let errorCount = 0;
    const entryIds: string[] = [];

    for (const entry of unposted) {
      try {
        await ledgerPostingProcessor({
          data: { journalEntryId: entry.id },
        } as any);
        reconciledCount++;
        entryIds.push(entry.id);
      } catch (err) {
        console.error(`[LedgerReconciliationService] Failed to reconcile entry ${entry.id}:`, err);
        errorCount++;
      }
    }

    return {
      totalUnposted: unposted.length,
      reconciledCount,
      errorCount,
      entryIds,
    };
  },

  /**
   * Audits all account cached balances against the single source of truth (sum of posted journal lines).
   * Automatically repairs any divergence and returns audit details.
   */
  async auditAndRepairAccountBalances(userId: string): Promise<BalanceAuditResult> {
    const accounts = await prisma.account.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        cachedBalance: true,
      },
    });

    const details: DiscrepancyDetail[] = [];
    let discrepanciesRepaired = 0;
    const now = new Date();

    for (const acc of accounts) {
      // Aggregate true balance from all posted lines
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            postedAt: { not: null },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const totalDebits = agg._sum.debitAmount ? new Decimal(agg._sum.debitAmount.toString()) : new Decimal(0);
      const totalCredits = agg._sum.creditAmount ? new Decimal(agg._sum.creditAmount.toString()) : new Decimal(0);
      const trueBalance = totalDebits.minus(totalCredits);

      const cached = new Decimal(acc.cachedBalance.toString());

      if (!cached.equals(trueBalance)) {
        // Discrepancy detected — repair atomically
        await prisma.account.update({
          where: { id: acc.id },
          data: {
            cachedBalance: trueBalance,
            postedThrough: now,
          },
        });

        discrepanciesRepaired++;
        details.push({
          accountId: acc.id,
          accountName: acc.name,
          previousBalance: cached.toString(),
          correctedBalance: trueBalance.toString(),
          discrepancy: trueBalance.minus(cached).toString(),
        });
      }
    }

    return {
      totalAccounts: accounts.length,
      discrepanciesRepaired,
      isBalanced: discrepanciesRepaired === 0,
      details,
    };
  },
};
