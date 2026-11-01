import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMFunctionCallingService, ACCOUNTING_TOOLS } from '../../src/modules/voice/services/LLMFunctionCallingService.js';

describe('LLMFunctionCallingService Unit Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // These tests choose providers by setting API keys (vitest.config.ts pins LLM_PROVIDER=local)
    delete process.env.LLM_PROVIDER;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('defines comprehensive accounting tool declarations matching JSON schema requirements', () => {
    expect(ACCOUNTING_TOOLS.length).toBeGreaterThanOrEqual(8);
    const toolNames = ACCOUNTING_TOOLS.map((t) => t.name);

    expect(toolNames).toContain('record_payment');
    expect(toolNames).toContain('record_receipt');
    expect(toolNames).toContain('record_contra');
    expect(toolNames).toContain('record_credit_sale');
    expect(toolNames).toContain('record_credit_purchase');
    expect(toolNames).toContain('query_balance');
    expect(toolNames).toContain('query_report');
    expect(toolNames).toContain('confirm_decision');
    expect(toolNames).toContain('general_financial_assistant');

    for (const tool of ACCOUNTING_TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
    }
  });

  it('falls back seamlessly to local deterministic orchestrator when no API keys are present', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const res = await LLMFunctionCallingService.interpret('user-1', 'Paid 500 for lunch from Cash');
    expect(res.llmMeta.isLLMPowered).toBe(false);
    expect(res.llmMeta.modelUsed).toBe('local-deterministic-orchestrator');
    expect(res.parsed.type).toBe('TRANSACTION');
    expect(res.parsed.action).toBe('DIRECT_PAYMENT');
    expect(res.parsed.amount).toBe(500);
  });

  it('handles Gemini function calling payload when GEMINI_API_KEY is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'record_contra',
                    args: {
                      amount: 15000,
                      direction: 'WITHDRAWAL',
                      narration: 'Cash withdrawal from ATM',
                    },
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'I withdrew 15000 from the bank');
    expect(res.llmMeta.isLLMPowered).toBe(true);
    expect(res.llmMeta.modelUsed).toBe('gemini-1.5-flash');
    expect(res.llmMeta.toolCalled).toBe('record_contra');
    expect(res.parsed.type).toBe('TRANSACTION');
    expect(res.parsed.action).toBe('WITHDRAWAL');
    expect(res.parsed.amount).toBe(15000);
    expect(res.parsed.voucherType).toBe('CONTRA');
  });

  it('handles OpenAI tool calling payload when OPENAI_API_KEY is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'record_credit_sale',
                    arguments: JSON.stringify({
                      amount: 45000,
                      personName: 'TechCorp Pvt Ltd',
                      narration: 'Sold 5 laptops',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'Sold 5 laptops to TechCorp for 45000 on credit');
    expect(res.llmMeta.isLLMPowered).toBe(true);
    expect(res.llmMeta.modelUsed).toBe('gpt-4o-mini');
    expect(res.llmMeta.toolCalled).toBe('record_credit_sale');
    expect(res.parsed.type).toBe('TRANSACTION');
    expect(res.parsed.action).toBe('PERSON_BOUGHT');
    expect(res.parsed.amount).toBe(45000);
    expect(res.parsed.personName).toBe('TechCorp Pvt Ltd');
  });

  it('handles general chit-chat and question answering via general_financial_assistant tool', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Double-entry bookkeeping is an accounting system where every entry has equal and opposite debits and credits.',
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'What is double entry accounting?');
    expect(res.llmMeta.isLLMPowered).toBe(true);
    expect(res.parsed.type).toBe('UNKNOWN');
    expect(res.parsed.reason).toContain('Double-entry bookkeeping');
  });

  it('handles Mistral AI tool calling payload when MISTRAL_API_KEY is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    process.env.MISTRAL_MODEL = 'mistral-small-latest';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_123',
                  function: {
                    name: 'record_receipt',
                    arguments: JSON.stringify({
                      amount: 12500,
                      personName: 'Rohan Sharma',
                      paymentMode: 'BANK',
                      narration: 'Received consulting fee',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'Rohan Sharma sent 12500 to my bank');
    expect(res.llmMeta.isLLMPowered).toBe(true);
    expect(res.llmMeta.modelUsed).toBe('mistral-small-latest');
    expect(res.llmMeta.toolCalled).toBe('record_receipt');
    expect(res.parsed.type).toBe('TRANSACTION');
    expect(res.parsed.action).toBe('RECEIVE_FROM_PERSON');
    expect(res.parsed.amount).toBe(12500);
    expect(res.parsed.personName).toBe('Rohan Sharma');
    expect(res.parsed.paymentMode).toBe('BANK');
  });

  it('handles Mistral AI conversational text response via general_financial_assistant tool', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'A Trial Balance ensures that total debits equal total credits across all ledger accounts.',
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'Explain what a trial balance is');
    expect(res.llmMeta.isLLMPowered).toBe(true);
    expect(res.parsed.type).toBe('UNKNOWN');
    expect(res.parsed.reason).toContain('Trial Balance ensures that total debits equal total credits');
  });

  it('gracefully degrades to local fallback if Mistral API call throws a network error', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';

    const mockFetch = vi.fn().mockRejectedValue(new Error('Mistral network timeout'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'What is my cash balance?');
    expect(res.llmMeta.isLLMPowered).toBe(false);
    expect(res.parsed.type).toBe('QUERY');
    expect(res.parsed.target).toBe('CASH_BALANCE');
  });

  it('gracefully degrades to local fallback if Gemini API call throws a network error', async () => {
    delete process.env.MISTRAL_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await LLMFunctionCallingService.interpret('user-1', 'What is my bank balance?');
    expect(res.llmMeta.isLLMPowered).toBe(false);
    expect(res.parsed.type).toBe('QUERY');
    expect(res.parsed.target).toBe('BANK_BALANCE');
  });

  describe('accuracy safeguards', () => {
    const mistralToolCall = (name: string, args: Record<string, unknown>) =>
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }] }),
      });

    beforeEach(() => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      process.env.MISTRAL_API_KEY = 'test-mistral-key';
      process.env.MISTRAL_MODEL = 'mistral-small-latest';
    });

    it('never forces the model to supply an amount, and lets payments name a person', () => {
      const payment = ACCOUNTING_TOOLS.find((t) => t.name === 'record_payment')!;
      expect(payment.parameters.required ?? []).not.toContain('amount');
      expect(payment.parameters.properties.personName).toBeDefined();
      const receipt = ACCOUNTING_TOOLS.find((t) => t.name === 'record_receipt')!;
      expect(receipt.parameters.properties.category).toBeDefined();
    });

    it('drops an amount and payment mode the user never said', async () => {
      vi.stubGlobal('fetch', mistralToolCall('record_payment', { amount: 500, category: 'Groceries', paymentMode: 'CASH' }));

      const res = await LLMFunctionCallingService.interpret('user-1', 'Paid for groceries');
      expect(res.parsed.type).toBe('TRANSACTION');
      const details = (res.parsed as any).details;
      expect(details.amount).toBeUndefined();
      expect(details.paymentMode).toBeUndefined();
      expect(details.categoryName).toBe('Groceries');
    });

    it('rejects a contact name that does not appear in the transcript', async () => {
      vi.stubGlobal('fetch', mistralToolCall('record_payment', { amount: 500, personName: 'Rahul', category: 'Food & Dining' }));

      const res = await LLMFunctionCallingService.interpret('user-1', 'Paid 500 for lunch in cash');
      expect((res.parsed as any).details.personName).toBeUndefined();
      expect((res.parsed as any).action).toBe('DIRECT_PAYMENT');
    });

    it('keeps "Sharma paid 5000" as money received even if the model reads it as a payment', async () => {
      vi.stubGlobal('fetch', mistralToolCall('record_payment', { amount: 5000, personName: 'Sharma', paymentMode: 'BANK' }));

      const res = await LLMFunctionCallingService.interpret('user-1', 'Sharma paid 5000 in bank');
      expect((res.parsed as any).action).toBe('RECEIVE_FROM_PERSON');
      expect((res.parsed as any).personName).toBe('Sharma');
      expect((res.parsed as any).paymentMode).toBe('BANK');
    });

    it('drops a direction the model guessed when the user never said one ("Rahul 5000")', async () => {
      vi.stubGlobal('fetch', mistralToolCall('record_receipt', { amount: 5000, personName: 'Rahul' }));

      const res = await LLMFunctionCallingService.interpret('user-1', 'Rahul 5000');
      expect(res.parsed).toMatchObject({ type: 'DETAILS', details: { amount: 5000, personName: 'Rahul' } });
      expect((res.parsed as any).details.flow).toBeUndefined();
    });

    it('lets the model fix a weak verb ("took a cab") but not invent a payment mode in Hindi', async () => {
      vi.stubGlobal('fetch', mistralToolCall('record_payment', { amount: 340, category: 'Travel' }));
      const cab = await LLMFunctionCallingService.interpret('user-1', 'Took a cab home for 340');
      expect((cab.parsed as any).action).toBe('DIRECT_PAYMENT');

      vi.stubGlobal('fetch', mistralToolCall('record_payment', { amount: 5000, personName: 'Rahul', paymentMode: 'CASH' }));
      const hindi = await LLMFunctionCallingService.interpret('user-1', 'राहुल को 5000 रुपए दे');
      expect((hindi.parsed as any).details.paymentMode).toBeUndefined();
      expect((hindi.parsed as any).personName).toBe('Rahul');
    });

    it('maps PROFIT_LOSS and RECENT_ENTRIES reports to supported queries', async () => {
      vi.stubGlobal('fetch', mistralToolCall('query_report', { reportType: 'PROFIT_LOSS' }));
      const pnl = await LLMFunctionCallingService.interpret('user-1', 'How did my business do');
      expect(pnl.parsed).toMatchObject({ type: 'QUERY', target: 'TOTAL_INCOME' });

      vi.stubGlobal('fetch', mistralToolCall('query_report', { reportType: 'RECENT_ENTRIES' }));
      const recent = await LLMFunctionCallingService.interpret('user-1', 'list what I did lately');
      expect(recent.parsed).toMatchObject({ type: 'QUERY', target: 'RECENT_TRANSACTIONS' });
    });

    it('falls back to the next Mistral model when the configured one has no quota, then skips it', async () => {
      process.env.MISTRAL_MODEL = 'zero-quota-model';
      process.env.MISTRAL_FALLBACK_MODELS = 'ministral-8b-latest';
      const success = {
        ok: true,
        json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'query_balance', arguments: '{"target":"CASH_BALANCE"}' } }] } }] }),
      };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h === 'x-ratelimit-limit-req-minute' ? '0' : null) },
          text: async () => '{"message":"Rate limit exceeded"}',
        })
        .mockResolvedValue(success);
      vi.stubGlobal('fetch', mockFetch);

      const first = await LLMFunctionCallingService.interpret('user-1', 'how much cash do i have');
      expect(first.llmMeta.modelUsed).toBe('ministral-8b-latest');
      expect(JSON.parse(mockFetch.mock.calls[1][1].body).model).toBe('ministral-8b-latest');

      await LLMFunctionCallingService.interpret('user-1', 'how much cash do i have');
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(JSON.parse(mockFetch.mock.calls[2][1].body).model).toBe('ministral-8b-latest');
      delete process.env.MISTRAL_FALLBACK_MODELS;
    });

    it('offers provide_entry_details only while an entry is being built, with the state in the prompt', async () => {
      const mockFetch = mistralToolCall('provide_entry_details', { paymentMode: 'BANK' });
      vi.stubGlobal('fetch', mockFetch);

      await LLMFunctionCallingService.interpret('user-1', 'what is my net worth');
      const plainTools = JSON.parse(mockFetch.mock.calls[0][1].body).tools.map((t: any) => t.function.name);
      expect(plainTools).not.toContain('provide_entry_details');

      const res = await LLMFunctionCallingService.interpret('user-1', 'online', {
        stage: 'COLLECTING',
        draftSummary: 'payment of ₹500 for Food & Dining (payment mode not given yet)',
        lastQuestion: 'Did you pay 500 rupees in cash or from your bank account?',
        awaiting: 'paymentMode',
      });
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.tools.map((t: any) => t.function.name)).toContain('provide_entry_details');
      expect(body.tool_choice).toBe('any');
      expect(body.messages[0].content).toContain('Did you pay 500 rupees in cash or from your bank account?');
      expect(res.parsed).toMatchObject({ type: 'DETAILS', details: { paymentMode: 'BANK' } });
    });

    it('never lets a chat reply claim that a transaction was recorded', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Done! I have recorded your payment of 500 for lunch.' } }] }) })
      );

      const res = await LLMFunctionCallingService.interpret('user-1', 'hello there');
      expect(res.parsed.type).toBe('UNKNOWN');
      expect((res.parsed as any).reason).not.toMatch(/recorded/i);
    });

    it('LLM_PROVIDER=local skips every provider', async () => {
      process.env.LLM_PROVIDER = 'local';
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const res = await LLMFunctionCallingService.interpret('user-1', 'Paid 500 for lunch from Cash');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res.llmMeta.isLLMPowered).toBe(false);
    });
  });
});
