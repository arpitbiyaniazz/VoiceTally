import {
  VoiceParser,
  type TransactionDetails,
  type TransactionFlow,
  type VoiceParsedResult,
  type VoiceQueryIntent,
} from './VoiceParser.js';
import { VoiceDialogue } from './VoiceDialogue.js';
import { FinancialGuardrails } from '../security/FinancialGuardrails.js';

export interface LLMToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface LLMFunctionCallingResult {
  toolCall?: LLMToolCall;
  naturalReply?: string;
  isLLMPowered: boolean;
  modelUsed: string;
}

/**
 * What the voice agent is in the middle of, so the model can read short follow-up answers ("cash", "500")
 */
export interface LLMConversationContext {
  stage: 'COLLECTING' | 'AWAITING_CONFIRMATION';
  draftSummary: string;
  lastQuestion?: string;
  awaiting?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}

function tool(name: string, description: string, properties: Record<string, Record<string, unknown>>, required: string[] = []): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: 'object', properties, ...(required.length > 0 ? { required } : {}) },
  };
}

const AMOUNT = { type: 'number', description: 'Amount in rupees as a plain number, exactly as the user said it. Omit if not said.' };
const PERSON = { type: 'string', description: 'Name of the person or business, in English letters. Omit if not said.' };
const PAYMENT_MODE = {
  type: 'string',
  enum: ['CASH', 'BANK'],
  description: 'CASH for cash. BANK for bank, UPI, GPay, PhonePe, Paytm, card, cheque, NEFT/IMPS/RTGS or online transfer. Omit if not said.',
};
const BANK_ACCOUNT = { type: 'string', description: 'A specific bank the user named, e.g. HDFC or SBI. Omit if not said.' };
const DATE = { type: 'string', description: 'Transaction date as YYYY-MM-DD, only if the user said when it happened.' };
const NARRATION = { type: 'string', description: "Short description in the user's words (max 8 words)." };

