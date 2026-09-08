import { prisma } from '../../../core/database/prisma.js';
import { redis } from '../../../core/redis/client.js';
import { VoiceParser, type VoiceParsedResult, type VoiceTransactionIntent } from './VoiceParser.js';
import { LLMFunctionCallingService } from './LLMFunctionCallingService.js';
import { JournalEntryModel, type JournalLineInput } from '../../ledger/models/JournalEntryModel.js';
import { AccountModel } from '../../ledger/models/AccountModel.js';
import { PersonModel } from '../../ledger/models/PersonModel.js';
import { ReportsModel } from '../../ledger/models/ReportsModel.js';
import { PromptGuard } from '../security/PromptGuard.js';
import { FinancialGuardrails } from '../security/FinancialGuardrails.js';
import { VoiceTelemetry } from '../observability/VoiceTelemetry.js';
import { Decimal } from '@prisma/client/runtime/library';

export interface VoiceProcessResult {
  intent: VoiceParsedResult;
  spokenResponse: string;
  displayTitle: string;
  data?: any;
  executed: boolean;
  needsConfirmation?: boolean;
  confirmToken?: string;
  voucher?: any;
  latencyMs?: number;
}

interface PendingSession {
  userId: string;
  intent: VoiceTransactionIntent;
  lines: JournalLineInput[];
  debitAccountName: string;
  creditAccountName: string;
  createdAt: number;
}

export class VoiceAgentService {
  // Local cache for fallback / test environments
  private static pendingSessions = new Map<string, PendingSession>();

