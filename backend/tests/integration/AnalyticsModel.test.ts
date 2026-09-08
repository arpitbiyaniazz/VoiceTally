import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/core/database/prisma.js';
import { redisClient } from '../../src/core/redis/client.js';
import { AnalyticsModel } from '../../src/modules/ledger/models/AnalyticsModel.js';
import { PostingEngine } from '../../src/modules/ledger/services/PostingEngine.js';

describe('AnalyticsModel Integration Tests', () => {
  let userId: string;
  let cashAccountId: string;
  let bankAccountId: string;
  let salesAccountId: string;
  let consultingAccountId: string;
  let rentAccountId: string;
  let foodAccountId: string;
  let personAccountId: string;

  beforeAll(async () => {
    // Create unique test user
    const user = await prisma.user.create({
      data: {
        email: `analytics_test_${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Analytics Tester',
      },
    });
    userId = user.id;

    // Create standard accounts
    const cash = await prisma.account.create({
      data: { userId, name: 'Cash in Hand', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 0 },
    });
    cashAccountId = cash.id;

    const bank = await prisma.account.create({
      data: { userId, name: 'HDFC Bank', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 0 },
    });
    bankAccountId = bank.id;

    const sales = await prisma.account.create({
      data: { userId, name: 'Product Sales', type: 'INCOME', subtype: 'INCOME_CATEGORY', cachedBalance: 0 },
    });
    salesAccountId = sales.id;

    const consulting = await prisma.account.create({
      data: { userId, name: 'Consulting Income', type: 'INCOME', subtype: 'INCOME_CATEGORY', cachedBalance: 0 },
    });
    consultingAccountId = consulting.id;

    const rent = await prisma.account.create({
      data: { userId, name: 'Office Rent', type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY', cachedBalance: 0 },
    });
    rentAccountId = rent.id;

    const food = await prisma.account.create({
      data: { userId, name: 'Dining & Food', type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY', cachedBalance: 0 },
    });
    foodAccountId = food.id;

    const person = await prisma.account.create({
      data: { userId, name: 'Sharma Ji (Debtor)', type: 'ASSET', subtype: 'PERSON', cachedBalance: 0 },
    });
    personAccountId = person.id;

    // Post sample transactions:
    // 1. Inflow: ₹100,000 Consulting Income -> Bank
    await prisma.journalEntry.create({
      data: {
        userId,
        voucherType: 'RECEIPT',
        date: new Date(),
        narration: 'Consulting Retainer',
        lines: {
          create: [
            { accountId: bankAccountId, debitAmount: 100000, creditAmount: 0 },
            { accountId: consultingAccountId, debitAmount: 0, creditAmount: 100000 },
          ],
        },
      },
    });
    await prisma.account.update({ where: { id: bankAccountId }, data: { cachedBalance: { increment: 100000 } } });
    await prisma.account.update({ where: { id: consultingAccountId }, data: { cachedBalance: { increment: -100000 } } });

    // 2. Outflow: ₹20,000 Rent from Bank
    await prisma.journalEntry.create({
      data: {
        userId,
        voucherType: 'PAYMENT',
        date: new Date(),
        narration: 'Office Rent Payment',
        lines: {
          create: [
            { accountId: rentAccountId, debitAmount: 20000, creditAmount: 0 },
            { accountId: bankAccountId, debitAmount: 0, creditAmount: 20000 },
          ],
        },
      },
    });
    await prisma.account.update({ where: { id: rentAccountId }, data: { cachedBalance: { increment: 20000 } } });
    await prisma.account.update({ where: { id: bankAccountId }, data: { cachedBalance: { increment: -20000 } } });

    // 3. Outflow: ₹5,000 Food from Cash
    await prisma.journalEntry.create({
      data: {
        userId,
        voucherType: 'PAYMENT',
        date: new Date(),
        narration: 'Team Lunch',
        lines: {
          create: [
            { accountId: foodAccountId, debitAmount: 5000, creditAmount: 0 },
            { accountId: cashAccountId, debitAmount: 0, creditAmount: 5000 },
          ],
        },
      },
    });
    await prisma.account.update({ where: { id: foodAccountId }, data: { cachedBalance: { increment: 5000 } } });
    await prisma.account.update({ where: { id: cashAccountId }, data: { cachedBalance: { increment: -5000 } } });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.journalLine.deleteMany({ where: { account: { userId } } });
      await prisma.journalEntry.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('generates summary KPIs with accurate liquid cash and runway computation', async () => {
    const summary = await AnalyticsModel.getSummary(userId);

    expect(summary.totalLiquidCash).toBe(75000); // 80000 (Bank) - 5000 (Cash) = 75000
    expect(summary.averageMonthlyBurn).toBeGreaterThan(0);
    expect(summary.estimatedRunwayMonths).toBeGreaterThan(0);
    expect(summary.savingsRate).toBe(75); // (100k - 25k) / 100k = 75%
  });

  it('generates monthly trends with accurate income and expense numbers', async () => {
    const trends = await AnalyticsModel.getMonthlyTrends(userId, 6);

    expect(trends).toHaveLength(6);
    const currentMonth = trends[trends.length - 1];
    expect(currentMonth.income).toBe(100000);
    expect(currentMonth.expense).toBe(25000);
    expect(currentMonth.netSavings).toBe(75000);
  });

  it('computes category breakdowns sorted by amount descending', async () => {
    const breakdown = await AnalyticsModel.getCategoryBreakdown(userId);

    expect(breakdown.expenses.length).toBeGreaterThanOrEqual(2);
    expect(breakdown.expenses[0].accountName).toBe('Office Rent');
    expect(breakdown.expenses[0].amount).toBe(20000);
    expect(breakdown.expenses[0].percentage).toBe(80); // 20000 / 25000 = 80%

    expect(breakdown.income.length).toBeGreaterThanOrEqual(1);
    expect(breakdown.income[0].accountName).toBe('Consulting Income');
    expect(breakdown.income[0].amount).toBe(100000);
    expect(breakdown.income[0].percentage).toBe(100);
  });

  it('generates a balanced Sankey graph connecting income to pool and pool to expenses & savings', async () => {
    const sankey = await AnalyticsModel.getSankeyFlow(userId);

    expect(sankey.totalIncome).toBe(100000);
    expect(sankey.totalExpense).toBe(25000);
    expect(sankey.netSavings).toBe(75000);

    const poolNode = sankey.nodes.find((n) => n.id === 'pool_total_inflow');
    expect(poolNode).toBeDefined();

    const savingsNode = sankey.nodes.find((n) => n.type === 'savings');
    expect(savingsNode).toBeDefined();

    const rentLink = sankey.links.find((l) => l.target === `expense_${rentAccountId}`);
    expect(rentLink?.value).toBe(20000);

    const savingsLink = sankey.links.find((l) => l.target === 'savings_net_retained');
    expect(savingsLink?.value).toBe(75000);
  });
});
