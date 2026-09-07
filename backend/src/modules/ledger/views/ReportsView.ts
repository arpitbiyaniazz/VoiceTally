import type { ApiResponse } from '../../../core/types/index.js';
import type {
  TrialBalanceReport,
  ProfitAndLossReport,
  BalanceSheetReport,
  CashFlowReport,
} from '../models/ReportsModel.js';

export const ReportsView = {
  trialBalance(report: TrialBalanceReport): ApiResponse {
    return {
      success: true,
      data: {
        asOfDate: report.asOfDate,
        totalDebit: report.totalDebit.toString(),
        totalCredit: report.totalCredit.toString(),
        isBalanced: report.isBalanced,
        difference: report.difference.toString(),
        rows: report.rows.map((r) => ({
          accountId: r.accountId,
          accountName: r.accountName,
          type: r.type,
          subtype: r.subtype,
          debitBalance: r.debitBalance.toString(),
          creditBalance: r.creditBalance.toString(),
        })),
      },
    };
  },

  profitAndLoss(report: ProfitAndLossReport): ApiResponse {
    return {
      success: true,
      data: {
        startDate: report.startDate,
        endDate: report.endDate,
        totalIncome: report.totalIncome.toString(),
        totalExpense: report.totalExpense.toString(),
        netProfit: report.netProfit.toString(),
        isProfitable: report.isProfitable,
        incomeAccounts: report.incomeAccounts.map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          amount: a.amount.toString(),
        })),
        expenseAccounts: report.expenseAccounts.map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          amount: a.amount.toString(),
        })),
      },
    };
  },

  balanceSheet(report: BalanceSheetReport): ApiResponse {
    return {
      success: true,
      data: {
        asOfDate: report.asOfDate,
        isBalanced: report.isBalanced,
        difference: report.difference.toString(),
        assets: {
          totalAssets: report.assets.totalAssets.toString(),
          cashAndBank: report.assets.cashAndBank.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
          receivables: report.assets.receivables.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
          otherAssets: report.assets.otherAssets.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
        },
        liabilities: {
          totalLiabilities: report.liabilities.totalLiabilities.toString(),
          payables: report.liabilities.payables.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
          otherLiabilities: report.liabilities.otherLiabilities.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
        },
        equity: {
          totalEquity: report.equity.totalEquity.toString(),
          currentPeriodEarnings: report.equity.currentPeriodEarnings.toString(),
          capital: report.equity.capital.map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount.toString(),
          })),
        },
        totalLiabilitiesAndEquity: report.totalLiabilitiesAndEquity.toString(),
      },
    };
  },

  cashFlow(report: CashFlowReport): ApiResponse {
    return {
      success: true,
      data: {
        startDate: report.startDate,
        endDate: report.endDate,
        openingCashBalance: report.openingCashBalance.toString(),
        closingCashBalance: report.closingCashBalance.toString(),
        netCashFlow: report.netCashFlow.toString(),
        totalOperating: report.totalOperating.toString(),
        totalInvesting: report.totalInvesting.toString(),
        totalFinancing: report.totalFinancing.toString(),
        operatingActivities: report.operatingActivities.map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          amount: a.amount.toString(),
        })),
        investingActivities: report.investingActivities.map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          amount: a.amount.toString(),
        })),
        financingActivities: report.financingActivities.map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          amount: a.amount.toString(),
        })),
      },
    };
  },
};
