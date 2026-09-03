import { Decimal } from '@prisma/client/runtime/library';
import { UnbalancedEntryError, ValidationError } from '../../../core/errors/index.js';
import type { VoucherType } from '@prisma/client';
import type { JournalLineInput } from '../models/JournalEntryModel.js';

// ─── Voucher Input Types ──────────────────────────────────────────────────

export interface PaymentReceiptInput {
  voucherType: 'PAYMENT' | 'RECEIPT';
  amount: number | string;
  date: string | Date;
  narration: string;
  cashAccountId: string;     // Cash or Bank account
  counterAccountId: string;  // Expense, Income, or Person account
}

export interface ContraInput {
  voucherType: 'CONTRA';
  amount: number | string;
  date: string | Date;
  narration: string;
  fromAccountId: string;     // Source cash/bank account
  toAccountId: string;       // Destination cash/bank account
}

export interface JournalInput {
  voucherType: 'JOURNAL';
  date: string | Date;
  narration: string;
  lines: JournalLineInput[];
}

export type VoucherInput = PaymentReceiptInput | ContraInput | JournalInput;

// ─── Posting Engine (Deterministic — no LLM, no guessing) ────────────────

/**
 * Stateless service that maps semantic voucher input to balanced journal lines.
 * This is the deterministic heart of the system.
 *
 * Rules (from Section 3 of the spec):
 *   Payment: Debit counterAccount, Credit cashAccount
 *   Receipt: Debit cashAccount, Credit counterAccount
 *   Contra:  Debit toAccount, Credit fromAccount
 *   Journal: pass-through (user specifies lines directly)
 */
export const PostingEngine = {
  /**
   * Build balanced journal lines from a voucher input.
   * Always validates the balance invariant before returning.
   */
  buildJournalLines(input: VoucherInput): JournalLineInput[] {
    let lines: JournalLineInput[];

    switch (input.voucherType) {
      case 'PAYMENT':
        lines = this.buildPaymentLines(input as PaymentReceiptInput);
        break;
      case 'RECEIPT':
        lines = this.buildReceiptLines(input as PaymentReceiptInput);
        break;
      case 'CONTRA':
        lines = this.buildContraLines(input as ContraInput);
        break;
      case 'JOURNAL':
        lines = (input as JournalInput).lines;
        break;
      default:
        throw new ValidationError(`Unknown voucher type: ${(input as { voucherType: string }).voucherType}`);
    }

    // Final balance check
    this.validateBalance(lines);

    return lines;
  },

  /**
   * Payment voucher: money going OUT.
   * Debit the counter-account (expense, person, etc.)
   * Credit the cash/bank account.
   */
  buildPaymentLines(input: PaymentReceiptInput): JournalLineInput[] {
    const amount = new Decimal(input.amount);

    if (amount.isZero() || amount.isNegative()) {
      throw new ValidationError('Amount must be positive', {
        amount: ['Must be greater than zero'],
      });
    }

    if (input.cashAccountId === input.counterAccountId) {
      throw new ValidationError('Cash account and counter account cannot be the same');
    }

    return [
      {
        accountId: input.counterAccountId,
        debitAmount: amount.toString(),
        creditAmount: '0',
      },
      {
        accountId: input.cashAccountId,
        debitAmount: '0',
        creditAmount: amount.toString(),
      },
    ];
  },

  /**
   * Receipt voucher: money coming IN.
   * Debit the cash/bank account.
   * Credit the counter-account (income, person, etc.)
   */
  buildReceiptLines(input: PaymentReceiptInput): JournalLineInput[] {
    const amount = new Decimal(input.amount);

    if (amount.isZero() || amount.isNegative()) {
      throw new ValidationError('Amount must be positive', {
        amount: ['Must be greater than zero'],
      });
    }

    if (input.cashAccountId === input.counterAccountId) {
      throw new ValidationError('Cash account and counter account cannot be the same');
    }

    return [
      {
        accountId: input.cashAccountId,
        debitAmount: amount.toString(),
        creditAmount: '0',
      },
      {
        accountId: input.counterAccountId,
        debitAmount: '0',
        creditAmount: amount.toString(),
      },
    ];
  },

  /**
   * Contra voucher: cash/bank transfer (no expense or income).
   * Debit the destination account.
   * Credit the source account.
   */
  buildContraLines(input: ContraInput): JournalLineInput[] {
    const amount = new Decimal(input.amount);

    if (amount.isZero() || amount.isNegative()) {
      throw new ValidationError('Amount must be positive', {
        amount: ['Must be greater than zero'],
      });
    }

    if (input.fromAccountId === input.toAccountId) {
      throw new ValidationError('Source and destination accounts cannot be the same');
    }

    return [
      {
        accountId: input.toAccountId,
        debitAmount: amount.toString(),
        creditAmount: '0',
      },
      {
        accountId: input.fromAccountId,
        debitAmount: '0',
        creditAmount: amount.toString(),
      },
    ];
  },

  /**
   * Validate that lines balance (SUM debits === SUM credits).
   */
  validateBalance(lines: JournalLineInput[]): void {
    const totalDebits = lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.debitAmount || 0)),
      new Decimal(0)
    );
    const totalCredits = lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.creditAmount || 0)),
      new Decimal(0)
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new UnbalancedEntryError(
        undefined,
        totalDebits.toString(),
        totalCredits.toString()
      );
    }
  },
};
