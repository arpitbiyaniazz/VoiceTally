import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SankeyFlowChart } from '../components/analytics/SankeyFlowChart';
import { CategoryDonutChart } from '../components/analytics/CategoryDonutChart';
import { TrendBarChart } from '../components/analytics/TrendBarChart';
import { RunwaySimulator } from '../components/analytics/RunwaySimulator';

describe('Visual BI Analytics Components', () => {
  const formatAmount = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  it('renders SankeyFlowChart with income, pool, and expense flows', () => {
    const nodes = [
      { id: 'inc-1', name: 'Freelance Consulting', type: 'income' as const },
      { id: 'pool', name: 'Total Revenue Pool', type: 'pool' as const },
      { id: 'exp-1', name: 'Office Rent', type: 'expense' as const },
      { id: 'sav-1', name: 'Net Retained Savings', type: 'savings' as const },
    ];
    const links = [
      { source: 'inc-1', target: 'pool', value: 50000 },
      { source: 'pool', target: 'exp-1', value: 20000 },
      { source: 'pool', target: 'sav-1', value: 30000 },
    ];

    render(
      <SankeyFlowChart
        nodes={nodes}
        links={links}
        totalIncome={50000}
        totalExpense={20000}
        netSavings={30000}
        formatAmount={formatAmount}
      />
    );

    expect(screen.getByText(/Inflows: ₹50,000/i)).toBeInTheDocument();
    expect(screen.getByText(/Outflows: ₹20,000/i)).toBeInTheDocument();
    expect(screen.getByText(/Net Retained: ₹30,000/i)).toBeInTheDocument();
    expect(screen.getByText(/Freelance/i)).toBeInTheDocument();
    expect(screen.getByText(/Office Rent/i)).toBeInTheDocument();
  });

  it('renders CategoryDonutChart and displays interactive category legends', () => {
    const categories = [
      { accountId: '1', accountName: 'Rent', subtype: 'EXPENSE_CATEGORY', amount: 20000, percentage: 66.7 },
      { accountId: '2', accountName: 'Food', subtype: 'EXPENSE_CATEGORY', amount: 10000, percentage: 33.3 },
    ];

    render(
      <CategoryDonutChart
        title="Expense Categories"
        categories={categories}
        formatAmount={formatAmount}
      />
    );

    expect(screen.getByText('Expense Categories')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('renders TrendBarChart with monthly trend bars', () => {
    const trends = [
      { monthKey: '2026-01', monthLabel: 'Jan 2026', income: 40000, expense: 15000, netSavings: 25000 },
      { monthKey: '2026-02', monthLabel: 'Feb 2026', income: 60000, expense: 20000, netSavings: 40000 },
    ];

    render(<TrendBarChart trends={trends} formatAmount={formatAmount} />);

    expect(screen.getByText('Income vs Expense Trends')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });

  it('renders RunwaySimulator and calculates dynamic runway changes on slider input', () => {
    render(
      <RunwaySimulator
        totalLiquidCash={100000}
        totalReceivables={50000}
        averageMonthlyBurn={25000}
        monthlyIncomeAverage={0}
        formatAmount={formatAmount}
      />
    );

    expect(screen.getByText(/Predictive Cash Runway & Burn Simulator/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate Runway/i)).toBeInTheDocument();

    // Adjust burn slider
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBe(3);

    fireEvent.change(sliders[0], { target: { value: '50' } }); // +50% burn
    expect(screen.getByText(/Reset Baseline/i)).toBeInTheDocument();
  });
});
