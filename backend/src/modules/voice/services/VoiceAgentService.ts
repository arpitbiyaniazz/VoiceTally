import { redis } from '../../../core/redis/client.js';
import {
  VoiceParser,
  type TransactionAction,
  type TransactionDetails,
  type VoiceParsedResult,
  type VoiceQueryIntent,
  type VoiceTransactionIntent,
} from './VoiceParser.js';
import {
  VoiceDialogue,
  type ClarificationField,
  type ClarificationPrompt,
  type DraftSummary,
  type TransactionDraft,
} from './VoiceDialogue.js';
import { VoiceAccountResolver, type AccountRef, type AccountResolution } from './VoiceAccountResolver.js';
import { LLMFunctionCallingService, type LLMConversationContext } from './LLMFunctionCallingService.js';
import { JournalEntryModel, type JournalLineInput } from '../../ledger/models/JournalEntryModel.js';
import { ReportsModel } from '../../ledger/models/ReportsModel.js';
import { PromptGuard } from '../security/PromptGuard.js';
import { FinancialGuardrails, type FinancialGuardrailResult } from '../security/FinancialGuardrails.js';
import { VoiceTelemetry } from '../observability/VoiceTelemetry.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * The agent asked a follow-up question because the entry is missing a detail
 */
export interface VoiceClarificationIntent {
  type: 'CLARIFICATION';
  field: ClarificationField;
  draft: DraftSummary;
  rawText: string;
}

export interface VoiceClarification {
  field: ClarificationField;
  question: string;
  options: string[];
  draft: DraftSummary;
}

/**
 * Where the conversation stands after this turn, so clients can show the right UI
 */
export interface VoiceConversationState {
  stage: 'IDLE' | 'COLLECTING' | 'AWAITING_CONFIRMATION';
  clarification?: VoiceClarification;
  preview?: Record<string, unknown>;
}

export interface VoiceProcessResult {
  intent: VoiceParsedResult | VoiceClarificationIntent;
  spokenResponse: string;
  displayTitle: string;
  data?: any;
  executed: boolean;
  needsConfirmation?: boolean;
  needsClarification?: boolean;
  clarification?: VoiceClarification;
  conversation?: VoiceConversationState;
  confirmToken?: string;
  voucher?: any;
  latencyMs?: number;
}

interface EntryPlan {
  action: TransactionAction;
  debit: AccountRef;
  credit: AccountRef;
  names: { fund?: string; person?: string; category?: string };
}

interface PendingSession {
  /** Missing for sessions stored by earlier versions, which were always previews */
  stage?: 'COLLECTING' | 'AWAITING_CONFIRMATION';
  userId: string;
  draft?: TransactionDraft;
  awaiting?: ClarificationField;
  prompt?: ClarificationPrompt;
  attempts?: number;
  /** Everything the user said while building this entry */
  sourceText?: string;
  // Preview stage
  intent?: VoiceTransactionIntent;
  plan?: EntryPlan;
  preview?: Record<string, unknown>;
  /** Legacy previews stored resolved lines */
  lines?: JournalLineInput[];
  debitAccountName?: string;
  creditAccountName?: string;
  createdAt: number;
  updatedAt?: number;
}

const SESSION_TTL_SECONDS = 300;
const REDIS_TIMEOUT_MS = 1500;
const MAX_ATTEMPTS = 3;
const CHOICE_FIELDS: ClarificationField[] = ['personChoice', 'bankChoice', 'cashChoice', 'counterpartyKind'];

const CLARIFICATION_TITLES: Record<ClarificationField, string> = {
  flow: 'Paid or Received?',
  amount: 'Amount Needed',
  counterparty: 'Who or What For?',
  person: 'Contact Needed',
  paymentMode: 'Cash or Bank?',
  counterpartyKind: 'Person or Purpose?',
  date: 'Entry Date',
  personChoice: 'Which Contact?',
  bankChoice: 'Which Bank Account?',
  cashChoice: 'Which Cash Account?',
};

const DEFAULT_SUGGESTIONS = [
  'What is my bank balance?',
  'What is my net worth?',
  'I made a withdrawal of 5000 from bank',
  'Took 2000 from John in cash',
  'Paid 450 for groceries from Cash',
];

function localDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function humanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function titleCase(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function sumBalances(accounts: Array<{ cachedBalance: Decimal | string | number }>): number {
  return accounts.reduce((s, a) => s + parseFloat(a.cachedBalance.toString()), 0);
}

export class VoiceAgentService {
  // Local cache for fallback / test environments
  private static pendingSessions = new Map<string, PendingSession>();

  /**
   * Run a Redis command with a short timeout. The shared client never fails queued commands
   * while disconnected (maxRetriesPerRequest: null, required by BullMQ), so without this a Redis
   * outage would hang every voice request instead of falling back to memory.
   */
  private static async redisCall<T>(op: () => Promise<T>): Promise<T | undefined> {
    if (!['ready', 'connect', 'connecting'].includes(redis.status)) return undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        op(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), REDIS_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Distributed pending session storage with Redis + memory fallback (5-minute TTL)
   */
  public static async getPendingSession(userId: string): Promise<PendingSession | null> {
    const raw = await this.redisCall(() => redis.get(`voice:pending:${userId}`));
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // Corrupt entry — fall back to memory
      }
    }
    return this.pendingSessions.get(userId) || null;
  }

  public static async setPendingSession(userId: string, session: PendingSession): Promise<void> {
    this.pendingSessions.set(userId, session);
    // Non-fatal on failure: the local fallback is active
    await this.redisCall(() => redis.set(`voice:pending:${userId}`, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS));
  }

  public static async deletePendingSession(userId: string): Promise<void> {
    this.pendingSessions.delete(userId);
    await this.redisCall(() => redis.del(`voice:pending:${userId}`));
  }

  /**
   * Atomically claims and removes a pending session to prevent race conditions & double posting
   */
  public static async takePendingSession(userId: string): Promise<PendingSession | null> {
    // 1. Synchronously claim from local memory map first (prevents async event loop interleaving)
    let inMemorySession: PendingSession | null = null;
    if (this.pendingSessions.has(userId)) {
      inMemorySession = this.pendingSessions.get(userId) || null;
      this.pendingSessions.delete(userId);
    }

    // 2. Atomic Redis GET & DEL via Lua script
    let redisSession: PendingSession | null = null;
    const raw = (await this.redisCall(() =>
      redis.eval(
        "local val = redis.call('get', KEYS[1]); if val then redis.call('del', KEYS[1]) end; return val;",
        1,
        `voice:pending:${userId}`
      )
    )) as string | null | undefined;
    if (raw) {
      try {
        redisSession = JSON.parse(raw);
      } catch {
        // Fallback to local memory session
      }
    }

    return inMemorySession || redisSession || null;
  }

  private static isExpired(session: PendingSession): boolean {
    return Date.now() - (session.updatedAt ?? session.createdAt) > SESSION_TTL_SECONDS * 1000;
  }

  private static async getActiveSession(userId: string): Promise<PendingSession | null> {
    const session = await this.getPendingSession(userId);
    if (session && this.isExpired(session)) {
      await this.deletePendingSession(userId);
      return null;
    }
    return session;
  }

  /**
   * Helper to format currency in Indian numbering (e.g. ₹50,000.00)
   */
  public static fmt(val: number | Decimal | string | undefined): string {
    if (val === undefined || val === null) return '₹0.00';
    const num = typeof val === 'number' ? val : parseFloat(val.toString());
    if (isNaN(num)) return '₹0.00';
    const abs = Math.abs(num);
    return `${num < 0 ? '-' : ''}₹${abs.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Helper to format currency for natural spoken speech (e.g. "50,000 rupees")
   */
  public static fmtSpoken(val: number | Decimal | string | undefined): string {
    if (val === undefined || val === null) return '0 rupees';
    const num = typeof val === 'number' ? val : parseFloat(val.toString());
    if (isNaN(num)) return '0 rupees';
    const abs = Math.round(Math.abs(num));
    return `${num < 0 ? 'minus ' : ''}${abs.toLocaleString('en-IN')} rupees`;
  }

  /**
   * Names and terms speech recognition should expect for this user (contacts, accounts)
   */
  public static async getTranscriptionHints(userId: string): Promise<string[]> {
    try {
      return await VoiceAccountResolver.transcriptionHints(userId);
    } catch {
      return [];
    }
  }

  /**
   * Main entry point: Process a voice transcript or command with prompt guard & telemetry
   */
  public static async process(
    userId: string,
    transcript: string,
    execute: boolean = false
  ): Promise<VoiceProcessResult> {
    const startTime = Date.now();
    const correlationId = VoiceTelemetry.createCorrelationId();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. AI SECURITY & PROMPT INJECTION GUARDRAIL (EXCLUDE INJECTION & FORWARD CLEAN QUERY)
    // ─────────────────────────────────────────────────────────────────────────
    const guardCheck = PromptGuard.inspect(transcript);
    if (guardCheck.hasInjection) {
      VoiceTelemetry.logEvent({
        correlationId,
        userId,
        timestamp: new Date().toISOString(),
        eventType: 'GUARDRAIL_VIOLATION',
        rawTranscript: transcript,
        latencyMs: Date.now() - startTime,
        details: {
          threatType: guardCheck.threatType,
          matchedPattern: guardCheck.matchedPattern,
          sanitizedText: guardCheck.sanitizedText,
        },
      });

      // If the query was 100% injection with no remaining financial/natural query
      if (!guardCheck.sanitizedText) {
        const deflection = PromptGuard.getSafeDeflectionMessage(guardCheck.threatType);
        const latencyMs = Date.now() - startTime;

        return {
          intent: {
            type: 'UNKNOWN',
            rawText: transcript,
            reason: `Security Guardrail Triggered: ${guardCheck.threatType}`,
          },
          spokenResponse: deflection,
          displayTitle: 'Security Guardrail Active',
          data: {
            threatType: guardCheck.threatType,
            guidance: 'VoiceTally operations are strictly restricted to double-entry financial accounting.',
          },
          executed: false,
          latencyMs,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CONVERSATION: answer follow-ups, interpret new requests, ask for what's missing
    // ─────────────────────────────────────────────────────────────────────────
    const textToProcess = guardCheck.sanitizedText || transcript;
    const session = await this.getActiveSession(userId);
    const res = await this.converse(userId, textToProcess, session, execute, correlationId);
    res.latencyMs = Date.now() - startTime;
    return res;
  }

  /**
   * Route one utterance given the conversation state
   */
  private static async converse(
    userId: string,
    text: string,
    session: PendingSession | null,
    execute: boolean,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    // 1. Bare yes / no ("yes", "go ahead", "cancel", "nahi")
    const decision = VoiceParser.parseConfirmation(text);
    if (decision) {
      return this.handleDecision(userId, decision, text, session, execute, correlationId);
    }

    // 2. "That's wrong" / "change the amount" — ask for the new value
    if (session?.draft) {
      const target = VoiceParser.correctionTarget(text);
      if (target) return this.askCorrection(userId, session, target, text);
    }

    // 3. An answer or correction for the entry being built (handled locally, no LLM round trip)
    if (session?.draft) {
      const updated = await this.interpretReply(userId, text, session);
      if (updated) return this.advance(userId, updated, session, execute, text, correlationId);
    }

    // 4. Full interpretation (LLM function calling with deterministic fallback)
    const { parsed, llmMeta } = await LLMFunctionCallingService.interpret(userId, text, this.llmContext(session));

    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'INTENT_PARSED',
      rawTranscript: text,
      intentType: parsed.type,
      actionOrTarget: parsed.type === 'TRANSACTION' ? parsed.action : parsed.type === 'QUERY' ? parsed.target : undefined,
      amount: parsed.type === 'TRANSACTION' ? parsed.amount : undefined,
      details: { llmMeta },
    });

    switch (parsed.type) {
      case 'CONFIRMATION':
        return this.handleDecision(userId, parsed.decision, text, session, execute, correlationId);

      case 'QUERY': {
        const res = await this.handleQuery(userId, parsed, correlationId);
        return session ? this.withReminder(userId, res, session) : res;
      }

      case 'TRANSACTION':
      case 'DETAILS': {
        const details = parsed.type === 'TRANSACTION' ? (parsed.details ?? this.detailsFromIntent(parsed)) : parsed.details;
        if (session?.draft && !VoiceDialogue.isFreshCommand(details, session.draft)) {
          return this.advance(userId, VoiceDialogue.merge(session.draft, details), session, execute, text, correlationId);
        }
        return this.advance(userId, { ...details }, null, execute, text, correlationId);
      }

      default: {
        if (session) return this.reask(userId, session, text, "Sorry, I didn't catch that.");
        return this.unknownResponse(parsed, llmMeta.isLLMPowered);
      }
    }
  }

  // ─── Yes / no ────────────────────────────────────────────────────────────

  private static async handleDecision(
    userId: string,
    decision: 'CONFIRM' | 'CANCEL',
    text: string,
    session: PendingSession | null,
    execute: boolean,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    // "Did you mean Rahul Sharma, or a new contact?" — yes picks the suggestion, no the new contact
    if (session?.stage === 'COLLECTING' && session.draft && session.awaiting === 'personChoice' && session.prompt?.options.length === 2) {
      const explicitCancel = /\b(?:cancel|abort|discard|stop|forget|delete|scrap)\b/i.test(text);
      if (decision === 'CONFIRM' || !explicitCancel) {
        const draft = this.applyChoice(session.draft, session, 'personChoice', decision === 'CONFIRM' ? 0 : 1);
        return this.advance(userId, draft, session, execute, text, correlationId);
      }
    }

    if (decision === 'CANCEL') {
      return this.handleConfirmation(userId, { type: 'CONFIRMATION', decision, rawText: text }, correlationId);
    }

    if (session?.stage === 'COLLECTING') {
      return this.reask(userId, session, text, 'I still need one more detail before I can record this.');
    }

    return this.handleConfirmation(userId, { type: 'CONFIRMATION', decision, rawText: text }, correlationId);
  }

  /**
   * Handle confirmation decisions ("yes", "confirm", "proceed", "cancel")
   */
  private static async handleConfirmation(
    userId: string,
    intent: Extract<VoiceParsedResult, { type: 'CONFIRMATION' }>,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    // If user says "cancel" / "no"
    if (intent.decision === 'CANCEL') {
      await this.deletePendingSession(userId);
      return {
        intent,
        spokenResponse: 'Transaction cancelled. No changes have been made to your ledger.',
        displayTitle: 'Transaction Cancelled',
        data: { status: 'CANCELLED' },
        executed: false,
        conversation: { stage: 'IDLE' },
      };
    }

    // Atomically claim pending session to prevent race conditions & double postings
    const session = await this.takePendingSession(userId);

    // If user says "yes" / "confirm" but no pending session exists
    if (!session) {
      return {
        intent,
        spokenResponse: 'There is no pending transaction to confirm. You can state a new financial transaction or balance query.',
        displayTitle: 'No Pending Transaction',
        data: { status: 'NO_PENDING_SESSION' },
        executed: false,
        conversation: { stage: 'IDLE' },
      };
    }

    // Still collecting details — nothing to post yet
    if (session.stage === 'COLLECTING') {
      await this.setPendingSession(userId, session);
      return this.reask(userId, session, intent.rawText, 'I still need one more detail before I can record this.');
    }

    // Check session expiry (5 minutes)
    if (this.isExpired(session) || !session.intent) {
      return {
        intent,
        spokenResponse: 'The pending transaction preview has expired. Please state your transaction again.',
        displayTitle: 'Preview Expired',
        data: { status: 'EXPIRED' },
        executed: false,
        conversation: { stage: 'IDLE' },
      };
    }

    let entry;
    try {
      entry = await this.postEntry(userId, session);
    } catch (err: any) {
      return {
        intent,
        spokenResponse: `I couldn't post that entry: ${err?.message || 'unexpected error'}. Nothing was recorded — please say the transaction again.`,
        displayTitle: 'Posting Failed',
        data: { status: 'POST_FAILED', error: err?.message },
        executed: false,
        conversation: { stage: 'IDLE' },
      };
    }

    const posted = session.intent;
    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'TRANSACTION_EXECUTED',
      rawTranscript: intent.rawText,
      intentType: 'TRANSACTION',
      actionOrTarget: posted.action,
      amount: posted.amount,
      details: { voucherId: entry.id, voucherType: entry.voucherType },
    });

    const debitAccountName = session.debitAccountName ?? session.plan?.debit.name ?? '';
    const creditAccountName = session.creditAccountName ?? session.plan?.credit.name ?? '';
    const spoken = `Confirmed! Successfully recorded ${this.fmtSpoken(posted.amount)} ${posted.voucherType.toLowerCase()} voucher. Debited ${debitAccountName} and credited ${creditAccountName}.`;

    return {
      intent: posted,
      spokenResponse: spoken,
      displayTitle: `${posted.voucherType} Voucher Posted`,
      data: {
        voucherId: entry.id,
        voucherType: entry.voucherType,
        narration: entry.narration,
        amount: posted.amount,
        formattedAmount: this.fmt(posted.amount),
        debitAccount: debitAccountName,
        creditAccount: creditAccountName,
        date: entry.date,
      },
      executed: true,
      voucher: entry,
      conversation: { stage: 'IDLE' },
    };
  }

  // ─── Follow-up answers ───────────────────────────────────────────────────

  /**
   * Interpret a reply while an entry is being built. Returns the updated draft,
   * or null when the reply is something else (a question, a new transaction, gibberish).
   */
  private static async interpretReply(userId: string, text: string, session: PendingSession): Promise<TransactionDraft | null> {
    const draft = session.draft!;
    const generic = VoiceParser.parse(text);
    // A bare "cash" or "bank account" is an answer here, not a balance query
    const asksSomething =
      VoiceParser.isQuestion(text) || /\b(?:balance|how\s+much|kitna|show|tell|report|worth|total|statement)\b/i.test(text);
    if (generic.type === 'QUERY' && asksSomething) return null;
    const genericDetails = generic.type === 'TRANSACTION' ? generic.details : generic.type === 'DETAILS' ? generic.details : undefined;
    if (genericDetails && VoiceDialogue.isFreshCommand(genericDetails, draft)) return null;

    const awaiting = session.stage === 'COLLECTING' ? session.awaiting : undefined;

    // Choice questions: pick one of the offered options ("the second one", "HDFC", "Rahul Sharma")
    if (awaiting && CHOICE_FIELDS.includes(awaiting) && session.prompt) {
      let idx = VoiceDialogue.matchOption(text, session.prompt.options);
      if (idx < 0 && awaiting === 'counterpartyKind') {
        if (/\b(?:person|contact|someone|somebody|human|name|friend|relative)\b/i.test(text)) idx = 0;
        else if (/\b(?:expense|spent|spend|purpose|category|item|thing|things|income|source|bought|purchase)\b/i.test(text)) idx = 1;
      }
      return idx >= 0 ? this.applyChoice(draft, session, awaiting, idx) : null;
    }

    const reply = VoiceParser.parseFollowUp(text, awaiting ?? 'any', draft.flow);
    const update: TransactionDetails = { ...reply.details };

    switch (awaiting) {
      case 'flow':
        if (!update.flow && session.prompt) {
          const idx = VoiceDialogue.matchOption(text, session.prompt.options);
          if (idx >= 0) update.flow = VoiceParser.parseFollowUp(session.prompt.options[idx], 'flow').details.flow;
        }
        break;

      case 'paymentMode':
        if (!update.paymentMode && session.prompt) {
          const idx = VoiceDialogue.matchOption(text, session.prompt.options);
          if (idx === 0) update.paymentMode = 'CASH';
          if (idx === 1) update.paymentMode = 'BANK';
        }
        break;

      case 'person':
        if (!update.personName && reply.bareAnswer) {
          update.personName = VoiceParser.sanitizePersonName(reply.bareAnswer) ?? undefined;
        }
        break;

      case 'counterparty':
        if (!update.personName && !update.categoryName && reply.bareAnswer) {
          const kind = await this.classifyCounterparty(userId, reply.bareAnswer, reply.bareHint, draft.flow);
          if (kind === 'person') update.personName = VoiceParser.sanitizePersonName(reply.bareAnswer) ?? titleCase(reply.bareAnswer);
          else if (kind === 'category') update.categoryName = titleCase(reply.bareAnswer);
          else return { ...VoiceDialogue.merge(draft, update), pendingCounterparty: reply.bareAnswer };
        }
        break;

      case 'date':
        if (!update.date && /\b(?:today|aaj|now)\b/i.test(text)) {
          const next = { ...draft };
          delete next.date;
          return next;
        }
        break;
    }

    // A reply to a payment question that names a person and a purpose keeps both;
    // an amount of 0 ("zero") is not an answer
    if (update.amount === 0) delete update.amount;
    const hasNews = Object.values(update).some((v) => v !== undefined);
    return hasNews ? VoiceDialogue.merge(draft, update) : null;
  }

  /**
   * Apply the option the user picked for a choice question
   */
  private static applyChoice(draft: TransactionDraft, session: PendingSession, field: ClarificationField, idx: number): TransactionDraft {
    const choice = session.prompt?.choices?.[idx];
    switch (field) {
      case 'personChoice':
        if (!choice) return { ...draft, chosenPerson: { name: draft.personName ?? 'Contact', isNew: true } };
        return {
          ...draft,
          personName: choice.name,
          chosenPerson: {
            accountId: choice.id.startsWith('person:') ? undefined : choice.id,
            personId: choice.personId,
            name: choice.name,
          },
        };
      case 'bankChoice':
        return choice ? { ...draft, chosenBankAccount: { id: choice.id, name: choice.name } } : draft;
      case 'cashChoice':
        return choice ? { ...draft, chosenCashAccount: { id: choice.id, name: choice.name } } : draft;
      case 'counterpartyKind': {
        const word = draft.pendingCounterparty ?? '';
        const next = { ...draft };
        delete next.pendingCounterparty;
        if (idx === 0) next.personName = VoiceParser.sanitizePersonName(word) ?? titleCase(word);
        else next.categoryName = VoiceParser.canonicalCategory(word, draft.flow === 'IN' ? 'INCOME' : 'EXPENSE')?.name ?? titleCase(word);
        return next;
      }
      default:
        return draft;
    }
  }

  /**
   * Decide whether a free-form answer like "Rahul" or "repairs" is a person or a purpose
   */
  private static async classifyCounterparty(
    userId: string,
    answer: string,
    hint: 'person' | 'category' | undefined,
    flow: TransactionDraft['flow']
  ): Promise<'person' | 'category' | 'unknown'> {
    if (hint) return hint;

    const contacts = await VoiceAccountResolver.matchPeople(userId, answer);
    if (contacts.how === 'exact' || contacts.how === 'word') return 'person';

    const type = flow === 'IN' ? 'INCOME' : 'EXPENSE';
    const category = await VoiceAccountResolver.resolveCategory(userId, answer, type);
    if (category.status === 'resolved' && category.ref.kind === 'existing') return 'category';

    if (!VoiceParser.sanitizePersonName(answer)) return 'category';
    // Money received usually comes from people; for payments a single unknown word could be either
    if (flow === 'IN') return 'person';
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(answer.trim())) return 'person';
    return 'unknown';
  }

  // ─── Building the entry ──────────────────────────────────────────────────

  /**
   * Ask for the next missing detail, or preview / post the entry when nothing is missing
   */
  private static async advance(
    userId: string,
    draft: TransactionDraft,
    base: PendingSession | null,
    execute: boolean,
    text: string,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    const sourceText = [base?.sourceText, text].filter(Boolean).join(' | ').slice(-600);

    if (draft.pendingCounterparty) {
      return this.ask(userId, 'counterpartyKind', draft, base, text, sourceText);
    }

    const field = VoiceDialogue.nextMissingField(draft);
    if (field) return this.ask(userId, field, draft, base, text, sourceText);

    const amountCheck = FinancialGuardrails.validateAmount(draft.amount);
    if (!amountCheck.passed) {
      const withoutAmount = { ...draft };
      delete withoutAmount.amount;
      return this.ask(userId, 'amount', withoutAmount, base, text, sourceText, { prefix: amountCheck.reason });
    }

    const planned = await this.planEntry(userId, draft, sourceText);
    if (planned.status === 'ambiguous') {
      return this.ask(userId, planned.field, draft, base, text, sourceText, { ambiguity: planned });
    }

    return this.previewOrPost(userId, draft, planned.plan, amountCheck, execute, text, sourceText, base, correlationId);
  }

  /**
   * Work out which ledger accounts the entry debits and credits (read-only)
   */
  private static async planEntry(
    userId: string,
    draft: TransactionDraft,
    sourceText: string
  ): Promise<{ status: 'ok'; plan: EntryPlan } | Extract<AccountResolution, { status: 'ambiguous' }>> {
    const action = VoiceParser.actionFor(draft)!;

    let person: AccountRef | undefined;
    if (['RECEIVE_FROM_PERSON', 'GIVE_TO_PERSON', 'PERSON_BOUGHT', 'USER_BOUGHT'].includes(action)) {
      const r = await VoiceAccountResolver.resolvePerson(userId, draft.personName!, draft.chosenPerson);
      if (r.status === 'ambiguous') return r;
      person = r.ref;
    }

    const cashSide = () => VoiceAccountResolver.resolveFund(userId, 'CASH', undefined, draft.chosenCashAccount);
    const bankSide = () => VoiceAccountResolver.resolveFund(userId, 'BANK', draft.bankHint, draft.chosenBankAccount);
    const modeSide = () => (draft.paymentMode === 'BANK' ? bankSide() : cashSide());

    const ok = (debit: AccountRef, credit: AccountRef, names: EntryPlan['names']) => ({
      status: 'ok' as const,
      plan: { action, debit, credit, names },
    });

    switch (action) {
      case 'WITHDRAWAL':
      case 'DEPOSIT': {
        const bank = await bankSide();
        if (bank.status === 'ambiguous') return bank;
        const cash = await cashSide();
        if (cash.status === 'ambiguous') return cash;
        return action === 'WITHDRAWAL'
          ? ok(cash.ref, bank.ref, { fund: bank.ref.name })
          : ok(bank.ref, cash.ref, { fund: bank.ref.name });
      }
      case 'RECEIVE_FROM_PERSON':
      case 'GIVE_TO_PERSON': {
        const fund = await modeSide();
        if (fund.status === 'ambiguous') return fund;
        return action === 'RECEIVE_FROM_PERSON'
          ? ok(fund.ref, person!, { fund: fund.ref.name, person: person!.name })
          : ok(person!, fund.ref, { fund: fund.ref.name, person: person!.name });
      }
      case 'PERSON_BOUGHT': {
        const income = await VoiceAccountResolver.resolveCategory(userId, 'Sales Revenue', 'INCOME');
        if (income.status === 'ambiguous') return income;
        return ok(person!, income.ref, { person: person!.name, category: income.ref.name });
      }
      case 'USER_BOUGHT': {
        const expense = await VoiceAccountResolver.resolveCategory(userId, draft.categoryName ?? 'Purchases', 'EXPENSE', sourceText);
        if (expense.status === 'ambiguous') return expense;
        return ok(expense.ref, person!, { person: person!.name, category: expense.ref.name });
      }
      case 'DIRECT_PAYMENT': {
        const fund = await modeSide();
        if (fund.status === 'ambiguous') return fund;
        const expense = await VoiceAccountResolver.resolveCategory(userId, draft.categoryName ?? 'General Expense', 'EXPENSE', sourceText);
        if (expense.status === 'ambiguous') return expense;
        return ok(expense.ref, fund.ref, { fund: fund.ref.name, category: expense.ref.name });
      }
      case 'DIRECT_INCOME': {
        const fund = await modeSide();
        if (fund.status === 'ambiguous') return fund;
        const income = await VoiceAccountResolver.resolveCategory(userId, draft.categoryName ?? 'General Income', 'INCOME', sourceText);
        if (income.status === 'ambiguous') return income;
        return ok(fund.ref, income.ref, { fund: fund.ref.name, category: income.ref.name });
      }
    }
  }

  /**
   * Show the double-entry preview (two-step confirmation) or post directly when execute=true
   */
  private static async previewOrPost(
    userId: string,
    draft: TransactionDraft,
    plan: EntryPlan,
    amountCheck: FinancialGuardrailResult,
    execute: boolean,
    text: string,
    sourceText: string,
    base: PendingSession | null,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    const { action } = plan;
    const amount = draft.amount!;
    const voucherType = VoiceParser.voucherTypeFor(action);
    const debitAccountName = plan.debit.name;
    const creditAccountName = plan.credit.name;
    const narration = VoiceParser.describeTransaction(action, draft, plan.names);

    const intent: VoiceTransactionIntent = {
      type: 'TRANSACTION',
      action,
      voucherType,
      amount,
      personName: plan.names.person ?? draft.personName,
      categoryName: draft.categoryName,
      paymentMode: draft.paymentMode ?? (action === 'WITHDRAWAL' ? 'BANK' : 'CASH'),
      narration,
      rawText: text,
      details: this.detailsOf(draft),
    };

    // 5. DIRECT EXECUTION (Posting atomically)
    if (execute) {
      const entry = await this.postEntry(userId, { userId, intent, plan, draft, createdAt: Date.now() });
      await this.deletePendingSession(userId);

      VoiceTelemetry.logEvent({
        correlationId,
        userId,
        timestamp: new Date().toISOString(),
        eventType: 'TRANSACTION_EXECUTED',
        rawTranscript: text,
        intentType: 'TRANSACTION',
        actionOrTarget: action,
        amount,
        details: { voucherId: entry.id, voucherType: entry.voucherType },
      });

      return {
        intent,
        spokenResponse: `Successfully recorded ${this.fmtSpoken(amount)} ${voucherType.toLowerCase()} voucher. Debited ${debitAccountName} and credited ${creditAccountName}.`,
        displayTitle: `${voucherType} Voucher Posted`,
        data: {
          voucherId: entry.id,
          voucherType: entry.voucherType,
          narration: entry.narration,
          amount,
          formattedAmount: this.fmt(amount),
          debitAccount: debitAccountName,
          creditAccount: creditAccountName,
          date: entry.date,
        },
        executed: true,
        voucher: entry,
        conversation: { stage: 'IDLE' },
      };
    }

    // 4. PREVIEW / TWO-STEP RECONFIRMATION WORKFLOW
    const newAccounts = [plan.debit, plan.credit]
      .map((ref) => VoiceAccountResolver.newAccountLabel(ref))
      .filter((n): n is { name: string; kind: string } => n !== null);

    const preview: Record<string, unknown> = {
      isPreview: true,
      voucherType,
      debitAccount: debitAccountName,
      creditAccount: creditAccountName,
      amount,
      formattedAmount: this.fmt(amount),
      narration,
      warning: amountCheck.warning,
      date: draft.date ?? localDate(),
      isBackdated: !!draft.date,
      newAccounts,
      draft: VoiceDialogue.summarize(draft),
    };

    const now = Date.now();
    await this.setPendingSession(userId, {
      stage: 'AWAITING_CONFIRMATION',
      userId,
      draft,
      intent,
      plan,
      preview,
      debitAccountName,
      creditAccountName,
      sourceText,
      attempts: 0,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    });

    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'CONFIRMATION_REQUESTED',
      rawTranscript: text,
      intentType: 'TRANSACTION',
      actionOrTarget: action,
      amount,
    });

    let spoken = `I'm ready to record ${this.fmtSpoken(amount)} ${voucherType.toLowerCase()} voucher: Debiting ${debitAccountName} and Crediting ${creditAccountName}`;
    if (draft.date) spoken += `, dated ${humanDate(draft.date)}`;
    spoken += '.';
    if (newAccounts.length > 0) {
      spoken += ` ${newAccounts.map((a) => `${a.name} will be added as a new ${a.kind}`).join(', and ')}.`;
    }
    spoken += ' Shall I confirm and post this?';

    return {
      intent,
      spokenResponse: spoken,
      displayTitle: `Preview: ${voucherType} Voucher`,
      data: preview,
      executed: false,
      needsConfirmation: true,
      confirmToken: `conf_${now}_${Math.random().toString(36).slice(2, 6)}`,
      conversation: { stage: 'AWAITING_CONFIRMATION', preview },
    };
  }

  /**
   * Create any new accounts and post the balanced journal entry
   */
  private static async postEntry(userId: string, session: PendingSession) {
    const intent = session.intent!;
    let lines: JournalLineInput[];

    if (session.plan) {
      const debitId = await VoiceAccountResolver.materialize(userId, session.plan.debit);
      const creditId = await VoiceAccountResolver.materialize(userId, session.plan.credit);
      lines = [
        { accountId: debitId, debitAmount: intent.amount, creditAmount: 0 },
        { accountId: creditId, debitAmount: 0, creditAmount: intent.amount },
      ];
    } else {
      lines = session.lines ?? [];
    }

    // Double-entry mathematical balance verification
    if (!FinancialGuardrails.verifyDoubleEntryBalance(lines)) {
      throw new Error('Transaction debit and credit lines do not balance');
    }

    return JournalEntryModel.create(userId, {
      date: session.draft?.date ?? localDate(),
      narration: intent.narration,
      voucherType: intent.voucherType,
      source: 'VOICE',
      lines,
    });
  }

  // ─── Asking questions ────────────────────────────────────────────────────

  private static async ask(
    userId: string,
    field: ClarificationField,
    draft: TransactionDraft,
    base: PendingSession | null,
    text: string,
    sourceText: string,
    opts?: { prefix?: string; ambiguity?: Extract<AccountResolution, { status: 'ambiguous' }> }
  ): Promise<VoiceProcessResult> {
    const contacts =
      field === 'counterparty' || field === 'person' ? await VoiceAccountResolver.recentContacts(userId).catch(() => []) : [];
    const prompt = VoiceDialogue.prompt(field, draft, {
      choices: opts?.ambiguity?.choices,
      spokenName: opts?.ambiguity?.spokenName ?? draft.personName,
      fuzzy: opts?.ambiguity?.fuzzy,
      contacts,
    });

    const sameQuestion = base?.stage === 'COLLECTING' && base.awaiting === field;
    const attempts = sameQuestion ? (base?.attempts ?? 0) + 1 : 0;
    if (attempts >= MAX_ATTEMPTS) return this.giveUp(userId, text);

    const now = Date.now();
    await this.setPendingSession(userId, {
      stage: 'COLLECTING',
      userId,
      draft,
      awaiting: field,
      prompt,
      attempts,
      sourceText,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    });

    VoiceTelemetry.logEvent({
      correlationId: VoiceTelemetry.createCorrelationId(),
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'CLARIFICATION_REQUESTED',
      rawTranscript: text,
      intentType: 'CLARIFICATION',
      actionOrTarget: field,
      amount: draft.amount,
    });

    return this.clarificationResponse(prompt, draft, text, opts?.prefix);
  }

  private static clarificationResponse(
    prompt: ClarificationPrompt,
    draft: TransactionDraft,
    text: string,
    prefix?: string
  ): VoiceProcessResult {
    const summary = VoiceDialogue.summarize(draft);
    const clarification: VoiceClarification = {
      field: prompt.field,
      question: prompt.question,
      options: prompt.options,
      draft: summary,
    };
    return {
      intent: { type: 'CLARIFICATION', field: prompt.field, draft: summary, rawText: text },
      spokenResponse: [prefix, prompt.question].filter(Boolean).join(' '),
      displayTitle: CLARIFICATION_TITLES[prompt.field],
      data: { needsClarification: true, ...clarification },
      executed: false,
      needsClarification: true,
      clarification,
      conversation: { stage: 'COLLECTING', clarification },
    };
  }

  /**
   * Repeat the pending question (or the confirmation prompt) after an unclear reply
   */
  private static async reask(userId: string, session: PendingSession, text: string, prefix: string): Promise<VoiceProcessResult> {
    if (session.stage === 'COLLECTING' && session.prompt && session.draft) {
      const attempts = (session.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) return this.giveUp(userId, text);
      await this.setPendingSession(userId, { ...session, attempts, updatedAt: Date.now() });
      return this.clarificationResponse(session.prompt, session.draft, text, prefix);
    }

    await this.setPendingSession(userId, { ...session, updatedAt: Date.now() });
    return {
      intent: session.intent ?? { type: 'UNKNOWN', rawText: text, reason: 'Awaiting confirmation' },
      spokenResponse: `${prefix} Say yes to post the entry, cancel to discard it, or tell me what to change.`,
      displayTitle: 'Waiting for Confirmation',
      data: session.preview,
      executed: false,
      needsConfirmation: !!session.preview,
      conversation: { stage: 'AWAITING_CONFIRMATION', preview: session.preview },
    };
  }

  /**
   * The user asked to change part of the entry without saying the new value
   */
  private static async askCorrection(
    userId: string,
    session: PendingSession,
    target: 'amount' | 'counterparty' | 'paymentMode' | 'date' | 'any',
    text: string
  ): Promise<VoiceProcessResult> {
    const draft = session.draft!;
    const isContra = draft.flow === 'WITHDRAWAL' || draft.flow === 'DEPOSIT';
    const source = session.sourceText ?? text;

    if (target === 'amount') {
      const next = { ...draft };
      delete next.amount;
      return this.ask(userId, 'amount', next, session, text, source, { prefix: 'Sure.' });
    }
    if (target === 'counterparty' && !isContra) {
      const next = { ...draft };
      delete next.personName;
      delete next.chosenPerson;
      if (draft.flow === 'CREDIT_SALE' || draft.flow === 'CREDIT_PURCHASE') return this.ask(userId, 'person', next, session, text, source, { prefix: 'Sure.' });
      delete next.categoryName;
      return this.ask(userId, 'counterparty', next, session, text, source, { prefix: 'Sure.' });
    }
    if (target === 'paymentMode' && (draft.flow === 'OUT' || draft.flow === 'IN')) {
      const next = { ...draft };
      delete next.paymentMode;
      delete next.bankHint;
      delete next.chosenBankAccount;
      delete next.chosenCashAccount;
      return this.ask(userId, 'paymentMode', next, session, text, source, { prefix: 'Sure.' });
    }
    if (target === 'date') {
      return this.ask(userId, 'date', draft, session, text, source, { prefix: 'Sure.' });
    }

    if (session.stage === 'COLLECTING') return this.reask(userId, session, text, 'No problem.');
    await this.setPendingSession(userId, { ...session, updatedAt: Date.now() });
    return {
      intent: session.intent ?? { type: 'UNKNOWN', rawText: text, reason: 'Correction requested' },
      spokenResponse: 'No problem — what should I change? Tell me the correct amount, person, category, payment mode or date, or say cancel to discard it.',
      displayTitle: 'What Should I Change?',
      data: session.preview,
      executed: false,
      needsConfirmation: !!session.preview,
      conversation: { stage: 'AWAITING_CONFIRMATION', preview: session.preview },
    };
  }

  private static async giveUp(userId: string, text: string): Promise<VoiceProcessResult> {
    await this.deletePendingSession(userId);
    return {
      intent: { type: 'UNKNOWN', rawText: text, reason: 'Too many unclear answers' },
      spokenResponse:
        "I'm having trouble with that entry, so I've discarded it. Please say the whole transaction in one sentence, for example: 'Paid 500 for lunch in cash'.",
      displayTitle: 'Entry Discarded',
      data: { status: 'ABANDONED', suggestions: DEFAULT_SUGGESTIONS },
      executed: false,
      conversation: { stage: 'IDLE' },
    };
  }

  /**
   * A query answered mid-entry keeps the entry alive and reminds the user where we were
   */
  private static async withReminder(userId: string, res: VoiceProcessResult, session: PendingSession): Promise<VoiceProcessResult> {
    await this.setPendingSession(userId, { ...session, updatedAt: Date.now() });

    if (session.stage === 'COLLECTING' && session.prompt && session.draft) {
      const clarification: VoiceClarification = {
        field: session.prompt.field,
        question: session.prompt.question,
        options: session.prompt.options,
        draft: VoiceDialogue.summarize(session.draft),
      };
      return {
        ...res,
        spokenResponse: `${res.spokenResponse} Now, back to your entry: ${session.prompt.question}`,
        needsClarification: true,
        clarification,
        conversation: { stage: 'COLLECTING', clarification },
      };
    }

    const amount = session.intent?.amount;
    return {
      ...res,
      spokenResponse: `${res.spokenResponse} Your ${amount !== undefined ? `${this.fmtSpoken(amount)} ` : ''}entry is still waiting — say yes to post it or cancel to discard it.`,
      conversation: { stage: 'AWAITING_CONFIRMATION', preview: session.preview },
    };
  }

  private static llmContext(session: PendingSession | null): LLMConversationContext | undefined {
    if (!session?.draft) return undefined;
    return {
      stage: session.stage ?? 'AWAITING_CONFIRMATION',
      draftSummary: VoiceDialogue.describe(session.draft),
      lastQuestion: session.stage === 'COLLECTING' ? session.prompt?.question : 'Shall I confirm and post this entry?',
      awaiting: session.stage === 'COLLECTING' ? session.awaiting : undefined,
    };
  }

  private static detailsFromIntent(intent: VoiceTransactionIntent): TransactionDetails {
    return {
      flow: VoiceParser.flowForAction(intent.action),
      amount: intent.amount || undefined,
      personName: intent.personName,
      categoryName: intent.categoryName,
      paymentMode: intent.paymentMode,
    };
  }

  private static detailsOf(draft: TransactionDraft): TransactionDetails {
    const { flow, amount, personName, categoryName, paymentMode, bankHint, date, narration } = draft;
    return { flow, amount, personName, categoryName, paymentMode, bankHint, date, narration };
  }

  private static unknownResponse(parsed: VoiceParsedResult, isLLMPowered: boolean): VoiceProcessResult {
    const reason = parsed.type === 'UNKNOWN' ? parsed.reason : undefined;
    // The model's chat reply answers questions and greetings; anything else gets the usual guidance
    const conversational =
      VoiceParser.isQuestion(parsed.rawText) ||
      /^\s*(?:hi|hello|hey|namaste|namaskar|thanks|thank\s+you|good\s+(?:morning|afternoon|evening)|help)\b/i.test(parsed.rawText) ||
      /^(?:explain|define|what's|tell\s+me)\b/i.test(parsed.rawText.trim());
    const isConversationalAI = isLLMPowered && !!reason && conversational;
    return {
      intent: parsed,
      spokenResponse: isConversationalAI
        ? reason!
        : "I'm not sure I understood that financial request. You can say things like: 'What is my bank balance?', 'I withdrew 5000 from Bank', 'I took 2000 from John', or 'Paid 450 for groceries using Cash'.",
      displayTitle: isConversationalAI ? 'VoiceTally Assistant' : 'Query Not Understood',
      data: {
        answer: isConversationalAI ? reason : undefined,
        suggestions: isConversationalAI ? undefined : DEFAULT_SUGGESTIONS,
      },
      executed: false,
      conversation: { stage: 'IDLE' },
    };
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /**
   * Handle read-only queries (Balances, Net Worth, Profit & Loss)
   */
  private static async handleQuery(
    userId: string,
    intent: VoiceQueryIntent,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'QUERY_EXECUTED',
      rawTranscript: intent.rawText,
      intentType: 'QUERY',
      actionOrTarget: intent.target,
    });

    switch (intent.target) {
      case 'BANK_BALANCE':
      case 'CASH_BALANCE': {
        const isBank = intent.target === 'BANK_BALANCE';
        const funds = await VoiceAccountResolver.fundAccounts(userId);
        let accounts = isBank ? funds.bank : funds.cash;
        if (isBank && intent.accountHint) {
          const hinted = accounts.filter((a) => a.name.toLowerCase().includes(intent.accountHint!.toLowerCase()));
          if (hinted.length > 0) accounts = hinted;
        }
        const balance = sumBalances(accounts);
        const label = accounts.length === 1 ? accounts[0].name : isBank ? 'Bank' : 'Cash';
        const breakdown = accounts.map((a) => ({
          name: a.name,
          balance: parseFloat(a.cachedBalance.toString()),
          formattedBalance: this.fmt(a.cachedBalance),
        }));

        let spoken = `Your ${label} balance is ${this.fmtSpoken(balance)}.`;
        if (accounts.length > 1) {
          spoken = `Your total ${isBank ? 'bank' : 'cash'} balance is ${this.fmtSpoken(balance)}: ${breakdown
            .map((b) => `${b.name} has ${this.fmtSpoken(b.balance)}`)
            .join(', ')}.`;
        }

        return {
          intent,
          spokenResponse: spoken,
          displayTitle: isBank ? 'Bank Balance' : 'Cash in Hand',
          data: {
            account: label,
            type: 'ASSET',
            balance,
            formattedBalance: this.fmt(balance),
            accounts: breakdown,
          },
          executed: true,
        };
      }

      case 'CASH_AND_BANK': {
        const { cash, bank } = await VoiceAccountResolver.fundAccounts(userId);
        const cashTotal = sumBalances(cash);
        const bankTotal = sumBalances(bank);
        const total = cashTotal + bankTotal;
        return {
          intent,
          spokenResponse: `You have ${this.fmtSpoken(cashTotal)} in cash and ${this.fmtSpoken(bankTotal)} in the bank — ${this.fmtSpoken(total)} in total.`,
          displayTitle: 'Cash & Bank Balance',
          data: {
            account: 'Cash & Bank',
            balance: total,
            formattedBalance: this.fmt(total),
            cash: cashTotal,
            formattedCash: this.fmt(cashTotal),
            bank: bankTotal,
            formattedBank: this.fmt(bankTotal),
          },
          executed: true,
        };
      }

      case 'NET_WORTH':
      case 'TOTAL_ASSETS':
      case 'TOTAL_LIABILITIES': {
        const bs = await ReportsModel.getBalanceSheet(userId, new Date());
        const totalAssets = parseFloat(bs.assets.totalAssets.toString());
        const totalLiabilities = parseFloat(bs.liabilities.totalLiabilities.toString());
        const netWorth = totalAssets - totalLiabilities;

        let spoken = `Your current Net Worth is ${this.fmtSpoken(netWorth)}. Total Assets stand at ${this.fmtSpoken(totalAssets)} with ${this.fmtSpoken(totalLiabilities)} in Liabilities.`;
        if (intent.target === 'TOTAL_ASSETS') {
          spoken = `Your Total Assets are currently ${this.fmtSpoken(totalAssets)}.`;
        } else if (intent.target === 'TOTAL_LIABILITIES') {
          spoken = `Your Total Liabilities are currently ${this.fmtSpoken(totalLiabilities)}.`;
        }

        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Net Worth & Financial Position',
          data: {
            netWorth,
            formattedNetWorth: this.fmt(netWorth),
            totalAssets,
            formattedTotalAssets: this.fmt(totalAssets),
            totalLiabilities,
            formattedTotalLiabilities: this.fmt(totalLiabilities),
            asOfDate: localDate(),
          },
          executed: true,
        };
      }

      case 'PERSON_BALANCE': {
        const name = intent.personName || 'Contact';
        const { how, people } = await VoiceAccountResolver.matchPeople(userId, name);
        const matched = how === 'exact' || how === 'word' ? people.filter((p) => p.accounts.length > 0) : [];

        if (matched.length === 0) {
          const suggestion = how === 'near' && people[0] ? ` Did you mean ${people[0].name}?` : '';
          return {
            intent,
            spokenResponse: `No contact found for ${name}.${suggestion} You can add ${name} or record a transaction to create their account.`,
            displayTitle: `Balance for ${name}`,
            data: { person: name, balance: 0, status: 'NOT_FOUND' },
            executed: true,
          };
        }

        const describe = (personName: string, balance: number) =>
          balance > 0
            ? { spoken: `${personName} owes you ${this.fmtSpoken(balance)} as a Sundry Debtor.`, role: 'Debtor (Owes You)' }
            : balance < 0
              ? { spoken: `You owe ${personName} ${this.fmtSpoken(Math.abs(balance))} as a Sundry Creditor.`, role: 'Creditor (You Owe)' }
              : { spoken: `${personName}'s account is fully settled with zero balance.`, role: 'Settled (₹0)' };

        if (matched.length > 1) {
          const rows = matched.map((p) => {
            const balance = sumBalances(p.accounts);
            return { person: p.name, balance, formattedBalance: this.fmt(balance), ...describe(p.name, balance) };
          });
          return {
            intent,
            spokenResponse: `I found ${rows.length} contacts named ${name}. ${rows.map((r) => r.spoken).join(' ')}`,
            displayTitle: `Balances for ${name}`,
            data: { person: name, matches: rows.map(({ spoken: _s, ...r }) => r) },
            executed: true,
          };
        }

        const person = matched[0];
        const balance = sumBalances(person.accounts);
        const { spoken, role } = describe(person.name, balance);
        return {
          intent,
          spokenResponse: spoken,
          displayTitle: `${person.name} — Balance`,
          data: {
            person: person.name,
            phone: person.phone,
            role,
            balance,
            formattedBalance: this.fmt(balance),
          },
          executed: true,
        };
      }

      case 'TOTAL_EXPENSES':
      case 'EXPENSE_CATEGORY': {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const pnl = await ReportsModel.getProfitAndLoss(userId, start, end);

        if (intent.target === 'EXPENSE_CATEGORY' && intent.categoryName) {
          const category = intent.categoryName;
          const keywords = VoiceParser.categoryKeywords(category, 'EXPENSE');
          const matches = pnl.expenseAccounts.filter((item: any) => {
            const accountName = item.accountName.toLowerCase();
            return (
              accountName.includes(category.toLowerCase()) ||
              keywords.some((k) => new RegExp(`\\b${VoiceParser.escapeRegExp(k)}`).test(accountName))
            );
          });
          const amt = matches.reduce((s: number, m: any) => s + parseFloat(m.amount.toString()), 0);
          const spoken =
            matches.length > 0
              ? `You have spent ${this.fmtSpoken(amt)} on ${matches.map((m: any) => m.accountName).join(' and ')} this month.`
              : `You have not recorded any ${category} expenses this month.`;

          return {
            intent,
            spokenResponse: spoken,
            displayTitle: `${category} Expenses (This Month)`,
            data: { category, amount: amt, formattedAmount: this.fmt(amt), items: matches },
            executed: true,
          };
        }

        const totalExpense = parseFloat(pnl.totalExpense.toString());
        const spoken = `Your total expenses for this month are ${this.fmtSpoken(totalExpense)}.`;
        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Monthly Expenses',
          data: {
            totalExpense,
            formattedTotalExpense: this.fmt(totalExpense),
            items: pnl.expenseAccounts,
          },
          executed: true,
        };
      }

      case 'TOTAL_INCOME': {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const pnl = await ReportsModel.getProfitAndLoss(userId, start, end);
        const totalRevenue = parseFloat(pnl.totalIncome.toString());
        const netProfit = parseFloat(pnl.netProfit.toString());

        const spoken = `Your total income this month is ${this.fmtSpoken(totalRevenue)}, resulting in a Net Profit of ${this.fmtSpoken(netProfit)}.`;
        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Monthly Revenue & Profit',
          data: {
            totalRevenue,
            formattedTotalRevenue: this.fmt(totalRevenue),
            netProfit,
            formattedNetProfit: this.fmt(netProfit),
            items: pnl.incomeAccounts,
          },
          executed: true,
        };
      }

      case 'RECENT_TRANSACTIONS': {
        const { entries } = await JournalEntryModel.list(userId, { pageSize: 5 });
        if (entries.length === 0) {
          return {
            intent,
            spokenResponse: 'You have no recent transactions recorded yet.',
            displayTitle: 'Recent Transactions',
            data: { entries: [] },
            executed: true,
          };
        }

        const first = entries[0];
        const totalLinesAmount = first.lines.reduce(
          (s: number, l: any) => s + parseFloat(l.debitAmount.toString()),
          0
        );
        const spoken = `You have ${entries.length} recent entries. The latest was "${first.narration}" for ${this.fmtSpoken(totalLinesAmount)} on ${new Date(first.date).toLocaleDateString('en-IN')}.`;

        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Recent Transactions',
          data: { entries },
          executed: true,
        };
      }

      default:
        return {
          intent,
          spokenResponse: "I can't answer that question yet. Try asking about your bank or cash balance, expenses, income, net worth, or a contact's balance.",
          displayTitle: 'Query Not Supported',
          data: { suggestions: DEFAULT_SUGGESTIONS },
          executed: false,
        };
    }
  }
}
