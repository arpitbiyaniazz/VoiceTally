import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Multi-turn voice entry through the real agent, resolver, dialogue rules and parser.
 * Only storage is faked (in-memory accounts, contacts and journal entries; Redis offline).
 */
const db = vi.hoisted(() => ({
  accounts: [] as any[],
  people: [] as any[],
  entries: [] as any[],
  seq: 0,
}));

vi.mock('../../src/core/redis/client.js', () => ({
  redis: { status: 'end', get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn() },
}));

vi.mock('../../src/core/database/prisma.js', () => {
  const matches = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([key, value]) => (key === 'NOT' ? !matches(row, value) : row[key] === value));
  return {
    prisma: {
      account: {
        findMany: vi.fn(async ({ where }: any) => db.accounts.filter((a) => matches(a, where))),
        findUnique: vi.fn(
          async ({ where }: any) =>
            db.accounts.find((a) => a.userId === where.userId_name.userId && a.name === where.userId_name.name) ?? null
        ),
      },
      person: {
        findMany: vi.fn(async ({ where }: any) =>
          db.people
            .filter((p) => p.userId === where.userId)
            .map((p) => ({ ...p, accounts: db.accounts.filter((a) => a.personId === p.id) }))
        ),
      },
      journalLine: { findMany: vi.fn(async () => []) },
    },
  };
});

vi.mock('../../src/modules/ledger/models/AccountModel.js', () => ({
  AccountModel: {
    create: vi.fn(async (userId: string, input: any) => {
      const account = { id: `acc_${++db.seq}`, userId, personId: null, cachedBalance: 0, ...input };
      db.accounts.push(account);
      return account;
    }),
  },
}));

vi.mock('../../src/modules/ledger/models/PersonModel.js', () => ({
  PersonModel: {
    create: vi.fn(async (userId: string, input: any) => {
      const person = { id: `per_${++db.seq}`, userId, name: input.name, phone: null };
      const account = { id: `acc_${++db.seq}`, userId, name: input.name, type: 'ASSET', subtype: 'PERSON', personId: person.id, cachedBalance: 0 };
      db.people.push(person);
      db.accounts.push(account);
      return { ...person, accounts: [account] };
    }),
  },
}));

vi.mock('../../src/modules/ledger/models/JournalEntryModel.js', () => ({
  JournalEntryModel: {
    create: vi.fn(async (userId: string, input: any) => {
      const entry = { id: `je_${++db.seq}`, userId, ...input };
      db.entries.push(entry);
      return entry;
    }),
    list: vi.fn(async () => ({ entries: [] })),
  },
}));

vi.mock('../../src/modules/ledger/models/ReportsModel.js', () => ({
  ReportsModel: {
    getBalanceSheet: vi.fn(async () => ({ assets: { totalAssets: 0 }, liabilities: { totalLiabilities: 0 } })),
    getProfitAndLoss: vi.fn(async () => ({ expenseAccounts: [], incomeAccounts: [], totalExpense: 0, totalIncome: 0, netProfit: 0 })),
  },
}));

import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';

let userCount = 0;

