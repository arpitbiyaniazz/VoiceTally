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

  /**
   * Transcribes recorded audio blob using Voxtral Realtime (voxtral-mini-transcribe-realtime-2602)
   */
  async transcribeAudio(audioBlob: Blob): Promise<{ transcript: string; model: string; fallback?: boolean }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          const res = await api.post<{
            success: boolean;
            data: { transcript: string; model: string; fallback?: boolean };
          }>('/voice/transcribe', {
            audioBase64: base64data,
            mimeType: audioBlob.type || 'audio/webm',
            fileName: 'query.webm',
          });
          resolve(res.data.data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(audioBlob);
    });
  },

  /**
   * Generates natural speech talking audio using Voxtral TTS (voxtral-mini-tts-2603)
   */
  async synthesizeSpeech(text: string, voice: string = 'en_paul_neutral'): Promise<Blob> {
    const res = await api.post('/voice/tts', { text, voice }, { responseType: 'blob' });
    return res.data;
  },

  /**
   * Fetches active Voxtral voice models configuration
   */
  getConfig() {
    return api.get<{
      success: boolean;
      data: {
        sttModel: string;
        ttsModel: string;
        provider: string;
        isConfigured: boolean;
      };
    }>('/voice/config');
  },
};

