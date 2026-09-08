import { describe, it, expect, beforeAll } from 'vitest';
import { UserModel } from '../../src/modules/auth/models/UserModel.js';
import { AccountModel } from '../../src/modules/ledger/models/AccountModel.js';
import { JournalEntryModel } from '../../src/modules/ledger/models/JournalEntryModel.js';
import { UnbalancedEntryError, ValidationError } from '../../src/core/errors/index.js';

describe('Double-Entry Accounting Invariant & Auth Lifecycle', () => {
  let userId: string;
  let cashAccountId: string;
  let bankAccountId: string;
  let expenseAccountId: string;

  beforeAll(async () => {
    const email = `testuser_${Date.now()}@voicetally.app`;
    const user = await UserModel.register(email, 'securePassword123', 'Integration Test User');
    userId = user.id;

    const accounts = await AccountModel.list(userId);
    cashAccountId = accounts.find((a) => a.name === 'Cash')!.id;
    bankAccountId = accounts.find((a) => a.name === 'Bank')!.id;

    const exp = await AccountModel.create(userId, {
      name: 'Internet Bills',
      type: 'EXPENSE',
      subtype: 'EXPENSE_CATEGORY',
      cashFlowCategory: 'OPERATING',
    });
    expenseAccountId = exp.id;
  });

  it('should create balanced journal entry atomically', async () => {
    const entry = await JournalEntryModel.create(userId, {
      date: new Date(),
      narration: 'Paid fiber broadband bill',
      voucherType: 'PAYMENT',
      lines: [
        { accountId: expenseAccountId, debitAmount: 1200, creditAmount: 0 },
        { accountId: bankAccountId, debitAmount: 0, creditAmount: 1200 },
      ],
    });

    expect(entry.id).toBeDefined();
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0].debitAmount.toString()).toBe('1200');
    expect(entry.lines[1].creditAmount.toString()).toBe('1200');
  });

  it('should reject unbalanced entries at the model level', async () => {
    await expect(
      JournalEntryModel.create(userId, {
        date: new Date(),
        narration: 'Unbalanced payment attempt',
        voucherType: 'PAYMENT',
        lines: [
          { accountId: expenseAccountId, debitAmount: 1000, creditAmount: 0 },
          { accountId: bankAccountId, debitAmount: 0, creditAmount: 900 },
        ],
      })
    ).rejects.toThrow(UnbalancedEntryError);
  });

  it('should reject entries with fewer than 2 lines', async () => {
    await expect(
      JournalEntryModel.create(userId, {
        date: new Date(),
        narration: 'Single line attempt',
        voucherType: 'JOURNAL',
        lines: [
          { accountId: expenseAccountId, debitAmount: 500, creditAmount: 0 },
        ],
      })
    ).rejects.toThrow(ValidationError);
  });

  it('should accurately compute running balance in account ledger', async () => {
    const ledger = await JournalEntryModel.getAccountLedger(bankAccountId, userId);
    expect(ledger.rows.length).toBeGreaterThanOrEqual(1);
    const lastRow = ledger.rows[ledger.rows.length - 1];
    expect(lastRow.creditAmount.toString()).toBe('1200');
  });
});