function seedUser(opts: { funds?: Array<[string, number]>; people?: string[]; expenses?: string[]; income?: string[] } = {}): string {
  const userId = `user_${++userCount}`;
  for (const [name, balance] of opts.funds ?? [['Cash', 1000], ['Bank', 50000]]) {
    db.accounts.push({ id: `acc_${++db.seq}`, userId, name, type: 'ASSET', subtype: 'CASH_BANK', personId: null, cachedBalance: balance });
  }
  for (const name of opts.people ?? []) {
    const person = { id: `per_${++db.seq}`, userId, name, phone: null };
    db.people.push(person);
    db.accounts.push({ id: `acc_${++db.seq}`, userId, name, type: 'ASSET', subtype: 'PERSON', personId: person.id, cachedBalance: 0 });
  }
  for (const name of opts.expenses ?? []) {
    db.accounts.push({ id: `acc_${++db.seq}`, userId, name, type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY', personId: null, cachedBalance: 0 });
  }
  for (const name of opts.income ?? []) {
    db.accounts.push({ id: `acc_${++db.seq}`, userId, name, type: 'INCOME', subtype: 'INCOME_CATEGORY', personId: null, cachedBalance: 0 });
  }
  return userId;
}

const accountId = (userId: string, name: string) => db.accounts.find((a) => a.userId === userId && a.name === name)?.id;
const say = (userId: string, text: string, execute = false) => VoiceAgentService.process(userId, text, execute);

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('VoiceAgentService — follow-up questions and accurate entries', () => {
  beforeEach(() => {
    db.accounts.length = 0;
    db.people.length = 0;
    db.entries.length = 0;
  });

  it('asks for the amount and payment mode, previews, and creates accounts only on confirmation', async () => {
    const u = seedUser();

    const r1 = await say(u, 'Paid for groceries');
    expect(r1.needsClarification).toBe(true);
    expect(r1.clarification?.field).toBe('amount');
    expect(r1.spokenResponse).toMatch(/how much did you pay for groceries/i);
    expect(r1.conversation?.stage).toBe('COLLECTING');
    expect(r1.needsConfirmation).toBeUndefined();

    const r2 = await say(u, '450');
    expect(r2.clarification?.field).toBe('paymentMode');
    expect(r2.clarification?.options).toEqual(['Cash', 'Bank / UPI']);
    expect(r2.clarification?.draft).toMatchObject({ flowLabel: 'Payment', amount: 450, categoryName: 'Groceries' });

    const r3 = await say(u, 'cash');
    expect(r3.needsConfirmation).toBe(true);
    expect(r3.conversation?.stage).toBe('AWAITING_CONFIRMATION');
    expect(r3.data).toMatchObject({ debitAccount: 'Groceries', creditAccount: 'Cash', amount: 450, isBackdated: false });
    expect(r3.data.newAccounts).toEqual([{ name: 'Groceries', kind: 'expense category' }]);
    expect(accountId(u, 'Groceries')).toBeUndefined();

    const r4 = await say(u, 'yeah go ahead');
    expect(r4.executed).toBe(true);
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]).toMatchObject({ voucherType: 'PAYMENT', source: 'VOICE', date: localDate() });
    expect(db.entries[0].lines).toEqual([
      { accountId: accountId(u, 'Groceries'), debitAmount: 450, creditAmount: 0 },
      { accountId: accountId(u, 'Cash'), debitAmount: 0, creditAmount: 450 },
    ]);
  });

  it('cancelling a preview leaves no stray contact or account behind', async () => {
    const u = seedUser();
    expect((await say(u, 'Gave money to Rahul')).clarification?.field).toBe('amount');
    expect((await say(u, '5000')).clarification?.field).toBe('paymentMode');

    const preview = await say(u, 'through UPI');
    expect(preview.data).toMatchObject({ debitAccount: 'Rahul', creditAccount: 'Bank' });
    expect(preview.data.newAccounts).toEqual([{ name: 'Rahul', kind: 'contact' }]);

    const cancelled = await say(u, 'cancel');
    expect(cancelled.spokenResponse).toContain('Transaction cancelled');
    expect(db.people).toHaveLength(0);
    expect(accountId(u, 'Rahul')).toBeUndefined();
    expect(db.entries).toHaveLength(0);
  });

  it('asks whether money was paid or received for "Rahul 5000"', async () => {
    const u = seedUser();
    const r1 = await say(u, 'Rahul 5000');
    expect(r1.clarification?.field).toBe('flow');
    expect(r1.clarification?.options).toEqual(['Gave to Rahul', 'Received from Rahul', 'Rahul bought on credit']);

    expect((await say(u, 'Received from Rahul')).clarification?.field).toBe('paymentMode');
    const preview = await say(u, 'cash');
    expect(preview.data).toMatchObject({ voucherType: 'RECEIPT', debitAccount: 'Cash', creditAccount: 'Rahul', amount: 5000 });
  });

  it('asks which bank account when the user has several, and reuses their income account', async () => {
    const u = seedUser({
      funds: [['Cash on Hand', 18000], ['HDFC Bank Account', 220000], ['ICICI Savings Account', 150000]],
      income: ['Salary & Compensation'],
    });

    const r1 = await say(u, 'Received salary 75000 in bank');
    expect(r1.clarification?.field).toBe('bankChoice');
    expect(r1.clarification?.options).toEqual(['HDFC Bank Account', 'ICICI Savings Account']);

    const preview = await say(u, 'the second one');
    expect(preview.data).toMatchObject({ debitAccount: 'ICICI Savings Account', creditAccount: 'Salary & Compensation', amount: 75000 });
    expect(preview.data.newAccounts).toEqual([]);
  });

  it('uses the bank the user names and the matching existing expense account', async () => {
    const u = seedUser({
      funds: [['Cash on Hand', 18000], ['HDFC Bank Account', 220000], ['ICICI Savings Account', 150000]],
      expenses: ['Apartment Rent', 'Dining & Restaurants'],
    });

    const rent = await say(u, 'Paid 2000 for rent from HDFC');
    expect(rent.data).toMatchObject({ debitAccount: 'Apartment Rent', creditAccount: 'HDFC Bank Account' });

    const lunch = await say(u, 'Paid 500 for lunch in cash');
    expect(lunch.data).toMatchObject({ debitAccount: 'Dining & Restaurants', creditAccount: 'Cash on Hand' });
  });

  it('matches an account the user names outright ("Office Rent")', async () => {
    const u = seedUser({ expenses: ['Office Rent'] });
    const preview = await say(u, 'Paid 1500 for Office Rent from Cash');
    expect(preview.data).toMatchObject({ debitAccount: 'Office Rent', creditAccount: 'Cash' });
  });

  it('asks which contact when several match, and accepts a surname as the answer', async () => {
    const u = seedUser({ people: ['Rahul Sharma', 'Rahul Verma'] });

    const r1 = await say(u, 'Received 2000 from Rahul in cash');
    expect(r1.clarification?.field).toBe('personChoice');
    expect(r1.clarification?.options).toEqual(['Rahul Sharma', 'Rahul Verma', 'New contact "Rahul"']);

    const preview = await say(u, 'Verma');
    expect(preview.data).toMatchObject({ debitAccount: 'Cash', creditAccount: 'Rahul Verma' });
  });

  it('a single first-name match is used without asking; "Raj" never matches "Rajesh"', async () => {
    const u = seedUser({ people: ['Rahul Sharma', 'Rajesh Kumar'] });
    expect((await say(u, 'Received 2000 from Rahul in cash')).data).toMatchObject({ creditAccount: 'Rahul Sharma' });

    const raj = await say(u, 'Received 300 from Raj in cash');
    expect(raj.data).toMatchObject({ creditAccount: 'Raj' });
    expect(raj.data.newAccounts).toEqual([{ name: 'Raj', kind: 'contact' }]);
  });

  it('offers a near spelling and takes "yes" as that contact', async () => {
    const u = seedUser({ people: ['Rahul Sharma'] });

    const r1 = await say(u, 'Gave 500 to Rahl in cash');
    expect(r1.clarification?.field).toBe('personChoice');
    expect(r1.spokenResponse).toMatch(/did you mean rahul sharma/i);

    const preview = await say(u, 'yes');
    expect(preview.data).toMatchObject({ debitAccount: 'Rahul Sharma', creditAccount: 'Cash' });
  });

  it('lets the user correct the preview before posting', async () => {
    const u = seedUser();
    expect((await say(u, 'Paid 500 for lunch from cash')).data).toMatchObject({ amount: 500, creditAccount: 'Cash' });

    expect((await say(u, 'make it 600')).data).toMatchObject({ amount: 600, creditAccount: 'Cash' });
    expect((await say(u, 'change it to bank')).data).toMatchObject({ amount: 600, creditAccount: 'Bank' });

    const asked = await say(u, 'change the amount');
    expect(asked.clarification?.field).toBe('amount');
    expect((await say(u, '650')).data).toMatchObject({ amount: 650, creditAccount: 'Bank' });

    expect((await say(u, 'yes')).executed).toBe(true);
    expect(db.entries[0].lines[0].debitAmount).toBe(650);
    expect(db.entries[0].lines[1].accountId).toBe(accountId(u, 'Bank'));
  });

  it('answers a question mid-entry, then returns to the pending question', async () => {
    const u = seedUser();
    await say(u, 'Paid for groceries');

    const query = await say(u, 'what is my cash balance?');
    expect(query.intent.type).toBe('QUERY');
    expect(query.spokenResponse).toMatch(/Your Cash balance is 1,000 rupees\. Now, back to your entry: How much did you pay for Groceries\?/);
    expect(query.conversation?.stage).toBe('COLLECTING');

    expect((await say(u, '300')).clarification?.field).toBe('paymentMode');
  });

  it('starts over when the user states a different transaction', async () => {
    const u = seedUser();
    await say(u, 'Paid for groceries');
    const preview = await say(u, 'Received 2000 from Rahul in cash');
    expect(preview.data).toMatchObject({ voucherType: 'RECEIPT', debitAccount: 'Cash', creditAccount: 'Rahul', amount: 2000 });
  });

  it('re-asks when the user says yes before the details are complete', async () => {
    const u = seedUser();
    await say(u, 'Paid for groceries');
    const r = await say(u, 'yes');
    expect(r.clarification?.field).toBe('amount');
    expect(r.spokenResponse).toMatch(/^I still need one more detail/);
    expect(db.entries).toHaveLength(0);
  });

  it('cancelling while collecting discards the draft', async () => {
    const u = seedUser();
    await say(u, 'Paid for groceries');
    expect((await say(u, 'no, cancel it')).spokenResponse).toContain('Transaction cancelled');
    expect((await say(u, 'yes')).spokenResponse).toContain('no pending transaction');
  });

  it('gives up after three unclear answers instead of looping forever', async () => {
    const u = seedUser();
    await say(u, 'Paid for groceries');
    await say(u, 'blah blah');
    await say(u, 'blah blah');
    const last = await say(u, 'blah blah');
    expect(last.displayTitle).toBe('Entry Discarded');
    expect(last.conversation?.stage).toBe('IDLE');
  });

  it('asks for a valid amount instead of rejecting a negative one', async () => {
    const u = seedUser();
    const r1 = await say(u, 'I made a withdrawal from the bank -5000', true);
    expect(r1.executed).toBe(false);
    expect(r1.clarification?.field).toBe('amount');
    expect(r1.spokenResponse).toMatch(/positive/i);

    const preview = await say(u, '5000');
    expect(preview.data).toMatchObject({ voucherType: 'CONTRA', debitAccount: 'Cash', creditAccount: 'Bank', amount: 5000 });
  });

  it('records the date the user mentioned', async () => {
    const u = seedUser();
    const preview = await say(u, 'Paid 500 for dinner yesterday in cash');
    expect(preview.data).toMatchObject({ isBackdated: true, date: localDate(-1) });
    expect(preview.spokenResponse).toMatch(/dated/);

    await say(u, 'yes');
    expect(db.entries[0].date).toBe(localDate(-1));
  });

  it('asks whether an unknown word is a person or a purpose', async () => {
    const u = seedUser();
    expect((await say(u, 'Paid 500 in cash')).clarification?.field).toBe('counterparty');

    const kind = await say(u, 'kaka');
    expect(kind.clarification?.field).toBe('counterpartyKind');
    expect(kind.clarification?.options).toEqual(['Kaka is a person', 'Spent on Kaka']);

    const preview = await say(u, 'a person');
    expect(preview.data).toMatchObject({ debitAccount: 'Kaka', creditAccount: 'Cash' });
  });

  it('asks who the supplier was for a credit purchase', async () => {
    const u = seedUser();
    const r1 = await say(u, 'Purchased office stationery for 1200 on credit');
    expect(r1.clarification?.field).toBe('person');
    expect(r1.spokenResponse).toMatch(/who did you buy stationery from on credit/i);

    const preview = await say(u, 'Apex Traders');
    expect(preview.data).toMatchObject({ voucherType: 'JOURNAL', debitAccount: 'Stationery', creditAccount: 'Apex Traders' });
  });

  it('posts straight away with execute=true only when nothing is missing', async () => {
    const u = seedUser();
    const incomplete = await say(u, 'Paid for groceries', true);
    expect(incomplete.executed).toBe(false);
    expect(incomplete.needsClarification).toBe(true);

    const u2 = seedUser();
    const posted = await say(u2, 'Paid 450 for groceries using cash', true);
    expect(posted.executed).toBe(true);
    expect(db.entries).toHaveLength(1);
  });

  it('reports the total and each account when the user has several banks', async () => {
    const u = seedUser({ funds: [['Cash on Hand', 18000], ['HDFC Bank Account', 220000], ['ICICI Savings Account', 150000]] });
    const res = await say(u, 'What is my bank balance?');
    expect(res.spokenResponse).toMatch(/total bank balance is 3,70,000 rupees/i);
    expect(res.data.accounts).toHaveLength(2);

    const cash = await say(u, 'how much cash do i have');
    expect(cash.spokenResponse).toBe('Your Cash on Hand balance is 18,000 rupees.');
  });
});
