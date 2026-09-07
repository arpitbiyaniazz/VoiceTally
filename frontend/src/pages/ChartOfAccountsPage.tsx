import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ledgerApi } from '../api/ledger';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  cachedBalance: string;
  cashFlowCategory: string;
}

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const SUBTYPE_MAP: Record<string, string[]> = {
  ASSET: ['CASH_BANK', 'PERSON'],
  LIABILITY: ['PERSON'],
  EQUITY: ['EQUITY_CAPITAL'],
  INCOME: ['INCOME_CATEGORY'],
  EXPENSE: ['EXPENSE_CATEGORY'],
};

export function ChartOfAccountsPage() {
  const navigate = useNavigate();
  const [chart, setChart] = useState<Record<string, Account[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // New account form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('EXPENSE');
  const [newSubtype, setNewSubtype] = useState('EXPENSE_CATEGORY');
  const [newCashFlow, setNewCashFlow] = useState('OPERATING');

  const fetchChart = () => {
    ledgerApi.getChartOfAccounts()
      .then(({ data }) => setChart(data.data || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchChart(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await ledgerApi.createAccount({
        name: newName,
        type: newType,
        subtype: newSubtype,
        cashFlowCategory: newCashFlow,
      });
      setShowModal(false);
      setNewName('');
      fetchChart();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to create account');
    }
  };

  const formatBal = (b: string) => {
    const n = parseFloat(b);
    return `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page chart-accounts-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="page-subtitle">Categorized master structure for all your financial ledgers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Account
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-lg" style={{ maxWidth: 320 }}>
        <input
          type="text"
          className="input search-input"
          placeholder="🔍 Search account in chart..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {ACCOUNT_TYPES.map((type) => {
        const rawAccounts = chart[type] || [];
        const accounts = rawAccounts.filter((a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.subtype.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (accounts.length === 0 && searchQuery) return null;
        if (rawAccounts.length === 0) return null;

        return (
          <div key={type} className="mb-xl">
            <div className="flex items-center justify-between mb-md">
              <h2 className="flex items-center gap-sm">
                <span className={`badge badge-${type.toLowerCase()}`} style={{ fontSize: 'var(--text-sm)', padding: '6px 14px' }}>
                  {type} ACCOUNTS
                </span>
                <span className="text-sm text-muted">({accounts.length} active)</span>
              </h2>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Account Name</th>
                    <th style={{ width: '25%' }}>Account Subtype</th>
                    <th style={{ width: '20%' }}>Cash Flow Group</th>
                    <th style={{ textAlign: 'right', width: '20%' }}>Current Balance</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc: Account) => (
                    <tr key={acc.id}>
                      <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {acc.name}
                      </td>
                      <td className="text-muted">
                        <span style={{ textTransform: 'capitalize' }}>
                          {acc.subtype.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </td>
                      <td className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {acc.cashFlowCategory}
                      </td>
                      <td className="amount balance">
                        {formatBal(acc.cachedBalance)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/accounts/${acc.id}/ledger`)}
                          title="Open account ledger"
                        >
                          Ledger ➔
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Account Creation Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Account</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="toast-error mb-md">⚠️ {error}</div>}
                <div className="form-group">
                  <label className="label">Account Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Groceries, Office Rent, Consulting Revenue, Bank Savings"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Primary Type</label>
                    <select
                      className="select"
                      value={newType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setNewType(nextType);
                        setNewSubtype(SUBTYPE_MAP[nextType]?.[0] || '');
                      }}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Subtype</label>
                    <select
                      className="select"
                      value={newSubtype}
                      onChange={(e) => setNewSubtype(e.target.value)}
                    >
                      {(SUBTYPE_MAP[newType] || []).map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Cash Flow Statement Category</label>
                  <select
                    className="select"
                    value={newCashFlow}
                    onChange={(e) => setNewCashFlow(e.target.value)}
                  >
                    <option value="OPERATING">Operating (Day-to-day revenue/expenses)</option>
                    <option value="INVESTING">Investing (Assets, equipment)</option>
                    <option value="FINANCING">Financing (Loans, equity capital)</option>
                    <option value="NONE">None</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Account ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
