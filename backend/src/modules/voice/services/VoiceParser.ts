import type { VoucherType } from '@prisma/client';

/**
 * High-level classification of user voice utterance
 */
export type VoiceIntentType = 'QUERY' | 'TRANSACTION' | 'CONFIRMATION' | 'UNKNOWN';

/**
 * Read-only accounting inquiries
 */
export interface VoiceQueryIntent {
  type: 'QUERY';
  target:
    | 'BANK_BALANCE'
    | 'CASH_BALANCE'
    | 'NET_WORTH'
    | 'TOTAL_ASSETS'
    | 'TOTAL_LIABILITIES'
    | 'TOTAL_INCOME'
    | 'TOTAL_EXPENSES'
    | 'PERSON_BALANCE'
    | 'EXPENSE_CATEGORY'
    | 'RECENT_TRANSACTIONS';
  personName?: string;
  categoryName?: string;
  rawText: string;
}

/**
 * Double-entry ledger mutation commands
 */
export interface VoiceTransactionIntent {
  type: 'TRANSACTION';
  action:
    | 'WITHDRAWAL'          // Contra: Bank -> Cash (ATM/Bank cash withdrawal)
    | 'DEPOSIT'             // Contra: Cash -> Bank (Cash deposit into bank)
    | 'RECEIVE_FROM_PERSON' // Receipt: Debtor -> Cash/Bank (Payment collected from debtor)
    | 'GIVE_TO_PERSON'      // Payment: Cash/Bank -> Person (Lending / Debt repayment)
    | 'PERSON_BOUGHT'       // Journal: Person Dr, Sales Cr (Debtor purchase on credit)
    | 'USER_BOUGHT'         // Journal: Expense Dr, Creditor Cr (User purchase from vendor on credit)
    | 'DIRECT_PAYMENT'      // Payment: Expense Dr, Cash/Bank Cr (Direct expense payment)
    | 'DIRECT_INCOME';      // Receipt: Cash/Bank Dr, Income Cr (Direct salary/revenue receipt)
  voucherType: VoucherType;
  amount: number;
  personName?: string;
  categoryName?: string;
  paymentMode: 'CASH' | 'BANK';
  narration: string;
  rawText: string;
}

/**
 * Conversational user confirmation responses ("yes", "confirm", "proceed", "cancel")
 */
export interface VoiceConfirmationIntent {
  type: 'CONFIRMATION';
  decision: 'CONFIRM' | 'CANCEL';
  rawText: string;
}

/**
 * Unrecognized or out-of-domain utterances
 */
export interface VoiceUnknownIntent {
  type: 'UNKNOWN';
  rawText: string;
  reason: string;
}

export type VoiceParsedResult =
  | VoiceQueryIntent
  | VoiceTransactionIntent
  | VoiceConfirmationIntent
  | VoiceUnknownIntent;

/**
 * VoiceParser — Natural Language Financial Parser & Intent Classifier
 *
 * Deterministically parses spoken and typed financial utterances with Indian numbering
 * conventions, Hinglish accounting colloquialisms, and strict double-entry classifications.
 */
