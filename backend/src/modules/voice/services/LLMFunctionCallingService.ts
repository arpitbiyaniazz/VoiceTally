import { VoiceParsedResult, VoiceParser } from './VoiceParser.js';

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

export const ACCOUNTING_TOOLS = [
  {
    name: 'record_payment',
    description: 'Records an expense or payment from Cash or Bank (e.g., "Paid 500 for lunch from Cash", "Paid 3000 for electricity bill using Bank")',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The numeric transaction amount' },
        category: { type: 'string', description: 'Expense category name, e.g. Food & Dining, Rent, Utilities, Groceries' },
        paymentMode: { type: 'string', enum: ['CASH', 'BANK'], description: 'Payment source account (CASH or BANK)' },
        narration: { type: 'string', description: 'Brief description of the transaction' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'record_receipt',
    description: 'Records incoming money or customer payment into Cash or Bank (e.g., "Sharma paid 5000 in bank", "Received 2000 cash from John")',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The numeric transaction amount' },
        personName: { type: 'string', description: 'Name of the customer or person who paid' },
        paymentMode: { type: 'string', enum: ['CASH', 'BANK'], description: 'Destination fund account (CASH or BANK)' },
        narration: { type: 'string', description: 'Brief description of the receipt' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'record_contra',
    description: 'Transfers money between Cash and Bank accounts (e.g., "I made the withdrawal from the bank 5000", "Deposited 8000 cash into bank")',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The numeric amount transferred' },
        direction: { type: 'string', enum: ['WITHDRAWAL', 'DEPOSIT'], description: 'WITHDRAWAL (Bank to Cash) or DEPOSIT (Cash to Bank)' },
        narration: { type: 'string', description: 'Narration note' },
      },
      required: ['amount', 'direction'],
    },
  },
  {
    name: 'record_credit_sale',
    description: 'Records a credit sale where customer buys on credit / owes money (e.g., "Rahul bought laptop for 45000", "Billed 12000 to Acme")',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The numeric amount' },
        personName: { type: 'string', description: 'Name of the debtor/customer' },
        narration: { type: 'string', description: 'Description of items sold or service provided' },
      },
      required: ['amount', 'personName'],
    },
  },
  {
    name: 'record_credit_purchase',
    description: 'Records an item bought from supplier on credit (e.g., "Purchased 20000 inventory from Sharma on credit")',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The numeric amount' },
        personName: { type: 'string', description: 'Name of the creditor/supplier' },
        category: { type: 'string', description: 'Expense or asset category' },
        narration: { type: 'string', description: 'Description of purchase' },
      },
      required: ['amount', 'personName'],
    },
  },
  {
    name: 'query_balance',
    description: 'Queries live financial balances for Bank, Cash in hand, or a specific person/contact (e.g. "how much money do i have in my bank account", "what is my bank balance", "how much cash do i have", "how much does Rahul owe me")',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['BANK_BALANCE', 'CASH_BALANCE', 'PERSON_BALANCE'] },
        personName: { type: 'string', description: 'Person name if querying person balance' },
      },
      required: ['target'],
    },
  },
  {
    name: 'query_report',
    description: 'Queries financial reports such as Net Worth, Total Assets, Total Liabilities, Profit & Loss, or Recent Transactions',
    parameters: {
      type: 'object',
      properties: {
        reportType: {
          type: 'string',
          enum: ['NET_WORTH', 'TOTAL_ASSETS', 'TOTAL_LIABILITIES', 'PROFIT_LOSS', 'RECENT_ENTRIES'],
        },
      },
      required: ['reportType'],
    },
  },
  {
    name: 'confirm_decision',
    description: 'Confirms and posts the currently pending voucher or cancels it (e.g., "yes", "confirm", "proceed", "cancel", "no")',
    parameters: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['YES', 'CANCEL'] },
      },
      required: ['decision'],
    },
  },
  {
    name: 'general_financial_assistant',
    description: 'Answers accounting and general finance questions, greetings, or explanations with natural dialogue',
    parameters: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Natural response to the user' },
      },
      required: ['reply'],
    },
  },
];

