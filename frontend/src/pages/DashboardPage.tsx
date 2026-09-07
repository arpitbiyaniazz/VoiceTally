import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ledgerApi } from '../api/ledger';
import { useAuth } from '../context/useAuth';
import './DashboardPage.css';

interface AccountSummary {
  id: string;
  name: string;
  type: string;
  subtype: string;
  cachedBalance: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    ledgerApi.listAccounts()
      .then(({ data }) => {
        if (active) setAccounts(data.data || []);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const grouped = {
    ASSET: accounts.filter((a) => a.type === 'ASSET'),
    LIABILITY: accounts.filter((a) => a.type === 'LIABILITY'),
    EQUITY: accounts.filter((a) => a.type === 'EQUITY'),
    INCOME: accounts.filter((a) => a.type === 'INCOME'),
    EXPENSE: accounts.filter((a) => a.type === 'EXPENSE'),
  };

  const totalAssets = grouped.ASSET.reduce((s, a) => s + parseFloat(a.cachedBalance), 0);
  const totalLiabilities = grouped.LIABILITY.reduce((s, a) => s + parseFloat(a.cachedBalance), 0);
  const totalIncome = grouped.INCOME.reduce((s, a) => s + parseFloat(a.cachedBalance), 0);
  const totalExpense = grouped.EXPENSE.reduce((s, a) => s + parseFloat(a.cachedBalance), 0);
  const netWorth = totalAssets - Math.abs(totalLiabilities);
  const netProfit = Math.abs(totalIncome) - Math.abs(totalExpense);

  const formatAmount = (n: number) => {
    const abs = Math.abs(n);
    return `${n < 0 ? '-' : ''}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchesFilter = filterType === 'ALL' || acc.type === filterType;
    const matchesSearch = acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          acc.subtype.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.name || 'Friend'} 👋</h1>
          <p className="page-subtitle">Your double-entry financial pulse and voice ledger</p>
        </div>
        <div className="dashboard-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/voice')}>
            🎙️ Voice Studio
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/vouchers')}>
            + New Voucher
          </button>
        </div>
      </div>

      {/* Net Worth & Voice Hero Banner */}
      <div className="dashboard-hero-banner glass-card">
        <div className="hero-stat-block">
          <div className="hero-stat-label">Estimated Net Worth</div>
          <div className="hero-stat-value">{formatAmount(netWorth)}</div>
          <div className="hero-stat-meta">
            <span className={`hero-status-pill ${netWorth >= 0 ? 'surplus' : 'deficit'}`}>
              {netWorth >= 0 ? '✓ Positive Solvency' : '⚠️ Net Debt Position'}
            </span>
            <span className="hero-stat-hint">Assets ({formatAmount(totalAssets)}) − Liabilities ({formatAmount(Math.abs(totalLiabilities))})</span>
          </div>
        </div>

        <div className="hero-voice-shortcut" onClick={() => navigate('/voice')}>
          <div className="hero-voice-orb">🎙️</div>
          <div className="hero-voice-info">
            <div className="hero-voice-title">VoiceTally AI Assistant</div>
            <div className="hero-voice-prompt">
              Try: <em>"Paid ₹500 for lunch"</em> or <em>"Rahul paid 10000"</em>
            </div>
          </div>
          <div className="hero-voice-arrow">➔</div>
        </div>
      </div>

      {/* Quick Action Tiles */}
      <div className="quick-actions-grid mb-lg">
        <div 
          className="quick-action-card glass-card glass-card-interactive" 
          onClick={() => navigate('/vouchers')}
        >
          <div className="quick-action-icon payment">💸</div>
          <div className="quick-action-content">
            <div className="quick-action-title">Record Expense</div>
            <div className="quick-action-desc">Spendings, rent, groceries, salary</div>
          </div>
        </div>

        <div 
          className="quick-action-card glass-card glass-card-interactive" 
          onClick={() => navigate('/vouchers')}
        >
          <div className="quick-action-icon receipt">💰</div>
          <div className="quick-action-content">
            <div className="quick-action-title">Receive Money</div>
            <div className="quick-action-desc">Income, client payments, loans returned</div>
          </div>
        </div>

        <div 
          className="quick-action-card glass-card glass-card-interactive" 
          onClick={() => navigate('/vouchers')}
        >
          <div className="quick-action-icon contra">🏦</div>
          <div className="quick-action-content">
            <div className="quick-action-title">Bank Transfer</div>
            <div className="quick-action-desc">Move between Cash & Bank accounts</div>
          </div>
        </div>

        <div 
          className="quick-action-card glass-card glass-card-interactive" 
          onClick={() => navigate('/people')}
        >
          <div className="quick-action-icon people">👥</div>
          <div className="quick-action-content">
            <div className="quick-action-title">People & Debts</div>
            <div className="quick-action-desc">Track who owes you & whom you owe</div>
          </div>
        </div>
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="dashboard-grid">
        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Total Assets</span>
            <span className="badge badge-asset">{grouped.ASSET.length} accounts</span>
          </div>
          <div className="dashboard-card-value assets">{formatAmount(totalAssets)}</div>
          <div className="dashboard-card-desc">What you own (Cash, Bank, Receivables)</div>
        </div>

        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Total Liabilities</span>
            <span className="badge badge-liability">{grouped.LIABILITY.length} accounts</span>
          </div>
          <div className="dashboard-card-value liabilities">{formatAmount(Math.abs(totalLiabilities))}</div>
          <div className="dashboard-card-desc">What you owe (Payables & Debts)</div>
        </div>

        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Net Profit / Savings</span>
            <span className="badge badge-income">{netProfit >= 0 ? '+ Profit' : 'Loss'}</span>
          </div>
          <div className={`dashboard-card-value ${netProfit >= 0 ? 'income' : 'expenses'}`}>
            {formatAmount(netProfit)}
          </div>
          <div className="dashboard-card-desc">Revenue ({formatAmount(Math.abs(totalIncome))}) − Expenses</div>
        </div>

        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Total Expenses</span>
            <span className="badge badge-expense">{grouped.EXPENSE.length} categories</span>
          </div>
          <div className="dashboard-card-value expenses">{formatAmount(Math.abs(totalExpense))}</div>
          <div className="dashboard-card-desc">Total outgoings recorded to date</div>
        </div>
      </div>

      {/* Visual Analytics & BI Interactive Banner */}
      <div 
        className="analytics-promo-banner glass-card glass-card-interactive mt-lg"
        onClick={() => navigate('/analytics')}
        style={{
          cursor: 'pointer',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-xl)',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            flexShrink: 0,
          }}>
            🌊
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>
                Sankey Cash Flow River & Predictive Runway Studio
              </span>
              <span className="badge badge-income" style={{ fontSize: '10px' }}>NEW BI</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Explore animated income-to-expense cash flow rivers, category donut charts, and scenario stress-testing.
            </p>
          </div>
        </div>

        <button className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>
          Explore Analytics Studio ➔
        </button>
      </div>

      {/* Account Balances Table */}
      <div className="dashboard-accounts mt-xl">
        <div className="accounts-header-row">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Account Balances</h2>
            <p className="text-sm text-muted">All active accounts in your chart of accounts</p>
          </div>

          <div className="accounts-controls">
            <input
              type="text"
              className="input search-input"
              placeholder="🔍 Search account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: 220, minHeight: 38 }}
            />
            <div className="filter-pill-group">
              {['ALL', 'ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'].map((t) => (
                <button
                  key={t}
                  className={`filter-pill ${filterType === t ? 'active' : ''}`}
                  onClick={() => setFilterType(t)}
                >
                  {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="data-table-wrapper mt-md">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Classification</th>
                <th>Subtype</th>
                <th style={{ textAlign: 'right' }}>Current Balance</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted" style={{ padding: '36px' }}>
                    No accounts matching "{searchQuery}" in {filterType} category
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {acc.name}
                    </td>
                    <td>
                      <span className={`badge badge-${acc.type.toLowerCase()}`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="text-muted">
                      {acc.subtype.replace(/_/g, ' ')}
                    </td>
                    <td className="amount balance">
                      {formatAmount(parseFloat(acc.cachedBalance))}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/accounts/${acc.id}/ledger`)}
                        title={`View transaction ledger for ${acc.name}`}
                      >
                        Ledger ➔
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
