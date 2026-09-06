import { useState, useEffect } from 'react';
import { ledgerApi } from '../api/ledger';
import './ReportsPage.css';

type ReportTab = 'BALANCE_SHEET' | 'PROFIT_LOSS' | 'CASH_FLOW' | 'TRIAL_BALANCE';

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('BALANCE_SHEET');
  const [loading, setLoading] = useState(false);

  // Date filters
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(currentMonthStart);
  const [endDate, setEndDate] = useState(currentMonthEnd);
  const [asOfDate, setAsOfDate] = useState(now.toISOString().split('T')[0]);

  // Report states
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);

  useEffect(() => {
    let active = true;

    const loadReport = async () => {
      try {
        if (activeTab === 'BALANCE_SHEET') {
          const { data } = await ledgerApi.getBalanceSheet(asOfDate);
          if (active) setBalanceSheet(data.data);
        } else if (activeTab === 'PROFIT_LOSS') {
          const { data } = await ledgerApi.getProfitAndLoss(startDate, endDate);
          if (active) setPnl(data.data);
        } else if (activeTab === 'CASH_FLOW') {
          const { data } = await ledgerApi.getCashFlowStatement(startDate, endDate);
          if (active) setCashFlow(data.data);
        } else if (activeTab === 'TRIAL_BALANCE') {
          const { data } = await ledgerApi.getTrialBalance(asOfDate);
          if (active) setTrialBalance(data.data);
        }
      } catch (err) {
        console.error('Failed to load financial report', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        loadReport();
      }
    });

    return () => {
      active = false;
    };
  }, [activeTab, startDate, endDate, asOfDate]);

  const fmt = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '₹0.00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '₹0.00';
    return `${num < 0 ? '-' : ''}₹${Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handlePreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'YTD' | 'ALL') => {
    const today = new Date();
    if (preset === 'THIS_MONTH') {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(e.toISOString().split('T')[0]);
    } else if (preset === 'LAST_MONTH') {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(e.toISOString().split('T')[0]);
    } else if (preset === 'YTD') {
      const s = new Date(today.getFullYear(), 0, 1);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'ALL') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  };

  return (
    <div className="page reports-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Statements</h1>
          <p className="page-subtitle">Accurate double-entry balance sheets, profit & loss, and cash flow reports</p>
        </div>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          🖨️ Print / Export
        </button>
      </div>

      {/* Tabs */}
      <div className="reports-tabs">
        <button
          className={`report-tab-btn ${activeTab === 'BALANCE_SHEET' ? 'active' : ''}`}
          onClick={() => setActiveTab('BALANCE_SHEET')}
        >
          ⚖️ Balance Sheet
        </button>
        <button
          className={`report-tab-btn ${activeTab === 'PROFIT_LOSS' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROFIT_LOSS')}
        >
          📈 Profit & Loss
        </button>
        <button
          className={`report-tab-btn ${activeTab === 'CASH_FLOW' ? 'active' : ''}`}
          onClick={() => setActiveTab('CASH_FLOW')}
        >
          💧 Cash Flow
        </button>
        <button
          className={`report-tab-btn ${activeTab === 'TRIAL_BALANCE' ? 'active' : ''}`}
          onClick={() => setActiveTab('TRIAL_BALANCE')}
        >
          📋 Trial Balance
        </button>
      </div>

      {/* Date Filters Bar */}
      <div className="reports-filter-bar glass-card">
        {activeTab === 'BALANCE_SHEET' || activeTab === 'TRIAL_BALANCE' ? (
          <div className="filter-group">
            <label className="label">As of Date</label>
            <input
              type="date"
              className="input"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="filter-group">
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="filter-presets">
              <button className="btn btn-ghost btn-sm" onClick={() => handlePreset('THIS_MONTH')}>This Month</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handlePreset('LAST_MONTH')}>Last Month</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handlePreset('YTD')}>This Year</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handlePreset('ALL')}>All Time</button>
            </div>
          </>
        )}
      </div>

      {loading && (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      )}

      {!loading && (
        <div className="report-content">
          {/* BALANCE SHEET TAB */}
          {activeTab === 'BALANCE_SHEET' && balanceSheet && (
            <div className="report-sheet">
              <div className="report-status-banner glass-card mb-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted">Balance Sheet Status</div>
                    <div className="text-lg font-semibold" style={{ color: balanceSheet.isBalanced ? 'var(--color-credit)' : 'var(--color-danger)' }}>
                      {balanceSheet.isBalanced ? '✓ Equation Balanced (Assets = Liabilities + Equity)' : '⚠ Discrepancy Detected'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted">Total Assets</div>
                    <div className="font-mono text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {fmt(balanceSheet.assets.totalAssets)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="balance-sheet-grid">
                {/* Left Column: ASSETS */}
                <div className="report-column glass-card">
                  <div className="column-header">
                    <h2>Assets</h2>
                    <span className="amount-header">{fmt(balanceSheet.assets.totalAssets)}</span>
                  </div>

                  <div className="section-block">
                    <h3>Cash & Bank Equivalents</h3>
                    {balanceSheet.assets.cashAndBank.length === 0 ? (
                      <div className="empty-subtext">None</div>
                    ) : (
                      balanceSheet.assets.cashAndBank.map((a: any) => (
                        <div key={a.accountId} className="report-line">
                          <span>{a.accountName}</span>
                          <span className="font-mono">{fmt(a.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="section-block">
                    <h3>Receivables (Sundry Debtors)</h3>
                    {balanceSheet.assets.receivables.length === 0 ? (
                      <div className="empty-subtext">None</div>
                    ) : (
                      balanceSheet.assets.receivables.map((a: any) => (
                        <div key={a.accountId} className="report-line">
                          <span>{a.accountName}</span>
                          <span className="font-mono">{fmt(a.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {balanceSheet.assets.otherAssets.length > 0 && (
                    <div className="section-block">
                      <h3>Other Assets</h3>
                      {balanceSheet.assets.otherAssets.map((a: any) => (
                        <div key={a.accountId} className="report-line">
                          <span>{a.accountName}</span>
                          <span className="font-mono">{fmt(a.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="column-footer">
                    <span>Total Assets</span>
                    <span className="font-mono">{fmt(balanceSheet.assets.totalAssets)}</span>
                  </div>
                </div>

                {/* Right Column: LIABILITIES & EQUITY */}
                <div className="report-column glass-card">
                  <div className="column-header">
                    <h2>Liabilities & Equity</h2>
                    <span className="amount-header">{fmt(balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>

                  {/* Liabilities */}
                  <div className="section-block">
                    <h3>Payables (Sundry Creditors)</h3>
                    {balanceSheet.liabilities.payables.length === 0 ? (
                      <div className="empty-subtext">None</div>
                    ) : (
                      balanceSheet.liabilities.payables.map((a: any) => (
                        <div key={a.accountId} className="report-line">
                          <span>{a.accountName}</span>
                          <span className="font-mono">{fmt(a.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {balanceSheet.liabilities.otherLiabilities.length > 0 && (
                    <div className="section-block">
                      <h3>Other Liabilities</h3>
                      {balanceSheet.liabilities.otherLiabilities.map((a: any) => (
                        <div key={a.accountId} className="report-line">
                          <span>{a.accountName}</span>
                          <span className="font-mono">{fmt(a.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="subtotal-line">
                    <span>Total Liabilities</span>
                    <span className="font-mono">{fmt(balanceSheet.liabilities.totalLiabilities)}</span>
                  </div>

                  {/* Equity */}
                  <div className="section-block mt-md">
                    <h3>Equity & Reserves</h3>
                    {balanceSheet.equity.capital.map((a: any) => (
                      <div key={a.accountId} className="report-line">
                        <span>{a.accountName}</span>
                        <span className="font-mono">{fmt(a.amount)}</span>
                      </div>
                    ))}
                    <div className="report-line">
                      <span>Current Period Net Earnings</span>
                      <span className="font-mono" style={{ color: parseFloat(balanceSheet.equity.currentPeriodEarnings) >= 0 ? 'var(--color-credit)' : 'var(--color-danger)' }}>
                        {fmt(balanceSheet.equity.currentPeriodEarnings)}
                      </span>
                    </div>
                  </div>

                  <div className="subtotal-line">
                    <span>Total Equity</span>
                    <span className="font-mono">{fmt(balanceSheet.equity.totalEquity)}</span>
                  </div>

                  <div className="column-footer">
                    <span>Total Liabilities + Equity</span>
                    <span className="font-mono">{fmt(balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROFIT & LOSS TAB */}
          {activeTab === 'PROFIT_LOSS' && pnl && (
            <div className="report-sheet">
              <div className="pnl-summary-grid mb-lg">
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Total Revenue</div>
                  <div className="dashboard-card-value income">{fmt(pnl.totalIncome)}</div>
                  <div className="dashboard-card-count">{pnl.incomeAccounts.length} Income streams</div>
                </div>
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Total Expenses</div>
                  <div className="dashboard-card-value expenses">{fmt(pnl.totalExpense)}</div>
                  <div className="dashboard-card-count">{pnl.expenseAccounts.length} Expense categories</div>
                </div>
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Net Profit / Loss</div>
                  <div className={`dashboard-card-value ${pnl.isProfitable ? 'income' : 'expenses'}`}>
                    {fmt(pnl.netProfit)}
                  </div>
                  <div className="dashboard-card-count">{pnl.isProfitable ? 'Profitable Period' : 'Operating Deficit'}</div>
                </div>
              </div>

              <div className="data-table-wrapper mb-lg">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account Category</th>
                      <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="section-row"><td colSpan={2}>Operating Income / Revenue</td></tr>
                    {pnl.incomeAccounts.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">No income recorded for this period</td></tr>
                    ) : (
                      pnl.incomeAccounts.map((a: any) => (
                        <tr key={a.accountId}>
                          <td style={{ paddingLeft: 32 }}>{a.accountName}</td>
                          <td className="amount credit">{fmt(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="subtotal-table-row">
                      <td>Total Income</td>
                      <td className="amount credit">{fmt(pnl.totalIncome)}</td>
                    </tr>

                    <tr className="section-row"><td colSpan={2}>Operating Expenses</td></tr>
                    {pnl.expenseAccounts.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">No expenses recorded for this period</td></tr>
                    ) : (
                      pnl.expenseAccounts.map((a: any) => (
                        <tr key={a.accountId}>
                          <td style={{ paddingLeft: 32 }}>{a.accountName}</td>
                          <td className="amount debit">{fmt(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="subtotal-table-row">
                      <td>Total Expenses</td>
                      <td className="amount debit">{fmt(pnl.totalExpense)}</td>
                    </tr>

                    <tr className="total-table-row">
                      <td><strong>Net Profit / (Loss)</strong></td>
                      <td className={`amount ${pnl.isProfitable ? 'credit' : 'debit'}`} style={{ fontSize: 'var(--text-lg)' }}>
                        {fmt(pnl.netProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CASH FLOW TAB */}
          {activeTab === 'CASH_FLOW' && cashFlow && (
            <div className="report-sheet">
              <div className="pnl-summary-grid mb-lg">
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Opening Cash Balance</div>
                  <div className="dashboard-card-value font-mono">{fmt(cashFlow.openingCashBalance)}</div>
                </div>
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Net Cash Movement</div>
                  <div className={`dashboard-card-value font-mono ${parseFloat(cashFlow.netCashFlow) >= 0 ? 'income' : 'expenses'}`}>
                    {fmt(cashFlow.netCashFlow)}
                  </div>
                </div>
                <div className="dashboard-card glass-card">
                  <div className="dashboard-card-label">Closing Cash Balance</div>
                  <div className="dashboard-card-value font-mono">{fmt(cashFlow.closingCashBalance)}</div>
                </div>
              </div>

              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Activity / Flow Breakdown</th>
                      <th style={{ textAlign: 'right' }}>Cash Impact (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="section-row"><td colSpan={2}>1. Cash Flow from Operating Activities</td></tr>
                    {cashFlow.operatingActivities.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">No operating transactions</td></tr>
                    ) : (
                      cashFlow.operatingActivities.map((a: any, i: number) => (
                        <tr key={i}>
                          <td style={{ paddingLeft: 32 }}>{a.accountName}</td>
                          <td className={`amount ${parseFloat(a.amount) >= 0 ? 'credit' : 'debit'}`}>{fmt(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="subtotal-table-row">
                      <td>Net Cash from Operating Activities</td>
                      <td className={`amount ${parseFloat(cashFlow.totalOperating) >= 0 ? 'credit' : 'debit'}`}>{fmt(cashFlow.totalOperating)}</td>
                    </tr>

                    <tr className="section-row"><td colSpan={2}>2. Cash Flow from Investing Activities (Debts/Loans/Assets)</td></tr>
                    {cashFlow.investingActivities.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">No investing transactions</td></tr>
                    ) : (
                      cashFlow.investingActivities.map((a: any, i: number) => (
                        <tr key={i}>
                          <td style={{ paddingLeft: 32 }}>{a.accountName}</td>
                          <td className={`amount ${parseFloat(a.amount) >= 0 ? 'credit' : 'debit'}`}>{fmt(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="subtotal-table-row">
                      <td>Net Cash from Investing Activities</td>
                      <td className={`amount ${parseFloat(cashFlow.totalInvesting) >= 0 ? 'credit' : 'debit'}`}>{fmt(cashFlow.totalInvesting)}</td>
                    </tr>

                    <tr className="section-row"><td colSpan={2}>3. Cash Flow from Financing Activities (Capital/Dividends)</td></tr>
                    {cashFlow.financingActivities.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">No financing transactions</td></tr>
                    ) : (
                      cashFlow.financingActivities.map((a: any, i: number) => (
                        <tr key={i}>
                          <td style={{ paddingLeft: 32 }}>{a.accountName}</td>
                          <td className={`amount ${parseFloat(a.amount) >= 0 ? 'credit' : 'debit'}`}>{fmt(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="subtotal-table-row">
                      <td>Net Cash from Financing Activities</td>
                      <td className={`amount ${parseFloat(cashFlow.totalFinancing) >= 0 ? 'credit' : 'debit'}`}>{fmt(cashFlow.totalFinancing)}</td>
                    </tr>

                    <tr className="total-table-row">
                      <td><strong>Net Increase / (Decrease) in Cash Equivalents</strong></td>
                      <td className={`amount ${parseFloat(cashFlow.netCashFlow) >= 0 ? 'credit' : 'debit'}`} style={{ fontSize: 'var(--text-lg)' }}>
                        {fmt(cashFlow.netCashFlow)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TRIAL BALANCE TAB */}
          {activeTab === 'TRIAL_BALANCE' && trialBalance && (
            <div className="report-sheet">
              <div className="report-status-banner glass-card mb-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted">Trial Balance Verification</div>
                    <div className="text-lg font-semibold" style={{ color: trialBalance.isBalanced ? 'var(--color-credit)' : 'var(--color-danger)' }}>
                      {trialBalance.isBalanced ? '✓ Total Debits Equal Total Credits' : '⚠ Imbalance in Ledger'}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm text-muted">Total Debits / Credits</div>
                    <div className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {fmt(trialBalance.totalDebit)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Debit Balance (₹)</th>
                      <th style={{ textAlign: 'right' }}>Credit Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.rows.map((r: any) => (
                      <tr key={r.accountId}>
                        <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.accountName}</td>
                        <td><span className={`badge badge-${r.type.toLowerCase()}`}>{r.type}</span></td>
                        <td className="amount debit">{parseFloat(r.debitBalance) > 0 ? fmt(r.debitBalance) : '—'}</td>
                        <td className="amount credit">{parseFloat(r.creditBalance) > 0 ? fmt(r.creditBalance) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="total-table-row">
                      <td><strong>Grand Totals</strong></td>
                      <td></td>
                      <td className="amount debit font-semibold" style={{ fontSize: 'var(--text-base)' }}>{fmt(trialBalance.totalDebit)}</td>
                      <td className="amount credit font-semibold" style={{ fontSize: 'var(--text-base)' }}>{fmt(trialBalance.totalCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