export class LLMFunctionCallingService {
  /**
   * Translates an incoming query through LLM function calling into a structured VoiceParsedResult.
   */
  public static async interpret(
    userId: string,
    transcript: string
  ): Promise<{ parsed: VoiceParsedResult; llmMeta: { isLLMPowered: boolean; modelUsed: string; toolCalled?: string } }> {
    const text = transcript.trim();
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    const mistralKey = process.env.MISTRAL_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // 1. If Mistral AI is requested or configured
    if ((provider === 'mistral' || (!provider && mistralKey)) && mistralKey) {
      try {
        const mistralResult = await this.callMistralToolCalling(text, mistralKey);
        if (mistralResult && mistralResult.toolCall) {
          const parsed = this.mapToolCallToVoiceParsedResult(mistralResult.toolCall, text);
          return {
            parsed,
            llmMeta: {
              isLLMPowered: true,
              modelUsed: mistralResult.modelUsed,
              toolCalled: mistralResult.toolCall.name,
            },
          };
        }
      } catch (err) {
        console.warn('[LLMFunctionCallingService] Mistral API call failed, falling back to next provider / orchestrator:', err);
      }
    }

    // 2. If Gemini API key is configured
    if ((provider === 'gemini' || (!provider && geminiKey)) && geminiKey) {
      try {
        const geminiResult = await this.callGeminiFunctionCalling(text, geminiKey);
        if (geminiResult && geminiResult.toolCall) {
          const parsed = this.mapToolCallToVoiceParsedResult(geminiResult.toolCall, text);
          return {
            parsed,
            llmMeta: {
              isLLMPowered: true,
              modelUsed: geminiResult.modelUsed,
              toolCalled: geminiResult.toolCall.name,
            },
          };
        }
      } catch (err) {
        console.warn('[LLMFunctionCallingService] Gemini API call failed, falling back to next provider / orchestrator:', err);
      }
    }

    // 3. If OpenAI API key is configured
    if ((provider === 'openai' || (!provider && openaiKey)) && openaiKey) {
      try {
        const openaiResult = await this.callOpenAIToolCalling(text, openaiKey);
        if (openaiResult && openaiResult.toolCall) {
          const parsed = this.mapToolCallToVoiceParsedResult(openaiResult.toolCall, text);
          return {
            parsed,
            llmMeta: {
              isLLMPowered: true,
              modelUsed: openaiResult.modelUsed,
              toolCalled: openaiResult.toolCall.name,
            },
          };
        }
      } catch (err) {
        console.warn('[LLMFunctionCallingService] OpenAI API call failed, falling back to local orchestrator:', err);
      }
    }

    // 4. Built-in Local LLM Function-Calling Orchestrator (Zero-dependency fallback)
    const localParsed = VoiceParser.parse(text);
    return {
      parsed: localParsed,
      llmMeta: {
        isLLMPowered: false,
        modelUsed: 'local-deterministic-orchestrator',
      },
    };
  }

