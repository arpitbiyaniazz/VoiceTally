import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMFunctionCallingService, ACCOUNTING_TOOLS } from '../../src/modules/voice/services/LLMFunctionCallingService.js';

describe('LLMFunctionCallingService Unit Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
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
});