export const ACCOUNTING_TOOLS: ToolDefinition[] = [
  tool(
    'record_payment',
    'Money the user paid or gave out: expenses, bills, things bought and paid for, paying, lending or repaying a person (e.g. "Paid 500 for lunch from Cash", "Gave 2000 to Rahul", "Paid 3000 for electricity bill using Bank")',
    {
      amount: AMOUNT,
      category: { type: 'string', description: 'What the money was spent on, e.g. Food & Dining, Groceries, Rent, Electricity, Travel & Fuel. Omit if not said or implied.' },
      personName: { ...PERSON, description: 'The person or business the user paid. Omit if not said.' },
      paymentMode: PAYMENT_MODE,
      bankAccount: BANK_ACCOUNT,
      date: DATE,
      narration: NARRATION,
    }
  ),
  tool(
    'record_receipt',
    'Money the user received: from a person or customer, salary, interest, refunds or other income (e.g. "Sharma paid 5000 in bank", "Received salary 60000", "Got 2000 cash from John")',
    {
      amount: AMOUNT,
      personName: { ...PERSON, description: 'The person or business who paid the user. Omit if not said.' },
      category: { type: 'string', description: 'Income source when it is not a person, e.g. Salary, Interest, Freelance Income, Refund. Omit if not said.' },
      paymentMode: PAYMENT_MODE,
      bankAccount: BANK_ACCOUNT,
      date: DATE,
      narration: NARRATION,
    }
  ),
  tool(
    'record_contra',
    'The user moved their own money between cash and bank: ATM / cash withdrawal or cash deposit (e.g. "I made the withdrawal from the bank 5000", "Deposited 8000 cash into bank")',
    {
      amount: AMOUNT,
      direction: { type: 'string', enum: ['WITHDRAWAL', 'DEPOSIT'], description: 'WITHDRAWAL (bank to cash) or DEPOSIT (cash to bank)' },
      bankAccount: BANK_ACCOUNT,
      date: DATE,
      narration: NARRATION,
    },
    ['direction']
  ),
  tool(
    'record_credit_sale',
    'Someone bought from the user on credit and now owes the user; no money received yet (e.g. "Rahul bought laptop for 45000", "Billed 12000 to Acme")',
    {
      amount: AMOUNT,
      personName: { ...PERSON, description: 'The customer who now owes the user. Omit if not said.' },
      narration: NARRATION,
      date: DATE,
    }
  ),
  tool(
    'record_credit_purchase',
    'The user bought from a supplier on credit and now owes them; no money paid yet (e.g. "Purchased 20000 inventory from Sharma on credit")',
    {
      amount: AMOUNT,
      personName: { ...PERSON, description: 'The supplier the user now owes. Omit if not said.' },
      category: { type: 'string', description: 'What was bought, e.g. Stationery, Office Supplies, Equipment. Omit if not said.' },
      narration: NARRATION,
      date: DATE,
    }
  ),
  tool(
    'query_balance',
    'Questions about current balances: bank, cash in hand, both together, or what a person owes / is owed (e.g. "how much money do i have in my bank account", "what is my bank balance", "how much cash do i have", "how much does Rahul owe me")',
    {
      target: { type: 'string', enum: ['BANK_BALANCE', 'CASH_BALANCE', 'CASH_AND_BANK', 'PERSON_BALANCE'] },
      personName: { type: 'string', description: 'Person name if querying person balance' },
      bankAccount: BANK_ACCOUNT,
    },
    ['target']
  ),
  tool(
    'query_report',
    'Questions about reports: Net Worth, Total Assets, Total Liabilities, income or Profit & Loss this month, expenses this month (in total or for one category), or Recent Transactions',
    {
      reportType: {
        type: 'string',
        enum: ['NET_WORTH', 'TOTAL_ASSETS', 'TOTAL_LIABILITIES', 'TOTAL_INCOME', 'PROFIT_LOSS', 'TOTAL_EXPENSES', 'EXPENSE_CATEGORY', 'RECENT_ENTRIES'],
      },
      category: { type: 'string', description: 'Expense category for EXPENSE_CATEGORY, e.g. Groceries' },
    },
    ['reportType']
  ),
  tool(
    'confirm_decision',
    'Confirms and posts the currently pending voucher or cancels it (e.g., "yes", "confirm", "go ahead", "cancel", "no")',
    { decision: { type: 'string', enum: ['YES', 'CANCEL'] } },
    ['decision']
  ),
  tool(
    'general_financial_assistant',
    'Greetings, help, or general accounting questions that are not a transaction or a balance / report question. Never say that anything was recorded.',
    { reply: { type: 'string', description: 'Short natural response to the user (max 2 sentences)' } },
    ['reply']
  ),
];

/** Only offered while the agent is collecting details or waiting for confirmation */
const ENTRY_DETAILS_TOOL = tool(
  'provide_entry_details',
  'The user is answering the assistant\'s follow-up question or correcting the entry being prepared (e.g. "cash", "5000", "it was from Rahul", "make it 600", "for office rent", "the HDFC one")',
  {
    amount: AMOUNT,
    personName: PERSON,
    category: { type: 'string', description: 'Expense or income category. Omit if not said.' },
    paymentMode: PAYMENT_MODE,
    bankAccount: BANK_ACCOUNT,
    date: DATE,
    direction: {
      type: 'string',
      enum: ['PAID', 'RECEIVED', 'WITHDRAWAL', 'DEPOSIT', 'CREDIT_SALE', 'CREDIT_PURCHASE'],
      description: 'Only if the user says (or changes) whether the money was paid out or received',
    },
  }
);

const DIRECTION_TO_FLOW: Record<string, TransactionFlow> = {
  PAID: 'OUT',
  RECEIVED: 'IN',
  WITHDRAWAL: 'WITHDRAWAL',
  DEPOSIT: 'DEPOSIT',
  CREDIT_SALE: 'CREDIT_SALE',
  CREDIT_PURCHASE: 'CREDIT_PURCHASE',
};

const REPORT_TARGETS: Record<string, VoiceQueryIntent['target']> = {
  NET_WORTH: 'NET_WORTH',
  TOTAL_ASSETS: 'TOTAL_ASSETS',
  TOTAL_LIABILITIES: 'TOTAL_LIABILITIES',
  TOTAL_INCOME: 'TOTAL_INCOME',
  PROFIT_LOSS: 'TOTAL_INCOME',
  TOTAL_EXPENSES: 'TOTAL_EXPENSES',
  EXPENSE_CATEGORY: 'EXPENSE_CATEGORY',
  RECENT_ENTRIES: 'RECENT_TRANSACTIONS',
  RECENT_TRANSACTIONS: 'RECENT_TRANSACTIONS',
};