  /**
   * Distributed pending session storage with Redis + memory fallback (5-minute TTL)
   */
  public static async getPendingSession(userId: string): Promise<PendingSession | null> {
    try {
      const raw = await redis.get(`voice:pending:${userId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Redis unavailable or errored — fallback to memory
    }
    return this.pendingSessions.get(userId) || null;
  }

  public static async setPendingSession(userId: string, session: PendingSession): Promise<void> {
    this.pendingSessions.set(userId, session);
    try {
      await redis.set(`voice:pending:${userId}`, JSON.stringify(session), 'EX', 300);
    } catch {
      // Non-fatal, local fallback is active
    }
  }

  public static async deletePendingSession(userId: string): Promise<void> {
    this.pendingSessions.delete(userId);
    try {
      await redis.del(`voice:pending:${userId}`);
    } catch {
      // Non-fatal
    }
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
    try {
      const raw = await redis.eval(
        "local val = redis.call('get', KEYS[1]); if val then redis.call('del', KEYS[1]) end; return val;",
        1,
        `voice:pending:${userId}`
      ) as string | null;

      if (raw) {
        redisSession = JSON.parse(raw);
      }
    } catch {
      // Fallback to local memory session
    }

    return inMemorySession || redisSession || null;
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
   * Ensure standard Cash / Bank accounts exist for the user
   */
  private static async getOrCreateCashBankAccount(userId: string, name: 'Cash' | 'Bank'): Promise<string> {
    const existing = await prisma.account.findUnique({
      where: { userId_name: { userId, name } },
    });
    if (existing) return existing.id;

    const created = await AccountModel.create(userId, {
      name,
      type: 'ASSET',
      subtype: 'CASH_BANK',
      cashFlowCategory: 'OPERATING',
    });
    return created.id;
  }

  /**
   * Ensure person and their linked PERSON account exist
   */
  private static async getOrCreatePersonAccount(
    userId: string,
    personName: string
  ): Promise<{ personId: string; accountId: string; name: string }> {
    const cleanName = FinancialGuardrails.sanitizeAccountName(personName);
    const existingPeople = await PersonModel.findByName(userId, cleanName);

    if (existingPeople.length > 0 && existingPeople[0].accounts.length > 0) {
      return {
        personId: existingPeople[0].id,
        accountId: existingPeople[0].accounts[0].id,
        name: existingPeople[0].name,
      };
    }

    // Check if account with that name exists
    const existingAccount = await prisma.account.findUnique({
      where: { userId_name: { userId, name: cleanName } },
    });
    if (existingAccount) {
      return {
        personId: existingAccount.personId || '',
        accountId: existingAccount.id,
        name: existingAccount.name,
      };
    }

    // Create new person + account atomically
    const created = await PersonModel.create(userId, {
      name: cleanName,
      label: 'Voice Contact',
    });

    return {
      personId: created.id,
      accountId: created.accounts[0].id,
      name: created.name,
    };
  }

  /**
   * Ensure an Expense or Income account exists
   */
  private static async getOrCreateCategoryAccount(
    userId: string,
    name: string,
    type: 'EXPENSE' | 'INCOME'
  ): Promise<string> {
    const cleanName = FinancialGuardrails.sanitizeAccountName(name);
    const existing = await prisma.account.findUnique({
      where: { userId_name: { userId, name: cleanName } },
    });
    if (existing) return existing.id;

    const created = await AccountModel.create(userId, {
      name: cleanName,
      type,
      subtype: type === 'EXPENSE' ? 'EXPENSE_CATEGORY' : 'INCOME_CATEGORY',
      cashFlowCategory: 'OPERATING',
    });
    return created.id;
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
    // 2. LLM INTENT PARSING & FUNCTION CALLING DISPATCH
    // ─────────────────────────────────────────────────────────────────────────
    const textToProcess = guardCheck.sanitizedText || transcript;
    const { parsed, llmMeta } = await LLMFunctionCallingService.interpret(
      userId,
      textToProcess
    );

    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'INTENT_PARSED',
      rawTranscript: transcript,
      intentType: parsed.type,
      actionOrTarget: parsed.type === 'TRANSACTION' ? parsed.action : parsed.type === 'QUERY' ? parsed.target : undefined,
      amount: parsed.type === 'TRANSACTION' ? parsed.amount : undefined,
      details: { llmMeta },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. ROUTE TO INTENT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    // 3A. Conversational Confirmation Handler ("yes" / "confirm" / "cancel")
    if (parsed.type === 'CONFIRMATION') {
      const res = await this.handleConfirmation(userId, parsed, correlationId);
      res.latencyMs = Date.now() - startTime;
      return res;
    }

    // 3B. Read-Only Query Handler
    if (parsed.type === 'QUERY') {
      const res = await this.handleQuery(userId, parsed, correlationId);
      res.latencyMs = Date.now() - startTime;
      return res;
    }

    // 3C. Transaction Handler (Double-entry voucher preview or execution)
    if (parsed.type === 'TRANSACTION') {
      const res = await this.handleTransaction(userId, parsed, execute, correlationId);
      res.latencyMs = Date.now() - startTime;
      return res;
    }

    // 3D. Unknown / Conversational Utterance Handler
    const latencyMs = Date.now() - startTime;
    const isConversationalAI = llmMeta?.isLLMPowered && parsed.reason;
    const spokenResponse = isConversationalAI
      ? parsed.reason!
      : "I'm not sure I understood that financial request. You can say things like: 'What is my bank balance?', 'I withdrew 5000 from Bank', 'I took 2000 from John', or 'Paid 450 for groceries using Cash'.";

    const displayTitle = isConversationalAI ? 'VoiceTally Assistant' : 'Query Not Understood';

    return {
      intent: parsed,
      spokenResponse,
      displayTitle,
      data: {
        answer: isConversationalAI ? parsed.reason : undefined,
        suggestions: isConversationalAI
          ? undefined
          : [
              'What is my bank balance?',
              'What is my net worth?',
              'I made a withdrawal of 5000 from bank',
              'Took 2000 from John in cash',
              'Paid 450 for groceries from Cash',
            ],
      },
      executed: false,
      latencyMs,
    };
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
      };
    }

    // Check session expiry (5 minutes)
    if (Date.now() - session.createdAt > 5 * 60 * 1000) {
      return {
        intent,
        spokenResponse: 'The pending transaction preview has expired. Please state your transaction again.',
        displayTitle: 'Preview Expired',
        data: { status: 'EXPIRED' },
        executed: false,
      };
    }

    // Post pending transaction
    const entry = await JournalEntryModel.create(userId, {
      date: new Date(),
      narration: session.intent.narration,
      voucherType: session.intent.voucherType,
      source: 'VOICE',
      lines: session.lines,
    });

    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'TRANSACTION_EXECUTED',
      rawTranscript: intent.rawText,
      intentType: 'TRANSACTION',
      actionOrTarget: session.intent.action,
      amount: session.intent.amount,
      details: { voucherId: entry.id, voucherType: entry.voucherType },
    });

    const spoken = `Confirmed! Successfully recorded ${this.fmtSpoken(session.intent.amount)} ${session.intent.voucherType.toLowerCase()} voucher. Debited ${session.debitAccountName} and credited ${session.creditAccountName}.`;

    return {
      intent: session.intent,
      spokenResponse: spoken,
      displayTitle: `${session.intent.voucherType} Voucher Posted`,
      data: {
        voucherId: entry.id,
        voucherType: entry.voucherType,
        narration: entry.narration,
        amount: session.intent.amount,
        formattedAmount: this.fmt(session.intent.amount),
        debitAccount: session.debitAccountName,
        creditAccount: session.creditAccountName,
        date: entry.date,
      },
      executed: true,
      voucher: entry,
    };
  }

  /**
   * Handle read-only queries (Balances, Net Worth, Profit & Loss)
   */
  private static async handleQuery(
    userId: string,
    intent: Extract<VoiceParsedResult, { type: 'QUERY' }>,
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
      case 'BANK_BALANCE': {
        const bank = await prisma.account.findUnique({
          where: { userId_name: { userId, name: 'Bank' } },
        });
        const balance = bank ? parseFloat(bank.cachedBalance.toString()) : 0;
        const spoken = `Your Bank balance is ${this.fmtSpoken(balance)}.`;
        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Bank Balance',
          data: {
            account: 'Bank',
            type: 'ASSET',
            balance,
            formattedBalance: this.fmt(balance),
          },
          executed: true,
        };
      }

      case 'CASH_BALANCE': {
        const cash = await prisma.account.findUnique({
          where: { userId_name: { userId, name: 'Cash' } },
        });
        const balance = cash ? parseFloat(cash.cachedBalance.toString()) : 0;
        const spoken = `Your Cash balance is ${this.fmtSpoken(balance)}.`;
        return {
          intent,
          spokenResponse: spoken,
          displayTitle: 'Cash in Hand',
          data: {
            account: 'Cash',
            type: 'ASSET',
            balance,
            formattedBalance: this.fmt(balance),
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
            asOfDate: new Date().toISOString().split('T')[0],
          },
          executed: true,
        };
      }

      case 'PERSON_BALANCE': {
        const name = intent.personName || 'Contact';
        const people = await PersonModel.findByName(userId, name);

        if (people.length === 0 || people[0].accounts.length === 0) {
          return {
            intent,
            spokenResponse: `No contact found for ${name}. You can add ${name} or record a transaction to create their account.`,
            displayTitle: `Balance for ${name}`,
            data: { person: name, balance: 0, status: 'NOT_FOUND' },
            executed: true,
          };
        }

        const person = people[0];
        const account = person.accounts[0];
        const balance = parseFloat(account.cachedBalance.toString());

        let spoken = '';
        let role = '';

        if (balance > 0) {
          spoken = `${person.name} owes you ${this.fmtSpoken(balance)} as a Sundry Debtor.`;
          role = 'Debtor (Owes You)';
        } else if (balance < 0) {
          spoken = `You owe ${person.name} ${this.fmtSpoken(Math.abs(balance))} as a Sundry Creditor.`;
          role = 'Creditor (You Owe)';
        } else {
          spoken = `${person.name}'s account is fully settled with zero balance.`;
          role = 'Settled (₹0)';
        }

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
          const match = pnl.expenseAccounts.find((item: any) =>
            item.accountName.toLowerCase().includes(intent.categoryName!.toLowerCase())
          );
          const amt = match ? parseFloat(match.amount.toString()) : 0;
          const spoken = match
            ? `You have spent ${this.fmtSpoken(amt)} on ${match.accountName} this month.`
            : `You have not recorded any ${intent.categoryName} expenses this month.`;

          return {
            intent,
            spokenResponse: spoken,
            displayTitle: `${intent.categoryName} Expenses (This Month)`,
            data: { category: intent.categoryName, amount: amt, formattedAmount: this.fmt(amt) },
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
    }
  }

  /**
   * Handle transaction mutations (With Financial Guardrails & 2-Step Confirmation)
   */
  private static async handleTransaction(
    userId: string,
    intent: Extract<VoiceParsedResult, { type: 'TRANSACTION' }>,
    execute: boolean,
    correlationId: string
  ): Promise<VoiceProcessResult> {
    // 1. Validate Amount against Financial Guardrails
    const guardrailCheck = FinancialGuardrails.validateAmount(intent.amount);
    if (!guardrailCheck.passed) {
      return {
        intent,
        spokenResponse: guardrailCheck.reason || 'Please specify a valid positive amount for this transaction.',
        displayTitle: 'Invalid Transaction Amount',
        data: { error: guardrailCheck.reason },
        executed: false,
      };
    }

    const lines: JournalLineInput[] = [];
    let debitAccountName = '';
    let creditAccountName = '';

    // 2. Build double-entry lines based on intent action
    switch (intent.action) {
      case 'WITHDRAWAL': {
        const cashId = await this.getOrCreateCashBankAccount(userId, 'Cash');
        const bankId = await this.getOrCreateCashBankAccount(userId, 'Bank');
        debitAccountName = 'Cash';
        creditAccountName = 'Bank';

        lines.push(
          { accountId: cashId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: bankId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'DEPOSIT': {
        const bankId = await this.getOrCreateCashBankAccount(userId, 'Bank');
        const cashId = await this.getOrCreateCashBankAccount(userId, 'Cash');
        debitAccountName = 'Bank';
        creditAccountName = 'Cash';

        lines.push(
          { accountId: bankId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: cashId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'RECEIVE_FROM_PERSON': {
        const cashOrBank = intent.paymentMode === 'BANK' ? 'Bank' : 'Cash';
        const fundAccountId = await this.getOrCreateCashBankAccount(userId, cashOrBank);
        const person = await this.getOrCreatePersonAccount(userId, intent.personName || 'Debtor');

        debitAccountName = cashOrBank;
        creditAccountName = person.name;

        lines.push(
          { accountId: fundAccountId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: person.accountId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'GIVE_TO_PERSON': {
        const cashOrBank = intent.paymentMode === 'BANK' ? 'Bank' : 'Cash';
        const fundAccountId = await this.getOrCreateCashBankAccount(userId, cashOrBank);
        const person = await this.getOrCreatePersonAccount(userId, intent.personName || 'Counterparty');

        debitAccountName = person.name;
        creditAccountName = cashOrBank;

        lines.push(
          { accountId: person.accountId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: fundAccountId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'PERSON_BOUGHT': {
        const person = await this.getOrCreatePersonAccount(userId, intent.personName || 'Customer');
        const incomeId = await this.getOrCreateCategoryAccount(userId, 'Sales Revenue', 'INCOME');

        debitAccountName = person.name;
        creditAccountName = 'Sales Revenue';

        lines.push(
          { accountId: person.accountId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: incomeId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'USER_BOUGHT': {
        const person = await this.getOrCreatePersonAccount(userId, intent.personName || 'Vendor');
        const expenseCategory = intent.categoryName || 'General Expense';
        const expenseId = await this.getOrCreateCategoryAccount(userId, expenseCategory, 'EXPENSE');

        debitAccountName = expenseCategory;
        creditAccountName = person.name;

        lines.push(
          { accountId: expenseId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: person.accountId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'DIRECT_PAYMENT': {
        const cashOrBank = intent.paymentMode === 'BANK' ? 'Bank' : 'Cash';
        const fundAccountId = await this.getOrCreateCashBankAccount(userId, cashOrBank);
        const expenseCategory = intent.categoryName || 'General Expense';
        const expenseId = await this.getOrCreateCategoryAccount(userId, expenseCategory, 'EXPENSE');

        debitAccountName = expenseCategory;
        creditAccountName = cashOrBank;

        lines.push(
          { accountId: expenseId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: fundAccountId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }

      case 'DIRECT_INCOME': {
        const cashOrBank = intent.paymentMode === 'BANK' ? 'Bank' : 'Cash';
        const fundAccountId = await this.getOrCreateCashBankAccount(userId, cashOrBank);
        const incomeCategory = intent.categoryName || 'General Income';
        const incomeId = await this.getOrCreateCategoryAccount(userId, incomeCategory, 'INCOME');

        debitAccountName = cashOrBank;
        creditAccountName = incomeCategory;

        lines.push(
          { accountId: fundAccountId, debitAmount: intent.amount, creditAmount: 0 },
          { accountId: incomeId, debitAmount: 0, creditAmount: intent.amount }
        );
        break;
      }
    }

    // 3. Double-entry mathematical balance verification
    if (!FinancialGuardrails.verifyDoubleEntryBalance(lines)) {
      return {
        intent,
        spokenResponse: 'Financial error: Transaction debit and credit lines do not balance.',
        displayTitle: 'Ledger Invariant Violation',
        data: { error: 'Debit amount must strictly equal credit amount' },
        executed: false,
      };
    }

    // 4. PREVIEW / TWO-STEP RECONFIRMATION WORKFLOW
    if (!execute) {
      // Store session in distributed cache for subsequent voice confirmation ("yes", "confirm") or button click
      await this.setPendingSession(userId, {
        userId,
        intent,
        lines,
        debitAccountName,
        creditAccountName,
        createdAt: Date.now(),
      });

      VoiceTelemetry.logEvent({
        correlationId,
        userId,
        timestamp: new Date().toISOString(),
        eventType: 'CONFIRMATION_REQUESTED',
        rawTranscript: intent.rawText,
        intentType: 'TRANSACTION',
        actionOrTarget: intent.action,
        amount: intent.amount,
      });

      const confirmToken = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const spoken = `I'm ready to record ${this.fmtSpoken(intent.amount)} ${intent.voucherType.toLowerCase()} voucher: Debiting ${debitAccountName} and Crediting ${creditAccountName}. Shall I confirm and post this?`;

      return {
        intent,
        spokenResponse: spoken,
        displayTitle: `Preview: ${intent.voucherType} Voucher`,
        data: {
          isPreview: true,
          voucherType: intent.voucherType,
          debitAccount: debitAccountName,
          creditAccount: creditAccountName,
          amount: intent.amount,
          formattedAmount: this.fmt(intent.amount),
          narration: intent.narration,
          warning: guardrailCheck.warning,
        },
        executed: false,
        needsConfirmation: true,
        confirmToken,
      };
    }

    // 5. DIRECT EXECUTION (Posting atomically)
    const entry = await JournalEntryModel.create(userId, {
      date: new Date(),
      narration: intent.narration,
      voucherType: intent.voucherType,
      source: 'VOICE',
      lines,
    });

    this.pendingSessions.delete(userId);

    VoiceTelemetry.logEvent({
      correlationId,
      userId,
      timestamp: new Date().toISOString(),
      eventType: 'TRANSACTION_EXECUTED',
      rawTranscript: intent.rawText,
      intentType: 'TRANSACTION',
      actionOrTarget: intent.action,
      amount: intent.amount,
      details: { voucherId: entry.id, voucherType: entry.voucherType },
    });

    const spoken = `Successfully recorded ${this.fmtSpoken(intent.amount)} ${intent.voucherType.toLowerCase()} voucher. Debited ${debitAccountName} and credited ${creditAccountName}.`;

    return {
      intent,
      spokenResponse: spoken,
      displayTitle: `${intent.voucherType} Voucher Posted`,
      data: {
        voucherId: entry.id,
        voucherType: entry.voucherType,
        narration: entry.narration,
        amount: intent.amount,
        formattedAmount: this.fmt(intent.amount),
        debitAccount: debitAccountName,
        creditAccount: creditAccountName,
        date: entry.date,
      },
      executed: true,
      voucher: entry,
    };
  }
}
