import { VoiceParser, type TransactionDetails, type TransactionFlow } from './VoiceParser.js';

/**
 * VoiceDialogue — Slot-filling rules for building a voucher over several turns
 *
 * Pure functions (no database access): which detail is still missing, how to ask for it,
 * how a reply is merged into the entry being built, and how a reply picks one of the offered options.
 */

export type ClarificationField =
  | 'flow'          // did the money go out or come in?
  | 'amount'
  | 'counterparty'  // who was paid / what it was for (payments & receipts)
  | 'person'        // the contact for a credit sale or credit purchase
  | 'paymentMode'
  | 'counterpartyKind' // an unknown word: is it a person or what the money was for?
  | 'date'
  | 'personChoice'  // several contacts match the spoken name
  | 'bankChoice'    // the user has several bank accounts
  | 'cashChoice';   // the user has several cash accounts

export interface DraftChoice {
  id: string;
  name: string;
  personId?: string | null;
}

/**
 * A transaction being assembled from one or more utterances
 */
export interface TransactionDraft extends TransactionDetails {
  /** Contact picked when several matched the spoken name (isNew = create a new contact) */
  chosenPerson?: { accountId?: string; personId?: string | null; name: string; isNew?: boolean };
  /** Bank account picked when the user has several */
  chosenBankAccount?: { id: string; name: string };
  /** Cash account picked when the user has several */
  chosenCashAccount?: { id: string; name: string };
  /** An unrecognised answer waiting to be classified as a person or a purpose */
  pendingCounterparty?: string;
}

export interface ClarificationPrompt {
  field: ClarificationField;
  question: string;
  /** Short replies the UI can offer as buttons (the user may also answer freely) */
  options: string[];
  /** Ledger entities behind the options of a choice question, in the same order */
  choices?: DraftChoice[];
}

export interface DraftSummary {
  flow?: TransactionFlow;
  flowLabel?: string;
  amount?: number;
  formattedAmount?: string;
  personName?: string;
  categoryName?: string;
  paymentMode?: 'CASH' | 'BANK';
  accountName?: string;
  date?: string;
}

const FLOW_LABELS: Record<TransactionFlow, string> = {
  OUT: 'Payment',
  IN: 'Receipt',
  WITHDRAWAL: 'Cash withdrawal',
  DEPOSIT: 'Cash deposit',
  CREDIT_SALE: 'Credit sale',
  CREDIT_PURCHASE: 'Credit purchase',
};

const COMMON_EXPENSES = ['Food & Dining', 'Groceries', 'Travel & Fuel', 'Rent'];
const COMMON_INCOME = ['Salary', 'Investment Income', 'Refunds & Cashback'];
const MAX_CHOICES = 4;

const OPTION_STOPWORDS = new Set(['the', 'one', 'and', 'account', 'bank', 'new', 'contact', 'with', 'for', 'from']);

function spoken(amount: number | undefined): string {
  if (amount === undefined || amount === null || !isFinite(amount)) return 'the amount';
  return `${Math.round(Math.abs(amount)).toLocaleString('en-IN')} rupees`;
}

