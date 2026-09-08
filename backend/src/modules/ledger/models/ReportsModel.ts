import { prisma } from '../../../core/database/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

export interface TrialBalanceRow {
  accountId: string;
  accountName: string;
  type: string;
  subtype: string;
  debitBalance: Decimal;
  creditBalance: Decimal;
}

export interface TrialBalanceReport {
  asOfDate: Date;
  rows: TrialBalanceRow[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  isBalanced: boolean;
  difference: Decimal;
}

export interface ProfitAndLossReport {
  startDate: Date;
  endDate: Date;
  incomeAccounts: { accountId: string; accountName: string; amount: Decimal }[];
  totalIncome: Decimal;
  expenseAccounts: { accountId: string; accountName: string; amount: Decimal }[];
  totalExpense: Decimal;
  netProfit: Decimal;
  isProfitable: boolean;
}

export interface BalanceSheetReport {
  asOfDate: Date;
  assets: {
    cashAndBank: { accountId: string; accountName: string; amount: Decimal }[];
    receivables: { accountId: string; accountName: string; amount: Decimal }[];
    otherAssets: { accountId: string; accountName: string; amount: Decimal }[];
    totalAssets: Decimal;
  };
  liabilities: {
    payables: { accountId: string; accountName: string; amount: Decimal }[];
    otherLiabilities: { accountId: string; accountName: string; amount: Decimal }[];
    totalLiabilities: Decimal;
  };
  equity: {
    capital: { accountId: string; accountName: string; amount: Decimal }[];
    currentPeriodEarnings: Decimal;
    totalEquity: Decimal;
  };
  totalLiabilitiesAndEquity: Decimal;
  isBalanced: boolean;
  difference: Decimal;
}

export interface CashFlowReport {
  startDate: Date;
  endDate: Date;
  operatingActivities: { accountId: string; accountName: string; amount: Decimal }[];
  totalOperating: Decimal;
  investingActivities: { accountId: string; accountName: string; amount: Decimal }[];
  totalInvesting: Decimal;
  financingActivities: { accountId: string; accountName: string; amount: Decimal }[];
  totalFinancing: Decimal;
  netCashFlow: Decimal;
  openingCashBalance: Decimal;
  closingCashBalance: Decimal;
}

function toEndOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(23, 59, 59, 999);
  return res;
}

function toStartOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
}

