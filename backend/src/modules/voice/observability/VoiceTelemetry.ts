/**
 * VoiceTelemetry — Observability, Metrics & Structured Audit Logging for VoiceTally
 *
 * Provides real-time metrics, latency measurements, structured event logging,
 * and security violation audits for all Voice AI interactions.
 */

export interface VoiceEventPayload {
  correlationId: string;
  userId: string;
  timestamp: string;
  eventType: 'INPUT_RECEIVED' | 'GUARDRAIL_VIOLATION' | 'INTENT_PARSED' | 'CONFIRMATION_REQUESTED' | 'TRANSACTION_EXECUTED' | 'QUERY_EXECUTED' | 'ERROR';
  rawTranscript: string;
  intentType?: string;
  actionOrTarget?: string;
  amount?: number;
  latencyMs?: number;
  details?: Record<string, any>;
}

export interface VoiceMetricsSummary {
  totalInteractions: number;
  queriesCount: number;
  transactionsCount: number;
  unknownsCount: number;
  guardrailBlocks: number;
  confirmationsRequested: number;
  executedTransactions: number;
  avgLatencyMs: number;
}

export class VoiceTelemetry {
  private static metrics: VoiceMetricsSummary = {
    totalInteractions: 0,
    queriesCount: 0,
    transactionsCount: 0,
    unknownsCount: 0,
    guardrailBlocks: 0,
    confirmationsRequested: 0,
    executedTransactions: 0,
    avgLatencyMs: 0,
  };

  private static totalLatencySum = 0;

  /**
   * Generates a unique correlation ID for tracing an interaction across the system
   */
  public static createCorrelationId(): string {
    return `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Record and log a structured telemetry event
   */
  public static logEvent(event: VoiceEventPayload): void {
    // Structured JSON log for observability platforms (e.g. Datadog, CloudWatch, OpenTelemetry)
    const logLine = JSON.stringify({
      level: event.eventType === 'GUARDRAIL_VIOLATION' || event.eventType === 'ERROR' ? 'WARN' : 'INFO',
      scope: 'VOICE_AGENT',
      ...event,
    });

    if (process.env.NODE_ENV !== 'test') {
      console.log(logLine);
    }

    // Update aggregated in-memory metrics
    this.updateMetrics(event);
  }

  private static updateMetrics(event: VoiceEventPayload): void {
    this.metrics.totalInteractions++;

    if (event.latencyMs && event.latencyMs > 0) {
      this.totalLatencySum += event.latencyMs;
      this.metrics.avgLatencyMs = Math.round(this.totalLatencySum / this.metrics.totalInteractions);
    }

    switch (event.eventType) {
      case 'GUARDRAIL_VIOLATION':
        this.metrics.guardrailBlocks++;
        break;
      case 'CONFIRMATION_REQUESTED':
        this.metrics.confirmationsRequested++;
        break;
      case 'TRANSACTION_EXECUTED':
        this.metrics.executedTransactions++;
        break;
      case 'INTENT_PARSED':
        if (event.intentType === 'QUERY') this.metrics.queriesCount++;
        else if (event.intentType === 'TRANSACTION') this.metrics.transactionsCount++;
        else if (event.intentType === 'UNKNOWN') this.metrics.unknownsCount++;
        break;
    }
  }

  /**
   * Returns current snapshot of Voice AI telemetry metrics
   */
  public static getMetrics(): VoiceMetricsSummary {
    return { ...this.metrics };
  }

  /**
   * Resets metrics (useful for test isolation)
   */
  public static resetMetrics(): void {
    this.metrics = {
      totalInteractions: 0,
      queriesCount: 0,
      transactionsCount: 0,
      unknownsCount: 0,
      guardrailBlocks: 0,
      confirmationsRequested: 0,
      executedTransactions: 0,
      avgLatencyMs: 0,
    };
    this.totalLatencySum = 0;
  }
}
