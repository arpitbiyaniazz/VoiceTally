import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';
import { WhatsAppBotService } from '../../src/modules/integrations/services/WhatsAppBotService.js';
import { TelegramBotService } from '../../src/modules/integrations/services/TelegramBotService.js';
import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';
import { ledgerPostingProcessor } from '../../src/workers/ledgerPostingProcessor.js';
import jwt from 'jsonwebtoken';

describe('Master E2E Workflows & Deep Accounting Invariant Suite', () => {
  let userId: string;
  let userEmail: string;
  let authToken: string;
  let cashAccountId: string;
  let bankAccountId: string;
  let salesAccountId: string;
  let rentAccountId: string;
  let personId: string;
  let personAccountId: string;

  const userPhone = '+919123456780';
  const telegramChatId = '8877665544';
  const pairingCode = 'E2E999';

  beforeAll(async () => {
    userEmail = `master_e2e_${Date.now()}@voicetally.app`;

    // 1. Register User via API
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: 'Password123!',
        name: 'Master E2E Auditor',
      });

    expect(regRes.status).toBe(201);
    userId = regRes.body.data.user.id;
    authToken = regRes.body.data.accessToken;

    // Attach phone, telegramChatId, and botPairingCode
    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: userPhone,
        telegramChatId: telegramChatId,
        botPairingCode: pairingCode,
      },
    });

    // 2. Fetch seeded Chart of Accounts
    const chartRes = await request(app)
      .get('/api/ledger/accounts/chart')
      .set('Authorization', `Bearer ${authToken}`);

    expect(chartRes.status).toBe(200);

    // Get Cash and Bank accounts
    const cashAcc = await prisma.account.findUnique({ where: { userId_name: { userId, name: 'Cash' } } });
    const bankAcc = await prisma.account.findUnique({ where: { userId_name: { userId, name: 'Bank' } } });

    cashAccountId = cashAcc?.id || (await prisma.account.create({
      data: { userId, name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 0 }
    })).id;

    bankAccountId = bankAcc?.id || (await prisma.account.create({
      data: { userId, name: 'Bank', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 0 }
    })).id;

    // Create custom Revenue & Expense accounts
    const salesAcc = await prisma.account.create({
      data: { userId, name: 'Consulting Sales', type: 'INCOME', subtype: 'INCOME_CATEGORY', cachedBalance: 0 }
    });
    salesAccountId = salesAcc.id;

    const rentAcc = await prisma.account.create({
      data: { userId, name: 'Office Rent Expense', type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY', cachedBalance: 0 }
    });
    rentAccountId = rentAcc.id;

    // Create a Person (Debtor)
    const personRes = await request(app)
      .post('/api/ledger/people')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Acme Corp',
        phone: '+919876540000',
        label: 'Client',
      });

    expect(personRes.status).toBe(201);
    personId = personRes.body.data.id;
    personAccountId = personRes.body.data.linkedAccountId;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.journalLine.deleteMany({ where: { account: { userId } } });
      await prisma.journalEntry.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.person.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  describe('1. Full Multi-Voucher Double-Entry Accounting Lifecycle', () => {
    it('records Initial Capital Receipt (Bank Dr, Capital Cr) via API', async () => {
      const capitalAcc = await prisma.account.create({
        data: { userId, name: 'Owner Capital', type: 'EQUITY', subtype: 'EQUITY_CAPITAL', cachedBalance: 0 }
      });

      const res = await request(app)
        .post('/api/ledger/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          voucherType: 'RECEIPT',
          date: new Date().toISOString(),
          narration: 'Initial owner equity capital deposit in Bank',
          amount: 100000,
          cashAccountId: bankAccountId,
          counterAccountId: capitalAcc.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      await ledgerPostingProcessor({ data: { journalEntryId: res.body.data.id } } as any);

      const updatedBank = await prisma.account.findUnique({ where: { id: bankAccountId } });
      expect(parseFloat(updatedBank!.cachedBalance.toString())).toBe(100000);
    });

    it('records Cash Withdrawal Contra (Cash Dr, Bank Cr) via API', async () => {
      const res = await request(app)
        .post('/api/ledger/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          voucherType: 'CONTRA',
          date: new Date().toISOString(),
          narration: 'Cash withdrawal from bank ATM',
          amount: 25000,
          fromAccountId: bankAccountId,
          toAccountId: cashAccountId,
        });

      expect(res.status).toBe(201);

      await ledgerPostingProcessor({ data: { journalEntryId: res.body.data.id } } as any);

      const updatedBank = await prisma.account.findUnique({ where: { id: bankAccountId } });
      const updatedCash = await prisma.account.findUnique({ where: { id: cashAccountId } });

      expect(parseFloat(updatedBank!.cachedBalance.toString())).toBe(75000);
      expect(parseFloat(updatedCash!.cachedBalance.toString())).toBe(25000);
    });

    it('records Expense Payment (Rent Dr, Cash Cr) via API', async () => {
      const res = await request(app)
        .post('/api/ledger/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          voucherType: 'PAYMENT',
          date: new Date().toISOString(),
          narration: 'Office rent payment in cash',
          amount: 10000,
          cashAccountId: cashAccountId,
          counterAccountId: rentAccountId,
        });

      expect(res.status).toBe(201);

      await ledgerPostingProcessor({ data: { journalEntryId: res.body.data.id } } as any);

      const updatedCash = await prisma.account.findUnique({ where: { id: cashAccountId } });
      const updatedRent = await prisma.account.findUnique({ where: { id: rentAccountId } });

      expect(parseFloat(updatedCash!.cachedBalance.toString())).toBe(15000);
      expect(parseFloat(updatedRent!.cachedBalance.toString())).toBe(10000);
    });

    it('records Credit Sale Journal Entry (Acme Corp Dr, Sales Cr) via multi-line payload', async () => {
      const res = await request(app)
        .post('/api/ledger/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          voucherType: 'JOURNAL',
          date: new Date().toISOString(),
          narration: 'Consulting services invoiced to Acme Corp on credit',
          lines: [
            { accountId: personAccountId, debitAmount: 40000, creditAmount: 0 },
            { accountId: salesAccountId, debitAmount: 0, creditAmount: 40000 },
          ],
        });

      expect(res.status).toBe(201);

      await ledgerPostingProcessor({ data: { journalEntryId: res.body.data.id } } as any);

      const updatedDebtor = await prisma.account.findUnique({ where: { id: personAccountId } });
      const updatedSales = await prisma.account.findUnique({ where: { id: salesAccountId } });

      expect(parseFloat(updatedDebtor!.cachedBalance.toString())).toBe(40000); // 40,000 Dr
      expect(parseFloat(updatedSales!.cachedBalance.toString())).toBe(-40000); // 40,000 Cr
    });

    it('rejects unbalanced journal entries (Debits != Credits)', async () => {
      const res = await request(app)
        .post('/api/ledger/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          voucherType: 'JOURNAL',
          date: new Date().toISOString(),
          narration: 'Faulty unbalanced entry',
          lines: [
            { accountId: personAccountId, debitAmount: 50000, creditAmount: 0 },
            { accountId: salesAccountId, debitAmount: 0, creditAmount: 30000 }, // Discrepancy 20,000!
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNBALANCED_ENTRY');
      expect(res.body.error.message).toContain('Unbalanced journal entry');
    });
  });

  describe('2. Financial Reports Mathematical Invariants Verification', () => {
    it('verifies Trial Balance satisfies Total Debits === Total Credits (Diff = 0)', async () => {
      const res = await request(app)
        .get('/api/ledger/reports/trial-balance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const tb = res.body.data;
      expect(tb.isBalanced).toBe(true);
      expect(parseFloat(tb.totalDebit.toString())).toBe(parseFloat(tb.totalCredit.toString()));
      expect(parseFloat(tb.difference.toString())).toBe(0);
    });

    it('verifies Profit and Loss Statement calculates correct Net Income', async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1).toISOString();
      const end = new Date(now.getFullYear(), 11, 31).toISOString();

      const res = await request(app)
        .get('/api/ledger/reports/profit-loss')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ startDate: start, endDate: end });

      expect(res.status).toBe(200);
      const pnl = res.body.data;

      expect(parseFloat(pnl.totalIncome.toString())).toBe(40000); // Consulting sales
      expect(parseFloat(pnl.totalExpense.toString())).toBe(10000); // Rent
      expect(parseFloat(pnl.netProfit.toString())).toBe(30000); // 40000 - 10000
    });

    it('verifies Balance Sheet satisfies Assets === Liabilities + Equity + Net Income', async () => {
      const res = await request(app)
        .get('/api/ledger/reports/balance-sheet')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const bs = res.body.data;

      // Assets: Bank (75000) + Cash (15000) + Acme Corp Debtor (40000) = 130,000
      const totalAssets = parseFloat(bs.assets.totalAssets.toString());
      expect(totalAssets).toBe(130000);

      // Liabilities & Equity: Owner Capital (100000) + Net Profit (30000) = 130,000
      const totalLiabilitiesAndEquity =
        parseFloat(bs.liabilities.totalLiabilities.toString()) +
        parseFloat(bs.equity.totalEquity.toString());

      expect(totalLiabilitiesAndEquity).toBe(130000);
      expect(totalAssets).toBe(totalLiabilitiesAndEquity);
    });
  });

  describe('3. Omnichannel Bot & Cross-Platform Conversational Invariants', () => {
    it('handles two-step voucher preview and cross-channel balance query', async () => {
      // 1. WhatsApp Bot creates preview for client debt payment
      const waPreview = await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'Received 20000 from Acme Corp in bank',
      });

      expect(waPreview.actionTaken).toBe('PREVIEW');
      expect(waPreview.previewCard).toBeDefined();
      expect(waPreview.previewCard.amount).toBe(20000);
      expect(waPreview.previewCard.debitAccount).toBe('Bank');
      expect(waPreview.previewCard.creditAccount).toBe('Acme Corp');

      // 2. Telegram Bot queries cash balance while preview is pending (session must remain intact)
      const tgBalance = await TelegramBotService.handleUpdate({
        update_id: 201,
        message: {
          message_id: 10,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Auditor' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: '/cash',
        },
      });

      expect(tgBalance.actionTaken).toBe('QUERY');
      expect(tgBalance.text).toContain('15,000 rupees'); // Unchanged Cash: 15,000

      // 3. WhatsApp confirms voucher posting
      const waConfirm = await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'YES',
      });

      expect(waConfirm.actionTaken).toBe('POSTED');
      expect(waConfirm.text).toContain('Voucher Successfully Recorded');

      // Process ledger posting in deterministic test env
      const latestEntry = await prisma.journalEntry.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (latestEntry) {
        await ledgerPostingProcessor({ data: { journalEntryId: latestEntry.id } } as any);
      }

      // 4. Verify Bank and Debtor updated in DB
      const updatedBank = await prisma.account.findUnique({ where: { id: bankAccountId } });
      const updatedDebtor = await prisma.account.findUnique({ where: { id: personAccountId } });

      expect(parseFloat(updatedBank!.cachedBalance.toString())).toBe(95000); // 75000 + 20000
      expect(parseFloat(updatedDebtor!.cachedBalance.toString())).toBe(20000); // 40000 - 20000

      // 5. Telegram queries updated bank balance
      const tgUpdatedBank = await TelegramBotService.handleUpdate({
        update_id: 202,
        message: {
          message_id: 11,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Auditor' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: '/bank',
        },
      });

      expect(tgUpdatedBank.actionTaken).toBe('QUERY');
      expect(tgUpdatedBank.text).toContain('95,000 rupees');
    });
  });

  describe('4. Visual BI Analytics End-to-End Flow', () => {
    it('computes complete Sankey Flow (Income -> Pool -> Expense & Retained)', async () => {
      const res = await request(app)
        .get('/api/ledger/analytics/sankey')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sankey = res.body.data;
      expect(sankey.totalIncome).toBe(40000);
      expect(sankey.totalExpense).toBe(10000);
      expect(sankey.netSavings).toBe(30000);

      // Verify node links
      expect(sankey.nodes.length).toBeGreaterThanOrEqual(4);
      expect(sankey.links.some((l: any) => l.target === 'pool_total_inflow')).toBe(true);
    });

    it('computes Expense Category Breakdown percentages', async () => {
      const res = await request(app)
        .get('/api/ledger/analytics/categories')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cat = res.body.data;

      expect(cat.expenses.length).toBeGreaterThanOrEqual(1);
      expect(cat.expenses[0].accountName).toBe('Office Rent Expense');
      expect(cat.expenses[0].amount).toBe(10000);
      expect(cat.expenses[0].percentage).toBe(100);
    });
  });
});
