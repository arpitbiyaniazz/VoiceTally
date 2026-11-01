import { api } from './client';

export type ClarificationField =
  | 'flow'
  | 'amount'
  | 'counterparty'
  | 'person'
  | 'paymentMode'
  | 'counterpartyKind'
  | 'date'
  | 'personChoice'
  | 'bankChoice'
  | 'cashChoice';

/** What the agent has understood so far about the entry being recorded */
export interface DraftSummary {
  flow?: string;
  flowLabel?: string;
  amount?: number;
  formattedAmount?: string;
  personName?: string;
  categoryName?: string;
  paymentMode?: 'CASH' | 'BANK';
  accountName?: string;
  /** YYYY-MM-DD */
  date?: string;
}

/** A follow-up question; sending an option's text as the next transcript answers it */
export interface VoiceClarification {
  field: ClarificationField;
  question: string;
  options: string[];
  draft?: DraftSummary;
}

export interface NewAccountNotice {
  name: string;
  kind: 'contact' | 'expense category' | 'income category' | 'cash account' | 'bank account' | string;
}

/** Double-entry voucher waiting for the user's confirmation */
export interface VoicePreviewData {
  isPreview?: boolean;
  voucherType?: string;
  debitAccount?: string;
  creditAccount?: string;
  amount?: number;
  formattedAmount?: string;
  narration?: string;
  warning?: string;
  /** YYYY-MM-DD */
  date?: string;
  isBackdated?: boolean;
  newAccounts?: NewAccountNotice[];
  draft?: DraftSummary;
}

export type ConversationStage = 'IDLE' | 'COLLECTING' | 'AWAITING_CONFIRMATION';

export interface VoiceConversationState {
  stage: ConversationStage;
  clarification?: VoiceClarification;
  preview?: VoicePreviewData;
}

export interface VoiceProcessResponse {
  intent: {
    type: 'QUERY' | 'TRANSACTION' | 'CONFIRMATION' | 'UNKNOWN' | 'CLARIFICATION' | 'DETAILS';
    action?: string;
    target?: string;
    decision?: 'CONFIRM' | 'CANCEL';
    voucherType?: string;
    amount?: number;
    personName?: string;
    categoryName?: string;
    paymentMode?: string;
    field?: ClarificationField;
    rawText: string;
  };
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

export interface VoiceConfig {
  sttModel: string;
  ttsModel: string;
  /** Persona id, e.g. "neutral_female" */
  voice?: string;
  /** Provider voice id, e.g. "gb_jane_neutral" */
  voiceId?: string;
  voiceLabel?: string;
  gender?: string;
  provider: string;
  isConfigured: boolean;
}

export interface VoiceTranscriptionResult {
  transcript: string;
  model: string;
  latencyMs?: number;
  fallback?: boolean;
  error?: string;
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
};

/** "audio/webm;codecs=opus" → { mimeType: "audio/webm", extension: "webm" } */
export function describeAudioType(rawType: string | undefined): { mimeType: string; extension: string } {
  const mimeType = (rawType || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
  return { mimeType, extension: AUDIO_EXTENSIONS[mimeType] ?? 'webm' };
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
   * Transcribes recorded audio with Voxtral speech-to-text
   */
  async transcribeAudio(audioBlob: Blob): Promise<VoiceTranscriptionResult> {
    const { mimeType, extension } = describeAudioType(audioBlob.type);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          const res = await api.post<{ success: boolean; data: VoiceTranscriptionResult }>('/voice/transcribe', {
            audioBase64: base64data,
            mimeType,
            fileName: `voice_query.${extension}`,
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
   * Generates spoken audio with Voxtral text-to-speech
   */
  async synthesizeSpeech(text: string, voice: string = 'neutral_female'): Promise<Blob> {
    const res = await api.post('/voice/tts', { text, voice }, { responseType: 'blob' });
    return res.data;
  },

  /**
   * Fetches the active Voxtral speech-to-text / text-to-speech configuration
   */
  getConfig() {
    return api.get<{ success: boolean; data: VoiceConfig }>('/voice/config');
  },
};
