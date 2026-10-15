export interface VoxtralTranscribeResult {
  transcript: string;
  model: string;
  latencyMs: number;
  fallback?: boolean;
  error?: string;
}

export interface VoxtralTTSResult {
  audioBuffer: Buffer;
  contentType: string;
  model: string;
  latencyMs: number;
}

export class VoxtralVoiceService {
  public static readonly DEFAULT_STT_MODEL = 'voxtral-mini-transcribe-realtime-2602';
  public static readonly DEFAULT_TTS_MODEL = 'voxtral-mini-tts-2603';
  public static readonly DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

  public static getSTTModel(): string {
    return process.env.VOXTRAL_STT_MODEL || this.DEFAULT_STT_MODEL;
  }

  public static getTTSModel(): string {
    return process.env.VOXTRAL_TTS_MODEL || this.DEFAULT_TTS_MODEL;
  }

  public static getBaseUrl(): string {
    return (process.env.MISTRAL_API_BASE_URL || this.DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Returns current configuration status for Voxtral STT and TTS models
   */
  public static getVoiceStatus() {
    return {
      sttModel: this.getSTTModel(),
      ttsModel: this.getTTSModel(),
      provider: 'mistral-voxtral',
      isConfigured: Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim().length > 0),
      features: {
        realtimeTranscription: true,
        voiceSynthesis: true,
        languages: ['en', 'hi', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ar'],
      },
    };
  }

  /**
   * Transcribes user query audio using voxtral-mini-transcribe-realtime-2602
   */
  public static async transcribe(
    audioBuffer: Buffer,
    mimeType: string = 'audio/webm',
    fileName: string = 'voice_query.webm'
  ): Promise<VoxtralTranscribeResult> {
    const startTime = Date.now();
    const model = this.getSTTModel();
    const apiKey = process.env.MISTRAL_API_KEY;
    const baseUrl = this.getBaseUrl();

    if (!apiKey) {
      console.warn(`[VoxtralVoiceService] MISTRAL_API_KEY missing. Cannot call ${model}.`);
      return {
        transcript: '',
        model,
        latencyMs: Date.now() - startTime,
        fallback: true,
        error: 'MISTRAL_API_KEY is not configured',
      };
    }

    try {
      const url = `${baseUrl}/audio/transcriptions`;
      const formData = new FormData();
      const uint8 = new Uint8Array(audioBuffer);
      const blob = new Blob([uint8], { type: mimeType });
      formData.append('file', blob, fileName);
      formData.append('model', model);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[VoxtralVoiceService] STT endpoint error (${model}) HTTP ${res.status}:`, errText);
        return {
          transcript: '',
          model,
          latencyMs,
          fallback: true,
          error: `Voxtral API error (${res.status}): ${errText}`,
        };
      }

      const json = (await res.json()) as { text?: string };
      const transcript = (json.text || '').trim();

      return {
        transcript,
        model,
        latencyMs,
        fallback: false,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.warn(`[VoxtralVoiceService] STT network error (${model}):`, err.message || err);
      return {
        transcript: '',
        model,
        latencyMs,
        fallback: true,
        error: err.message || 'Unknown network error during Voxtral transcription',
      };
    }
  }

  /**
   * Synthesizes speech response using voxtral-mini-tts-2603
   */
  public static async synthesizeSpeech(
    text: string,
    voice: string = 'en_paul_neutral'
  ): Promise<VoxtralTTSResult> {
    const startTime = Date.now();
    const model = this.getTTSModel();
    const apiKey = process.env.MISTRAL_API_KEY;
    const baseUrl = this.getBaseUrl();

    if (!text || text.trim().length === 0) {
      throw new Error('Text to synthesize cannot be empty');
    }

    if (!apiKey) {
      throw new Error(`MISTRAL_API_KEY is not configured for ${model}`);
    }

    const url = `${baseUrl}/audio/speech`;
    const payload = {
      model,
      input: text.trim(),
      voice_id: voice,
      response_format: 'mp3',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[VoxtralVoiceService] TTS endpoint error (${model}) HTTP ${res.status}:`, errText);
      throw new Error(`Voxtral TTS error (${res.status}): ${errText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);
    const contentType = res.headers.get('content-type') || 'audio/mpeg';

    return {
      audioBuffer,
      contentType,
      model,
      latencyMs,
    };
  }
}