export const ReportsModel = {
  /**
   * Generates a Trial Balance as of a given date.
   * Proves that total debits equal total credits across the chart of accounts.
   */
  async getTrialBalance(userId: string, asOfDate: Date = new Date()): Promise<TrialBalanceReport> {
    const endBound = toEndOfDay(asOfDate);
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const rows: TrialBalanceRow[] = [];
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    for (const account of accounts) {
      // Aggregate journal lines up to asOfDate (including end of day)
      const lines = await prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: {
            userId,
            date: { lte: endBound },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const sumDebits = lines._sum.debitAmount ?? new Decimal(0);
      const sumCredits = lines._sum.creditAmount ?? new Decimal(0);
      const net = sumDebits.minus(sumCredits);

      let debitBalance = new Decimal(0);
      let creditBalance = new Decimal(0);

      // Normal balance classification
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        if (net.gte(0)) {
          debitBalance = net;
        } else {
          creditBalance = net.abs();
        }
      } else {
        // LIABILITY, EQUITY, INCOME have normal credit balances
        if (net.lte(0)) {
          creditBalance = net.abs();
        } else {
          debitBalance = net;
        }
      }

      if (!debitBalance.isZero() || !creditBalance.isZero()) {
        rows.push({
          accountId: account.id,
          accountName: account.name,
          type: account.type,
          subtype: account.subtype,
          debitBalance,
          creditBalance,
        });

        totalDebit = totalDebit.plus(debitBalance);
        totalCredit = totalCredit.plus(creditBalance);
      }
    }

    const difference = totalDebit.minus(totalCredit);
    const isBalanced = difference.abs().lt(new Decimal('0.01'));

    return {
      asOfDate,
      rows,
      totalDebit,
      totalCredit,
      isBalanced,
      difference,
    };
  },

  /**
   * Generates a Profit & Loss (Income Statement) for a date range.
   * Net Profit = Total Revenue (Credit movements in INCOME) − Total Expenses (Debit movements in EXPENSE)
   */
  async getProfitAndLoss(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProfitAndLossReport> {
    const startBound = toStartOfDay(startDate);
    const endBound = toEndOfDay(endDate);

    const incomeAccounts = await prisma.account.findMany({
      where: { userId, type: 'INCOME' },
    });

    const expenseAccounts = await prisma.account.findMany({
      where: { userId, type: 'EXPENSE' },
    });

    const incomeRows: { accountId: string; accountName: string; amount: Decimal }[] = [];
    let totalIncome = new Decimal(0);

    for (const acc of incomeAccounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            date: { gte: startBound, lte: endBound },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const debits = agg._sum.debitAmount ?? new Decimal(0);
      const credits = agg._sum.creditAmount ?? new Decimal(0);
      // Income increases with credit
      const netIncome = credits.minus(debits);

      if (!netIncome.isZero()) {
        incomeRows.push({
          accountId: acc.id,
          accountName: acc.name,
          amount: netIncome,
        });
        totalIncome = totalIncome.plus(netIncome);
      }
    }

    const expenseRows: { accountId: string; accountName: string; amount: Decimal }[] = [];
    let totalExpense = new Decimal(0);

    for (const acc of expenseAccounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            date: { gte: startDate, lte: endDate },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const debits = agg._sum.debitAmount ?? new Decimal(0);
      const credits = agg._sum.creditAmount ?? new Decimal(0);
      // Expense increases with debit
      const netExpense = debits.minus(credits);

      if (!netExpense.isZero()) {
        expenseRows.push({
          accountId: acc.id,
          accountName: acc.name,
          amount: netExpense,
        });
        totalExpense = totalExpense.plus(netExpense);
      }
    }

    const netProfit = totalIncome.minus(totalExpense);

    return {
      startDate,
      endDate,
      incomeAccounts: incomeRows,
      totalIncome,
      expenseAccounts: expenseRows,
      totalExpense,
      netProfit,
      isProfitable: netProfit.gte(0),
    };
  },

  /**
   * Generates a Balance Sheet as of a given date.
   * Fundamental Accounting Equation: Assets = Liabilities + Equity (including Cumulative Retained Earnings)
   */
  async getBalanceSheet(userId: string, asOfDate: Date = new Date()): Promise<BalanceSheetReport> {
    const endBound = toEndOfDay(asOfDate);
    const accounts = await prisma.account.findMany({
      where: { userId },
    });

    const cashAndBank: { accountId: string; accountName: string; amount: Decimal }[] = [];
    const receivables: { accountId: string; accountName: string; amount: Decimal }[] = [];
    const otherAssets: { accountId: string; accountName: string; amount: Decimal }[] = [];
    let totalAssets = new Decimal(0);

    const payables: { accountId: string; accountName: string; amount: Decimal }[] = [];
    const otherLiabilities: { accountId: string; accountName: string; amount: Decimal }[] = [];
    let totalLiabilities = new Decimal(0);

    const capital: { accountId: string; accountName: string; amount: Decimal }[] = [];
    let totalCapital = new Decimal(0);

    let cumulativeIncome = new Decimal(0);
    let cumulativeExpense = new Decimal(0);

    for (const acc of accounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            date: { lte: endBound },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const debits = agg._sum.debitAmount ?? new Decimal(0);
      const credits = agg._sum.creditAmount ?? new Decimal(0);
      const netDebit = debits.minus(credits);
      const netCredit = credits.minus(debits);

      if (acc.type === 'ASSET') {
        if (acc.subtype === 'CASH_BANK') {
          cashAndBank.push({ accountId: acc.id, accountName: acc.name, amount: netDebit });
          totalAssets = totalAssets.plus(netDebit);
        } else if (acc.subtype === 'PERSON') {
          // Positive net debit = debtor (receivable)
          // Negative net debit = creditor (payable)
          if (netDebit.gte(0)) {
            receivables.push({ accountId: acc.id, accountName: acc.name, amount: netDebit });
            totalAssets = totalAssets.plus(netDebit);
          } else {
            payables.push({ accountId: acc.id, accountName: acc.name, amount: netDebit.abs() });
            totalLiabilities = totalLiabilities.plus(netDebit.abs());
          }
        } else {
          otherAssets.push({ accountId: acc.id, accountName: acc.name, amount: netDebit });
          totalAssets = totalAssets.plus(netDebit);
        }
      } else if (acc.type === 'LIABILITY') {
        if (acc.subtype === 'PERSON') {
          if (netCredit.gte(0)) {
            payables.push({ accountId: acc.id, accountName: acc.name, amount: netCredit });
            totalLiabilities = totalLiabilities.plus(netCredit);
          } else {
            receivables.push({ accountId: acc.id, accountName: acc.name, amount: netCredit.abs() });
            totalAssets = totalAssets.plus(netCredit.abs());
          }
        } else {
          otherLiabilities.push({ accountId: acc.id, accountName: acc.name, amount: netCredit });
          totalLiabilities = totalLiabilities.plus(netCredit);
        }
      } else if (acc.type === 'EQUITY') {
        capital.push({ accountId: acc.id, accountName: acc.name, amount: netCredit });
        totalCapital = totalCapital.plus(netCredit);
      } else if (acc.type === 'INCOME') {
        cumulativeIncome = cumulativeIncome.plus(netCredit);
      } else if (acc.type === 'EXPENSE') {
        cumulativeExpense = cumulativeExpense.plus(netDebit);
      }
    }

    const currentPeriodEarnings = cumulativeIncome.minus(cumulativeExpense);
    const totalEquity = totalCapital.plus(currentPeriodEarnings);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

    const difference = totalAssets.minus(totalLiabilitiesAndEquity);
    const isBalanced = difference.abs().lt(new Decimal('0.01'));

    return {
      asOfDate,
      assets: {
        cashAndBank,
        receivables,
        otherAssets,
        totalAssets,
      },
      liabilities: {
        payables,
        otherLiabilities,
        totalLiabilities,
      },
      equity: {
        capital,
        currentPeriodEarnings,
        totalEquity,
      },
      totalLiabilitiesAndEquity,
      isBalanced,
      difference,
    };
  },

  /**
   * Generates a Cash Flow Statement for a given date range.
   * Tracks inflows and outflows through Cash/Bank accounts categorised by
   * OPERATING, INVESTING, and FINANCING activities.
   */
  async getCashFlowStatement(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CashFlowReport> {
    const startBound = toStartOfDay(startDate);
    const endBound = toEndOfDay(endDate);

    const cashBankAccounts = await prisma.account.findMany({
      where: { userId, subtype: 'CASH_BANK' },
    });
    const cashAccountIds = new Set(cashBankAccounts.map((a) => a.id));

    // Calculate opening cash balance (before startDate)
    let openingCashBalance = new Decimal(0);
    for (const cashAcc of cashBankAccounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: cashAcc.id,
          journalEntry: {
            userId,
            date: { lt: startBound },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });
      const d = agg._sum.debitAmount ?? new Decimal(0);
      const c = agg._sum.creditAmount ?? new Decimal(0);
      openingCashBalance = openingCashBalance.plus(d.minus(c));
    }

    // Query all entries in range affecting Cash/Bank accounts
    const entries = await prisma.journalEntry.findMany({
      where: {
        userId,
        date: { gte: startBound, lte: endBound },
        lines: {
          some: {
            accountId: { in: Array.from(cashAccountIds) },
          },
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    const operating: { accountId: string; accountName: string; amount: Decimal }[] = [];
    const investing: { accountId: string; accountName: string; amount: Decimal }[] = [];
    const financing: { accountId: string; accountName: string; amount: Decimal }[] = [];

    let totalOperating = new Decimal(0);
    let totalInvesting = new Decimal(0);
    let totalFinancing = new Decimal(0);

    for (const entry of entries) {
      // Find cash lines and non-cash counterpart lines
      const cashLines = entry.lines.filter((l) => cashAccountIds.has(l.accountId));
      const counterLines = entry.lines.filter((l) => !cashAccountIds.has(l.accountId));

      // Skip internal contra cash-to-cash transfers as net cash flow is 0
      if (counterLines.length === 0) continue;

      for (const counterLine of counterLines) {
        const cat = counterLine.account.cashFlowCategory;
        // Inflow to cash when counter account is credited, Outflow when counter account is debited
        const cashEffect = new Decimal(counterLine.creditAmount.toString())
          .minus(new Decimal(counterLine.debitAmount.toString()));

        const item = {
          accountId: counterLine.accountId,
          accountName: `${counterLine.account.name} (${entry.narration})`,
          amount: cashEffect,
        };

        if (cat === 'OPERATING' || cat === 'NONE') {
          operating.push(item);
          totalOperating = totalOperating.plus(cashEffect);
        } else if (cat === 'INVESTING') {
          investing.push(item);
          totalInvesting = totalInvesting.plus(cashEffect);
        } else if (cat === 'FINANCING') {
          financing.push(item);
          totalFinancing = totalFinancing.plus(cashEffect);
        }
      }
    }

    const netCashFlow = totalOperating.plus(totalInvesting).plus(totalFinancing);
    const closingCashBalance = openingCashBalance.plus(netCashFlow);

    return {
      startDate,
      endDate,
      operatingActivities: operating,
      totalOperating,
      investingActivities: investing,
      totalInvesting,
      financingActivities: financing,
      totalFinancing,
      netCashFlow,
      openingCashBalance,
      closingCashBalance,
    };
  },
};
