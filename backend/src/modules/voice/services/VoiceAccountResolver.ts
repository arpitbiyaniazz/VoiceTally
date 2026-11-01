import type { Account } from '@prisma/client';
import { prisma } from '../../../core/database/prisma.js';
import { ConflictError } from '../../../core/errors/index.js';
import { AccountModel } from '../../ledger/models/AccountModel.js';
import { PersonModel } from '../../ledger/models/PersonModel.js';
import { FinancialGuardrails } from '../security/FinancialGuardrails.js';
import { VoiceParser, type PaymentMode } from './VoiceParser.js';
import { VoiceDialogue, type DraftChoice, type TransactionDraft } from './VoiceDialogue.js';

/**
 * A ledger account an entry will post to — one that already exists, or one to create
 * when the entry is confirmed (previewing never creates accounts).
 */
export type AccountRef =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new-fund'; name: 'Cash' | 'Bank' }
  | { kind: 'new-person'; name: string; personId?: string | null }
  | { kind: 'new-category'; name: string; type: 'EXPENSE' | 'INCOME' };

export type AccountResolution =
  | { status: 'resolved'; ref: AccountRef }
  | {
      status: 'ambiguous';
      field: 'personChoice' | 'bankChoice' | 'cashChoice';
      choices: DraftChoice[];
      spokenName?: string;
      fuzzy?: boolean;
    };

/** Cash-type ledger accounts are named like "Cash", "Cash on Hand", "Petty Cash", "Wallet" */
const CASH_NAME_RE = /\b(?:cash|hand|petty|wallet)\b/i;

/** Words worth biasing speech recognition towards in this app */
const DOMAIN_TERMS = ['UPI', 'GPay', 'PhonePe', 'Paytm', 'NEFT', 'IMPS', 'RTGS', 'lakh', 'crore', 'rupees'];

/** Generic ledger words that add nothing as speech-recognition hints */
const GENERIC_HINT_WORDS = new Set([
  'account', 'accounts', 'bank', 'cash', 'capital', 'opening', 'savings', 'current', 'expense', 'expenses',
  'income', 'general', 'sales', 'revenue', 'receivable', 'payable', 'deposit', 'contact', 'hand', 'and',
  'the', 'for', 'with', 'from', 'other', 'misc', 'supplies',
]);

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean);
}

function existing(account: { id: string; name: string }): AccountResolution {
  return { status: 'resolved', ref: { kind: 'existing', id: account.id, name: account.name } };
}

