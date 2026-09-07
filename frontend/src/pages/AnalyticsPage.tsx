import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ledgerApi } from '../api/ledger';
import { SankeyFlowChart } from '../components/analytics/SankeyFlowChart';
import type { SankeyNode, SankeyLink } from '../components/analytics/SankeyFlowChart';
import { CategoryDonutChart } from '../components/analytics/CategoryDonutChart';
import type { CategoryItem } from '../components/analytics/CategoryDonutChart';
import { TrendBarChart } from '../components/analytics/TrendBarChart';
import type { MonthlyTrendItem } from '../components/analytics/TrendBarChart';
import { RunwaySimulator } from '../components/analytics/RunwaySimulator';
import './AnalyticsPage.css';

interface SummaryData {
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

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<'30D' | '90D' | '6M' | '1Y'>('90D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<MonthlyTrendItem[]>([]);
  const [expenses, setExpenses] = useState<CategoryItem[]>([]);
  const [income, setIncome] = useState<CategoryItem[]>([]);
  const [sankey, setSankey] = useState<{
    nodes: SankeyNode[];
    links: SankeyLink[];
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
  } | null>(null);

  const formatAmount = (n: number) => {
    const abs = Math.abs(n);
    return `${n < 0 ? '-' : ''}₹${abs.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');

    const now = new Date();
    let startDate: Date | undefined;
    let months = 6;

    if (timeFilter === '30D') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      months = 3;
    } else if (timeFilter === '90D') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      months = 6;
    } else if (timeFilter === '6M') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      months = 6;
    } else if (timeFilter === '1Y') {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      months = 12;
    }

    const startStr = startDate ? startDate.toISOString().split('T')[0] : undefined;
    const endStr = now.toISOString().split('T')[0];

    try {
      const [sumRes, trendRes, catRes, sankeyRes] = await Promise.all([
        ledgerApi.getAnalyticsSummary(),
        ledgerApi.getAnalyticsTrends(months),
        ledgerApi.getCategoryBreakdown(startStr, endStr),
        ledgerApi.getSankeyFlow(startStr, endStr),
      ]);

      setSummary(sumRes.data.data);
      setTrends(trendRes.data.data || []);
      setExpenses(catRes.data.data?.expenses || []);
      setIncome(catRes.data.data?.income || []);
      setSankey(sankeyRes.data.data);
    } catch (err: any) {
      console.error('Failed to load analytics', err);
      setError('Unable to load analytics data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page analytics-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Financial Intelligence & Analytics</h1>
          <p className="page-subtitle">
            Interactive visual insights, cash flow rivers, and predictive runway models
          </p>
        </div>

        <div className="analytics-header-controls">
          <div className="filter-pill-group">
            {(['30D', '90D', '6M', '1Y'] as const).map((t) => (
              <button
                key={t}
                className={`filter-pill ${timeFilter === t ? 'active' : ''}`}
                onClick={() => setTimeFilter(t)}
              >
                {t === '30D' ? 'Last 30 Days' : t === '90D' ? 'Last Quarter' : t === '6M' ? 'Last 6 Mos' : 'Past Year'}
              </button>
            ))}
          </div>

          <button className="btn btn-secondary" onClick={() => navigate('/voice')}>
            🎙️ Voice Query
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-md">{error}</div>}

      {/* KPI Highlight Strip */}
      {summary && (
        <div className="analytics-kpi-grid mb-lg">
          <div className="kpi-metric-card glass-card">
            <div className="kpi-top">
              <span className="kpi-label">Liquid Cash Pool</span>
              <span className="badge badge-asset">Ready Capital</span>
            </div>
            <div className="kpi-value positive">{formatAmount(summary.totalLiquidCash)}</div>
            <div className="kpi-hint">Cash in hand & Verified Bank Balances</div>
          </div>

          <div className="kpi-metric-card glass-card">
            <div className="kpi-top">
              <span className="kpi-label">Avg Monthly Burn</span>
              <span className="badge badge-expense">Trailing 3M</span>
            </div>
            <div className="kpi-value warning">{formatAmount(summary.averageMonthlyBurn)}/mo</div>
            <div className="kpi-hint">Operating & personal expenses run-rate</div>
          </div>

          <div className="kpi-metric-card glass-card">
            <div className="kpi-top">
              <span className="kpi-label">Net Savings Rate</span>
              <span className="badge badge-income">Efficiency</span>
            </div>
            <div className={`kpi-value ${summary.savingsRate >= 20 ? 'positive' : 'neutral'}`}>
              {summary.savingsRate}%
            </div>
            <div className="kpi-hint">Share of revenue retained after expenses</div>
          </div>

          <div className="kpi-metric-card glass-card">
            <div className="kpi-top">
              <span className="kpi-label">Solvency Ratio</span>
              <span className="badge badge-neutral">Assets / Debts</span>
            </div>
            <div className="kpi-value positive">
              {summary.solvencyRatio >= 999 ? '∞ Zero Debt' : `${summary.solvencyRatio}x`}
            </div>
            <div className="kpi-hint">Total Assets vs Outstanding Payables</div>
          </div>
        </div>
      )}

      {/* Section 1: Sankey Cash Flow River Diagram */}
      <div className="analytics-section-card glass-card mb-lg">
        <div className="section-card-header">
          <div>
            <h2 className="section-card-title">🌊 Cash Flow River (Sankey Diagram)</h2>
            <p className="section-card-subtitle">
              Visualizing how all revenue flows into your central operating pool and disperses into expense sinks & net savings
            </p>
          </div>
        </div>

        {sankey && (
          <SankeyFlowChart
            nodes={sankey.nodes}
            links={sankey.links}
            totalIncome={sankey.totalIncome}
            totalExpense={sankey.totalExpense}
            netSavings={sankey.netSavings}
            formatAmount={formatAmount}
          />
        )}
      </div>

      {/* Section 2: 2-Column Donuts for Category Distribution */}
      <div className="analytics-donuts-grid mb-lg">
        <CategoryDonutChart
          title="Expense Category Distribution"
          categories={expenses}
          formatAmount={formatAmount}
          emptyMessage="No expense transactions found in this period."
        />

        <CategoryDonutChart
          title="Income Source Breakdown"
          categories={income}
          formatAmount={formatAmount}
          colorPalette={['#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#14b8a6']}
          emptyMessage="No income transactions found in this period."
        />
      </div>

      {/* Section 3: Monthly Trendline Bar Chart */}
      <div className="mb-lg">
        <TrendBarChart trends={trends} formatAmount={formatAmount} />
      </div>

      {/* Section 4: Predictive Cash Runway & Burn Simulator */}
      {summary && (
        <div className="mb-lg">
          <RunwaySimulator
            totalLiquidCash={summary.totalLiquidCash}
            totalReceivables={summary.totalReceivables}
            averageMonthlyBurn={summary.averageMonthlyBurn}
            monthlyIncomeAverage={summary.monthlyIncomeAverage}
            formatAmount={formatAmount}
          />
        </div>
      )}
    </div>
  );
}
