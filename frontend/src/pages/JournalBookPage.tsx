import React, { useState, useEffect } from 'react';
import { ledgerApi } from '../api/ledger';

interface JournalEntry {
  id: string;
  date: string;
  narration: string;
  voucherType: string;
  source: string;
  postedAt: string | null;
  lines: { accountName: string; debitAmount: string; creditAmount: string }[];
}

export function JournalBookPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [voucherFilter, setVoucherFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    ledgerApi.listEntries({ page, pageSize: 50 })
      .then(({ data }) => {
        if (active) {
          setEntries(data.data || []);
          setTotal(data.meta?.total || 0);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page]);

  const fmt = (n: string) => {
    const val = parseFloat(n);
    if (val === 0) return '—';
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const filteredEntries = entries.filter((entry) => {
    const matchesVoucher = voucherFilter === 'ALL' || entry.voucherType === voucherFilter;
    const matchesSearch = entry.narration.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          entry.lines.some((l) => l.accountName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesVoucher && matchesSearch;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page journal-book-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal Book</h1>
          <p className="page-subtitle">Chronological ledger of all posted double-entry transactions ({total} total)</p>
        </div>

        <div className="accounts-controls">
          <input
            type="text"
            className="input search-input"
            placeholder="🔍 Search narration or account..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 260, minHeight: 40 }}
          />
          <div className="filter-pill-group">
            {['ALL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'].map((t) => (
              <button
                key={t}
                className={`filter-pill ${voucherFilter === t ? 'active' : ''}`}
                onClick={() => setVoucherFilter(t)}
              >
                {t === 'ALL' ? 'All Vouchers' : t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📒</div>
          <div className="empty-state-title">No transactions found</div>
          <p className="text-muted">
            {searchQuery || voucherFilter !== 'ALL'
              ? 'Try changing your search keywords or filter category.'
              : 'Post your first voucher or speak a voice command to see entries here.'}
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Date</th>
                <th style={{ width: '40%' }}>Narration / Description</th>
                <th style={{ width: '15%' }}>Voucher Type</th>
                <th style={{ width: '13%' }}>Channel / Source</th>
                <th style={{ width: '12%' }}>Verification</th>
                <th style={{ width: '8%', textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isExpanded = expandedId === entry.id;

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      title="Click to view debit and credit line breakdown"
                    >
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {fmtDate(entry.date)}
                      </td>
                      <td style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {entry.narration}
                      </td>
                      <td>
                        <span className={`badge badge-${entry.voucherType.toLowerCase()}`}>
                          {entry.voucherType}
                        </span>
                      </td>
                      <td className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {entry.source === 'VOICE' ? '🎙️ Voice AI' : '📝 Manual'}
                      </td>
                      <td>
                        {entry.postedAt ? (
                          <span style={{ color: 'var(--color-credit)', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                            ✓ Balanced
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                            ⏳ Pending
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--color-accent)', fontWeight: 700 }}>
                        {isExpanded ? '▲ Hide' : '▼ View'}
                      </td>
                    </tr>

                    {/* Expandable Line Breakdown */}
                    {isExpanded && (
                      <tr key={`${entry.id}-lines`}>
                        <td colSpan={6} style={{ padding: 0, background: 'var(--color-bg-tertiary)' }}>
                          <div style={{ padding: '16px 24px', borderLeft: '4px solid var(--color-accent)' }}>
                            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                              Double-Entry Breakdown (ID: {entry.id})
                            </div>
                            <table className="data-table" style={{ margin: 0, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                              <thead>
                                <tr>
                                  <th>Affected Account</th>
                                  <th style={{ textAlign: 'right' }}>Debit (+)</th>
                                  <th style={{ textAlign: 'right' }}>Credit (−)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((line, i) => (
                                  <tr key={i}>
                                    <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                      {line.accountName}
                                    </td>
                                    <td className="amount debit">{fmt(line.debitAmount)}</td>
                                    <td className="amount credit">{fmt(line.creditAmount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-between mt-lg">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="text-sm text-muted">Page {page} of {Math.ceil(total / 50)}</span>
          <button className="btn btn-sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