export const VoiceAccountResolver = {
  refName(ref: AccountRef): string {
    return ref.name;
  },

  /**
   * Describe accounts that will be created when the entry is posted, for the preview
   */
  newAccountLabel(ref: AccountRef): { name: string; kind: string } | null {
    switch (ref.kind) {
      case 'new-person':
        return { name: ref.name, kind: 'contact' };
      case 'new-category':
        return { name: ref.name, kind: ref.type === 'EXPENSE' ? 'expense category' : 'income category' };
      case 'new-fund':
        return { name: ref.name, kind: ref.name === 'Cash' ? 'cash account' : 'bank account' };
      default:
        return null;
    }
  },

  /**
   * The user's cash and bank accounts, whatever they are called
   */
  async fundAccounts(userId: string): Promise<{ cash: Account[]; bank: Account[] }> {
    const accounts = await prisma.account.findMany({
      where: { userId, subtype: 'CASH_BANK' },
      orderBy: { createdAt: 'asc' },
    });
    return {
      cash: accounts.filter((a) => CASH_NAME_RE.test(a.name)),
      bank: accounts.filter((a) => !CASH_NAME_RE.test(a.name)),
    };
  },

  /**
   * Pick the cash or bank account for an entry, asking when the user has several
   */
  async resolveFund(
    userId: string,
    mode: PaymentMode,
    hint?: string,
    chosen?: { id: string; name: string }
  ): Promise<AccountResolution> {
    if (chosen) return existing(chosen);

    const { cash, bank } = await this.fundAccounts(userId);
    const pool = mode === 'CASH' ? cash : bank;
    const choiceField = mode === 'CASH' ? 'cashChoice' : 'bankChoice';

    if (hint && mode === 'BANK') {
      const hinted = bank.filter((a) => normalizeName(a.name).includes(normalizeName(hint)));
      if (hinted.length === 1) return existing(hinted[0]);
      if (hinted.length > 1) {
        return { status: 'ambiguous', field: 'bankChoice', choices: hinted.map((a) => ({ id: a.id, name: a.name })) };
      }
    }

    if (pool.length === 1) return existing(pool[0]);
    if (pool.length === 0) {
      return { status: 'resolved', ref: { kind: 'new-fund', name: mode === 'CASH' ? 'Cash' : 'Bank' } };
    }

    // Several accounts: one literally called "Cash" / "Bank" is the default
    const plain = pool.find((a) => normalizeName(a.name) === (mode === 'CASH' ? 'cash' : 'bank'));
    if (plain) return existing(plain);
    return { status: 'ambiguous', field: choiceField, choices: pool.map((a) => ({ id: a.id, name: a.name })) };
  },

  /**
   * Find the contact for a spoken name: exact match, a unique first-name / surname match,
   * or ask when several match. Near spellings ("Rahool") are offered for confirmation.
   */
  async resolvePerson(userId: string, spokenName: string, chosen?: TransactionDraft['chosenPerson']): Promise<AccountResolution> {
    if (chosen?.isNew) return { status: 'resolved', ref: { kind: 'new-person', name: chosen.name } };
    if (chosen?.accountId) return existing({ id: chosen.accountId, name: chosen.name });
    if (chosen?.personId) return { status: 'resolved', ref: { kind: 'new-person', name: chosen.name, personId: chosen.personId } };

    const name = FinancialGuardrails.sanitizeAccountName(spokenName);
    const { how, people } = await this.matchPeople(userId, name);

    const asChoice = (p: (typeof people)[number]): DraftChoice => ({
      id: p.accounts[0]?.id ?? `person:${p.id}`,
      name: p.name,
      personId: p.id,
    });

    if ((how === 'exact' || how === 'word') && people.length === 1) {
      const p = people[0];
      return p.accounts.length > 0
        ? existing(p.accounts[0])
        : { status: 'resolved', ref: { kind: 'new-person', name: p.name, personId: p.id } };
    }
    if (how === 'exact' || how === 'word') {
      return { status: 'ambiguous', field: 'personChoice', choices: people.map(asChoice), spokenName: name };
    }

    // An account with that exact name may already exist outside the contacts list
    const sameNamedAccount = await prisma.account.findUnique({ where: { userId_name: { userId, name } } });
    if (sameNamedAccount && sameNamedAccount.subtype === 'PERSON') return existing(sameNamedAccount);

    if (how === 'near') {
      return { status: 'ambiguous', field: 'personChoice', choices: people.slice(0, 3).map(asChoice), spokenName: name, fuzzy: true };
    }
    return { status: 'resolved', ref: { kind: 'new-person', name } };
  },

  /**
   * Contacts matching a spoken name: exact, then whole words ("Rahul" → "Rahul Sharma",
   * never "Raj" → "Rajesh"), then near spellings for speech-recognition slips
   */
  async matchPeople(userId: string, spokenName: string) {
    const people = await prisma.person.findMany({
      where: { userId },
      include: { accounts: { select: { id: true, name: true, cachedBalance: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    const target = normalizeName(spokenName);
    const exact = people.filter((p) => normalizeName(p.name) === target);
    if (exact.length > 0) return { how: 'exact' as const, people: exact };

    const spokenWords = words(spokenName).filter((w) => w.length >= 2);
    const wordMatches = people.filter((p) => {
      const contactWords = words(p.name);
      return spokenWords.length > 0 && spokenWords.every((w) => contactWords.includes(w));
    });
    if (wordMatches.length > 0) return { how: 'word' as const, people: wordMatches };

    const near = people.filter((p) => spokenWords.some((w) => VoiceDialogue.isNearMatch(w, p.name)));
    if (near.length > 0) return { how: 'near' as const, people: near };
    return { how: 'none' as const, people: [] as typeof people };
  },

  /**
   * Find the expense / income account for a category: an account the user named outright,
   * then exact name, then the category's keywords ("Rent" → "Apartment Rent"); otherwise create it.
   */
  async resolveCategory(userId: string, category: string, type: 'EXPENSE' | 'INCOME', utterance?: string): Promise<AccountResolution> {
    const accounts = await prisma.account.findMany({
      where: { userId, type, NOT: { subtype: 'PERSON' } },
      select: { id: true, name: true },
    });

    if (utterance) {
      const said = ` ${normalizeName(VoiceParser.normalize(utterance))} `;
      const named = accounts
        .filter((a) => normalizeName(a.name).length >= 3 && said.includes(` ${normalizeName(a.name)} `))
        .sort((a, b) => b.name.length - a.name.length)[0];
      if (named) return existing(named);
    }

    const target = normalizeName(category);
    const exact = accounts.find((a) => normalizeName(a.name) === target);
    if (exact) return existing(exact);

    const canonical = VoiceParser.canonicalCategory(category, type);
    if (canonical && canonical.name.toLowerCase() === category.toLowerCase()) {
      // Known category: any account carrying one of its keywords ("Dining & Restaurants" for Food & Dining)
      const scored = accounts
        .map((a) => {
          const name = normalizeName(a.name);
          const hits = canonical.keywords.filter((k) => new RegExp(`\\b${VoiceParser.escapeRegExp(k)}`).test(name)).length;
          return { a, hits };
        })
        .filter((s) => s.hits > 0)
        .sort((x, y) => y.hits - x.hits || x.a.name.length - y.a.name.length);
      if (scored.length > 0) return existing(scored[0].a);
    } else {
      // Free-text category: every significant word must match
      const wanted = VoiceParser.categoryKeywords(category, type);
      const match = accounts.find((a) => wanted.length > 0 && wanted.every((w) => words(a.name).some((t) => t.startsWith(w))));
      if (match) return existing(match);
    }

    return { status: 'resolved', ref: { kind: 'new-category', name: FinancialGuardrails.sanitizeAccountName(category), type } };
  },

  /**
   * Create the account behind a reference if needed and return its id (called only when posting)
   */
  async materialize(userId: string, ref: AccountRef): Promise<string> {
    if (ref.kind === 'existing') return ref.id;

    const byName = await prisma.account.findUnique({ where: { userId_name: { userId, name: ref.name } } });

    if (ref.kind === 'new-fund') {
      if (byName) return byName.id;
      const created = await AccountModel.create(userId, {
        name: ref.name,
        type: 'ASSET',
        subtype: 'CASH_BANK',
        cashFlowCategory: 'OPERATING',
      });
      return created.id;
    }

    if (ref.kind === 'new-category') {
      if (byName && byName.type === ref.type) return byName.id;
      const created = await AccountModel.create(userId, {
        name: byName ? `${ref.name} (${ref.type === 'EXPENSE' ? 'Expense' : 'Income'})` : ref.name,
        type: ref.type,
        subtype: ref.type === 'EXPENSE' ? 'EXPENSE_CATEGORY' : 'INCOME_CATEGORY',
        cashFlowCategory: 'OPERATING',
      });
      return created.id;
    }

    // New contact (or an existing contact that has no ledger account yet)
    if (byName && byName.subtype === 'PERSON' && (!ref.personId || byName.personId === ref.personId)) return byName.id;
    const accountName = byName ? `${ref.name} (Contact)` : ref.name;

    if (ref.personId) {
      const created = await AccountModel.create(userId, {
        name: accountName,
        type: 'ASSET',
        subtype: 'PERSON',
        personId: ref.personId,
        cashFlowCategory: 'INVESTING',
      });
      return created.id;
    }

    try {
      const person = await PersonModel.create(userId, { name: accountName, label: 'Voice Contact' });
      return person.accounts[0].id;
    } catch (err) {
      if (err instanceof ConflictError) {
        const raced = await prisma.account.findUnique({ where: { userId_name: { userId, name: accountName } } });
        if (raced) return raced.id;
      }
      throw err;
    }
  },

  /**
   * Recently used contact names, offered as quick replies when asking "who?"
   */
  async recentContacts(userId: string, limit = 3): Promise<string[]> {
    const lines = await prisma.journalLine.findMany({
      where: { account: { userId, subtype: 'PERSON' } },
      orderBy: { journalEntry: { createdAt: 'desc' } },
      take: 30,
      select: { account: { select: { name: true, person: { select: { name: true } } } } },
    });
    const names: string[] = [];
    for (const line of lines) {
      const name = line.account.person?.name ?? line.account.name;
      if (!names.includes(name)) names.push(name);
      if (names.length >= limit) break;
    }
    return names;
  },

  /**
   * Distinctive words from contact and account names that speech recognition should expect
   * (Voxtral context_bias: single words only, at most 100)
   */
  async transcriptionHints(userId: string): Promise<string[]> {
    const [people, accounts] = await Promise.all([
      prisma.person.findMany({ where: { userId }, select: { name: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
      prisma.account.findMany({ where: { userId, NOT: { subtype: 'PERSON' } }, select: { name: true }, take: 40 }),
    ]);
    const hints = new Map<string, string>();
    const addWords = (name: string) => {
      for (const word of name.split(/[^\p{L}\p{N}'-]+/u)) {
        const key = word.toLowerCase();
        if (word.length >= 3 && !/^\d+$/.test(word) && !GENERIC_HINT_WORDS.has(key) && !hints.has(key)) hints.set(key, word);
      }
    };
    people.forEach((p) => addWords(p.name));
    accounts.forEach((a) => addWords(a.name));
    DOMAIN_TERMS.forEach((t) => hints.set(t.toLowerCase(), t));
    return [...hints.values()].slice(0, 100);
  },
};