  /**
   * Calls Google Gemini REST API with Function Calling declarations
   */
  private static async callGeminiFunctionCalling(
    prompt: string,
    apiKey: string
  ): Promise<LLMFunctionCallingResult | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const toolsDeclaration = [
      {
        functionDeclarations: ACCOUNTING_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: 'You are VoiceTally AI, an expert double-entry accounting assistant. Your job is to classify financial requests and call the appropriate accounting tool with exact parameters.',
          },
        ],
      },
      tools: toolsDeclaration,
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API HTTP ${res.status}: ${errText}`);
    }

    const json: any = await res.json();
    const candidate = json.candidates?.[0]?.content?.parts?.[0];

    if (candidate?.functionCall) {
      return {
        toolCall: {
          name: candidate.functionCall.name,
          arguments: candidate.functionCall.args || {},
        },
        isLLMPowered: true,
        modelUsed: 'gemini-1.5-flash',
      };
    }

    if (candidate?.text) {
      return {
        toolCall: {
          name: 'general_financial_assistant',
          arguments: { reply: candidate.text },
        },
        naturalReply: candidate.text,
        isLLMPowered: true,
        modelUsed: 'gemini-1.5-flash',
      };
    }

    return null;
  }

  /**
   * Calls OpenAI Chat Completions REST API with Tools
   */
  private static async callOpenAIToolCalling(
    prompt: string,
    apiKey: string
  ): Promise<LLMFunctionCallingResult | null> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const tools = ACCOUNTING_TOOLS.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are VoiceTally AI, an expert double-entry accounting assistant. Classify financial commands into appropriate tool calls.',
        },
        { role: 'user', content: prompt },
      ],
      tools,
      tool_choice: 'auto',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API HTTP ${res.status}: ${errText}`);
    }

    const json: any = await res.json();
    const message = json.choices?.[0]?.message;

    if (message?.tool_calls?.[0]?.function) {
      const fn = message.tool_calls[0].function;
      let args = {};
      try {
        args = JSON.parse(fn.arguments);
      } catch {
        // Ignore
      }
      return {
        toolCall: {
          name: fn.name,
          arguments: args,
        },
        isLLMPowered: true,
        modelUsed: 'gpt-4o-mini',
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
        modelUsed: 'gpt-4o-mini',
      };
    }

    return null;
  }

  /**
   * Calls Mistral AI Chat Completions REST API with Tools
   */
  private static async callMistralToolCalling(
    prompt: string,
    apiKey: string
  ): Promise<LLMFunctionCallingResult | null> {
    const url = 'https://api.mistral.ai/v1/chat/completions';
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';

    const tools = ACCOUNTING_TOOLS.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are VoiceTally AI, an expert double-entry accounting assistant. Classify financial commands into appropriate tool calls.',
        },
        { role: 'user', content: prompt },
      ],
      tools,
      tool_choice: 'auto',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mistral API HTTP ${res.status}: ${errText}`);
    }

    const json: any = await res.json();
    const message = json.choices?.[0]?.message;

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

  /**
   * Maps LLM Tool Call into structured VoiceParsedResult for deterministic ledger posting
   */
  private static mapToolCallToVoiceParsedResult(
    toolCall: LLMToolCall,
    rawText: string
  ): VoiceParsedResult {
    const args = toolCall.arguments || {};

    switch (toolCall.name) {
      case 'record_payment':
        return {
          type: 'TRANSACTION',
          action: 'DIRECT_PAYMENT',
          voucherType: 'PAYMENT',
          amount: parseFloat(args.amount) || 0,
          categoryName: args.category || 'General Expense',
          paymentMode: args.paymentMode === 'BANK' ? 'BANK' : 'CASH',
          narration: args.narration || `Paid for ${args.category || 'General Expense'} via ${args.paymentMode || 'CASH'}`,
          rawText,
        };

      case 'record_receipt':
        return {
          type: 'TRANSACTION',
          action: 'RECEIVE_FROM_PERSON',
          voucherType: 'RECEIPT',
          amount: parseFloat(args.amount) || 0,
          personName: args.personName || 'Debtor',
          paymentMode: args.paymentMode === 'BANK' ? 'BANK' : 'CASH',
          narration: args.narration || `Received money from ${args.personName || 'Debtor'} in ${args.paymentMode || 'CASH'}`,
          rawText,
        };

      case 'record_contra':
        return {
          type: 'TRANSACTION',
          action: args.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL',
          voucherType: 'CONTRA',
          amount: parseFloat(args.amount) || 0,
          paymentMode: args.direction === 'DEPOSIT' ? 'CASH' : 'BANK',
          narration: args.narration || (args.direction === 'DEPOSIT' ? 'Cash deposited into Bank' : 'Cash withdrawn from Bank'),
          rawText,
        };

      case 'record_credit_sale':
        return {
          type: 'TRANSACTION',
          action: 'PERSON_BOUGHT',
          voucherType: 'JOURNAL',
          amount: parseFloat(args.amount) || 0,
          personName: args.personName || 'Customer',
          paymentMode: args.paymentMode === 'BANK' ? 'BANK' : 'CASH',
          narration: args.narration || `${args.personName || 'Customer'} purchased goods on credit`,
          rawText,
        };

      case 'record_credit_purchase':
        return {
          type: 'TRANSACTION',
          action: 'USER_BOUGHT',
          voucherType: 'JOURNAL',
          amount: parseFloat(args.amount) || 0,
          personName: args.personName || 'Vendor',
          categoryName: args.category || 'Supplies Expense',
          paymentMode: args.paymentMode === 'BANK' ? 'BANK' : 'CASH',
          narration: args.narration || `Purchased items from ${args.personName || 'Vendor'} on credit`,
          rawText,
        };

      case 'query_balance':
        return {
          type: 'QUERY',
          target: args.target as any,
          personName: args.personName,
          rawText,
        };

      case 'query_report':
        return {
          type: 'QUERY',
          target: args.reportType as any,
          rawText,
        };

      case 'confirm_decision':
        return {
          type: 'CONFIRMATION',
          decision: args.decision === 'CANCEL' ? 'CANCEL' : 'CONFIRM',
          rawText,
        };

      case 'general_financial_assistant':
      default:
        return {
          type: 'UNKNOWN',
          rawText,
          reason: args.reply || 'General financial guidance provided.',
        };
    }
  }
}
