import { useState, useEffect, type FormEvent } from 'react';
import { ledgerApi } from '../api/ledger';

interface PersonData {
  id: string;
  name: string;
  phone: string | null;
  label: string | null;
  balance: string;
  balanceDirection: string;
  balanceLabel: string;
  linkedAccountId: string | null;
}

export function PeoplePage() {
  const [people, setPeople] = useState<PersonData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'SETTLED'>('ALL');

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const fetchPeople = () => {
    ledgerApi.listPeople()
      .then(({ data }) => setPeople(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPeople(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    try {
      await ledgerApi.createPerson({
        name: newName,
        phone: newPhone || undefined,
        label: newLabel || undefined,
      });
      setShowModal(false);
      setNewName('');
      setNewPhone('');
      setNewLabel('');
      fetchPeople();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to create person');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalReceivable = people
    .filter((p) => p.balanceDirection === 'receivable')
    .reduce((s, p) => s + Math.abs(parseFloat(p.balance)), 0);

  const totalPayable = people
    .filter((p) => p.balanceDirection === 'payable')
    .reduce((s, p) => s + Math.abs(parseFloat(p.balance)), 0);

  const filteredPeople = people.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.label && p.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (p.phone && p.phone.includes(searchQuery));
    if (!matchesSearch) return false;

    if (filterType === 'RECEIVABLE') return p.balanceDirection === 'receivable';
    if (filterType === 'PAYABLE') return p.balanceDirection === 'payable';
    if (filterType === 'SETTLED') return parseFloat(p.balance) === 0;
    return true;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page people-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">People & Counterparties</h1>
          <p className="page-subtitle">Track money owed to you and debts you owe to others</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Person
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="dashboard-grid mb-xl">
        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Total You Are Owed</span>
            <span className="badge badge-credit">Receivable</span>
          </div>
          <div className="dashboard-card-value income">
            ₹{totalReceivable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="dashboard-card-desc">People who owe you money</div>
        </div>

        <div className="dashboard-card glass-card">
          <div className="dashboard-card-top">
            <span className="dashboard-card-label">Total You Owe</span>
            <span className="badge badge-debit">Payable</span>
          </div>
          <div className="dashboard-card-value liabilities">
            ₹{totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="dashboard-card-desc">Debts / loans to be settled</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="accounts-header-row mb-md">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Contacts Directory ({people.length})
        </h2>

        <div className="accounts-controls">
          <input
            type="text"
            className="input search-input"
            placeholder="🔍 Search name, label, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 260, minHeight: 40 }}
          />
          <div className="filter-pill-group">
            {[
              { key: 'ALL', label: 'All' },
              { key: 'RECEIVABLE', label: 'Owes You' },
              { key: 'PAYABLE', label: 'You Owe' },
              { key: 'SETTLED', label: 'Settled' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`filter-pill ${filterType === key ? 'active' : ''}`}
                onClick={() => setFilterType(key as any)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredPeople.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No contacts match your query</div>
          <p className="text-muted">Add contacts or try adjusting your filter.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person Name</th>
                <th>Relationship / Tag</th>
                <th>Contact Phone</th>
                <th style={{ textAlign: 'right' }}>Outstanding Balance</th>
                <th>Status / Relationship</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((p) => {
                const bal = parseFloat(p.balance);
                const isReceivable = p.balanceDirection === 'receivable';
                const isPayable = p.balanceDirection === 'payable';

                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: isReceivable ? 'var(--color-credit-bg)' : isPayable ? 'var(--color-debit-bg)' : 'var(--color-bg-tertiary)',
                          color: isReceivable ? '#34d399' : isPayable ? '#fb7185' : 'var(--color-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                        }}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        {p.name}
                      </div>
                    </td>
                    <td className="text-muted">{p.label || '—'}</td>
                    <td className="text-muted font-mono">{p.phone || '—'}</td>
                    <td className="amount balance">
                      {bal === 0 ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>₹0.00</span>
                      ) : (
                        <span style={{ color: isReceivable ? 'var(--color-credit)' : 'var(--color-debit)', fontWeight: 800 }}>
                          ₹{Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${isReceivable ? 'badge-receipt' : isPayable ? 'badge-payment' : 'badge-asset'}`}>
                        {p.balanceLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Person Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Contact / Person</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="toast-error mb-md">⚠️ {error}</div>}
                <div className="form-group">
                  <label className="label">Full Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Rahul Sharma, Priya, Landlord"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Phone Number (optional)</label>
                    <input
                      className="input"
                      placeholder="+91 9876543210"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Tag / Relationship (optional)</label>
                    <input
                      className="input"
                      placeholder="e.g. Supplier, Friend, Tenant, Client"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Contact ➔'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
