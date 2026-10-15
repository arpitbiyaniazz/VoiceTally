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

  it('correctly defaults to voxtral-mini-transcribe-realtime-2602 for STT', () => {
    delete process.env.VOXTRAL_STT_MODEL;
    expect(VoxtralVoiceService.getSTTModel()).toBe('voxtral-mini-transcribe-realtime-2602');
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
    const status = VoxtralVoiceService.getVoiceStatus();
    expect(status.sttModel).toBe('voxtral-mini-transcribe-realtime-2602');
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
    expect(result.model).toBe('voxtral-mini-transcribe-realtime-2602');
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
    expect(result.model).toBe('voxtral-mini-transcribe-realtime-2602');
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
});
