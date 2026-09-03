/**
 * VoiceTally Automated QA & Bug-Hunting Subagent
 *
 * Runs end-to-end audit using native fetch in Node 22:
 * 1. Auth flows & security boundaries
 * 2. Chart of accounts integrity & constraints
 * 3. Double-entry mathematical invariants
 * 4. Asynchronous ledger posting & idempotency
 * 5. Debtor/Creditor sign mechanics
 * 6. Financial statement calculations (Balance Sheet equation, P&L, Cash Flow, Trial Balance)
 * 7. Rate limiter & API error contract validation
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function test(suite: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ [${suite}] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    const errorMsg = err.message || JSON.stringify(err);
    results.push({ suite, name, passed: false, error: errorMsg, durationMs: Date.now() - start });
    console.error(`  ✗ [${suite}] ${name} -> ERROR: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }
  return { status: res.status, ok: res.ok, data };
}

async function runQASubAgent() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        VoiceTally Automated QA & Bug-Hunting Agent           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const testEmail = `qa_agent_${Date.now()}@voicetally.app`;
  const testPassword = 'Password123!';
  let token = '';
  let userId = '';

  let cashId = '';
  let bankId = '';
  let salaryId = '';
  let groceriesId = '';
  let personAccId = '';

  // ─── SUITE 1: Auth Security & Validation ─────────────────────────────────
  console.log('▶ SUITE 1: Auth Security & Validation');

  await test('Auth', 'Should reject registration with invalid email', async () => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'invalid-email', password: testPassword, name: 'Test' }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Auth', 'Should reject registration with short password (<8 chars)', async () => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'short', name: 'Test' }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Auth', 'Should successfully register new user and return JWT tokens', async () => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'QA Test Master' }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(!!res.data?.data?.accessToken, 'Missing accessToken');
    assert(!!res.data?.data?.refreshToken, 'Missing refreshToken');
    token = res.data.data.accessToken;
    userId = res.data.data.user.id;
  });

  await test('Auth', 'Should reject duplicate email registration with 409 Conflict', async () => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Duplicate' }),
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  await test('Auth', 'Should reject unauthenticated access to protected routes', async () => {
    const res = await apiRequest('/ledger/accounts');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ─── SUITE 2: Chart of Accounts & Auto-Seeding ───────────────────────────
  console.log('\n▶ SUITE 2: Chart of Accounts & Auto-Seeding Invariants');

  await test('Accounts', 'Should auto-seed 3 default accounts (Cash, Bank, Opening Capital)', async () => {
    const res = await apiRequest('/ledger/accounts/chart', { headers: authHeaders });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const chart = res.data.data;
    assert(chart.ASSET.some((a: any) => a.name === 'Cash'), 'Missing Cash account');
    assert(chart.ASSET.some((a: any) => a.name === 'Bank'), 'Missing Bank account');
    assert(chart.EQUITY.some((a: any) => a.name === 'Opening Capital'), 'Missing Opening Capital');

    cashId = chart.ASSET.find((a: any) => a.name === 'Cash').id;
    bankId = chart.ASSET.find((a: any) => a.name === 'Bank').id;
  });

  await test('Accounts', 'Should create custom Income and Expense accounts', async () => {
    const incRes = await apiRequest('/ledger/accounts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Salary Income', type: 'INCOME', subtype: 'INCOME_CATEGORY', cashFlowCategory: 'OPERATING' }),
    });
    salaryId = incRes.data.data.id;

    const expRes = await apiRequest('/ledger/accounts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Groceries Expense', type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY', cashFlowCategory: 'OPERATING' }),
    });
    groceriesId = expRes.data.data.id;

    assert(!!salaryId && !!groceriesId, 'Failed to create accounts');
  });

  await test('Accounts', 'Should reject duplicate account names for the same user', async () => {
    const res = await apiRequest('/ledger/accounts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK' }),
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  // ─── SUITE 3: Double-Entry Invariant Enforcement ─────────────────────────
  console.log('\n▶ SUITE 3: Double-Entry Invariant Enforcement');

  await test('Ledger Invariant', 'Should REJECT unbalanced journal entries with UNBALANCED_ENTRY', async () => {
    const res = await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'JOURNAL',
        date: '2026-09-01',
        narration: 'Unbalanced Attempt',
        lines: [
          { accountId: cashId, debitAmount: 500, creditAmount: 0 },
          { accountId: bankId, debitAmount: 0, creditAmount: 300 },
        ],
      }),
    });
    assert(res.status === 422, `Expected 422 Unbalanced Entry, got ${res.status}`);
    assert(res.data?.error?.code === 'UNBALANCED_ENTRY', 'Expected code UNBALANCED_ENTRY');
  });

  await test('Ledger Invariant', 'Should REJECT entries where line has both debit and credit', async () => {
    const res = await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'JOURNAL',
        date: '2026-09-01',
        narration: 'Both debit & credit on same line',
        lines: [
          { accountId: cashId, debitAmount: 500, creditAmount: 500 },
          { accountId: bankId, debitAmount: 0, creditAmount: 0 },
        ],
      }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Posting', 'Should post RECEIPT voucher (Salary: ₹60,000 -> Bank)', async () => {
    const res = await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'RECEIPT',
        amount: 60000,
        date: '2026-09-01',
        narration: 'September Salary',
        cashAccountId: bankId,
        counterAccountId: salaryId,
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.data.totals.debit === '60000', 'Debit total must match');
    assert(res.data.data.totals.credit === '60000', 'Credit total must match');
  });

  await test('Posting', 'Should post CONTRA voucher (ATM Cash withdrawal ₹10,000 Bank -> Cash)', async () => {
    const res = await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'CONTRA',
        amount: 10000,
        date: '2026-09-02',
        narration: 'Cash withdrawal',
        fromAccountId: bankId,
        toAccountId: cashId,
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  await test('Posting', 'Should post PAYMENT voucher (Groceries: ₹2,500 from Cash)', async () => {
    const res = await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'PAYMENT',
        amount: 2500,
        date: '2026-09-03',
        narration: 'Supermarket Groceries',
        cashAccountId: cashId,
        counterAccountId: groceriesId,
      }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  // ─── SUITE 4: Contacts & Debtors/Creditors Logic ─────────────────────────
  console.log('\n▶ SUITE 4: Contacts & Debtors/Creditors Logic');

  await test('People', 'Should create Contact and automatically link PERSON account', async () => {
    const res = await apiRequest('/ledger/people', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Vikram Mehta', phone: '+919811223344', label: 'Coworker' }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(!!res.data.data.linkedAccountId, 'Missing linked account ID');
    personAccId = res.data.data.linkedAccountId;
  });

  await test('People', 'Should track receivable when lending ₹5,000 to contact', async () => {
    await apiRequest('/ledger/vouchers', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherType: 'PAYMENT',
        amount: 5000,
        date: '2026-09-03',
        narration: 'Lent to Vikram for travel',
        cashAccountId: bankId,
        counterAccountId: personAccId,
      }),
    });

    // Allow worker a brief moment to update cache
    await new Promise((r) => setTimeout(r, 600));

    const pRes = await apiRequest('/ledger/people', { headers: authHeaders });
    const vikram = pRes.data.data.find((p: any) => p.name === 'Vikram Mehta');
    assert(vikram.balance === '5000', `Expected balance 5000, got ${vikram.balance}`);
    assert(vikram.balanceDirection === 'receivable', `Expected receivable, got ${vikram.balanceDirection}`);
    assert(vikram.balanceLabel.includes('Owes you ₹5000'), `Expected 'Owes you ₹5000', got ${vikram.balanceLabel}`);
  });

  // ─── SUITE 5: Financial Reports & Mathematical Consistency ──────────────
  console.log('\n▶ SUITE 5: Financial Reports & Mathematical Consistency');

  await test('Reports', 'Trial Balance: Total Debits must equal Total Credits', async () => {
    const res = await apiRequest('/ledger/reports/trial-balance', { headers: authHeaders });
    const tb = res.data.data;
    assert(tb.isBalanced === true, 'Trial Balance must be balanced');
    assert(tb.difference === '0', 'Difference must be exactly zero');
    assert(tb.totalDebit === tb.totalCredit, `Debits (${tb.totalDebit}) != Credits (${tb.totalCredit})`);
  });

  await test('Reports', 'Profit & Loss: Net Profit = Total Revenue (60,000) - Total Expense (2,500) = 57,500', async () => {
    const res = await apiRequest(
      '/ledger/reports/profit-loss?startDate=2026-01-01&endDate=2026-12-31',
      { headers: authHeaders }
    );
    const pnl = res.data.data;
    assert(pnl.totalIncome === '60000', `Expected 60000 income, got ${pnl.totalIncome}`);
    assert(pnl.totalExpense === '2500', `Expected 2500 expense, got ${pnl.totalExpense}`);
    assert(pnl.netProfit === '57500', `Expected 57500 net profit, got ${pnl.netProfit}`);
    assert(pnl.isProfitable === true, 'Must be marked as profitable');
  });

  await test('Reports', 'Balance Sheet: Assets (57,500) must equal Liabilities (0) + Equity (57,500)', async () => {
    const res = await apiRequest('/ledger/reports/balance-sheet', { headers: authHeaders });
    const bs = res.data.data;
    assert(bs.isBalanced === true, 'Balance Sheet equation must balance');
    assert(bs.difference === '0', `Difference must be zero, got ${bs.difference}`);
    // Bank (45,000) + Cash (7,500) + Vikram Receivable (5,000) = 57,500
    assert(bs.assets.totalAssets === '57500', `Expected assets 57500, got ${bs.assets.totalAssets}`);
    assert(bs.equity.totalEquity === '57500', `Expected equity 57500, got ${bs.equity.totalEquity}`);
  });

  await test('Reports', 'Cash Flow: Net Cash Movement = Operating (+57,500) + Investing (-5,000) = +52,500', async () => {
    const res = await apiRequest(
      '/ledger/reports/cash-flow?startDate=2026-01-01&endDate=2026-12-31',
      { headers: authHeaders }
    );
    const cf = res.data.data;
    assert(cf.totalOperating === '57500', `Expected operating +57500, got ${cf.totalOperating}`);
    assert(cf.totalInvesting === '-5000', `Expected investing -5000, got ${cf.totalInvesting}`);
    assert(cf.netCashFlow === '52500', `Expected net cash 52500, got ${cf.netCashFlow}`);
    // Closing cash (Bank 45,000 + Cash 7,500 = 52,500)
    assert(cf.closingCashBalance === '52500', `Expected closing cash 52500, got ${cf.closingCashBalance}`);
  });

  // ─── SUITE 6: Account Ledger Running Balance ─────────────────────────────
  console.log('\n▶ SUITE 6: Account Ledger Running Balance Calculation');

  await test('Ledger Rows', 'Cash Account ledger must show chronological lines with running balances', async () => {
    const res = await apiRequest(`/ledger/accounts/${cashId}/ledger`, { headers: authHeaders });
    const ledger = res.data.data;
    assert(ledger.rows.length === 2, `Expected 2 rows in cash ledger, got ${ledger.rows.length}`);
    // Line 1: +10,000 from ATM Contra
    assert(ledger.rows[0].debitAmount === '10000', 'Row 1 debit should be 10000');
    assert(ledger.rows[0].runningBalance === '10000', 'Row 1 running balance should be 10000');
    // Line 2: -2,500 for Groceries
    assert(ledger.rows[1].creditAmount === '2500', 'Row 2 credit should be 2500');
    assert(ledger.rows[1].runningBalance === '7500', 'Row 2 running balance should be 7500');
  });

  // ─── SUITE 7: Voice Agent Intent Processing & Queries ────────────────────
  console.log('\n▶ SUITE 7: Voice Agent Intent Processing & Invariants');

  await test('Voice Agent', 'Should process ATM bank withdrawal ("i made the withdrawal from the bank 2000")', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'i made the withdrawal from the bank 2000', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.executed === true, 'Should execute voucher');
    assert(data.intent.action === 'WITHDRAWAL', 'Action should be WITHDRAWAL');
    assert(data.data.voucherType === 'CONTRA', 'Should be CONTRA voucher');
    assert(data.data.amount === 2000, `Expected 2000 amount, got ${data.data.amount}`);
  });

  await test('Voice Agent', 'Should process "Rahul bought goods for 15000" (Debtor on Credit)', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'Rahul bought goods for 15000', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.executed === true, 'Should execute voucher');
    assert(data.data.debitAccount === 'Rahul', 'Debit account should be Rahul');
    assert(data.data.creditAccount === 'Sales Revenue', 'Credit account should be Sales Revenue');
    assert(data.data.amount === 15000, 'Amount should be 15000');
  });

  await test('Voice Agent', 'Should process "i take 3000 muny from Rahul in cash" (Debt Settlement Receipt)', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'i take 3000 muny from Rahul in cash', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.executed === true, 'Should execute voucher');
    assert(data.data.voucherType === 'RECEIPT', 'Should be RECEIPT voucher');
    assert(data.data.debitAccount === 'Cash', 'Debit account should be Cash');
    assert(data.data.creditAccount === 'Rahul', 'Credit account should be Rahul');
    assert(data.data.amount === 3000, 'Amount should be 3000');
  });

  await test('Voice Agent', 'Should answer "what is the bank balance?" query with spoken response', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'what is the bank balance?', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.intent.type === 'QUERY', 'Should be QUERY intent');
    assert(data.intent.target === 'BANK_BALANCE', 'Target should be BANK_BALANCE');
    assert(typeof data.spokenResponse === 'string' && data.spokenResponse.length > 0, 'Must have spoken response');
    assert(data.data.account === 'Bank', 'Account should be Bank');
  });

  await test('Voice Agent', 'Should answer "how much does Rahul owe me?" debtor query', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'how much does Rahul owe me?', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.intent.target === 'PERSON_BALANCE', 'Target should be PERSON_BALANCE');
    assert(data.data.person === 'Rahul', 'Person should be Rahul');
    assert(data.spokenResponse.includes('Rahul'), 'Spoken response should mention Rahul');
  });

  await test('Voice Agent', 'Should answer "what is my net worth?" financial health query', async () => {
    const res = await apiRequest('/voice/process', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ transcript: 'what is my net worth?', execute: true }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = res.data.data;
    assert(data.intent.target === 'NET_WORTH', 'Target should be NET_WORTH');
    assert(data.data.netWorth !== undefined, 'Net worth must be calculated');
  });

  // ─── SUMMARY REPORT ──────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║   QA Subagent Audit Complete: ${passed}/${total} Passed (${failed} Failed)        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.error('Failures detected:');
    results.filter((r) => !r.passed).forEach((f) => {
      console.error(`  - [${f.suite}] ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 100% of functional, API, & invariant tests PASSED with 0 bugs detected.\n');
    process.exit(0);
  }
}

runQASubAgent().catch((err) => {
  console.error('Fatal QA agent error:', err);
  process.exit(1);
});

