import { useState, useEffect, type FormEvent } from 'react';
import { ledgerApi, type VoucherPayload } from '../api/ledger';
import './VoucherEntryPage.css';

type VoucherType = 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
}

interface JournalLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
}

const VOUCHER_DESCRIPTIONS: Record<VoucherType, { title: string; desc: string; icon: string; tag: string }> = {
  PAYMENT: {
    title: 'Payment Voucher',
    desc: 'Money Out — Record payments for expenses, bills, or creditors',
    icon: '💸',
    tag: 'Expense / Outflow',
  },
  RECEIPT: {
    title: 'Receipt Voucher',
    desc: 'Money In — Record collections, sales, income, or debtor returns',
    icon: '💰',
    tag: 'Income / Inflow',
  },
  CONTRA: {
    title: 'Contra Voucher',
    desc: 'Internal Transfer — Transfer money between Cash & Bank accounts',
    icon: '🏦',
    tag: 'Cash & Bank Move',
  },
  JOURNAL: {
    title: 'Journal Entry',
    desc: 'Double-Entry — Multi-account adjustments with balanced debits & credits',
    icon: '📒',
    tag: 'General Ledger',
  },
};

export function VoucherEntryPage() {
  const [voucherType, setVoucherType] = useState<VoucherType>('PAYMENT');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Common fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [amount, setAmount] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [counterAccountId, setCounterAccountId] = useState('');

  // Contra fields
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');

  // Journal fields
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    { accountId: '', debitAmount: '', creditAmount: '' },
    { accountId: '', debitAmount: '', creditAmount: '' },
  ]);

  useEffect(() => {
    ledgerApi.listAccounts().then(({ data }) => {
      const accs = data.data || [];
      setAccounts(accs);
      
      const cashAccounts = accs.filter((a: Account) => a.subtype === 'CASH_BANK');
      if (cashAccounts.length > 0) {
        setCashAccountId(cashAccounts[0].id);
        setFromAccountId(cashAccounts[0].id);
        if (cashAccounts.length > 1) {
          setToAccountId(cashAccounts[1].id);
        }
      }
    });
  }, []);

  const cashBankAccounts = accounts.filter((a) => a.subtype === 'CASH_BANK');
  const nonCashAccounts = accounts.filter((a) => a.subtype !== 'CASH_BANK');

  const resetForm = () => {
    setNarration('');
    setAmount('');
    setJournalLines([
      { accountId: '', debitAmount: '', creditAmount: '' },
      { accountId: '', debitAmount: '', creditAmount: '' },
    ]);
  };

  const addAmountChip = (val: number) => {
    const curr = parseFloat(amount) || 0;
    setAmount((curr + val).toString());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let payload: VoucherPayload;

      if (voucherType === 'PAYMENT' || voucherType === 'RECEIPT') {
        payload = {
          voucherType,
          amount: parseFloat(amount),
          date,
          narration,
          cashAccountId,
          counterAccountId,
        };
      } else if (voucherType === 'CONTRA') {
        payload = {
          voucherType,
          amount: parseFloat(amount),
          date,
          narration,
          fromAccountId,
          toAccountId,
        };
      } else {
        payload = {
          voucherType: 'JOURNAL',
          date,
          narration,
          lines: journalLines
            .filter((l) => l.accountId)
            .map((l) => ({
              accountId: l.accountId,
              debitAmount: parseFloat(l.debitAmount) || 0,
              creditAmount: parseFloat(l.creditAmount) || 0,
            })),
        };
      }

      await ledgerApi.postVoucher(payload);
      setSuccess(`✓ ${voucherType} voucher posted successfully to ledger!`);
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to post voucher');
    } finally {
      setLoading(false);
    }
  };

  const addJournalLine = () => {
    setJournalLines([...journalLines, { accountId: '', debitAmount: '', creditAmount: '' }]);
  };

  const updateJournalLine = (index: number, field: keyof JournalLine, value: string) => {
    const updated = [...journalLines];
    updated[index] = { ...updated[index], [field]: value };
    setJournalLines(updated);
  };

  const removeJournalLine = (index: number) => {
    if (journalLines.length <= 2) return;
    setJournalLines(journalLines.filter((_, i) => i !== index));
  };

  const journalDebits = journalLines.reduce((s, l) => s + (parseFloat(l.debitAmount) || 0), 0);
  const journalCredits = journalLines.reduce((s, l) => s + (parseFloat(l.creditAmount) || 0), 0);
  const journalBalanced = Math.abs(journalDebits - journalCredits) < 0.01 && journalDebits > 0;

  return (
    <div className="page voucher-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Voucher Entry</h1>
          <p className="page-subtitle">Create double-entry financial transactions with live verification</p>
        </div>
      </div>

      {/* Voucher Type Tabs */}
      <div className="voucher-cards-selector">
        {(['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'] as VoucherType[]).map((type) => {
          const info = VOUCHER_DESCRIPTIONS[type];
          const isSelected = voucherType === type;

          return (
            <div
              key={type}
              className={`voucher-type-card glass-card glass-card-interactive ${isSelected ? 'active ' + type.toLowerCase() : ''}`}
              onClick={() => {
                setVoucherType(type);
                setError('');
                setSuccess('');
              }}
            >
              <div className="voucher-card-top">
                <span className="voucher-card-icon">{info.icon}</span>
                <span className={`badge badge-${type.toLowerCase()}`}>{type}</span>
              </div>
              <div className="voucher-card-title">{info.title}</div>
              <div className="voucher-card-desc">{info.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Feedback Banners */}
      {success && (
        <div className="toast-success mb-md" style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)' }}>
          {success}
        </div>
      )}
      {error && (
        <div className="toast-error mb-md" style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Transaction Entry Form */}
      <form className="voucher-form-container glass-card" onSubmit={handleSubmit}>
        <div className="form-section-title">
          <span>📅</span> Transaction Details
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="label">Narration</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Paid office electricity bill, Client retainer, Grocery purchase"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              required
            />
          </div>
        </div>

        {/* PAYMENT & RECEIPT Specific Fields */}
        {(voucherType === 'PAYMENT' || voucherType === 'RECEIPT') && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Amount (₹)</label>
                <div className="amount-input-wrapper">
                  <span className="currency-prefix">₹</span>
                  <input
                    type="number"
                    className="input input-amount-field"
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                {/* Quick Add Chips */}
                <div className="amount-quick-chips">
                  {[500, 1000, 2000, 5000, 10000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="amount-chip"
                      onClick={() => addAmountChip(val)}
                    >
                      +₹{val.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">
                  {voucherType === 'PAYMENT' ? 'Cash / Bank Account' : 'Cash / Bank Account'}
                </label>
                <select
                  className="select"
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  required
                >
                  <option value="">Select cash / bank account</option>
                  {cashBankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="label">
                {voucherType === 'PAYMENT'
                  ? 'Expense / Person Account'
                  : 'Income / Person Account'}
              </label>
              <select
                className="select"
                value={counterAccountId}
                onChange={(e) => setCounterAccountId(e.target.value)}
                required
              >
                <option value="">Select category or counterparty</option>
                {nonCashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>

            {/* Live Double-Entry Preview Card */}
            {amount && cashAccountId && counterAccountId && (
              <div className="voucher-preview-card glass-card mt-lg">
                <div className="preview-header">
                  <span className="preview-title">⚡ Live Ledger Impact Preview</span>
                  <span className="badge badge-journal">Debits = Credits: ₹{parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th>Classification</th>
                        <th style={{ textAlign: 'right' }}>Debit Impact (+)</th>
                        <th style={{ textAlign: 'right' }}>Credit Impact (−)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {voucherType === 'PAYMENT'
                            ? accounts.find((a) => a.id === counterAccountId)?.name
                            : accounts.find((a) => a.id === cashAccountId)?.name}
                        </td>
                        <td>
                          <span className="badge badge-debit">Debit Side</span>
                        </td>
                        <td className="amount debit">₹{parseFloat(amount).toFixed(2)}</td>
                        <td className="amount">—</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {voucherType === 'PAYMENT'
                            ? accounts.find((a) => a.id === cashAccountId)?.name
                            : accounts.find((a) => a.id === counterAccountId)?.name}
                        </td>
                        <td>
                          <span className="badge badge-credit">Credit Side</span>
                        </td>
                        <td className="amount">—</td>
                        <td className="amount credit">₹{parseFloat(amount).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* CONTRA Specific Fields */}
        {voucherType === 'CONTRA' && (
          <>
            <div className="form-group">
              <label className="label">Amount (₹)</label>
              <div className="amount-input-wrapper">
                <span className="currency-prefix">₹</span>
                <input
                  type="number"
                  className="input input-amount-field"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="label">From Account</label>
                <select
                  className="select"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  required
                >
                  <option value="">Select source</option>
                  {cashBankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">To Account</label>
                <select
                  className="select"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  required
                >
                  <option value="">Select destination</option>
                  {cashBankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {amount && fromAccountId && toAccountId && (
              <div className="voucher-preview-card glass-card mt-lg">
                <div className="preview-header">
                  <span className="preview-title">⚡ Live Contra Transfer Preview</span>
                  <span className="badge badge-contra">₹{parseFloat(amount).toFixed(2)} Transfer</span>
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Direction</th>
                        <th style={{ textAlign: 'right' }}>Debit</th>
                        <th style={{ textAlign: 'right' }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {accounts.find((a) => a.id === toAccountId)?.name}
                        </td>
                        <td><span className="badge badge-credit">Received Into</span></td>
                        <td className="amount debit">₹{parseFloat(amount).toFixed(2)}</td>
                        <td className="amount">—</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {accounts.find((a) => a.id === fromAccountId)?.name}
                        </td>
                        <td><span className="badge badge-debit">Withdrawn From</span></td>
                        <td className="amount">—</td>
                        <td className="amount credit">₹{parseFloat(amount).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* JOURNAL Specific Fields */}
        {voucherType === 'JOURNAL' && (
          <div className="journal-editor-section mt-md">
            <div className="journal-lines-header">
              <div>
                <span className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  Journal Lines
                </span>
                <p className="text-xs text-muted">Add at least two lines. Sum of debits must equal sum of credits.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addJournalLine}
              >
                + Add Line
              </button>
            </div>

            <div className="data-table-wrapper mt-sm">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>Account</th>
                    <th style={{ textAlign: 'right', width: '25%' }}>Debit Amount (₹)</th>
                    <th style={{ textAlign: 'right', width: '25%' }}>Credit Amount (₹)</th>
                    <th style={{ width: '5%', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          className="select"
                          value={line.accountId}
                          onChange={(e) => updateJournalLine(i, 'accountId', e.target.value)}
                          required
                        >
                          <option value="">Select account...</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input input-amount"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          value={line.debitAmount}
                          onChange={(e) => updateJournalLine(i, 'debitAmount', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input input-amount"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          value={line.creditAmount}
                          onChange={(e) => updateJournalLine(i, 'creditAmount', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => removeJournalLine(i)}
                          disabled={journalLines.length <= 2}
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Totals Row */}
                  <tr className="journal-totals-row">
                    <td style={{ fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      Total Amounts
                    </td>
                    <td className={`amount ${journalBalanced ? 'credit' : 'debit'}`} style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>
                      ₹{journalDebits.toFixed(2)}
                    </td>
                    <td className={`amount ${journalBalanced ? 'credit' : 'debit'}`} style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>
                      ₹{journalCredits.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {journalBalanced ? (
                        <span title="Balanced entry" style={{ color: 'var(--color-credit)', fontSize: '1.2rem' }}>✓</span>
                      ) : (
                        <span title="Unbalanced entry" style={{ color: 'var(--color-debit)', fontSize: '1.2rem' }}>≠</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Validation Callout */}
            <div className={`journal-status-callout ${journalBalanced ? 'balanced' : 'unbalanced'} mt-md`}>
              {journalBalanced ? (
                <span>✓ Debits and credits are perfectly balanced at ₹{journalDebits.toFixed(2)}. Ready to post!</span>
              ) : (
                <span>
                  ⚠️ Unbalanced entry: Total debits (₹{journalDebits.toFixed(2)}) ≠ total credits (₹{journalCredits.toFixed(2)}). 
                  Difference: <strong>₹{Math.abs(journalDebits - journalCredits).toFixed(2)}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="voucher-submit-bar">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={resetForm}
          >
            Clear Form
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading || (voucherType === 'JOURNAL' && !journalBalanced)}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              `Post ${voucherType}`
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
