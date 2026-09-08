import { api } from './client';

export interface VoiceProcessResponse {
  intent: {
    type: 'QUERY' | 'TRANSACTION' | 'CONFIRMATION' | 'UNKNOWN';
    action?: string;
    target?: string;
    decision?: 'CONFIRM' | 'CANCEL';
    voucherType?: string;
    amount?: number;
    personName?: string;
    categoryName?: string;
    rawText: string;
  };
  spokenResponse: string;
  displayTitle: string;
  data?: any;
  executed: boolean;
  needsConfirmation?: boolean;
  confirmToken?: string;
  voucher?: any;
  latencyMs?: number;
}

export const voiceApi = {
  process(
    payload: string | { transcript?: string; text?: string; execute?: boolean },
    execute?: boolean
  ) {
    if (typeof payload === 'string') {
      return api.post<{ success: boolean; data: VoiceProcessResponse }>('/voice/process', {
        transcript: payload,
        execute: execute ?? false,
      });
    }
    return api.post<{ success: boolean; data: VoiceProcessResponse }>('/voice/process', {
      transcript: payload.transcript || payload.text,
      execute: payload.execute ?? (execute ?? false),
    });
  },

  getMetrics() {
    return api.get<{ success: boolean; data: any }>('/voice/metrics');
  },
};
