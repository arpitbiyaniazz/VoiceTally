import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';
import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';
import { LedgerReconciliationService } from '../../src/modules/ledger/services/LedgerReconciliationService.js';
import { Decimal } from '@prisma/client/runtime/library';

describe('Backend Architect: Fault Tolerance, Concurrency & Self-Healing Resilience', () => {
  let userId: string;
  let userEmail: string;
  let authToken: string;
  let cashAccountId: string;
  let rentAccountId: string;

  beforeAll(async () => {
    userEmail = `architect_test_${Date.now()}@voicetally.app`;

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: 'Password123!',
        name: 'Architect Tester',
      });

    expect(regRes.status).toBe(201);
    userId = regRes.body.data.user.id;
    authToken = regRes.body.data.accessToken;

    const cashAcc = await prisma.account.findUnique({
      where: { userId_name: { userId, name: 'Cash' } },
    });
    cashAccountId = cashAcc!.id;

    // Create an Expense account
    const expRes = await request(app)
      .post('/api/ledger/accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Office Rent',
        type: 'EXPENSE',
        subtype: 'EXPENSE_CATEGORY',
        cashFlowCategory: 'OPERATING',
      });

    rentAccountId = expRes.body.data.id;
  });

  describe('1. Concurrency Locking & Race-Condition Prevention (Double Confirmation)', () => {
    it('prevents double-posting when concurrent YES confirmations are dispatched', async () => {
      // 1. Initiate a transaction preview
      const previewRes = await VoiceAgentService.process(userId, 'Paid 1500 for Office Rent from Cash', false);
      expect(previewRes.intent.type).toBe('TRANSACTION');
      expect(previewRes.data?.isPreview).toBe(true);

      // 2. Dispatch two simultaneous confirmation requests
      const [res1, res2] = await Promise.all([
        VoiceAgentService.process(userId, 'YES', false),
        VoiceAgentService.process(userId, 'YES', false),
      ]);

      // Exactly one should succeed and one should find no pending session
      const postedResults = [res1, res2].filter((r) => r.executed && r.data?.status !== 'NO_PENDING_SESSION');
      const noSessionResults = [res1, res2].filter((r) => r.data?.status === 'NO_PENDING_SESSION');

      expect(postedResults.length).toBe(1);
      expect(noSessionResults.length).toBe(1);
      expect(postedResults[0].spokenResponse).toMatch(/recorded/i);

      // Verify in DB that only 1 journal entry was created
      const entries = await prisma.journalEntry.findMany({
        where: { userId },
      });
      expect(entries.length).toBe(1);
    });
  });

  describe('2. Self-Healing Ledger Reconciliation & Balance Invariant Auditing', () => {
    it('detects and posts unposted entries and repairs cached balance discrepancies', async () => {
      // 1. Manually create an entry that was left unposted (postedAt = null)
      const orphanEntry = await prisma.journalEntry.create({
        data: {
          userId,
          date: new Date(),
          narration: 'Simulated network interrupted entry',
          voucherType: 'PAYMENT',
          source: 'MANUAL',
          postedAt: null, // Unposted!
          lines: {
            create: [
              { accountId: rentAccountId, debitAmount: 2000, creditAmount: 0 },
              { accountId: cashAccountId, debitAmount: 0, creditAmount: 2000 },
            ],
          },
        },
      });

      // 2. Introduce an intentional synthetic cached balance divergence on Cash account
      await prisma.account.update({
        where: { id: cashAccountId },
        data: { cachedBalance: new Decimal(999999) },
      });

      // 3. Call the Reconciliation Endpoint via API
      const reconcileRes = await request(app)
        .post('/api/ledger/reconcile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(reconcileRes.status).toBe(200);
      expect(reconcileRes.body.success).toBe(true);

      const { unpostedReconciliation, balanceAudit } = reconcileRes.body.data;

      // Verify unposted entry was posted
      expect(unpostedReconciliation.totalUnposted).toBeGreaterThanOrEqual(1);
      expect(unpostedReconciliation.reconciledCount).toBeGreaterThanOrEqual(1);

      // Verify the orphan entry in DB now has a postedAt timestamp
      const checkedEntry = await prisma.journalEntry.findUnique({
        where: { id: orphanEntry.id },
      });
      expect(checkedEntry!.postedAt).not.toBeNull();

      // Verify balance audit detected and repaired the cash account discrepancy
      expect(balanceAudit.discrepanciesRepaired).toBeGreaterThanOrEqual(1);
      const repairedCash = await prisma.account.findUnique({ where: { id: cashAccountId } });

      // Calculate expected true balance (-1500 from test 1 + -2000 from orphan entry = -3500)
      expect(parseFloat(repairedCash!.cachedBalance.toString())).toBe(-3500);
    });
  });
});