const BALANCE_TARGETS = new Set(['BANK_BALANCE', 'CASH_BALANCE', 'CASH_AND_BANK', 'PERSON_BALANCE']);
const DISABLED_PROVIDERS = new Set(['none', 'off', 'local', 'disabled', 'false']);
const TIME_REFERENCE_RE =
  /\b(?:yesterday|ago|last|on|dated|kal|parso|pehle|week|month|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b|\d{1,2}(?:st|nd|rd|th)\b/i;

function localDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseAmountArg(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[₹,\s]/g, ''));
  return isFinite(num) ? num : undefined;
}

function textArg(value: unknown, max = 80): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = FinancialGuardrails.sanitizeAccountName(value.replace(/[\r\n\t]+/g, ' ')).slice(0, max).trim();
  return clean || undefined;
}

export class LLMFunctionCallingService {
  /** Provider/model keys that recently failed with quota, auth or invalid-model errors */
  private static cooldowns = new Map<string, number>();

  /**
   * Translates an incoming query through LLM function calling into a structured VoiceParsedResult.
   * The model's output is checked against what the user actually said; without a usable model the
   * deterministic parser answers on its own.
   */
  public static async interpret(
    userId: string,
    transcript: string,
    context?: LLMConversationContext
  ): Promise<{ parsed: VoiceParsedResult; llmMeta: { isLLMPowered: boolean; modelUsed: string; toolCalled?: string } }> {
    const text = transcript.trim();
    const local = VoiceParser.parse(text);

    for (const provider of this.providers()) {
      try {
        const result =
          provider.name === 'mistral'
            ? await this.callMistralToolCalling(text, provider.key, context)
            : provider.name === 'gemini'
              ? await this.callGeminiFunctionCalling(text, provider.key, context)
              : await this.callOpenAIToolCalling(text, provider.key, context);

        if (result && result.toolCall) {
          const llmParsed = this.mapToolCallToVoiceParsedResult(result.toolCall, text);
          return {
            parsed: this.reconcile(llmParsed, local, text),
            llmMeta: {
              isLLMPowered: true,
              modelUsed: result.modelUsed,
              toolCalled: result.toolCall.name,
            },
          };
        }
      } catch (err) {
        console.warn(
          `[LLMFunctionCallingService] ${provider.name} API call failed, falling back to next provider / orchestrator:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Built-in Local Function-Calling Orchestrator (Zero-dependency fallback)
    return {
      parsed: local,
      llmMeta: {
        isLLMPowered: false,
        modelUsed: 'local-deterministic-orchestrator',
      },
    };
  }

  // ─── Providers ───────────────────────────────────────────────────────────

  private static providers(): Array<{ name: 'mistral' | 'gemini' | 'openai'; key: string }> {
    const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
    if (provider && DISABLED_PROVIDERS.has(provider)) return [];

    const list: Array<{ name: 'mistral' | 'gemini' | 'openai'; key: string }> = [];
    const mistralKey = process.env.MISTRAL_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (mistralKey && (provider === 'mistral' || !provider)) list.push({ name: 'mistral', key: mistralKey });
    if (geminiKey && (provider === 'gemini' || !provider)) list.push({ name: 'gemini', key: geminiKey });
    if (openaiKey && (provider === 'openai' || !provider)) list.push({ name: 'openai', key: openaiKey });
    return list;
  }

  private static timeoutSignal(): AbortSignal {
    const ms = parseInt(process.env.LLM_TIMEOUT_MS || '', 10);
    return AbortSignal.timeout(Number.isFinite(ms) && ms > 0 ? ms : 8000);
  }

  private static isCoolingDown(key: string): boolean {
    const until = this.cooldowns.get(key);
    return until !== undefined && Date.now() < until;
  }

  /**
   * Quota (429), tier / auth (401, 403) and unknown-model errors mean this model won't work right now
   */
  private static noteUnavailable(key: string, status: number, body: string, headers?: Headers): boolean {
    const unavailable = status === 429 || status === 401 || status === 403 || status === 404 || (status === 400 && /model/i.test(body));
    if (!unavailable) return false;
    const zeroQuota = headers?.get?.('x-ratelimit-limit-req-minute') === '0';
    const burst = status === 429 && !zeroQuota;
    this.cooldowns.set(key, Date.now() + (burst ? 30_000 : 10 * 60_000));
    return true;
  }

  private static toolsFor(context?: LLMConversationContext): ToolDefinition[] {
    return context ? [ENTRY_DETAILS_TOOL, ...ACCOUNTING_TOOLS] : ACCOUNTING_TOOLS;
  }

  private static systemPrompt(context?: LLMConversationContext): string {
    const lines = [
      'You are the language-understanding engine of VoiceTally, an Indian double-entry bookkeeping app. Users speak or type in English, Hindi or Hinglish. Turn each message into exactly one tool call.',
      '',
      'Rules:',
      '1. Only fill in what the user actually said. Never guess or invent an amount, person, category, payment mode or date — leave the field out and the app will ask a follow-up question.',
      '2. Amounts: convert spoken numbers and Indian units to a plain number ("fifteen hundred" = 1500, "2.5k" = 2500, "1 lakh 20 thousand" = 120000, "dedh lakh" = 150000, "paanch hazaar" = 5000). Quantities, dates, times and phone numbers are not amounts.',
      '3. paymentMode: CASH for cash / nakad. BANK for bank, UPI, GPay, PhonePe, Paytm, card, cheque, NEFT / IMPS / RTGS, net banking or any online transfer.',
      '4. Pick the tool by the direction of money: record_payment = money went out from the user; record_receipt = money came in to the user; record_contra = the user moved their own money between cash and bank; record_credit_sale = someone now owes the user, nothing received yet; record_credit_purchase = the user now owes a supplier, nothing paid yet.',
      '5. "X paid / gave / sent / transferred N" where X is someone else means the user RECEIVED money from X. "Paid X" or "gave N to X" means the user paid X.',
      '6. Names: English letters only (transliterate Hindi, e.g. राहुल → Rahul), without honorifics such as ji, sir or bhai. Words like customer, friend, shop or landlord are not names.',
      '7. Questions about balances, dues, expenses, income, profit, net worth or recent entries use query_balance or query_report — never a record_* tool.',
      '8. Greetings, help and general accounting questions use general_financial_assistant with a short reply. Never claim that a transaction was recorded, saved or posted.',
      `9. Today is ${localDate()}. Only set date when the user says when it happened (e.g. yesterday, on the 20th).`,
    ];

    if (context) {
      lines.push(
        '',
        'Conversation state:',
        context.stage === 'COLLECTING'
          ? `The app is collecting details for this entry: ${context.draftSummary}.`
          : `The app is waiting for the user to confirm this entry: ${context.draftSummary}.`
      );
      if (context.lastQuestion) lines.push(`The assistant just asked: "${context.lastQuestion}"`);
      lines.push(
        'If the message answers that question or corrects the entry (e.g. "cash", "500", "it was Rahul", "make it 600", "change it to bank"), call provide_entry_details with only the new details. If the user says yes or no, call confirm_decision. If the user describes a different, complete transaction, use the matching record_* tool.'
      );
    }
    return lines.join('\n');
  }

  /**
   * Calls Google Gemini REST API with Function Calling declarations
   */
  private static async callGeminiFunctionCalling(
    prompt: string,
    apiKey: string,
    context?: LLMConversationContext
  ): Promise<LLMFunctionCallingResult | null> {
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: this.systemPrompt(context) }],
      },
      tools: [
        {
          functionDeclarations: this.toolsFor(context).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
        },
      },
      generationConfig: { temperature: 0 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.timeoutSignal(),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.noteUnavailable(`gemini:${model}`, res.status, errText, res.headers);
      throw new Error(`Gemini API HTTP ${res.status}: ${errText}`);
    }

    const json: any = await res.json();
    const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((p) => p?.functionCall)?.functionCall;

    if (call) {
      return {
        toolCall: {
          name: call.name,
          arguments: call.args || {},
        },
        isLLMPowered: true,
        modelUsed: model,
      };
    }

    const textPart = parts.find((p) => typeof p?.text === 'string')?.text;
    if (textPart) {
      return {
        toolCall: {
          name: 'general_financial_assistant',
          arguments: { reply: textPart },
        },
        naturalReply: textPart,
        isLLMPowered: true,
        modelUsed: model,
      };
    }

    return null;
  }

  /**
   * Calls OpenAI Chat Completions REST API with Tools
   */
  private static async callOpenAIToolCalling(
    prompt: string,
    apiKey: string,
    context?: LLMConversationContext
  ): Promise<LLMFunctionCallingResult | null> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: this.systemPrompt(context) },
          { role: 'user', content: prompt },
        ],
        tools: this.toolsFor(context).map((t) => ({ type: 'function', function: t })),
        tool_choice: 'required',
        parallel_tool_calls: false,
        temperature: 0,
      }),
      signal: this.timeoutSignal(),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.noteUnavailable(`openai:${model}`, res.status, errText, res.headers);
      throw new Error(`OpenAI API HTTP ${res.status}: ${errText}`);
    }

    return this.parseChatCompletion(await res.json(), model);
  }

  /**
   * Calls Mistral AI Chat Completions REST API with Tools. Falls through a list of models, because
   * some subscription tiers have no quota for the configured one (HTTP 429 with a 0/minute limit).
   */
  private static async callMistralToolCalling(
    prompt: string,
    apiKey: string,
    context?: LLMConversationContext
  ): Promise<LLMFunctionCallingResult | null> {
    const url = `${(process.env.MISTRAL_API_BASE_URL || 'https://api.mistral.ai/v1').replace(/\/+$/, '')}/chat/completions`;
    const primary = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const fallbacks = (process.env.MISTRAL_FALLBACK_MODELS ?? 'ministral-8b-latest')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const models = [...new Set([primary, ...fallbacks])];
    const tools = this.toolsFor(context).map((t) => ({ type: 'function', function: t }));

    let lastError: Error | null = null;
    for (const model of models) {
      const key = `mistral:${model}`;
      if (this.isCoolingDown(key)) continue;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: this.systemPrompt(context) },
            { role: 'user', content: prompt },
          ],
          tools,
          tool_choice: 'any',
          parallel_tool_calls: false,
          temperature: 0,
          max_tokens: 400,
        }),
        signal: this.timeoutSignal(),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = new Error(`Mistral API HTTP ${res.status} (${model}): ${errText}`);
        if (this.noteUnavailable(key, res.status, errText, res.headers)) continue;
        throw lastError;
      }

      return this.parseChatCompletion(await res.json(), model);
    }

    if (lastError) throw lastError;
    return null;
  }

  /**
   * OpenAI-compatible chat completion → tool call (Mistral and OpenAI share this shape)
   */
  private static parseChatCompletion(json: any, model: string): LLMFunctionCallingResult | null {
    const message = json?.choices?.[0]?.message;

    if (message?.tool_calls?.[0]?.function) {
      const fn = message.tool_calls[0].function;
      let args = {};
      try {
        args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {});
      } catch {
        // Ignore JSON parse error
      }
      return {
        toolCall: {
          name: fn.name,
          arguments: args,
        },
        isLLMPowered: true,
        modelUsed: model,
      };
    }

    if (message?.content) {
      return {
        toolCall: {
          name: 'general_financial_assistant',
          arguments: { reply: message.content },
        },
        naturalReply: message.content,
        isLLMPowered: true,
        modelUsed: model,
      };
    }

    return null;
  }

  // ─── Mapping & validation ─────────────────────────────────────────────────

  /**
   * Maps LLM Tool Call into structured VoiceParsedResult for deterministic ledger posting
   */
  private static mapToolCallToVoiceParsedResult(toolCall: LLMToolCall, rawText: string): VoiceParsedResult {
    const args = toolCall.arguments || {};
    const common = (): TransactionDetails => ({
      amount: parseAmountArg(args.amount),
      personName: textArg(args.personName, 60),
      categoryName: textArg(args.category, 60),
      paymentMode: args.paymentMode === 'BANK' ? 'BANK' : args.paymentMode === 'CASH' ? 'CASH' : undefined,
      bankHint: textArg(args.bankAccount, 30),
      date: typeof args.date === 'string' ? args.date : undefined,
      narration: textArg(args.narration, 60),
    });

    switch (toolCall.name) {
      case 'record_payment':
        return this.detailsToParsed({ ...common(), flow: 'OUT' }, rawText);

      case 'record_receipt':
        return this.detailsToParsed({ ...common(), flow: 'IN' }, rawText);

      case 'record_contra': {
        const { amount, bankHint, date, narration } = common();
        return this.detailsToParsed({ flow: args.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL', amount, bankHint, date, narration }, rawText);
      }

      case 'record_credit_sale': {
        const { amount, personName, date, narration } = common();
        return this.detailsToParsed({ flow: 'CREDIT_SALE', amount, personName, date, narration }, rawText);
      }

      case 'record_credit_purchase': {
        const { amount, personName, categoryName, date, narration } = common();
        return this.detailsToParsed({ flow: 'CREDIT_PURCHASE', amount, personName, categoryName, date, narration }, rawText);
      }

      case 'provide_entry_details': {
        const details = common();
        const flow = typeof args.direction === 'string' ? DIRECTION_TO_FLOW[args.direction] : undefined;
        return { type: 'DETAILS', details: flow ? { ...details, flow } : details, rawText };
      }

      case 'query_balance': {
        const target = typeof args.target === 'string' && BALANCE_TARGETS.has(args.target) ? (args.target as VoiceQueryIntent['target']) : undefined;
        if (!target) return { type: 'UNKNOWN', rawText, reason: 'Unsupported balance query' };
        return {
          type: 'QUERY',
          target,
          personName: textArg(args.personName, 60),
          accountHint: textArg(args.bankAccount, 30),
          rawText,
        };
      }

      case 'query_report': {
        const target = typeof args.reportType === 'string' ? REPORT_TARGETS[args.reportType] : undefined;
        if (!target) return { type: 'UNKNOWN', rawText, reason: 'Unsupported report query' };
        return { type: 'QUERY', target, categoryName: textArg(args.category, 60), rawText };
      }

      case 'confirm_decision':
        return {
          type: 'CONFIRMATION',
          decision: args.decision === 'CANCEL' || args.decision === 'NO' ? 'CANCEL' : 'CONFIRM',
          rawText,
        };

      case 'general_financial_assistant':
      default:
        return {
          type: 'UNKNOWN',
          rawText,
          reason: this.sanitizeReply(args.reply),
        };
    }
  }

  private static detailsToParsed(details: TransactionDetails, rawText: string): VoiceParsedResult {
    if (!details.flow) return { type: 'DETAILS', details, rawText };
    const action = VoiceParser.actionFor(details)!;
    return {
      type: 'TRANSACTION',
      action,
      voucherType: VoiceParser.voucherTypeFor(action),
      amount: details.amount ?? 0,
      personName: details.personName,
      categoryName: details.categoryName,
      paymentMode: details.paymentMode ?? (details.flow === 'WITHDRAWAL' ? 'BANK' : 'CASH'),
      narration: VoiceParser.describeTransaction(action, details),
      rawText,
      details,
    };
  }

  /**
   * Combine the model's reading with the deterministic parser: the parser is exact on yes / no,
   * questions and the patterns it knows; the model covers the long tail. Anything the model
   * "heard" that is not in the transcript is dropped, so the agent asks instead of guessing.
   */
  private static reconcile(llm: VoiceParsedResult, local: VoiceParsedResult, text: string): VoiceParsedResult {
    if (local.type === 'CONFIRMATION') return local;
    if (llm.type === 'UNKNOWN' && local.type !== 'UNKNOWN') return local;
    if ((llm.type === 'TRANSACTION' || llm.type === 'DETAILS') && local.type === 'QUERY') return local;
    if (llm.type === 'TRANSACTION' && VoiceParser.isQuestion(text) && local.type !== 'TRANSACTION') return local;

    if (llm.type === 'QUERY' && llm.target === 'PERSON_BALANCE') {
      const name = llm.personName ? VoiceParser.sanitizePersonName(llm.personName) : null;
      if (!name || !this.isMentioned(name, text)) return local.type === 'QUERY' ? local : { type: 'UNKNOWN', rawText: text, reason: 'Which contact do you want the balance for?' };
      return { ...llm, personName: name };
    }

    if (llm.type === 'TRANSACTION' || llm.type === 'DETAILS') {
      const localDetails = local.type === 'TRANSACTION' || local.type === 'DETAILS' ? local.details : undefined;
      const details = this.validateDetails(llm.details ?? {}, localDetails, text);
      return llm.type === 'DETAILS' ? { type: 'DETAILS', details, rawText: text } : this.detailsToParsed(details, text);
    }

    return llm;
  }

  private static validateDetails(llm: TransactionDetails, local: TransactionDetails | undefined, text: string): TransactionDetails {
    const out: TransactionDetails = {};

    // Direction: what the user stated outright beats the model ("Sharma paid 5000" is money in); a direction
    // the model guessed with nothing in the sentence to support it ("Rahul 5000") is dropped so the agent asks
    const explicit = VoiceParser.explicitFlow(text);
    if (explicit) out.flow = explicit;
    else if (llm.flow && (local?.flow || VoiceParser.hasDirectionCue(text))) out.flow = llm.flow;
    else out.flow = local?.flow;

    // Amount: digits are parsed exactly by the parser; spoken numbers are left to the model.
    // An amount the user never said is dropped.
    const hasDigits = /\d/.test(text);
    if (hasDigits && local?.amount !== undefined) out.amount = local.amount;
    else if (llm.amount !== undefined && VoiceParser.hasNumberContent(text)) out.amount = llm.amount;
    else if (local?.amount !== undefined) out.amount = local.amount;

    // Person: must be a real name that the user actually said
    const llmPerson = llm.personName ? VoiceParser.sanitizePersonName(llm.personName) : null;
    if (llmPerson && this.isMentioned(llmPerson, text)) out.personName = llmPerson;
    else if (local?.personName) out.personName = local.personName;

    // Category: the parser's canonical names keep the ledger consistent; placeholders are dropped
    const type = out.flow === 'IN' ? 'INCOME' : 'EXPENSE';
    if (local?.categoryName) out.categoryName = local.categoryName;
    else if (llm.categoryName && !VoiceParser.isGenericCategory(llm.categoryName) && out.flow !== 'WITHDRAWAL' && out.flow !== 'DEPOSIT') {
      out.categoryName = VoiceParser.canonicalCategory(llm.categoryName, type)?.name ?? llm.categoryName.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Payment mode: only what the user said (Hindi transcripts are romanised before this check)
    const detected = VoiceParser.detectPaymentMode(text);
    if (detected) {
      out.paymentMode = detected.mode;
      out.bankHint = detected.bankHint ?? (detected.mode === 'BANK' ? llm.bankHint : undefined);
    }

    // Date: the parser's reading, or a past date from the model when the user referred to a time
    const today = localDate();
    if (local?.date) out.date = local.date;
    else if (llm.date && /^\d{4}-\d{2}-\d{2}$/.test(llm.date) && llm.date < today && TIME_REFERENCE_RE.test(text)) out.date = llm.date;

    if (llm.narration) out.narration = llm.narration;

    for (const key of Object.keys(out) as Array<keyof TransactionDetails>) {
      if (out[key] === undefined) delete out[key];
    }
    return out;
  }

  /**
   * Did the user actually say (part of) this name? Allows small spelling differences.
   */
  private static isMentioned(name: string, text: string): boolean {
    const saidWords = VoiceParser.normalize(text).toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return name
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token.length >= 3 && (saidWords.includes(token) || saidWords.some((w) => VoiceDialogue.isNearMatch(w, token))));
  }

  /**
   * Keep chit-chat replies short and never let them claim that something was posted
   */
  private static sanitizeReply(reply: unknown): string {
    // Replies are rendered as HTML by the bot simulator, so markup is stripped
    const text = typeof reply === 'string' ? reply.replace(/<[^>]*>?/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    if (!text) return 'General financial guidance provided.';
    if (
      /\b(?:recorded|posted|saved|added|logged|entered|booked)\b/i.test(text) &&
      /\b(?:transaction|entry|voucher|payment|expense|receipt|income)\b/i.test(text)
    ) {
      return 'I can help you record that. Tell me the amount, who it was with or what it was for, and whether it was cash or bank.';
    }
    return text;
  }
}
