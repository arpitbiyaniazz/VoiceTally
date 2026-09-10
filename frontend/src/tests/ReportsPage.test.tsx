import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReportsPage } from '../pages/ReportsPage';
import { ledgerApi } from '../api/ledger';

vi.mock('../api/ledger', () => ({
  ledgerApi: {
    getProfitAndLoss: vi.fn(),
    getBalanceSheet: vi.fn(),
    getCashFlowStatement: vi.fn(),
    getTrialBalance: vi.fn(),
  },
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Arpit Biyani', email: 'arpit@example.com' },
    loading: false,
  }),
}));

describe('UI: ReportsPage Financial Statements & Print Table', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (ledgerApi.getProfitAndLoss as any).mockResolvedValue({
      data: {
        success: true,
        data: {
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
          incomeAccounts: [
            { accountId: 'inc-1', accountName: 'Revenues / Client Services', amount: 139079 },
          ],
          totalIncome: 139079,
          expenseAccounts: [
            { accountId: 'exp-1', accountName: 'SG&A (Operating Expenses)', amount: 117423 },
            { accountId: 'exp-2', accountName: 'D&A', amount: 2158 },
            { accountId: 'exp-3', accountName: 'Financial Expenses', amount: 511 },
            { accountId: 'exp-4', accountName: 'Corporation Tax', amount: 2326 },
          ],
          totalExpense: 122418,
          netProfit: 16661,
          isProfitable: true,
        },
      },
    });

    (ledgerApi.getBalanceSheet as any).mockResolvedValue({
      data: {
        success: true,
        data: {
          asOfDate: new Date('2026-09-08'),
          assets: {
            cashAndBank: [{ accountId: 'a-1', accountName: 'Bank of India', amount: 100000 }],
            receivables: [{ accountId: 'a-2', accountName: 'Trade Receivables', amount: 50000 }],
            otherAssets: [],
            totalAssets: 150000,
          },
          liabilities: {
            payables: [{ accountId: 'l-1', accountName: 'Trade Creditors', amount: 30000 }],
            otherLiabilities: [],
            totalLiabilities: 30000,
          },
          equity: {
            capital: [{ accountId: 'e-1', accountName: 'Owner Capital', amount: 103339 }],
            currentPeriodEarnings: 16661,
            totalEquity: 120000,
          },
          totalLiabilitiesAndEquity: 150000,
          isBalanced: true,
          difference: 0,
        },
      },
    });
  });

  it('renders formal statement table with P&L header, gross profit, and net income', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Financial Statements')).toBeInTheDocument();
    expect(screen.getByText(/Print Statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Table Format/i)).toBeInTheDocument();

    await waitFor(() => {
      // Table header with P&L (₹)
      expect(screen.getByText('P&L (₹)')).toBeInTheDocument();
      // Line items
      expect(screen.getByText('Gross profit')).toBeInTheDocument();
      expect(screen.getByText('EBITDA')).toBeInTheDocument();
      expect(screen.getByText('Operating income')).toBeInTheDocument();
      expect(screen.getByText('Profit before tax')).toBeInTheDocument();
      expect(screen.getByText('Net income')).toBeInTheDocument();
      // Accounting values formatted properly
      expect(screen.getAllByText('139,079').length).toBeGreaterThan(0);
      expect(screen.getAllByText('16,661').length).toBeGreaterThan(0);
    });
  });

  it('triggers window.print when print button is clicked', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('P&L (₹)')).toBeInTheDocument();
    });

    const printBtn = screen.getByRole('button', { name: /Print Statement/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('switches to Balance Sheet tab and renders formal balance sheet table', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    const bsTab = screen.getByRole('button', { name: /Balance Sheet/i });
    fireEvent.click(bsTab);

    await waitFor(() => {
      expect(screen.getByText('Balance Sheet (₹)')).toBeInTheDocument();
      expect(screen.getByText('1. ASSETS')).toBeInTheDocument();
      expect(screen.getByText('Total Assets')).toBeInTheDocument();
      expect(screen.getByText('2. LIABILITIES')).toBeInTheDocument();
      expect(screen.getByText('Total Liabilities')).toBeInTheDocument();
      expect(screen.getByText('Total Liabilities + Equity')).toBeInTheDocument();
      expect(screen.getAllByText('150,000').length).toBeGreaterThan(0);
    });
  });

  it('toggles between Table Format and Visual BI Cards view', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('P&L (₹)')).toBeInTheDocument();
    });

    const cardsToggle = screen.getByRole('button', { name: /Visual BI Cards/i });
    fireEvent.click(cardsToggle);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Net Profit / Loss')).toBeInTheDocument();

    const tableToggle = screen.getByRole('button', { name: /Table Format/i });
    fireEvent.click(tableToggle);

    expect(screen.getByText('P&L (₹)')).toBeInTheDocument();
  });
});
