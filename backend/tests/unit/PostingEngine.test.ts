import { describe, it, expect } from 'vitest';
import { PostingEngine } from '../../src/modules/ledger/services/PostingEngine.js';
import { UnbalancedEntryError, ValidationError } from '../../src/core/errors/index.js';

describe('PostingEngine', () => {
  it('should generate balanced lines for PAYMENT voucher', () => {
    const lines = PostingEngine.buildPaymentLines({
      voucherType: 'PAYMENT',
      amount: 1500,
      date: '2026-09-01',
      narration: 'Office Rent',
      cashAccountId: 'bank-acc-1',
      counterAccountId: 'rent-acc-2',
    });

    expect(lines).toHaveLength(2);
    // Counter account debited
    expect(lines[0]).toEqual({
      accountId: 'rent-acc-2',
      debitAmount: '1500',
      creditAmount: '0',
    });
    // Cash/Bank credited
    expect(lines[1]).toEqual({
      accountId: 'bank-acc-1',
      debitAmount: '0',
      creditAmount: '1500',
    });
  });

  it('should generate balanced lines for RECEIPT voucher', () => {
    const lines = PostingEngine.buildReceiptLines({
      voucherType: 'RECEIPT',
      amount: 25000,
      date: '2026-09-01',
      narration: 'Freelance Consulting',
      cashAccountId: 'bank-acc-1',
      counterAccountId: 'income-acc-3',
    });

    expect(lines).toHaveLength(2);
    // Cash/Bank debited
    expect(lines[0]).toEqual({
      accountId: 'bank-acc-1',
      debitAmount: '25000',
      creditAmount: '0',
    });
    // Counter account credited
    expect(lines[1]).toEqual({
      accountId: 'income-acc-3',
      debitAmount: '0',
      creditAmount: '25000',
    });
  });

  it('should generate balanced lines for CONTRA voucher', () => {
    const lines = PostingEngine.buildContraLines({
      voucherType: 'CONTRA',
      amount: 5000,
      date: '2026-09-01',
      narration: 'Cash withdrawal',
      fromAccountId: 'bank-acc-1',
      toAccountId: 'cash-acc-4',
    });

    expect(lines).toHaveLength(2);
    // Destination account debited
    expect(lines[0]).toEqual({
      accountId: 'cash-acc-4',
      debitAmount: '5000',
      creditAmount: '0',
    });
    // Source account credited
    expect(lines[1]).toEqual({
      accountId: 'bank-acc-1',
      debitAmount: '0',
      creditAmount: '5000',
    });
  });

  it('should reject non-positive amounts', () => {
    expect(() =>
      PostingEngine.buildPaymentLines({
        voucherType: 'PAYMENT',
        amount: 0,
        date: '2026-09-01',
        narration: 'Zero amount',
        cashAccountId: 'bank-acc-1',
        counterAccountId: 'exp-acc-2',
      })
    ).toThrow(ValidationError);

    expect(() =>
      PostingEngine.buildPaymentLines({
        voucherType: 'PAYMENT',
        amount: -50,
        date: '2026-09-01',
        narration: 'Negative amount',
        cashAccountId: 'bank-acc-1',
        counterAccountId: 'exp-acc-2',
      })
    ).toThrow(ValidationError);
  });

  it('should reject identical source and counter accounts', () => {
    expect(() =>
      PostingEngine.buildContraLines({
        voucherType: 'CONTRA',
        amount: 1000,
        date: '2026-09-01',
        narration: 'Self transfer',
        fromAccountId: 'bank-acc-1',
        toAccountId: 'bank-acc-1',
      })
    ).toThrow(ValidationError);
  });

  it('should throw UnbalancedEntryError when debits != credits in validateBalance', () => {
    expect(() =>
      PostingEngine.validateBalance([
        { accountId: 'acc-1', debitAmount: '100', creditAmount: '0' },
        { accountId: 'acc-2', debitAmount: '0', creditAmount: '90' },
      ])
    ).toThrow(UnbalancedEntryError);
  });
});
