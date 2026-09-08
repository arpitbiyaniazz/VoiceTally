import { prisma } from '../../../core/database/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

export interface MonthlyTrend {
  monthKey: string; // e.g., "2026-03"
  monthLabel: string; // e.g., "Mar 2026"
  income: number;
  expense: number;
  netSavings: number;
}

export interface CategoryShare {
  accountId: string;
  accountName: string;
  subtype: string;
  amount: number;
  percentage: number;
}

export interface SankeyNode {
  id: string;
  name: string;
  type: 'income' | 'pool' | 'expense' | 'savings' | 'deficit';
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
}

export interface AnalyticsSummary {
  totalLiquidCash: number;
  totalReceivables: number;
  totalPayables: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  averageMonthlyBurn: number;
  estimatedRunwayMonths: number;
  estimatedRunwayDays: number;
  savingsRate: number;
  solvencyRatio: number;
  monthlyIncomeAverage: number;
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

export const AnalyticsModel = {
  /**
   * Retrieves high-level business intelligence & runway summary
   */
  async getSummary(userId: string): Promise<AnalyticsSummary> {
    const accounts = await prisma.account.findMany({
      where: { userId },
    });

    let totalLiquidCash = 0;
    let totalReceivables = 0;
    let totalPayables = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      const balance = parseFloat(acc.cachedBalance?.toString() || '0') || 0;

      if (acc.type === 'ASSET') {
        totalAssets += balance;
        if (acc.subtype === 'CASH_BANK') {
          totalLiquidCash += balance;
        } else if (acc.subtype === 'PERSON') {
          if (balance > 0) {
            totalReceivables += balance;
          } else {
            totalPayables += Math.abs(balance);
          }
        }
      } else if (acc.type === 'LIABILITY') {
        const absBal = Math.abs(balance);
        totalLiabilities += absBal;
        if (acc.subtype === 'PERSON') {
          totalPayables += absBal;
        }
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    // Calculate trailing 3-month burn rate
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const startBound = toStartOfDay(threeMonthsAgo);
    const endBound = toEndOfDay(now);

    const expenseLines = await prisma.journalLine.aggregate({
      where: {
        account: { userId, type: 'EXPENSE' },
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

    const incomeLines = await prisma.journalLine.aggregate({
      where: {
        account: { userId, type: 'INCOME' },
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

    const totalPeriodExpense = (expenseLines._sum.debitAmount ?? new Decimal(0))
      .minus(expenseLines._sum.creditAmount ?? new Decimal(0))
      .toNumber();

    const totalPeriodIncome = (incomeLines._sum.creditAmount ?? new Decimal(0))
      .minus(incomeLines._sum.debitAmount ?? new Decimal(0))
      .toNumber();

    const monthsCount = Math.max(1, (now.getFullYear() - threeMonthsAgo.getFullYear()) * 12 + now.getMonth() - threeMonthsAgo.getMonth() + 1);
    const averageMonthlyBurn = Math.max(0, totalPeriodExpense / monthsCount);
    const monthlyIncomeAverage = Math.max(0, totalPeriodIncome / monthsCount);

    const effectiveCash = Math.max(0, totalLiquidCash);
    const estimatedRunwayMonths = averageMonthlyBurn > 0 
      ? parseFloat((effectiveCash / averageMonthlyBurn).toFixed(1))
      : effectiveCash > 0 ? 999 : 0;

    const estimatedRunwayDays = Math.round(estimatedRunwayMonths * 30);
    const savingsRate = totalPeriodIncome > 0
      ? parseFloat((((totalPeriodIncome - totalPeriodExpense) / totalPeriodIncome) * 100).toFixed(1))
      : 0;

    const solvencyRatio = totalLiabilities > 0
      ? parseFloat((totalAssets / totalLiabilities).toFixed(2))
      : totalAssets > 0 ? 999 : 1;

    return {
      totalLiquidCash: Math.round(totalLiquidCash * 100) / 100,
      totalReceivables: Math.round(totalReceivables * 100) / 100,
      totalPayables: Math.round(totalPayables * 100) / 100,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
      averageMonthlyBurn: Math.round(averageMonthlyBurn * 100) / 100,
      estimatedRunwayMonths,
      estimatedRunwayDays,
      savingsRate,
      solvencyRatio,
      monthlyIncomeAverage: Math.round(monthlyIncomeAverage * 100) / 100,
    };
  },

  /**
   * Generates monthly income vs expense historical trend data
   */
  async getMonthlyTrends(userId: string, months: number = 6): Promise<MonthlyTrend[]> {
    const safeMonths = Math.min(Math.max(months, 3), 24);
    const now = new Date();
    const result: MonthlyTrend[] = [];

    for (let i = safeMonths - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startBound = toStartOfDay(monthDate);
      const endBound = toEndOfDay(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));

      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const incomeAgg = await prisma.journalLine.aggregate({
        where: {
          account: { userId, type: 'INCOME' },
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

      const expenseAgg = await prisma.journalLine.aggregate({
        where: {
          account: { userId, type: 'EXPENSE' },
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

      const incomeCredits = incomeAgg._sum.creditAmount ?? new Decimal(0);
      const incomeDebits = incomeAgg._sum.debitAmount ?? new Decimal(0);
      const netIncome = Math.max(0, incomeCredits.minus(incomeDebits).toNumber());

      const expenseDebits = expenseAgg._sum.debitAmount ?? new Decimal(0);
      const expenseCredits = expenseAgg._sum.creditAmount ?? new Decimal(0);
      const netExpense = Math.max(0, expenseDebits.minus(expenseCredits).toNumber());

      result.push({
        monthKey,
        monthLabel,
        income: Math.round(netIncome * 100) / 100,
        expense: Math.round(netExpense * 100) / 100,
        netSavings: Math.round((netIncome - netExpense) * 100) / 100,
      });
    }

    return result;
  },

  /**
   * Generates percentage-based categorical breakdown for Income and Expenses
   */
  async getCategoryBreakdown(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ expenses: CategoryShare[]; income: CategoryShare[] }> {
    const now = new Date();
    const start = startDate ? toStartOfDay(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? toEndOfDay(endDate) : toEndOfDay(now);

    const expenseAccounts = await prisma.account.findMany({
      where: { userId, type: 'EXPENSE' },
    });

    const incomeAccounts = await prisma.account.findMany({
      where: { userId, type: 'INCOME' },
    });

    const rawExpenses: { accountId: string; accountName: string; subtype: string; amount: number }[] = [];
    let totalExpense = 0;

    for (const acc of expenseAccounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            date: { gte: start, lte: end },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const d = agg._sum.debitAmount ?? new Decimal(0);
      const c = agg._sum.creditAmount ?? new Decimal(0);
      const net = d.minus(c).toNumber();

      if (net > 0) {
        rawExpenses.push({
          accountId: acc.id,
          accountName: acc.name,
          subtype: acc.subtype,
          amount: Math.round(net * 100) / 100,
        });
        totalExpense += net;
      }
    }

    const rawIncome: { accountId: string; accountName: string; subtype: string; amount: number }[] = [];
    let totalIncome = 0;

    for (const acc of incomeAccounts) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            userId,
            date: { gte: start, lte: end },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const d = agg._sum.debitAmount ?? new Decimal(0);
      const c = agg._sum.creditAmount ?? new Decimal(0);
      const net = c.minus(d).toNumber();

      if (net > 0) {
        rawIncome.push({
          accountId: acc.id,
          accountName: acc.name,
          subtype: acc.subtype,
          amount: Math.round(net * 100) / 100,
        });
        totalIncome += net;
      }
    }

    const expenses: CategoryShare[] = rawExpenses
      .map((item) => ({
        ...item,
        percentage: totalExpense > 0 ? parseFloat(((item.amount / totalExpense) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const income: CategoryShare[] = rawIncome
      .map((item) => ({
        ...item,
        percentage: totalIncome > 0 ? parseFloat(((item.amount / totalIncome) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { expenses, income };
  },

  /**
   * Generates a Sankey Financial River Flow graph (Income Streams -> Pool -> Expenses & Savings)
   */
  async getSankeyFlow(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<SankeyGraph> {
    const { expenses, income } = await this.getCategoryBreakdown(userId, startDate, endDate);

    const totalIncome = income.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const netSavings = totalIncome - totalExpense;

    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];

    const POOL_NODE_ID = 'pool_total_inflow';
    nodes.push({
      id: POOL_NODE_ID,
      name: 'Total Revenue Pool',
      type: 'pool',
      color: '#3b82f6',
    });

    // Add Income Nodes & Links to Pool
    if (income.length > 0) {
      for (const inc of income) {
        const nodeId = `income_${inc.accountId}`;
        nodes.push({
          id: nodeId,
          name: inc.accountName,
          type: 'income',
          color: '#10b981',
        });
        links.push({
          source: nodeId,
          target: POOL_NODE_ID,
          value: inc.amount,
        });
      }
    } else {
      // Fallback virtual income node if none recorded yet
      const fallbackId = 'income_unassigned';
      nodes.push({
        id: fallbackId,
        name: 'Initial Balance / Capital',
        type: 'income',
        color: '#10b981',
      });
      links.push({
        source: fallbackId,
        target: POOL_NODE_ID,
        value: Math.max(totalExpense, 1000),
      });
    }

    // Add Expense Nodes & Links from Pool
    for (const exp of expenses) {
      const nodeId = `expense_${exp.accountId}`;
      nodes.push({
        id: nodeId,
        name: exp.accountName,
        type: 'expense',
        color: '#f43f5e',
      });
      links.push({
        source: POOL_NODE_ID,
        target: nodeId,
        value: exp.amount,
      });
    }

    // Add Savings or Deficit link
    if (netSavings > 0) {
      const savingsNodeId = 'savings_net_retained';
      nodes.push({
        id: savingsNodeId,
        name: 'Net Retained Savings',
        type: 'savings',
        color: '#06b6d4',
      });
      links.push({
        source: POOL_NODE_ID,
        target: savingsNodeId,
        value: netSavings,
      });
    } else if (netSavings < 0 && totalIncome > 0) {
      const deficitNodeId = 'deficit_funded_by_reserves';
      nodes.push({
        id: deficitNodeId,
        name: 'Funded by Past Reserves',
        type: 'deficit',
        color: '#eab308',
      });
      links.push({
        source: deficitNodeId,
        target: POOL_NODE_ID,
        value: Math.abs(netSavings),
      });
    }

    return {
      nodes,
      links,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
    };
  },
};
