import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoxtralVoiceService } from '../../src/modules/voice/services/VoxtralVoiceService.js';

describe('VoxtralVoiceService Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('defaults to voxtral-mini-latest for recorded-audio transcription', () => {
    delete process.env.VOXTRAL_STT_MODEL;
    expect(VoxtralVoiceService.getSTTModel()).toBe('voxtral-mini-latest');
  });

  it('maps a realtime-only STT model to the file transcription model', () => {
    // The hosted API rejects it on /audio/transcriptions: "only supports realtime transcription"
    process.env.VOXTRAL_STT_MODEL = 'voxtral-mini-transcribe-realtime-2602';
    expect(VoxtralVoiceService.getSTTModel()).toBe('voxtral-mini-latest');
    process.env.VOXTRAL_STT_MODEL = 'voxtral-mini-2602';
    expect(VoxtralVoiceService.getSTTModel()).toBe('voxtral-mini-2602');
  });

  it('correctly defaults to voxtral-mini-tts-2603 for TTS', () => {
    delete process.env.VOXTRAL_TTS_MODEL;
    expect(VoxtralVoiceService.getTTSModel()).toBe('voxtral-mini-tts-2603');
  });

  it('correctly defaults to neutral_female voice preset', () => {
    delete process.env.VOXTRAL_VOICE_ID;
    expect(VoxtralVoiceService.getVoice()).toBe('neutral_female');
  });

  it('returns voice status metadata correctly with female gender', () => {
    process.env.MISTRAL_API_KEY = 'test-key';
    delete process.env.VOXTRAL_STT_MODEL;
    delete process.env.VOXTRAL_VOICE_ID;
    const status = VoxtralVoiceService.getVoiceStatus();
    expect(status.sttModel).toBe('voxtral-mini-latest');
    expect(status.voiceId).toBe('gb_jane_neutral');
    expect(status.ttsModel).toBe('voxtral-mini-tts-2603');
    expect(status.voice).toBe('neutral_female');
    expect(status.gender).toBe('female');
    expect(status.provider).toBe('mistral-voxtral');
    expect(status.isConfigured).toBe(true);
  });

  it('handles transcription when Mistral API responds successfully', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Paid 500 for lunch from cash' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const dummyAudio = Buffer.from('mock audio bytes');
    const result = await VoxtralVoiceService.transcribe(dummyAudio, 'audio/webm');

    expect(result.transcript).toBe('Paid 500 for lunch from cash');
    expect(result.model).toBe('voxtral-mini-latest');
    expect(result.fallback).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/audio/transcriptions'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('gracefully returns fallback when Mistral STT returns 401 error', async () => {
    process.env.MISTRAL_API_KEY = 'invalid-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"detail":"Invalid API Key"}',
    });
    vi.stubGlobal('fetch', mockFetch);

    const dummyAudio = Buffer.from('mock audio bytes');
    const result = await VoxtralVoiceService.transcribe(dummyAudio, 'audio/webm');

    expect(result.fallback).toBe(true);
    expect(result.model).toBe('voxtral-mini-latest');
    expect(result.error).toContain('401');
  });

  it('synthesizes speech using voxtral-mini-tts-2603 when Mistral API succeeds', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';

    const fakeAudioData = new Uint8Array([1, 2, 3, 4, 5]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'audio/mpeg' : null),
      },
      arrayBuffer: async () => fakeAudioData.buffer,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await VoxtralVoiceService.synthesizeSpeech('Recorded payment of 500', 'en_paul_neutral');

    expect(result.model).toBe('voxtral-mini-tts-2603');
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.audioBuffer).toBeDefined();
    expect(result.audioBuffer.length).toBe(5);
  });

  it('throws descriptive error if synthesizeSpeech text is empty', async () => {
    await expect(VoxtralVoiceService.synthesizeSpeech('')).rejects.toThrow('cannot be empty');
  });

  it('maps the female persona ids to hosted Mistral voices', () => {
    expect(VoxtralVoiceService.resolveVoiceId('neutral_female')).toBe('gb_jane_neutral');
    expect(VoxtralVoiceService.resolveVoiceId('cheerful_female')).toBe('gb_jane_confident');
    expect(VoxtralVoiceService.resolveVoiceId('en_paul_neutral')).toBe('en_paul_neutral');
  });

  it('decodes the base64 audio_data JSON returned by the hosted TTS endpoint', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';
    const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);
    const json = Buffer.from(JSON.stringify({ audio_data: mp3.toString('base64') }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
      arrayBuffer: async () => json.buffer.slice(json.byteOffset, json.byteOffset + json.byteLength),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await VoxtralVoiceService.synthesizeSpeech('Your bank balance is 5000 rupees', 'neutral_female');

    expect(result.contentType).toBe('audio/mpeg');
    expect(result.audioBuffer.equals(mp3)).toBe(true);
    const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(payload.voice_id).toBe('gb_jane_neutral');
  });

  it('retries with the default voice when a custom voice is rejected', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '{"message":"Voice not found"}' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'audio/mpeg' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await VoxtralVoiceService.synthesizeSpeech('Hello', 'my_custom_voice');
    expect(result.audioBuffer.length).toBe(3);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).voice_id).toBe('gb_jane_neutral');
  });

  it('sends recorded audio with a clean MIME type, matching file extension and context bias', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: 'Received 5000 from Vikramaditya' }) });
    vi.stubGlobal('fetch', mockFetch);

    await VoxtralVoiceService.transcribe(Buffer.from('audio'), 'audio/mp4', 'query.webm', { contextBias: ['Vikramaditya', 'UPI'] });

    const form = mockFetch.mock.calls[0][1].body as FormData;
    const file = form.get('file') as File;
    expect(file.type).toBe('audio/mp4');
    expect(file.name).toBe('query.mp4');
    expect(form.getAll('context_bias')).toEqual(['Vikramaditya', 'UPI']);
    expect(VoxtralVoiceService.normalizeMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('never sends multi-word bias items, and retries without bias if the API rejects it', async () => {
    process.env.MISTRAL_API_KEY = 'valid-key';
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"message":"Context bias item \'X\' is invalid"}' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: 'paid 500 for lunch' }) });
    vi.stubGlobal('fetch', mockFetch);

    const result = await VoxtralVoiceService.transcribe(Buffer.from('audio'), 'audio/webm', 'q.webm', {
      contextBias: ['Opening Capital', 'Rahul', 'a,b'],
    });

    expect((mockFetch.mock.calls[0][1].body as FormData).getAll('context_bias')).toEqual(['Rahul']);
    expect((mockFetch.mock.calls[1][1].body as FormData).getAll('context_bias')).toEqual([]);
    expect(result).toMatchObject({ transcript: 'paid 500 for lunch', fallback: false });
  });
});
