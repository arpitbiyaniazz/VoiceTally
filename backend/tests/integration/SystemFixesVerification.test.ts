import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/core/database/prisma.js';
import { redis } from '../../src/core/redis/client.js';
import { JournalEntryModel } from '../../src/modules/ledger/models/JournalEntryModel.js';
import { AccountModel } from '../../src/modules/ledger/models/AccountModel.js';
import { ReportsModel } from '../../src/modules/ledger/models/ReportsModel.js';
import { ledgerPostingProcessor } from '../../src/workers/ledgerPostingProcessor.js';
import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';
import { Decimal } from '@prisma/client/runtime/library';

describe('System Fixes & Edge-Case Invariant Verification', () => {
  let userId: string;
  let cashAccountId: string;
  let revenueAccountId: string;

  beforeEach(async () => {
    // Generate a unique user for test isolation
    const user = await prisma.user.create({
      data: {
        email: `fix_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@voicetally.app`,
        passwordHash: 'hashed_pw_test',
        name: 'Fixes Tester',
      },
    });
    userId = user.id;

    // Create Cash and Revenue accounts
    const cashAcc = await AccountModel.create(userId, {
      name: 'Cash',
      type: 'ASSET',
      subtype: 'CASH_BANK',
      cashFlowCategory: 'OPERATING',
    });
    cashAccountId = cashAcc.id;

    const revAcc = await AccountModel.create(userId, {
      name: 'Consulting Revenue',
      type: 'INCOME',
      subtype: 'INCOME_CATEGORY',
      cashFlowCategory: 'OPERATING',
    });
    revenueAccountId = revAcc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Ledger Worker: Parallel/concurrent worker executions atomically claim entry and prevent double-incrementing cachedBalance', async () => {
    // Create an entry in DB without posting it yet
    const entry = await JournalEntryModel.create(userId, {
      date: new Date(),
      narration: 'Consulting Fee Received',
      voucherType: 'RECEIPT',
      lines: [
        { accountId: cashAccountId, debitAmount: 5000, creditAmount: 0 },
        { accountId: revenueAccountId, debitAmount: 0, creditAmount: 5000 },
      ],
    });

    // Reset postedAt to null to simulate pending queue job
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { postedAt: null },
    });
    await prisma.account.update({
      where: { id: cashAccountId },
      data: { cachedBalance: new Decimal(0) },
    });

    // Simulate two concurrent workers running ledgerPostingProcessor at the exact same millisecond
    const mockJob = { data: { journalEntryId: entry.id } } as any;

    await Promise.all([
      ledgerPostingProcessor(mockJob),
      ledgerPostingProcessor(mockJob),
      ledgerPostingProcessor(mockJob),
    ]);

    // Verify account balance is incremented EXACTLY ONCE (5000, not 10000 or 15000)
    const finalCashAcc = await prisma.account.findUnique({ where: { id: cashAccountId } });
    expect(parseFloat(finalCashAcc!.cachedBalance.toString())).toBe(5000);

    const finalEntry = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(finalEntry!.postedAt).not.toBeNull();
  });

  it('2. Financial Reports: Normalizes end-of-day bounds so transactions later in the day are captured', async () => {
    // Post transaction at 18:30:00 on 2026-09-30
    const eveningDate = new Date('2026-09-30T18:30:00.000Z');
    await JournalEntryModel.create(userId, {
      date: eveningDate,
      narration: 'Evening Sales Invoice',
      voucherType: 'RECEIPT',
      lines: [
        { accountId: cashAccountId, debitAmount: 7500, creditAmount: 0 },
        { accountId: revenueAccountId, debitAmount: 0, creditAmount: 7500 },
      ],
    });

    // Request P&L report using calendar date (midnight ISO: 2026-09-30T00:00:00.000Z)
    const reportStartDate = new Date('2026-09-01T00:00:00.000Z');
    const reportEndDate = new Date('2026-09-30T00:00:00.000Z');

    const pnl = await ReportsModel.getProfitAndLoss(userId, reportStartDate, reportEndDate);
    expect(parseFloat(pnl.totalIncome.toString())).toBe(7500);
    expect(parseFloat(pnl.netProfit.toString())).toBe(7500);

    // Also check Trial Balance as of 2026-09-30
    const tb = await ReportsModel.getTrialBalance(userId, reportEndDate);
    expect(parseFloat(tb.totalDebit.toString())).toBe(7500);
    expect(parseFloat(tb.totalCredit.toString())).toBe(7500);
    expect(tb.isBalanced).toBe(true);
  });

  it('3. Distributed Voice Sessions: Correctly persists preview sessions to Redis and retrieves/cleans up on confirmation', async () => {
    const previewPrompt = 'Paid 1500 to Suresh from Cash';
    const previewResult = await VoiceAgentService.process(userId, previewPrompt, false);

    expect(previewResult.needsConfirmation).toBe(true);
    expect(previewResult.executed).toBe(false);

    // Verify session was stored in Redis
    const redisKey = `voice:pending:${userId}`;
    const rawSession = await redis.get(redisKey);
    expect(rawSession).not.toBeNull();
    const parsedSession = JSON.parse(rawSession!);
    expect(parsedSession.intent.amount).toBe(1500);
    expect(parsedSession.intent.voucherType).toBe('PAYMENT');

    // Confirm session
    const confirmResult = await VoiceAgentService.process(userId, 'Yes, confirm please');
    expect(confirmResult.executed).toBe(true);
    expect(confirmResult.spokenResponse).toContain('Confirmed!');

    // Verify session was cleaned up from Redis
    const cleanedSession = await redis.get(redisKey);
    expect(cleanedSession).toBeNull();
  });
});