function normalizeOption(s: string): string {
  return VoiceParser.normalize(s)
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export const VoiceDialogue = {
  flowLabel(flow: TransactionFlow | undefined): string | undefined {
    return flow ? FLOW_LABELS[flow] : undefined;
  },

  /**
   * Merge a reply or correction into the draft. Newly stated facts win.
   */
  merge(draft: TransactionDraft, update: TransactionDetails): TransactionDraft {
    const next: TransactionDraft = { ...draft };
    const keys = ['flow', 'amount', 'personName', 'categoryName', 'paymentMode', 'bankHint', 'date', 'narration'] as const;
    for (const key of keys) {
      const value = update[key];
      if (value !== undefined && value !== null && value !== '') {
        (next as Record<string, unknown>)[key] = value;
      }
    }

    if (update.personName || update.categoryName) delete next.pendingCounterparty;

    // A different contact or payment mode invalidates an earlier account choice
    if (update.personName && update.personName !== draft.personName) delete next.chosenPerson;
    if (update.bankHint && update.bankHint !== draft.bankHint) delete next.chosenBankAccount;
    // Restating the mode without naming a bank ("in bank", "via UPI") drops an earlier bank name
    if (update.paymentMode && !update.bankHint) delete next.bankHint;

    if (update.flow && draft.flow && update.flow !== draft.flow) {
      if (update.flow === 'WITHDRAWAL' || update.flow === 'DEPOSIT') {
        // Contra entries have no counterparty
        delete next.personName;
        delete next.categoryName;
        delete next.chosenPerson;
      } else if (next.categoryName && !update.categoryName) {
        // "Rent" paid becomes "Rental Income" received; drop categories that don't fit the new direction
        const type = update.flow === 'IN' ? 'INCOME' : 'EXPENSE';
        const remapped = update.flow === 'CREDIT_SALE' ? undefined : VoiceParser.canonicalCategory(next.categoryName, type);
        if (remapped) next.categoryName = remapped.name;
        else delete next.categoryName;
      }
    }
    return next;
  },

  /**
   * Is this utterance a brand-new transaction rather than an answer or correction for the draft?
   * Only when it states an amount and a direction that contradicts the draft, with its own counterparty
   * ("Received 2000 from Rahul" while we were asking about a lunch payment).
   */
  isFreshCommand(update: TransactionDetails, draft: TransactionDraft): boolean {
    if (!update.flow || update.amount === undefined || !draft.flow) return false;
    if (update.flow === draft.flow) return false;
    return update.flow === 'WITHDRAWAL' || update.flow === 'DEPOSIT' || !!update.personName || !!update.categoryName;
  },

  /**
   * The next detail that must be known before the voucher can be built, or null when complete
   */
  nextMissingField(d: TransactionDraft): ClarificationField | null {
    if (!d.flow) return 'flow';
    if (d.amount === undefined || d.amount === null) return 'amount';
    switch (d.flow) {
      case 'WITHDRAWAL':
      case 'DEPOSIT':
        return null;
      case 'CREDIT_SALE':
      case 'CREDIT_PURCHASE':
        return d.personName ? null : 'person';
      default:
        if (!d.personName && !d.categoryName) return 'counterparty';
        if (!d.paymentMode) return 'paymentMode';
        return null;
    }
  },

  /**
   * Phrase the follow-up question for a missing detail
   */
  prompt(field: ClarificationField, d: TransactionDraft, extra?: { choices?: DraftChoice[]; spokenName?: string; fuzzy?: boolean; contacts?: string[] }): ClarificationPrompt {
    const amt = spoken(d.amount);
    const person = d.personName;
    const category = d.categoryName;

    switch (field) {
      case 'flow': {
        if (person) {
          return {
            field,
            question:
              d.amount !== undefined
                ? `Did you give ${amt} to ${person}, or receive ${amt} from ${person}?`
                : `Did you pay ${person}, or receive money from ${person}?`,
            options: [`Gave to ${person}`, `Received from ${person}`, `${person} bought on credit`],
          };
        }
        return {
          field,
          question:
            d.amount !== undefined
              ? `What was the ${amt} for — did you pay it, receive it, or move it between cash and bank?`
              : 'Did you pay money, receive money, or move it between cash and bank?',
          options: ['I paid it', 'I received it', 'Withdrew cash from bank', 'Deposited cash in bank'],
        };
      }

      case 'amount': {
        let question = 'How much was it?';
        switch (d.flow) {
          case 'OUT':
            question = category ? `How much did you pay for ${category}?` : person ? `How much did you give ${person}?` : 'How much did you pay?';
            break;
          case 'IN':
            question = person ? `How much did you receive from ${person}?` : category ? `How much ${category} did you receive?` : 'How much did you receive?';
            break;
          case 'WITHDRAWAL':
            question = 'How much cash did you withdraw from the bank?';
            break;
          case 'DEPOSIT':
            question = 'How much cash did you deposit into the bank?';
            break;
          case 'CREDIT_SALE':
            question = person ? `What was the amount of ${person}'s credit purchase?` : 'How much was the credit sale for?';
            break;
          case 'CREDIT_PURCHASE':
            question = category ? `How much did the ${category} purchase cost?` : 'How much was the purchase?';
            break;
        }
        return { field, question, options: [] };
      }

      case 'counterparty': {
        const contacts = (extra?.contacts ?? []).slice(0, 2);
        if (d.flow === 'IN') {
          return {
            field,
            question: `Who did you receive ${amt} from? You can also say salary, interest or another income source.`,
            options: [...contacts, ...COMMON_INCOME].slice(0, MAX_CHOICES),
          };
        }
        return {
          field,
          question: `Who did you pay ${amt} to, or what was it for?`,
          options: [...contacts, ...COMMON_EXPENSES].slice(0, MAX_CHOICES),
        };
      }

      case 'person':
        return d.flow === 'CREDIT_SALE'
          ? { field, question: `Who bought ${category ? category.toLowerCase() : 'it'} from you on credit?`, options: (extra?.contacts ?? []).slice(0, MAX_CHOICES) }
          : { field, question: `Who did you buy ${category ? category.toLowerCase() : 'it'} from on credit?`, options: (extra?.contacts ?? []).slice(0, MAX_CHOICES) };

      case 'paymentMode':
        return {
          field,
          question: d.flow === 'IN' ? `Did you receive ${amt} in cash or in your bank account?` : `Did you pay ${amt} in cash or from your bank account?`,
          options: ['Cash', 'Bank / UPI'],
        };

      case 'counterpartyKind': {
        const word = d.pendingCounterparty ?? 'that';
        const label = word.replace(/\b\w/g, (c) => c.toUpperCase());
        return d.flow === 'IN'
          ? { field, question: `Is ${label} a person who paid you, or the source of the income?`, options: [`${label} is a person`, `It's ${label} income`] }
          : { field, question: `Is ${label} a person you paid, or what the money was spent on?`, options: [`${label} is a person`, `Spent on ${label}`] };
      }

      case 'date':
        return { field, question: 'Which date should this entry have? For example "today", "yesterday" or "20 October".', options: ['Today', 'Yesterday'] };

      case 'personChoice': {
        const choices = (extra?.choices ?? []).slice(0, MAX_CHOICES);
        const spokenName = extra?.spokenName ?? person ?? 'that name';
        const newOption = `New contact "${spokenName}"`;
        if (extra?.fuzzy && choices.length === 1) {
          return {
            field,
            question: `Did you mean ${choices[0].name}, or should I add "${spokenName}" as a new contact?`,
            options: [choices[0].name, newOption],
            choices,
          };
        }
        const names = choices.map((c) => c.name);
        return {
          field,
          question: `I found ${names.length} contacts named ${spokenName}: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. Which one?`,
          options: [...names, newOption],
          choices,
        };
      }

      case 'bankChoice':
      case 'cashChoice': {
        const choices = (extra?.choices ?? []).slice(0, MAX_CHOICES);
        const names = choices.map((c) => c.name);
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
        return {
          field,
          question: field === 'bankChoice' ? `Which bank account was it — ${list}?` : `Which cash account was it — ${list}?`,
          options: names,
          choices,
        };
      }
    }
  },

  /**
   * Which offered option does a reply refer to? ("the second one", "HDFC", "Rahul Sharma") — or -1
   */
  matchOption(text: string, options: string[]): number {
    if (options.length === 0) return -1;
    const reply = normalizeOption(text);
    if (!reply) return -1;

    const ordinals: Array<[RegExp, number]> = [
      [/\b(?:first|1st|pehla|pehli|pahla|pahli)\b/, 0],
      [/\b(?:second|2nd|doosra|dusra|doosri|dusri)\b/, 1],
      [/\b(?:third|3rd|teesra|tisra|teesri)\b/, 2],
      [/\b(?:fourth|4th)\b/, 3],
    ];
    for (const [re, idx] of ordinals) {
      if (re.test(reply) && idx < options.length) return idx;
    }
    if (/\blast\s+one\b|\bthe\s+last\b/.test(reply)) return options.length - 1;
    const digit = reply.match(/^(?:option\s+|number\s+)?([1-4])$/);
    if (digit && parseInt(digit[1], 10) <= options.length) return parseInt(digit[1], 10) - 1;

    const normalized = options.map(normalizeOption);
    const exact = normalized.indexOf(reply);
    if (exact >= 0) return exact;

    const contained = normalized
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => (o.length >= 3 && reply.includes(o)) || (reply.length >= 3 && o.includes(reply)));
    if (contained.length === 1) return contained[0].i;

    const replyTokens = new Set(reply.split(' ').filter((w) => w.length >= 3 && !OPTION_STOPWORDS.has(w)));
    const scores = normalized.map((o) => o.split(' ').filter((w) => replyTokens.has(w)).length);
    const best = Math.max(...scores);
    if (best > 0 && scores.filter((s) => s === best).length === 1) return scores.indexOf(best);
    return -1;
  },

  /**
   * Is the spoken name close to a contact name (STT spelling slips like "Rahool" for "Rahul")?
   */
  isNearMatch(spokenName: string, contactName: string): boolean {
    const a = spokenName.toLowerCase();
    const tokens = contactName.toLowerCase().split(/\s+/);
    return tokens.some((t) => t.length >= 4 && a.length >= 4 && levenshtein(a, t) <= (t.length >= 7 ? 2 : 1));
  },

  /**
   * Compact view of the draft for the UI and the LLM context
   */
  summarize(d: TransactionDraft): DraftSummary {
    return {
      flow: d.flow,
      flowLabel: this.flowLabel(d.flow),
      amount: d.amount,
      formattedAmount:
        d.amount !== undefined ? `₹${Math.abs(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
      personName: d.chosenPerson?.name ?? d.personName,
      categoryName: d.categoryName,
      paymentMode: d.paymentMode,
      accountName: d.paymentMode === 'CASH' ? d.chosenCashAccount?.name : d.chosenBankAccount?.name,
      date: d.date,
    };
  },

  /**
   * One-line description, e.g. "payment of ₹500 for Food & Dining (payment mode not given yet)"
   */
  describe(d: TransactionDraft): string {
    const parts: string[] = [];
    parts.push((this.flowLabel(d.flow) ?? 'transaction').toLowerCase());
    parts.push(d.amount !== undefined ? `of ₹${d.amount.toLocaleString('en-IN')}` : '(amount not given yet)');
    if (d.personName) parts.push(d.flow === 'IN' || d.flow === 'CREDIT_PURCHASE' ? `from ${d.personName}` : `to ${d.personName}`);
    if (d.categoryName) parts.push(`for ${d.categoryName}`);
    if (d.flow === 'OUT' || d.flow === 'IN') parts.push(d.paymentMode ? `via ${d.paymentMode === 'BANK' ? 'bank' : 'cash'}` : '(payment mode not given yet)');
    if (d.date) parts.push(`dated ${d.date}`);
    return parts.join(' ');
  },
};
