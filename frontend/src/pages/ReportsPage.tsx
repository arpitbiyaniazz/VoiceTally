import { useState, useEffect } from 'react';
import { ledgerApi } from '../api/ledger';
import { useAuth } from '../context/useAuth';
import './ReportsPage.css';

type ReportTab = 'PROFIT_LOSS' | 'BALANCE_SHEET' | 'CASH_FLOW' | 'TRIAL_BALANCE';
type ViewMode = 'TABLE' | 'CARDS';

export function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('PROFIT_LOSS');
  const [viewMode, setViewMode] = useState<ViewMode>('TABLE');
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

  const formatPeriodLabel = (sDate: string, eDate: string) => {
    try {
      const s = new Date(sDate);
      const e = new Date(eDate);
      if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      }
      return `${s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
    } catch {
      return 'Current Period';
    }
  };

  const formatAsOfLabel = (dStr: string) => {
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  const fmt = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '₹0.00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '₹0.00';
    return `${num < 0 ? '-' : ''}₹${Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  /**
   * Financial table accounting format matching standard corporate statements:
   * Parentheses for negatives: (116,572) or (2,025)
   * Pure numbers for positives: 121,033 or 4,461
   */
  const fmtAccounting = (val: string | number | undefined, forceParentheses = false): string => {
    if (val === undefined || val === null) return '0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '0';
    if (Math.abs(num) < 0.0001) return '0';

    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
      maximumFractionDigits: 2,
    });

    if (num < 0 || forceParentheses) {
      return `(${formatted})`;
    }
    return formatted;
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

  // Profit & Loss calculations
  const isCogsAccount = (name: string) => {
    const lower = name.toLowerCase();
    return lower.includes('cogs') || lower.includes('cost of') || lower.includes('direct cost') || lower.includes('purchase');
  };

  const incomeAccounts = pnl?.incomeAccounts || [];
  const expenseAccounts = pnl?.expenseAccounts || [];
  const cogsAccounts = expenseAccounts.filter((a: any) => isCogsAccount(a.accountName));
  const operatingExpenseAccounts = expenseAccounts.filter((a: any) => !isCogsAccount(a.accountName));

  const totalRevenue = pnl ? parseFloat(pnl.totalIncome) : 0;
  const totalCogs = cogsAccounts.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalOperatingExpense = operatingExpenseAccounts.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);
  const operatingIncome = grossProfit - totalOperatingExpense;
  const netIncome = pnl ? parseFloat(pnl.netProfit) : 0;

  return (
    <div className="page reports-page">
      {/* ─── Screen Page Header ────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Statements</h1>
          <p className="page-subtitle">Accurate double-entry balance sheets, profit & loss, and cash flow reports</p>
        </div>

        <div className="reports-header-actions">
          <div className="statement-view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'TABLE' ? 'active' : ''}`}
              onClick={() => setViewMode('TABLE')}
              title="Table Format (Formal Corporate Statement)"
            >
              📋 Table Format
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'CARDS' ? 'active' : ''}`}
              onClick={() => setViewMode('CARDS')}
              title="Visual BI Cards"
            >
              📊 Visual BI Cards
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
            title="Print or Export Financial Statement"
          >
            🖨️ Print Statement
          </button>
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────────────────────── */}
      <div className="reports-tabs">
        <button
          className={`report-tab-btn ${activeTab === 'PROFIT_LOSS' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROFIT_LOSS')}
        >
          📈 Profit & Loss
        </button>
        <button
          className={`report-tab-btn ${activeTab === 'BALANCE_SHEET' ? 'active' : ''}`}
          onClick={() => setActiveTab('BALANCE_SHEET')}
        >
          ⚖️ Balance Sheet
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

      {/* ─── Date Filters Bar ──────────────────────────────────────────── */}
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
          {/* ─── Formal Printable Letterhead (Printed on Paper / Export) ──── */}
          <div className="print-letterhead">
            <div className="print-letterhead-top">
              <div>
                <h2 className="print-company-name">VoiceTally Financial Systems</h2>
                <div className="print-company-sub">Zero-Discrepancy Double-Entry Accounting Ledger</div>
              </div>
              <div className="print-meta-box">
                <div><strong>Entity:</strong> {user?.name || 'Authorized Account'}</div>
                <div><strong>Printed:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                <div><strong>Reporting Currency:</strong> Indian Rupee (₹)</div>
              </div>
            </div>
            <div className="print-statement-banner">
              <span className="print-statement-name">
                {activeTab === 'PROFIT_LOSS' && 'STATEMENT OF PROFIT & LOSS'}
                {activeTab === 'BALANCE_SHEET' && 'STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)'}
                {activeTab === 'CASH_FLOW' && 'STATEMENT OF CASH FLOWS'}
                {activeTab === 'TRIAL_BALANCE' && 'STATEMENT OF TRIAL BALANCE'}
              </span>
              <span className="print-period-badge">
                {activeTab === 'BALANCE_SHEET' || activeTab === 'TRIAL_BALANCE'
                  ? `As of ${formatAsOfLabel(asOfDate)}`
                  : `Reporting Period: ${formatAsOfLabel(startDate)} to ${formatAsOfLabel(endDate)}`}
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              1. FORMAL TABLE FORMAT VIEW (Matches User Provided Screenshot)
              ════════════════════════════════════════════════════════════════ */}
          <div className={viewMode === 'TABLE' ? 'report-table-view' : 'report-table-view-print-only'}>
            {/* ─── P&L TABLE FORMAT ─────────────────────────────────────── */}
            {activeTab === 'PROFIT_LOSS' && pnl && (
              <div className="statement-table-card">
                <table className="statement-formal-table">
                  <thead>
                    <tr>
                      <th>P&L (₹)</th>
                      <th className="col-amount">{formatPeriodLabel(startDate, endDate)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="row-category">
                      <td>Revenues</td>
                      <td className="col-amount">{fmtAccounting(totalRevenue)}</td>
                    </tr>
                    {incomeAccounts.map((a: any) => (
                      <tr key={a.accountId} className="item-indent">
                        <td>{a.accountName}</td>
                        <td className="col-amount">{fmtAccounting(a.amount)}</td>
                      </tr>
                    ))}

                    <tr>
                      <td>Cost of goods sold</td>
                      <td className="col-amount">{totalCogs > 0 ? `(${fmtAccounting(totalCogs)})` : '0'}</td>
                    </tr>
                    {cogsAccounts.map((a: any) => (
                      <tr key={a.accountId} className="item-indent">
                        <td>{a.accountName}</td>
                        <td className="col-amount">({fmtAccounting(a.amount)})</td>
                      </tr>
                    ))}

                    <tr className="row-subtotal">
                      <td>Gross profit</td>
                      <td className="col-amount">{fmtAccounting(grossProfit)}</td>
                    </tr>

                    <tr>
                      <td>Capitalized expenses</td>
                      <td className="col-amount">0</td>
                    </tr>

                    <tr className="row-category">
                      <td>Operating Expenses (SG&A)</td>
                      <td className="col-amount">
                        {totalOperatingExpense > 0 ? `(${fmtAccounting(totalOperatingExpense)})` : '0'}
                      </td>
                    </tr>
                    {operatingExpenseAccounts.length === 0 ? (
                      <tr className="item-indent">
                        <td>General operating expenses</td>
                        <td className="col-amount">0</td>
                      </tr>
                    ) : (
                      operatingExpenseAccounts.map((a: any) => (
                        <tr key={a.accountId} className="item-indent">
                          <td>{a.accountName}</td>
                          <td className="col-amount">({fmtAccounting(a.amount)})</td>
                        </tr>
                      ))
                    )}

                    <tr>
                      <td>Subsidies</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Lease rentals</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Other operating income</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Other operating expenses</td>
                      <td className="col-amount">0</td>
                    </tr>

                    <tr className="row-subtotal">
                      <td>EBITDA</td>
                      <td className="col-amount">{fmtAccounting(operatingIncome)}</td>
                    </tr>

                    <tr>
                      <td>D&A</td>
                      <td className="col-amount">0</td>
                    </tr>

                    <tr className="row-subtotal">
                      <td>Operating income</td>
                      <td className="col-amount">{fmtAccounting(operatingIncome)}</td>
                    </tr>

                    <tr>
                      <td>Financial income</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Financial expenses</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Profit (loss) on disposal</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Exceptional income</td>
                      <td className="col-amount">0</td>
                    </tr>
                    <tr>
                      <td>Exceptional expenses</td>
                      <td className="col-amount">0</td>
                    </tr>

                    <tr className="row-subtotal">
                      <td>Profit before tax</td>
                      <td className="col-amount">{fmtAccounting(netIncome)}</td>
                    </tr>

                    <tr>
                      <td>Corporation tax</td>
                      <td className="col-amount">0</td>
                    </tr>

                    <tr className="row-total">
                      <td>Net income</td>
                      <td className="col-amount">{fmtAccounting(netIncome)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── BALANCE SHEET TABLE FORMAT ──────────────────────────── */}
            {activeTab === 'BALANCE_SHEET' && balanceSheet && (
              <div className="statement-table-card">
                <table className="statement-formal-table">
                  <thead>
                    <tr>
                      <th>Balance Sheet (₹)</th>
                      <th className="col-amount">As of {formatAsOfLabel(asOfDate)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="row-category">
                      <td>1. ASSETS</td>
                      <td className="col-amount"></td>
                    </tr>
                    <tr className="item-indent">
                      <td><strong>Cash & Bank Equivalents</strong></td>
                      <td className="col-amount"></td>
                    </tr>
                    {balanceSheet.assets.cashAndBank.length === 0 ? (
                      <tr className="item-indent-deep"><td>No cash/bank accounts registered</td><td className="col-amount">0</td></tr>
                    ) : (
                      balanceSheet.assets.cashAndBank.map((a: any) => (
                        <tr key={a.accountId} className="item-indent-deep">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}

                    <tr className="item-indent">
                      <td><strong>Receivables (Sundry Debtors)</strong></td>
                      <td className="col-amount"></td>
                    </tr>
                    {balanceSheet.assets.receivables.length === 0 ? (
                      <tr className="item-indent-deep"><td>No trade receivables</td><td className="col-amount">0</td></tr>
                    ) : (
                      balanceSheet.assets.receivables.map((a: any) => (
                        <tr key={a.accountId} className="item-indent-deep">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}

                    {balanceSheet.assets.otherAssets.length > 0 && (
                      <>
                        <tr className="item-indent">
                          <td><strong>Other Assets</strong></td>
                          <td className="col-amount"></td>
                        </tr>
                        {balanceSheet.assets.otherAssets.map((a: any) => (
                          <tr key={a.accountId} className="item-indent-deep">
                            <td>{a.accountName}</td>
                            <td className="col-amount">{fmtAccounting(a.amount)}</td>
                          </tr>
                        ))}
                      </>
                    )}

                    <tr className="row-total">
                      <td>Total Assets</td>
                      <td className="col-amount">{fmtAccounting(balanceSheet.assets.totalAssets)}</td>
                    </tr>

                    <tr className="row-category" style={{ paddingTop: 16 }}>
                      <td>2. LIABILITIES</td>
                      <td className="col-amount"></td>
                    </tr>
                    <tr className="item-indent">
                      <td><strong>Payables (Sundry Creditors)</strong></td>
                      <td className="col-amount"></td>
                    </tr>
                    {balanceSheet.liabilities.payables.length === 0 ? (
                      <tr className="item-indent-deep"><td>No trade payables</td><td className="col-amount">0</td></tr>
                    ) : (
                      balanceSheet.liabilities.payables.map((a: any) => (
                        <tr key={a.accountId} className="item-indent-deep">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}

                    {balanceSheet.liabilities.otherLiabilities.length > 0 && (
                      <>
                        <tr className="item-indent">
                          <td><strong>Other Liabilities</strong></td>
                          <td className="col-amount"></td>
                        </tr>
                        {balanceSheet.liabilities.otherLiabilities.map((a: any) => (
                          <tr key={a.accountId} className="item-indent-deep">
                            <td>{a.accountName}</td>
                            <td className="col-amount">{fmtAccounting(a.amount)}</td>
                          </tr>
                        ))}
                      </>
                    )}

                    <tr className="row-subtotal">
                      <td>Total Liabilities</td>
                      <td className="col-amount">{fmtAccounting(balanceSheet.liabilities.totalLiabilities)}</td>
                    </tr>

                    <tr className="row-category">
                      <td>3. EQUITY & RESERVES</td>
                      <td className="col-amount"></td>
                    </tr>
                    {balanceSheet.equity.capital.map((a: any) => (
                      <tr key={a.accountId} className="item-indent">
                        <td>{a.accountName}</td>
                        <td className="col-amount">{fmtAccounting(a.amount)}</td>
                      </tr>
                    ))}
                    <tr className="item-indent">
                      <td>Current Period Net Earnings</td>
                      <td className="col-amount">{fmtAccounting(balanceSheet.equity.currentPeriodEarnings)}</td>
                    </tr>

                    <tr className="row-subtotal">
                      <td>Total Equity</td>
                      <td className="col-amount">{fmtAccounting(balanceSheet.equity.totalEquity)}</td>
                    </tr>

                    <tr className="row-total">
                      <td>Total Liabilities + Equity</td>
                      <td className="col-amount">{fmtAccounting(balanceSheet.totalLiabilitiesAndEquity)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── CASH FLOW TABLE FORMAT ──────────────────────────────── */}
            {activeTab === 'CASH_FLOW' && cashFlow && (
              <div className="statement-table-card">
                <table className="statement-formal-table">
                  <thead>
                    <tr>
                      <th>Cash Flow Statement (₹)</th>
                      <th className="col-amount">{formatPeriodLabel(startDate, endDate)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="row-subtotal">
                      <td>Opening Cash & Bank Balance</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.openingCashBalance)}</td>
                    </tr>

                    <tr className="row-category">
                      <td>1. Cash Flow from Operating Activities</td>
                      <td className="col-amount"></td>
                    </tr>
                    {cashFlow.operatingActivities.length === 0 ? (
                      <tr className="item-indent"><td>No operating transactions recorded</td><td className="col-amount">0</td></tr>
                    ) : (
                      cashFlow.operatingActivities.map((a: any, i: number) => (
                        <tr key={i} className="item-indent">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="row-subtotal">
                      <td>Net Cash from Operating Activities</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.totalOperating)}</td>
                    </tr>

                    <tr className="row-category">
                      <td>2. Cash Flow from Investing Activities</td>
                      <td className="col-amount"></td>
                    </tr>
                    {cashFlow.investingActivities.length === 0 ? (
                      <tr className="item-indent"><td>No investing transactions recorded</td><td className="col-amount">0</td></tr>
                    ) : (
                      cashFlow.investingActivities.map((a: any, i: number) => (
                        <tr key={i} className="item-indent">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="row-subtotal">
                      <td>Net Cash from Investing Activities</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.totalInvesting)}</td>
                    </tr>

                    <tr className="row-category">
                      <td>3. Cash Flow from Financing Activities</td>
                      <td className="col-amount"></td>
                    </tr>
                    {cashFlow.financingActivities.length === 0 ? (
                      <tr className="item-indent"><td>No financing transactions recorded</td><td className="col-amount">0</td></tr>
                    ) : (
                      cashFlow.financingActivities.map((a: any, i: number) => (
                        <tr key={i} className="item-indent">
                          <td>{a.accountName}</td>
                          <td className="col-amount">{fmtAccounting(a.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="row-subtotal">
                      <td>Net Cash from Financing Activities</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.totalFinancing)}</td>
                    </tr>

                    <tr className="row-subtotal">
                      <td>Net Increase / (Decrease) in Cash Equivalents</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.netCashFlow)}</td>
                    </tr>

                    <tr className="row-total">
                      <td>Closing Cash & Bank Balance</td>
                      <td className="col-amount">{fmtAccounting(cashFlow.closingCashBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── TRIAL BALANCE TABLE FORMAT ──────────────────────────── */}
            {activeTab === 'TRIAL_BALANCE' && trialBalance && (
              <div className="statement-table-card">
                <table className="statement-formal-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th className="col-amount-split">Debit (Dr) (₹)</th>
                      <th className="col-amount-split">Credit (Cr) (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.rows.map((r: any) => (
                      <tr key={r.accountId}>
                        <td style={{ fontWeight: 600 }}>{r.accountName}</td>
                        <td><span className={`badge badge-${r.type.toLowerCase()}`}>{r.type}</span></td>
                        <td className="col-amount">{parseFloat(r.debitBalance) > 0 ? fmtAccounting(r.debitBalance) : '0'}</td>
                        <td className="col-amount">{parseFloat(r.creditBalance) > 0 ? fmtAccounting(r.creditBalance) : '0'}</td>
                      </tr>
                    ))}
                    <tr className="row-total">
                      <td>Grand Totals</td>
                      <td></td>
                      <td className="col-amount">{fmtAccounting(trialBalance.totalDebit)}</td>
                      <td className="col-amount">{fmtAccounting(trialBalance.totalCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════════
              2. VISUAL BI CARDS VIEW (Optional screen interactive toggle)
              ════════════════════════════════════════════════════════════════ */}
          {viewMode === 'CARDS' && (
            <div className="report-cards-view">
              {/* BALANCE SHEET CARDS */}
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
                      <div className="column-footer">
                        <span>Total Assets</span>
                        <span className="font-mono">{fmt(balanceSheet.assets.totalAssets)}</span>
                      </div>
                    </div>

                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>Liabilities & Equity</h2>
                        <span className="amount-header">{fmt(balanceSheet.totalLiabilitiesAndEquity)}</span>
                      </div>
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
                      <div className="subtotal-line">
                        <span>Total Liabilities</span>
                        <span className="font-mono">{fmt(balanceSheet.liabilities.totalLiabilities)}</span>
                      </div>
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

              {/* PROFIT & LOSS CARDS */}
              {activeTab === 'PROFIT_LOSS' && pnl && (
                <div className="report-sheet">
                  <div className="pnl-summary-grid mb-lg">
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Total Revenue</div>
                      <div className="dashboard-card-value income font-mono">{fmt(pnl.totalIncome)}</div>
                      <div className="dashboard-card-count">{pnl.incomeAccounts.length} Income streams</div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Total Expenses</div>
                      <div className="dashboard-card-value expenses font-mono">{fmt(pnl.totalExpense)}</div>
                      <div className="dashboard-card-count">{pnl.expenseAccounts.length} Expense categories</div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Net Profit / Loss</div>
                      <div className={`dashboard-card-value font-mono ${pnl.isProfitable ? 'income' : 'expenses'}`}>
                        {fmt(pnl.netProfit)}
                      </div>
                      <div className="dashboard-card-count">{pnl.isProfitable ? 'Profitable Period' : 'Operating Deficit'}</div>
                    </div>
                  </div>

                  <div className="balance-sheet-grid">
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>Revenue Streams</h2>
                        <span className="amount-header income font-mono">{fmt(pnl.totalIncome)}</span>
                      </div>
                      <div className="section-block">
                        <h3>Operating Income Accounts</h3>
                        {incomeAccounts.length === 0 ? (
                          <div className="empty-subtext">No revenue recorded</div>
                        ) : (
                          incomeAccounts.map((a: any) => (
                            <div key={a.accountId} className="report-line">
                              <span>{a.accountName}</span>
                              <span className="font-mono">{fmt(a.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Total Operating Inflow</span>
                        <span className="font-mono income">{fmt(pnl.totalIncome)}</span>
                      </div>
                    </div>

                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>Operating Expenses</h2>
                        <span className="amount-header expenses font-mono">{fmt(pnl.totalExpense)}</span>
                      </div>
                      <div className="section-block">
                        <h3>Operating Expenditures</h3>
                        {expenseAccounts.length === 0 ? (
                          <div className="empty-subtext">No expenses recorded</div>
                        ) : (
                          expenseAccounts.map((a: any) => (
                            <div key={a.accountId} className="report-line">
                              <span>{a.accountName}</span>
                              <span className="font-mono">{fmt(a.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Total Operating Outflow</span>
                        <span className="font-mono expenses">{fmt(pnl.totalExpense)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASH FLOW CARDS */}
              {activeTab === 'CASH_FLOW' && cashFlow && (
                <div className="report-sheet">
                  {/* Status / Overview Banner */}
                  <div className="report-status-banner glass-card mb-lg">
                    <div className="flex items-center justify-between" style={{ width: '100%' }}>
                      <div>
                        <div className="text-sm text-muted">Cash & Liquidity Summary</div>
                        <div
                          className="text-lg font-semibold"
                          style={{
                            color:
                              parseFloat(cashFlow.netCashFlow) >= 0 ? 'var(--color-credit)' : 'var(--color-danger)',
                          }}
                        >
                          {parseFloat(cashFlow.netCashFlow) >= 0
                            ? '✓ Positive Net Cash Position (Liquid Surplus)'
                            : '⚠ Net Cash Outflow in Selected Period'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted">Closing Liquid Reserves</div>
                        <div className="font-mono text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          {fmt(cashFlow.closingCashBalance)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3 KPI Summary Cards */}
                  <div className="pnl-summary-grid mb-lg">
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Opening Cash & Bank</div>
                      <div className="dashboard-card-value font-mono">{fmt(cashFlow.openingCashBalance)}</div>
                      <div className="dashboard-card-count">Initial period balance</div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Net Cash Flow</div>
                      <div
                        className={`dashboard-card-value font-mono ${
                          parseFloat(cashFlow.netCashFlow) >= 0 ? 'income' : 'expenses'
                        }`}
                      >
                        {fmt(cashFlow.netCashFlow)}
                      </div>
                      <div className="dashboard-card-count">
                        {parseFloat(cashFlow.netCashFlow) >= 0 ? 'Net Cash Inflow' : 'Net Cash Outflow'}
                      </div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Closing Cash & Bank</div>
                      <div className="dashboard-card-value income font-mono">{fmt(cashFlow.closingCashBalance)}</div>
                      <div className="dashboard-card-count">Total ending cash & bank</div>
                    </div>
                  </div>

                  {/* 3 Activity Breakdown Cards */}
                  <div className="balance-sheet-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                    {/* Operating Activities */}
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>1. Operating Activities</h2>
                        <span
                          className={`amount-header font-mono ${
                            parseFloat(cashFlow.totalOperating) >= 0 ? 'income' : 'expenses'
                          }`}
                        >
                          {fmt(cashFlow.totalOperating)}
                        </span>
                      </div>
                      <div className="section-block">
                        <h3>Operating Collections & Payments</h3>
                        {cashFlow.operatingActivities.length === 0 ? (
                          <div className="empty-subtext">No operating transactions</div>
                        ) : (
                          cashFlow.operatingActivities.map((a: any, i: number) => (
                            <div key={i} className="report-line">
                              <span>{a.accountName}</span>
                              <span className="font-mono">{fmt(a.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Net Operating</span>
                        <span className="font-mono">{fmt(cashFlow.totalOperating)}</span>
                      </div>
                    </div>

                    {/* Investing Activities */}
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>2. Investing Activities</h2>
                        <span className="amount-header font-mono">{fmt(cashFlow.totalInvesting)}</span>
                      </div>
                      <div className="section-block">
                        <h3>CapEx & Asset Movements</h3>
                        {cashFlow.investingActivities.length === 0 ? (
                          <div className="empty-subtext">No investing transactions</div>
                        ) : (
                          cashFlow.investingActivities.map((a: any, i: number) => (
                            <div key={i} className="report-line">
                              <span>{a.accountName}</span>
                              <span className="font-mono">{fmt(a.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Net Investing</span>
                        <span className="font-mono">{fmt(cashFlow.totalInvesting)}</span>
                      </div>
                    </div>

                    {/* Financing Activities */}
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>3. Financing Activities</h2>
                        <span className="amount-header font-mono">{fmt(cashFlow.totalFinancing)}</span>
                      </div>
                      <div className="section-block">
                        <h3>Capital, Loans & Borrowings</h3>
                        {cashFlow.financingActivities.length === 0 ? (
                          <div className="empty-subtext">No financing transactions</div>
                        ) : (
                          cashFlow.financingActivities.map((a: any, i: number) => (
                            <div key={i} className="report-line">
                              <span>{a.accountName}</span>
                              <span className="font-mono">{fmt(a.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Net Financing</span>
                        <span className="font-mono">{fmt(cashFlow.totalFinancing)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TRIAL BALANCE CARDS */}
              {activeTab === 'TRIAL_BALANCE' && trialBalance && (
                <div className="report-sheet">
                  {/* Status Banner */}
                  <div className="report-status-banner glass-card mb-lg">
                    <div className="flex items-center justify-between" style={{ width: '100%' }}>
                      <div>
                        <div className="text-sm text-muted">Trial Balance Equation</div>
                        <div
                          className="text-lg font-semibold"
                          style={{
                            color:
                              Math.abs(parseFloat(trialBalance.totalDebit) - parseFloat(trialBalance.totalCredit)) < 0.01
                                ? 'var(--color-credit)'
                                : 'var(--color-danger)',
                          }}
                        >
                          {Math.abs(parseFloat(trialBalance.totalDebit) - parseFloat(trialBalance.totalCredit)) < 0.01
                            ? '✓ Total Debits (Dr) = Total Credits (Cr) Mathematical Parity'
                            : '⚠ Ledger Imbalance Detected'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted">Parity Turnover</div>
                        <div className="font-mono text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          {fmt(trialBalance.totalDebit)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary KPI Cards */}
                  <div className="pnl-summary-grid mb-lg">
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Total Debit Balance (Dr)</div>
                      <div className="dashboard-card-value font-mono" style={{ color: '#38bdf8' }}>
                        {fmt(trialBalance.totalDebit)}
                      </div>
                      <div className="dashboard-card-count">
                        {trialBalance.rows.filter((r: any) => parseFloat(r.debitBalance) > 0).length} Debit Accounts
                      </div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Total Credit Balance (Cr)</div>
                      <div className="dashboard-card-value font-mono" style={{ color: 'var(--color-credit)' }}>
                        {fmt(trialBalance.totalCredit)}
                      </div>
                      <div className="dashboard-card-count">
                        {trialBalance.rows.filter((r: any) => parseFloat(r.creditBalance) > 0).length} Credit Accounts
                      </div>
                    </div>
                    <div className="dashboard-card glass-card">
                      <div className="dashboard-card-label">Parity Difference</div>
                      <div
                        className="dashboard-card-value font-mono"
                        style={{
                          color:
                            Math.abs(parseFloat(trialBalance.totalDebit) - parseFloat(trialBalance.totalCredit)) < 0.01
                              ? 'var(--color-credit)'
                              : 'var(--color-danger)',
                        }}
                      >
                        {fmt(Math.abs(parseFloat(trialBalance.totalDebit) - parseFloat(trialBalance.totalCredit)))}
                      </div>
                      <div className="dashboard-card-count">
                        {Math.abs(parseFloat(trialBalance.totalDebit) - parseFloat(trialBalance.totalCredit)) < 0.01
                          ? 'Zero Variance Verified'
                          : 'Audit Required'}
                      </div>
                    </div>
                  </div>

                  {/* 2-Column T-Account Ledger Cards */}
                  <div className="balance-sheet-grid">
                    {/* Debit Accounts Card */}
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>Debit Balances (Dr)</h2>
                        <span className="amount-header font-mono" style={{ color: '#38bdf8' }}>
                          {fmt(trialBalance.totalDebit)}
                        </span>
                      </div>
                      <div className="section-block">
                        <h3>Assets, Expenses & Receivables</h3>
                        {trialBalance.rows.filter((r: any) => parseFloat(r.debitBalance) > 0).length === 0 ? (
                          <div className="empty-subtext">No debit balances</div>
                        ) : (
                          trialBalance.rows
                            .filter((r: any) => parseFloat(r.debitBalance) > 0)
                            .map((r: any) => (
                              <div key={r.accountId} className="report-line">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>{r.accountName}</span>
                                  <span
                                    className={`badge badge-${r.type.toLowerCase()}`}
                                    style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                                  >
                                    {r.type}
                                  </span>
                                </div>
                                <span className="font-mono">{fmt(r.debitBalance)}</span>
                              </div>
                            ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Total Debit (Dr)</span>
                        <span className="font-mono" style={{ color: '#38bdf8' }}>
                          {fmt(trialBalance.totalDebit)}
                        </span>
                      </div>
                    </div>

                    {/* Credit Accounts Card */}
                    <div className="report-column glass-card">
                      <div className="column-header">
                        <h2>Credit Balances (Cr)</h2>
                        <span className="amount-header font-mono" style={{ color: 'var(--color-credit)' }}>
                          {fmt(trialBalance.totalCredit)}
                        </span>
                      </div>
                      <div className="section-block">
                        <h3>Liabilities, Equity & Revenues</h3>
                        {trialBalance.rows.filter((r: any) => parseFloat(r.creditBalance) > 0).length === 0 ? (
                          <div className="empty-subtext">No credit balances</div>
                        ) : (
                          trialBalance.rows
                            .filter((r: any) => parseFloat(r.creditBalance) > 0)
                            .map((r: any) => (
                              <div key={r.accountId} className="report-line">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>{r.accountName}</span>
                                  <span
                                    className={`badge badge-${r.type.toLowerCase()}`}
                                    style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                                  >
                                    {r.type}
                                  </span>
                                </div>
                                <span className="font-mono">{fmt(r.creditBalance)}</span>
                              </div>
                            ))
                        )}
                      </div>
                      <div className="column-footer">
                        <span>Total Credit (Cr)</span>
                        <span className="font-mono" style={{ color: 'var(--color-credit)' }}>
                          {fmt(trialBalance.totalCredit)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
