import { describe, it, expect, beforeAll } from 'vitest';
import { UserModel } from '../../src/modules/auth/models/UserModel.js';
import { AccountModel } from '../../src/modules/ledger/models/AccountModel.js';
import { JournalEntryModel } from '../../src/modules/ledger/models/JournalEntryModel.js';
import { PersonModel } from '../../src/modules/ledger/models/PersonModel.js';
import { ReportsModel } from '../../src/modules/ledger/models/ReportsModel.js';

describe('Financial Statements Engine (ReportsModel)', () => {
  let userId: string;
  let bankId: string;
  let cashId: string;
  let salaryId: string;
  let rentId: string;
  let friendPersonAccountId: string;

  beforeAll(async () => {
    const email = `reports_user_${Date.now()}@voicetally.app`;
    const user = await UserModel.register(email, 'securePass123', 'Financial Reports User');
    userId = user.id;

    const accounts = await AccountModel.list(userId);
    bankId = accounts.find((a) => a.name === 'Bank')!.id;
    cashId = accounts.find((a) => a.name === 'Cash')!.id;

    // Create Income and Expense accounts
    const salary = await AccountModel.create(userId, {
      name: 'Salary Income',
      type: 'INCOME',
      subtype: 'INCOME_CATEGORY',
      cashFlowCategory: 'OPERATING',
    });
    salaryId = salary.id;

    const rent = await AccountModel.create(userId, {
      name: 'House Rent',
      type: 'EXPENSE',
      subtype: 'EXPENSE_CATEGORY',
      cashFlowCategory: 'OPERATING',
    });
    rentId = rent.id;

    // Create Person
    const friend = await PersonModel.create(userId, {
      name: 'Amit Patel',
      label: 'Friend',
    });
    friendPersonAccountId = friend.accounts[0].id;

    const today = new Date();

    // 1. Receipt: ₹100,000 Salary into Bank
    await JournalEntryModel.create(userId, {
      date: today,
      narration: 'Salary received',
      voucherType: 'RECEIPT',
      lines: [
        { accountId: bankId, debitAmount: 100000, creditAmount: 0 },
        { accountId: salaryId, debitAmount: 0, creditAmount: 100000 },
      ],
    });

    // 2. Payment: ₹20,000 Rent paid from Bank
    await JournalEntryModel.create(userId, {
      date: today,
      narration: 'Rent payment',
      voucherType: 'PAYMENT',
      lines: [
        { accountId: rentId, debitAmount: 20000, creditAmount: 0 },
        { accountId: bankId, debitAmount: 0, creditAmount: 20000 },
      ],
    });

    // 3. Payment: Lent ₹10,000 to Amit Patel from Bank
    await JournalEntryModel.create(userId, {
      date: today,
      narration: 'Lent to Amit',
      voucherType: 'PAYMENT',
      lines: [
        { accountId: friendPersonAccountId, debitAmount: 10000, creditAmount: 0 },
        { accountId: bankId, debitAmount: 0, creditAmount: 10000 },
      ],
    });

    // 4. Contra: ₹15,000 Bank to Cash
    await JournalEntryModel.create(userId, {
      date: today,
      narration: 'Cash withdrawal',
      voucherType: 'CONTRA',
      lines: [
        { accountId: cashId, debitAmount: 15000, creditAmount: 0 },
        { accountId: bankId, debitAmount: 0, creditAmount: 15000 },
      ],
    });
  });

  it('should generate a balanced Trial Balance where Total Debits == Total Credits', async () => {
    const report = await ReportsModel.getTrialBalance(userId);
    expect(report.isBalanced).toBe(true);
    expect(report.totalDebit.toString()).toBe('100000');
    expect(report.totalCredit.toString()).toBe('100000');
    expect(report.difference.toString()).toBe('0');
  });

  it('should generate an accurate Profit & Loss statement', async () => {
    const start = new Date(2020, 0, 1);
    const end = new Date(2030, 11, 31);
    const pnl = await ReportsModel.getProfitAndLoss(userId, start, end);

    expect(pnl.totalIncome.toString()).toBe('100000');
    expect(pnl.totalExpense.toString()).toBe('20000');
    expect(pnl.netProfit.toString()).toBe('80000');
    expect(pnl.isProfitable).toBe(true);
  });

  it('should satisfy the Balance Sheet Equation (Assets = Liabilities + Equity)', async () => {
    const bs = await ReportsModel.getBalanceSheet(userId);

    // Assets: Bank (55,000) + Cash (15,000) + Amit Receivable (10,000) = 80,000
    expect(bs.assets.totalAssets.toString()).toBe('80000');

    // Equity: Retained earnings from Net Profit (80,000)
    expect(bs.equity.currentPeriodEarnings.toString()).toBe('80000');
    expect(bs.equity.totalEquity.toString()).toBe('80000');

    // Liabilities: 0
    expect(bs.liabilities.totalLiabilities.toString()).toBe('0');

    expect(bs.isBalanced).toBe(true);
    expect(bs.difference.toString()).toBe('0');
  });

  it('should track Cash Flow activities (Operating, Investing, Financing)', async () => {
    const start = new Date(2020, 0, 1);
    const end = new Date(2030, 11, 31);
    const cf = await ReportsModel.getCashFlowStatement(userId, start, end);

    // Operating: +100,000 (Salary) - 20,000 (Rent) = +80,000
    expect(cf.totalOperating.toString()).toBe('80000');

    // Investing: -10,000 (Lent to Amit)
    expect(cf.totalInvesting.toString()).toBe('-10000');

    // Net Cash Flow = 80,000 - 10,000 = 70,000 (Bank: 55,000 + Cash: 15,000)
    expect(cf.netCashFlow.toString()).toBe('70000');
    expect(cf.closingCashBalance.toString()).toBe('70000');
  });
});
