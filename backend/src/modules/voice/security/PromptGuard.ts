/**
 * PromptGuard — AI Security & Prompt Injection Defense for VoiceTally
 *
 * Protects the Voice AI Agent against adversarial inputs, prompt injection attempts,
 * system prompt extraction, privilege escalation, and out-of-domain malicious payloads.
 */

export interface PromptGuardCheckResult {
  isSafe: boolean;
  hasInjection: boolean;
  threatType?:
    | 'INSTRUCTION_OVERRIDE'
    | 'SYSTEM_PROMPT_LEAK'
    | 'ROLE_PLAY_JAILBREAK'
    | 'SQL_OR_CODE_INJECTION'
    | 'UNSAFE_SYSTEM_COMMAND';
  matchedPattern?: string;
  sanitizedText: string;
}

export class PromptGuard {
  // Regex patterns targeting classic LLM jailbreaks and prompt injection tactics
  private static readonly JAILBREAK_PATTERNS: Array<{ pattern: RegExp; type: PromptGuardCheckResult['threatType'] }> = [
    // 1. Instruction override / ignore instructions
    {
      pattern: /(?:ignore|disregard|forget|bypass|override)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules|prompts|directives)(?:[,\.;\s]+(?:and|then|also))?/gi,
      type: 'INSTRUCTION_OVERRIDE',
    },
    {
      pattern: /(?:from\s+now\s+on\s+you\s+(?:are|must|will)|act\s+as\s+(?:an?\s+)?(?:admin|root|developer|god\s+mode|unrestricted))(?:[,\.;\s]+(?:and|then|also))?/gi,
      type: 'ROLE_PLAY_JAILBREAK',
    },
    // 2. System prompt leakage attempts
    {
      pattern: /(?:reveal|show|print|output|display|repeat|tell\s+me)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|hidden\s+rules|developer\s+key|api\s+secret)(?:[,\.;\s]+(?:and|then|also))?/gi,
      type: 'SYSTEM_PROMPT_LEAK',
    },
    // 3. Dangerous database / system destruction strings
    {
      pattern: /(?:drop\s+(?:all\s+)?tables?\b[^;]*;?|delete\s+from\s+[a-zA-Z0-9_-]+\b[^;]*;?|alter\s+table\b[^;]*;?|truncate\s+table\b[^;]*;?|union\s+select\b[^;]*;?|;\s*drop\b[^;]*;?)/gi,
      type: 'SQL_OR_CODE_INJECTION',
    },
    {
      pattern: /(?:<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:|eval\(|exec\()/gi,
      type: 'SQL_OR_CODE_INJECTION',
    },
    // 4. Fake administrative commands
    {
      pattern: /(?:grant\s+me\s+admin|sudo\s+rm|format\s+c:|system\s+shutdown|wipe\s+database)/gi,
      type: 'UNSAFE_SYSTEM_COMMAND',
    },
  ];

  /**
   * Evaluates input text for prompt injection, strips out malicious injection payloads,
   * and returns the clean sanitized text for the LLM to process.
   */
  public static inspect(input: string): PromptGuardCheckResult {
    if (!input || typeof input !== 'string') {
      return {
        isSafe: true,
        hasInjection: false,
        sanitizedText: '',
      };
    }

    let cleaned = input.trim();
    let hasInjection = false;
    let detectedThreat: PromptGuardCheckResult['threatType'] = undefined;
    let matchedPattern: string | undefined = undefined;

    // Check and strip against adversarial injection patterns
    for (const { pattern, type } of this.JAILBREAK_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(cleaned)) {
        hasInjection = true;
        if (!detectedThreat) {
          detectedThreat = type;
          matchedPattern = pattern.source;
        }
        pattern.lastIndex = 0;
        cleaned = cleaned.replace(pattern, ' ');
      }
    }

    // Clean up residual punctuation, connectors and double spaces
    cleaned = cleaned
      .replace(/^[\s,;:\.?!]+|[\s,;:\.?!]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return {
      isSafe: !hasInjection,
      hasInjection,
      threatType: detectedThreat,
      matchedPattern,
      sanitizedText: cleaned,
    };
  }

  /**
   * Generates a safe, conversational deflection response when an injection attack has no valid query left
   */
  public static getSafeDeflectionMessage(threatType?: string): string {
    switch (threatType) {
      case 'INSTRUCTION_OVERRIDE':
      case 'ROLE_PLAY_JAILBREAK':
        return "I am your VoiceTally accounting assistant and operate exclusively within double-entry financial principles. How may I assist with your books or ledger balances?";
      case 'SYSTEM_PROMPT_LEAK':
        return "I do not disclose system architecture or internal configurations. You can ask for your bank balance, expenses, or record transactions.";
      case 'SQL_OR_CODE_INJECTION':
      case 'UNSAFE_SYSTEM_COMMAND':
        return "Security Guardrail: Database modifications are strictly restricted to validated accounting vouchers. Please state a valid financial transaction.";
      default:
        return "That request is outside financial ledger operations. You can record income, expenses, withdrawals, or query your balances.";
    }
  }
}
