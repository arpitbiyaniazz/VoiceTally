/**
 * FinancialGuardrails — Financial Bounds & Ledger Integrity Rules for VoiceTally
 *
 * Enforces business logic safety, prevents negative balance exploitation,
 * checks transaction thresholds, and guarantees mathematical balance.
 */

export interface FinancialGuardrailResult {
  passed: boolean;
  reason?: string;
  isHighValue?: boolean;
  warning?: string;
}

export class FinancialGuardrails {
  public static readonly MIN_AMOUNT = 0.01;
  public static readonly MAX_AMOUNT = 100_000_000; // 10 Crore max per single voucher
  public static readonly HIGH_VALUE_THRESHOLD = 100_000; // 1 Lakh threshold for extra confirmation

  /**
   * Validates transaction amount bounds and checks for NaN/Infinity/negative exploits
   */
  public static validateAmount(amount: number | null | undefined): FinancialGuardrailResult {
    if (amount === null || amount === undefined || isNaN(amount) || !isFinite(amount)) {
      return {
        passed: false,
        reason: 'A valid numerical transaction amount is required.',
      };
    }

    if (amount <= 0) {
      return {
        passed: false,
        reason: 'Transaction amounts must be positive numbers greater than zero.',
      };
    }

    if (amount < this.MIN_AMOUNT) {
      return {
        passed: false,
        reason: `Transaction amount must be at least ₹${this.MIN_AMOUNT}.`,
      };
    }

    if (amount > this.MAX_AMOUNT) {
      return {
        passed: false,
        reason: `Transaction amount exceeds the safety maximum limit of ₹${this.MAX_AMOUNT.toLocaleString('en-IN')}.`,
      };
    }

    const isHighValue = amount >= this.HIGH_VALUE_THRESHOLD;
    return {
      passed: true,
      isHighValue,
      warning: isHighValue
        ? `High-value transaction detected (₹${amount.toLocaleString('en-IN')}). Reconfirmation is strongly advised.`
        : undefined,
    };
  }

  /**
   * Verifies double-entry mathematical balance (Sum(Debits) === Sum(Credits))
   */
  public static verifyDoubleEntryBalance(lines: Array<{ debitAmount: number | string; creditAmount: number | string }>): boolean {
    if (!lines || lines.length < 2) return false;

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debitAmount?.toString() || '0') || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.creditAmount?.toString() || '0') || 0), 0);

    return Math.abs(totalDebit - totalCredit) < 0.0001 && totalDebit > 0;
  }

  /**
   * Sanitizes person and account names to prevent dangerous characters
   */
  public static sanitizeAccountName(name: string): string {
    return name
      .replace(/[<>'"`;\\]/g, '')
      .trim()
      .slice(0, 80);
  }
}