export class VoiceParser {
  /**
   * Parse amounts including Indian numbering multipliers (k, lakh, crore, cr) and negative numbers
   */
  public static parseAmount(text: string): number | null {
    if (!text || typeof text !== 'string') return null;

    // 0. Check for explicit negative numbers (e.g. -5000, - 500, minus 5000)
    const negMatch = text.match(/(?:-\s*|\bminus\s+)(\d+(?:,\d+)*(?:\.\d+)?)/i);
    if (negMatch) {
      const val = parseFloat(negMatch[1].replace(/,/g, ''));
      return -Math.abs(val);
    }

    // 1. Check for multiplier words: crore / cr, lakh / lac, thousand / k
    const croreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:crore|crores|cr)\b/i);
    if (croreMatch) {
      return Math.round(parseFloat(croreMatch[1]) * 10000000);
    }

    const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|lakhs|lacs)\b/i);
    if (lakhMatch) {
      return Math.round(parseFloat(lakhMatch[1]) * 100000);
    }

    const kMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand)\b/i);
    if (kMatch) {
      return Math.round(parseFloat(kMatch[1]) * 1000);
    }

    // 2. Check full numerical numbers (e.g. 10000, 45,000, 5000.50, ₹450, 500 bucks)
    const matches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        const val = parseFloat(m.replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          return val;
        }
      }
    }

    // 3. Fallback word numbers
    const wordNums: Record<string, number> = {
      'ten thousand': 10000,
      'five thousand': 5000,
      'two thousand': 2000,
      'one thousand': 1000,
      'five hundred': 500,
      'three hundred': 300,
      'two hundred': 200,
      'one hundred': 100,
      thousand: 1000,
      hundred: 100,
    };

    for (const [w, n] of Object.entries(wordNums)) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(text)) {
        return n;
      }
    }

    return null;
  }

  /**
   * Determine payment mode (Cash vs Bank/UPI/GPay/PhonePe/Transfer)
   */
  public static parsePaymentMode(text: string): 'CASH' | 'BANK' {
    if (
      /\b(bank|online|upi|gpay|google pay|phonepe|paytm|neft|rtgs|imps|cheque|check|card|debit card|credit card|transfer|net banking)\b/i.test(
        text
      )
    ) {
      return 'BANK';
    }
    return 'CASH';
  }

  /**
   * Extract person / counterparty name from conversational utterance
   */
  public static extractPersonName(text: string): string | null {
    // English and Hinglish patterns
    const patterns = [
      // "from John", "to Rahul", "with Amit", "for Sarah"
      /(?:from|to|for|with)\s+([A-Z][a-zA-Z0-9_-]+|\b[a-zA-Z]{3,20}\b)(?:\s+(?:for|using|via|worth|rupees|rs|in|on|cash|bank|ko|se))?/i,
      // "Rahul ko 5000 diya", "Sharma se 2000 mila"
      /([A-Z][a-zA-Z0-9_-]+|\b[a-zA-Z]{3,20}\b)\s+(?:ko|se)\s+/i,
      // "person John", "party Rahul", "client Sarah"
      /(?:person|party|customer|vendor|client)\s+([A-Z][a-zA-Z0-9_-]+|\b[a-zA-Z]{3,20}\b)/i,
      // "Rahul bought laptop", "John paid me"
      /^([A-Z][a-zA-Z0-9_-]+)\s+(?:bought|purchased|took|gave|paid|owes|has|ne)/i,
      // "does John owe me", "check balance of Sarah"
      /(?:does|is|has)\s+([A-Z][a-zA-Z0-9_-]+)\s+(?:owe|have|balance)/i,
      /(?:owe\s+([A-Z][a-zA-Z0-9_-]+))/i,
    ];

    const blacklisted = new Set([
      'bank', 'cash', 'atm', 'groceries', 'salary', 'food', 'lunch', 'dinner', 'rent',
      'withdrawal', 'deposit', 'money', 'muny', 'something', 'somthing', 'items', 'this',
      'that', 'rupees', 'rs', 'much', 'what', 'how', 'show', 'paid', 'took', 'gave', 'made',
      'the', 'a', 'an', 'my', 'me', 'i', 'you', 'he', 'she', 'they', 'we', 'from', 'to', 'for', 'via',
      'yes', 'no', 'confirm', 'proceed', 'post', 'ok', 'okay', 'haan', 'nahi', 'diya', 'mila',
    ]);

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (!blacklisted.has(candidate.toLowerCase()) && candidate.length > 1) {
          return candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }
      }
    }

    return null;
  }

  /**
   * Parse natural language voice text into a structured intent
   */
  public static parse(transcript: string): VoiceParsedResult {
    const text = transcript.trim();
    if (!text) {
      return {
        type: 'UNKNOWN',
        rawText: text,
        reason: 'Empty voice transcript provided',
      };
    }

    const lower = text.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // 0. CONFIRMATION INTENTS ("yes", "confirm", "proceed", "cancel", "no")
    // ─────────────────────────────────────────────────────────────────────────
    const confirmation = this.parseConfirmationIntent(lower, text);
    if (confirmation) return confirmation;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. QUERY INTENTS (Questions, Balances & Reports)
    // ─────────────────────────────────────────────────────────────────────────
    const query = this.parseQueryIntent(lower, text);
    if (query) return query;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TRANSACTION INTENTS (Double-Entry Commands)
    // ─────────────────────────────────────────────────────────────────────────
    const transaction = this.parseTransactionIntent(lower, text);
    if (transaction) return transaction;

    return {
      type: 'UNKNOWN',
      rawText: text,
      reason: 'Could not confidently determine financial intent or amount',
    };
  }

  /**
   * Helper: Parse user confirmation decisions
   */
  private static parseConfirmationIntent(lower: string, text: string): VoiceConfirmationIntent | null {
    const clean = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    if (
      /^(?:yes|yep|yeah|confirm|proceed|record(?:\s+it)?|post(?:\s+it|\s+voucher|\s+entry)?|do\s+it|sure|ok|okay|haan|ha|theek\s+hai|submit)$/i.test(
        clean
      ) ||
      /(?:yes\s+(?:confirm|proceed|post|record|please)|confirm\s+(?:it|transaction|voucher|and\s+post|please)|please\s+confirm|proceed\s+with\s+posting)/i.test(
        clean
      )
    ) {
      return {
        type: 'CONFIRMATION',
        decision: 'CONFIRM',
        rawText: text,
      };
    }

    if (
      /^(?:no|cancel|nevermind|never\s+mind|stop|abort|don't|dont|nahi|mat\s+karo|reject)$/i.test(clean) ||
      /(?:cancel\s+(?:transaction|voucher|this|it)|do\s+not\s+post|no\s+(?:cancel|dont|nevermind))/i.test(clean)
    ) {
      return {
        type: 'CONFIRMATION',
        decision: 'CANCEL',
        rawText: text,
      };
    }

    return null;
  }

  /**
   * Helper: Parse read-only queries
   */
  private static parseQueryIntent(lower: string, text: string): VoiceQueryIntent | null {
    // Bank Balance
    if (
      /(?:what\s+is|show|tell|check|how\s+much|what|get|view).*?(?:bank\s+balance|bank\s+account|balance.*?bank|money.*?(?:in|have).*?bank|in\s+(?:the\s+|my\s+)?bank)/i.test(
        lower
      ) ||
      /(?:how\s+much\s+(?:money\s+)?(?:do\s+i\s+have|is\s+(?:there|left)|have\s+i\s+got)\s+in\s+(?:my\s+|the\s+)?bank(?:\s+account)?)/i.test(
        lower
      ) ||
      /(?:bank\s+(?:me\s+)?kitna\s+paisa\s+hai|bank\s+(?:ka\s+)?balance\s+batao|bank\s+me\s+kitna\s+hai)/i.test(
        lower
      ) ||
      /^(?:bank\s+balance|check\s+bank|bank\s+account|my\s+bank\s+balance)$/i.test(lower)
    ) {
      return { type: 'QUERY', target: 'BANK_BALANCE', rawText: text };
    }

    // Cash Balance
    if (
      /(?:what\s+is|show|tell|check|how\s+much|what|get|view).*?(?:cash\s+balance|cash\s+in\s+hand|money.*?cash|cash|wallet\s+balance|money.*?wallet)/i.test(
        lower
      ) ||
      /(?:how\s+much\s+(?:money|cash)\s+(?:do\s+i\s+have|is\s+(?:there|left)|have\s+i\s+got))/i.test(
        lower
      ) ||
      /(?:cash\s+(?:me\s+)?kitna\s+(?:hai|paisa\s+hai)|rokar\s+kitna\s+hai|haath\s+me\s+kitna\s+cash\s+hai)/i.test(
        lower
      ) ||
      /^(?:cash\s+balance|check\s+cash|my\s+cash\s+balance|cash\s+in\s+hand|cash)$/i.test(lower)
    ) {
      return { type: 'QUERY', target: 'CASH_BALANCE', rawText: text };
    }

    // Net Worth & Assets & Liabilities
    if (/net\s*worth|wealth/i.test(lower)) {
      return { type: 'QUERY', target: 'NET_WORTH', rawText: text };
    }

    if (/total\s+assets/i.test(lower)) {
      return { type: 'QUERY', target: 'TOTAL_ASSETS', rawText: text };
    }

    if (/total\s+liabilit(?:y|ies)|loans/i.test(lower)) {
      return { type: 'QUERY', target: 'TOTAL_LIABILITIES', rawText: text };
    }

    // Person Balance Query
    if (
      /(?:how\s+much\s+(?:does\s+)?([a-zA-Z0-9_-]+)\s+owe(?:\s+me)?)/i.test(lower) ||
      /(?:how\s+much\s+do\s+i\s+owe\s+([a-zA-Z0-9_-]+))/i.test(lower) ||
      /(?:what\s+is\s+([a-zA-Z0-9_-]+)(?:'s)?\s+balance)/i.test(lower) ||
      /(?:check\s+balance\s+of\s+([a-zA-Z0-9_-]+))/i.test(lower) ||
      /(?:([a-zA-Z0-9_-]+)\s+ka\s+kitna\s+(?:hisaab|hisab|balance)\s+hai)/i.test(lower)
    ) {
      const personName = this.extractPersonName(text);
      if (personName) {
        return {
          type: 'QUERY',
          target: 'PERSON_BALANCE',
          personName,
          rawText: text,
        };
      }
    }

    // Specific Expense Category Query
    if (
      /(?:how\s+much\s+(?:did\s+i\s+spend|was\s+spent)\s+on\s+([a-zA-Z\s]+))/i.test(lower) ||
      /(?:what\s+are\s+my\s+([a-zA-Z\s]+)\s+expenses)/i.test(lower)
    ) {
      const categoryMatch = lower.match(
        /(?:spent\s+on|spend\s+on|my)\s+([a-zA-Z\s]+?)(?:\s+expenses|\s+this\s+month|\?|$)/i
      );
      const category = categoryMatch ? categoryMatch[1].trim() : undefined;
      return {
        type: 'QUERY',
        target: 'EXPENSE_CATEGORY',
        categoryName: category,
        rawText: text,
      };
    }

    // Total Expenses
    if (
      /(?:total\s+expenses|how\s+much\s+(?:did\s+i\s+spend|i\s+spent)|monthly\s+expenses|kitna\s+kharcha\s+hua)/i.test(
        lower
      )
    ) {
      return { type: 'QUERY', target: 'TOTAL_EXPENSES', rawText: text };
    }

    // Total Income / Profit
    if (
      /(?:total\s+income|total\s+revenue|how\s+much\s+(?:did\s+i\s+earn|i\s+earned)|monthly\s+income|kamai\s+kitni\s+hui)/i.test(
        lower
      )
    ) {
      return { type: 'QUERY', target: 'TOTAL_INCOME', rawText: text };
    }

    // Recent Transactions
    if (
      /(?:recent\s+transactions|last\s+transaction|recent\s+vouchers|recent\s+entries|show\s+history)/i.test(
        lower
      )
    ) {
      return { type: 'QUERY', target: 'RECENT_TRANSACTIONS', rawText: text };
    }

    return null;
  }

  /**
   * Helper: Parse double-entry ledger mutation commands
   */
  private static parseTransactionIntent(lower: string, text: string): VoiceTransactionIntent | null {
    const amount = this.parseAmount(text);
    const paymentMode = this.parsePaymentMode(text);

    // 2A. Bank ATM / Cash Withdrawal (Contra: Bank -> Cash)
    if (
      /(?:withdrew|withdrawal|withdraw|atm\s+withdrawal|take\s+out|took\s+out).*?(?:from\s+(?:the\s+)?bank|from\s+atm|bank)/i.test(
        lower
      ) ||
      /(?:transfer(?:red)?).*?(?:from\s+bank\s+to\s+cash)/i.test(lower) ||
      /(?:bank\s+se\s+cash\s+nikala|bank\s+se\s+nikale)/i.test(lower)
    ) {
      return {
        type: 'TRANSACTION',
        action: 'WITHDRAWAL',
        voucherType: 'CONTRA',
        amount: amount || 0,
        paymentMode: 'BANK',
        narration: `ATM / Cash withdrawal from Bank (${amount ? `₹${amount.toLocaleString('en-IN')}` : 'amount pending'})`,
        rawText: text,
      };
    }

    // 2B. Cash Deposit to Bank (Contra: Cash -> Bank)
    if (
      /(?:deposited|deposit|put|added).*?(?:into\s+(?:the\s+)?bank|in\s+bank|to\s+bank)/i.test(lower) ||
      /(?:transfer(?:red)?).*?(?:from\s+cash\s+to\s+bank)/i.test(lower) ||
      /(?:bank\s+me\s+.*?jama|jama\s+.*?bank|cash\s+.*?bank\s+me\s+dala|bank\s+me\s+dala)/i.test(lower)
    ) {
      return {
        type: 'TRANSACTION',
        action: 'DEPOSIT',
        voucherType: 'CONTRA',
        amount: amount || 0,
        paymentMode: 'CASH',
        narration: `Cash deposit into Bank (${amount ? `₹${amount.toLocaleString('en-IN')}` : 'amount pending'})`,
        rawText: text,
      };
    }

    // 2C. Person buying something / Sold goods to person on credit (Debtor creation / Sale)
    // e.g. "this person bought something for 5000", "Rahul bought laptop for 45000", "Sold items to Sarah for 3000"
    if (
      /(?:bought|purchased|took\s+items|took\s+goods|got\s+items|bought\s+something|sold\s+to|sold\s+items\s+to)/i.test(
        lower
      ) &&
      !/(?:i\s+bought|i\s+purchased|we\s+bought|maine\s+kharida)/i.test(lower)
    ) {
      const personName = this.extractPersonName(text) || 'Customer';
      return {
        type: 'TRANSACTION',
        action: 'PERSON_BOUGHT',
        voucherType: 'JOURNAL',
        amount: amount || 0,
        personName,
        paymentMode,
        narration: `Sale / Items purchased by ${personName} on credit`,
        rawText: text,
      };
    }

    // 2D. User bought something from a person on credit (Creditor creation / Purchase)
    // e.g. "I bought stationery from Apex Traders for 3500", "Purchased supplies from Rahul for 1200"
    if (
      /(?:i\s+bought|we\s+bought|i\s+purchased|purchased\s+from|bought\s+from|maine\s+kharida)/i.test(lower)
    ) {
      const personName = this.extractPersonName(text) || 'Vendor';
      let category = 'General Expense';
      if (/stationery/i.test(lower)) category = 'Stationery';
      else if (/groceries|grocery/i.test(lower)) category = 'Groceries';
      else if (/office\s+supplies/i.test(lower)) category = 'Office Supplies';
      else if (/electronics|hardware|laptop|computer/i.test(lower)) category = 'Equipment';

      return {
        type: 'TRANSACTION',
        action: 'USER_BOUGHT',
        voucherType: 'JOURNAL',
        amount: amount || 0,
        personName,
        categoryName: category,
        paymentMode,
        narration: `Purchased ${category} from ${personName} on credit`,
        rawText: text,
      };
    }

    // 2E. Taking / Receiving money from a person (Receipt / Debt repayment)
    // e.g. "i take this much muny from that person", "took 5000 from Rahul", "Sharma se 10k mila"
    if (
      /(?:take|took|taken|receive|received|got|collected|accepted).*?(?:from|money\s+from|muny\s+from)/i.test(
        lower
      ) ||
      /(?:paid\s+me|gave\s+me|se\s+.*?(?:mila|mile|liye|liya)|(?:mila|mile|liye|liya)\s+.*?se)/i.test(lower)
    ) {
      const personName = this.extractPersonName(text) || 'Debtor';
      return {
        type: 'TRANSACTION',
        action: 'RECEIVE_FROM_PERSON',
        voucherType: 'RECEIPT',
        amount: amount || 0,
        personName,
        paymentMode,
        narration: `Payment received from ${personName} (${paymentMode})`,
        rawText: text,
      };
    }

    // 2F. Giving / Lending money to a person (Payment / Lending / Debt)
    // e.g. "I gave 4000 to John", "lent 2500 to Rahul from bank", "Rahul ko 5000 diya"
    if (
      /(?:gave|give|given|lent|lend|transferred\s+to|sent).*?(?:to|money\s+to)/i.test(lower) ||
      /(?:ko\s+.*?(?:diya|diye)|(?:diya|diye)\s+.*?ko|paid\s+([A-Z][a-zA-Z]+))/i.test(text)
    ) {
      const personName = this.extractPersonName(text) || 'Counterparty';
      return {
        type: 'TRANSACTION',
        action: 'GIVE_TO_PERSON',
        voucherType: 'PAYMENT',
        amount: amount || 0,
        personName,
        paymentMode,
        narration: `Payment / Lent to ${personName} (${paymentMode})`,
        rawText: text,
      };
    }

    // 2G. Direct Expenses & Payments (Payment Voucher)
    // e.g. "Paid 450 for groceries using cash", "Paid electricity bill of 2200 from bank", "Spent 500 on dinner"
    if (
      /(?:paid|spent|spend|pay).*?(?:for|on|bill)/i.test(lower) ||
      /(?:groceries|electricity|rent|food|dinner|lunch|travel|cab|petrol|fuel|coffee|utilities)/i.test(
        lower
      )
    ) {
      let category = 'General Expense';
      if (/groceries|grocery/i.test(lower)) category = 'Groceries';
      else if (/electricity/i.test(lower)) category = 'Electricity';
      else if (/rent/i.test(lower)) category = 'Rent';
      else if (/food|dinner|lunch|coffee|restaurant/i.test(lower)) category = 'Food & Dining';
      else if (/travel|cab|taxi|uber|ola|petrol|fuel/i.test(lower)) category = 'Travel & Fuel';
      else if (/internet|wifi|phone|recharge/i.test(lower)) category = 'Utilities';

      return {
        type: 'TRANSACTION',
        action: 'DIRECT_PAYMENT',
        voucherType: 'PAYMENT',
        amount: amount || 0,
        categoryName: category,
        paymentMode,
        narration: `Paid for ${category} via ${paymentMode}`,
        rawText: text,
      };
    }

    // 2H. Direct Income / Salary / Freelance (Receipt Voucher)
    // e.g. "Received salary 60000 in bank", "Got freelance payment 15000"
    if (/(?:salary|freelance|consulting|dividend|interest|revenue|earned)/i.test(lower)) {
      let category = 'Salary';
      if (/freelance/i.test(lower)) category = 'Freelance Income';
      else if (/consulting/i.test(lower)) category = 'Consulting Revenue';
      else if (/dividend|interest/i.test(lower)) category = 'Investment Income';

      return {
        type: 'TRANSACTION',
        action: 'DIRECT_INCOME',
        voucherType: 'RECEIPT',
        amount: amount || 0,
        categoryName: category,
        paymentMode: 'BANK',
        narration: `Received ${category} in ${paymentMode}`,
        rawText: text,
      };
    }

    // If amount is detected but generic action
    if (amount && amount > 0) {
      if (/paid|payment/i.test(lower)) {
        return {
          type: 'TRANSACTION',
          action: 'DIRECT_PAYMENT',
          voucherType: 'PAYMENT',
          amount,
          categoryName: 'General Expense',
          paymentMode,
          narration: `Payment of ₹${amount.toLocaleString('en-IN')} via ${paymentMode}`,
          rawText: text,
        };
      }
      if (/received|income/i.test(lower)) {
        return {
          type: 'TRANSACTION',
          action: 'DIRECT_INCOME',
          voucherType: 'RECEIPT',
          amount,
          categoryName: 'General Income',
          paymentMode,
          narration: `Income of ₹${amount.toLocaleString('en-IN')} into ${paymentMode}`,
          rawText: text,
        };
      }
    }

    return null;
  }
}
