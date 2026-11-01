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

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
};

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  pcm: 'audio/pcm',
};

export class VoxtralVoiceService {
  /**
   * File transcription model for POST /audio/transcriptions. Realtime models
   * (voxtral-mini-transcribe-realtime-*) only work over the streaming WebSocket API.
   */
  public static readonly DEFAULT_STT_MODEL = 'voxtral-mini-latest';
  public static readonly DEFAULT_TTS_MODEL = 'voxtral-mini-tts-2603';
  /** App voice persona id that clients send; mapped to a hosted Mistral voice */
  public static readonly DEFAULT_VOICE = 'neutral_female';
  public static readonly DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

  /** Female persona ids → hosted Mistral voice slugs (preset names like "neutral_female" are not hosted voices) */
  private static readonly VOICE_PERSONAS: Record<string, { id: string; label: string }> = {
    neutral_female: { id: 'gb_jane_neutral', label: 'Jane (Neutral)' },
    cheerful_female: { id: 'gb_jane_confident', label: 'Jane (Confident)' },
    casual_female: { id: 'gb_jane_curious', label: 'Jane (Curious)' },
  };

  private static warnedRealtimeModel = false;

  public static getSTTModel(): string {
    const configured = process.env.VOXTRAL_STT_MODEL || this.DEFAULT_STT_MODEL;
    if (/realtime/i.test(configured)) {
      if (!this.warnedRealtimeModel) {
        this.warnedRealtimeModel = true;
        console.warn(
          `[VoxtralVoiceService] ${configured} only supports realtime (WebSocket) transcription; using ${this.DEFAULT_STT_MODEL} for recorded audio.`
        );
      }
      return this.DEFAULT_STT_MODEL;
    }
    return configured;
  }

  public static getTTSModel(): string {
    return process.env.VOXTRAL_TTS_MODEL || this.DEFAULT_TTS_MODEL;
  }

  public static getVoice(): string {
    return process.env.VOXTRAL_VOICE_ID || this.DEFAULT_VOICE;
  }

  /**
   * The hosted Mistral voice id for a persona id or explicit slug
   */
  public static resolveVoiceId(voice?: string): string {
    const requested = (voice || this.getVoice()).trim();
    return this.VOICE_PERSONAS[requested]?.id ?? requested;
  }

  public static getBaseUrl(): string {
    return (process.env.MISTRAL_API_BASE_URL || this.DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Strip codec parameters ("audio/webm;codecs=opus" → "audio/webm")
   */
  public static normalizeMimeType(mimeType?: string): string {
    const base = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    return base.startsWith('audio/') || base.startsWith('video/') ? base.replace(/^video\//, 'audio/') : 'audio/webm';
  }

  /**
   * Returns current configuration status for Voxtral STT and TTS models
   */
  public static getVoiceStatus() {
    const voice = this.getVoice();
    const persona = this.VOICE_PERSONAS[voice];
    return {
      sttModel: this.getSTTModel(),
      ttsModel: this.getTTSModel(),
      voice,
      voiceId: this.resolveVoiceId(voice),
      voiceLabel: persona?.label ?? voice,
      gender: 'female',
      availableVoices: Object.entries(this.VOICE_PERSONAS).map(([id, p]) => ({
        id,
        voiceId: p.id,
        label: `Female — ${p.label}`,
        gender: 'female',
      })),
      provider: 'mistral-voxtral',
      isConfigured: Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim().length > 0),
      features: {
        realtimeTranscription: false,
        recordedTranscription: true,
        contextBias: true,
        voiceSynthesis: true,
        languages: ['en', 'hi', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ar'],
      },
    };
  }

  /**
   * Transcribes recorded query audio with Voxtral (file transcription endpoint).
   * contextBias lists words the user is likely to say (contact and account names, up to 100).
   */
  public static async transcribe(
    audioBuffer: Buffer,
    mimeType: string = 'audio/webm',
    fileName: string = 'voice_query.webm',
    options?: { contextBias?: string[]; language?: string }
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
      const type = this.normalizeMimeType(mimeType);
      const extension = AUDIO_EXTENSIONS[type] ?? 'webm';
      const name = /\.[a-z0-9]+$/i.test(fileName) ? fileName.replace(/\.[a-z0-9]+$/i, `.${extension}`) : `${fileName}.${extension}`;

      const url = `${baseUrl}/audio/transcriptions`;
      const uint8 = new Uint8Array(audioBuffer);
      // The API accepts single words only ("must not contain commas or whitespace")
      const bias = (options?.contextBias ?? [])
        .map((word) => word.trim())
        .filter((word) => word.length > 0 && !/[\s,]/.test(word))
        .slice(0, 100);

      const send = (withBias: boolean) => {
        const formData = new FormData();
        formData.append('file', new Blob([uint8], { type }), name);
        formData.append('model', model);
        if (options?.language) formData.append('language', options.language);
        if (withBias) bias.forEach((word) => formData.append('context_bias', word));
        return fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
          signal: AbortSignal.timeout(20_000),
        });
      };

      let res = await send(bias.length > 0);
      if (!res.ok && res.status === 400 && bias.length > 0) {
        // Biasing is only a hint — never let it cost the transcription
        const errText = await res.text();
        if (/context.?bias/i.test(errText)) {
          console.warn('[VoxtralVoiceService] context_bias rejected, retrying without it:', errText.slice(0, 200));
          res = await send(false);
        } else {
          res = new Response(errText, { status: res.status });
        }
      }

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
    voice?: string
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

    const responseFormat = 'mp3';
    const request = (voiceId: string) =>
      fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: text.trim().slice(0, 1000),
          voice_id: voiceId,
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(20_000),
      });

    const voiceId = this.resolveVoiceId(voice);
    let res = await request(voiceId);

    // An unknown custom voice falls back to the default persona instead of silencing the assistant
    const fallbackVoice = this.resolveVoiceId(this.DEFAULT_VOICE);
    if (!res.ok && (res.status === 404 || res.status === 400) && voiceId !== fallbackVoice) {
      console.warn(`[VoxtralVoiceService] Voice '${voiceId}' rejected (HTTP ${res.status}); retrying with ${fallbackVoice}`);
      res = await request(fallbackVoice);
    }

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[VoxtralVoiceService] TTS endpoint error (${model}) HTTP ${res.status}:`, errText);
      throw new Error(`Voxtral TTS error (${res.status}): ${errText}`);
    }

    const body = Buffer.from(await res.arrayBuffer());
    const headerType = res.headers.get('content-type') || '';

    // The hosted API answers with JSON { audio_data: <base64> }; raw audio is accepted too
    if (headerType.includes('json')) {
      let audioData: string | undefined;
      try {
        audioData = (JSON.parse(body.toString('utf8')) as { audio_data?: string }).audio_data;
      } catch {
        // handled below
      }
      if (!audioData) {
        throw new Error('Voxtral TTS response did not contain audio data');
      }
      return {
        audioBuffer: Buffer.from(audioData, 'base64'),
        contentType: FORMAT_CONTENT_TYPES[responseFormat],
        model,
        latencyMs,
      };
    }

    return {
      audioBuffer: body,
      contentType: headerType || FORMAT_CONTENT_TYPES[responseFormat],
      model,
      latencyMs,
    };
  }
}
