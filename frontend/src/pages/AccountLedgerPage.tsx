import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ledgerApi } from '../api/ledger';

interface LedgerRow {
  date: string;
  narration: string;
  voucherType: string;
  debitAmount: string;
  creditAmount: string;
  runningBalance: string;
  journalEntryId: string;
}

export function AccountLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = useState<any>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;

    Promise.all([
      ledgerApi.getAccount(accountId),
      ledgerApi.getAccountLedger(accountId),
    ])
      .then(([accRes, ledgerRes]) => {
        setAccount(accRes.data.data);
        setRows(ledgerRes.data.data?.rows || []);
        setOpeningBalance(ledgerRes.data.data?.openingBalance || '0');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accountId]);

  const fmt = (n: string) => {
    const val = parseFloat(n);
    if (val === 0) return '—';
    return `₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const fmtBal = (n: string) => {
    const val = parseFloat(n);
    const prefix = val < 0 ? '-' : '';
    return `${prefix}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const currentBal = parseFloat(account?.liveBalance || account?.cachedBalance || '0');

  return (
    <div className="page ledger-page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm mb-sm" onClick={() => navigate(-1)}>
            ← Back to Accounts
          </button>
          <h1 className="page-title">{account?.name || 'Account'} — Ledger</h1>
          <p className="page-subtitle">
            <span className={`badge badge-${account?.type?.toLowerCase()}`}>{account?.type}</span>
            {' '}
            <span className="text-muted">{account?.subtype?.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <div className="glass-card" style={{ padding: '18px 28px', textAlign: 'right' }}>
          <div className="text-xs font-bold text-muted uppercase tracking-wide">Closing Balance</div>
          <div
            className="font-mono"
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 800,
              color: currentBal >= 0 ? 'var(--color-text-primary)' : 'var(--color-debit)',
            }}
          >
            {fmtBal(currentBal.toString())}
          </div>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Date</th>
              <th style={{ width: '40%' }}>Narration / Description</th>
              <th style={{ width: '12%' }}>Voucher Type</th>
              <th style={{ textAlign: 'right', width: '12%' }}>Debit (+)</th>
              <th style={{ textAlign: 'right', width: '12%' }}>Credit (−)</th>
              <th style={{ textAlign: 'right', width: '12%' }}>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {parseFloat(openingBalance) !== 0 && (
              <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                <td colSpan={3} style={{ fontWeight: 700, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                  Opening Balance Brought Forward
                </td>
                <td></td>
                <td></td>
                <td className="amount balance" style={{ fontWeight: 800 }}>{fmtBal(openingBalance)}</td>
              </tr>
            )}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted" style={{ padding: '48px' }}>
                  No transactions recorded in this ledger yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(row.date)}</td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{row.narration}</td>
                  <td>
                    <span className={`badge badge-${row.voucherType.toLowerCase()}`}>
                      {row.voucherType}
                    </span>
                  </td>
                  <td className="amount debit">{fmt(row.debitAmount)}</td>
                  <td className="amount credit">{fmt(row.creditAmount)}</td>
                  <td className="amount balance" style={{ fontWeight: 700 }}>
                    {fmtBal(row.runningBalance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
