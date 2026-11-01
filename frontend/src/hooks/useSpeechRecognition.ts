import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceApi, type VoiceConfig } from '../api/voice';
import { SpeechOutput, VoiceInputEngine } from './voiceEngine';

export const DEFAULT_STT_MODEL = 'voxtral-mini-latest';
export const DEFAULT_TTS_MODEL = 'voxtral-mini-tts-2603';
export const DEFAULT_VOICE = 'neutral_female';
export const DEFAULT_VOICE_LABEL = 'Jane (Neutral)';

interface UseSpeechRecognitionOptions {
  onResult?: (finalText: string) => void;
  /** Voice persona for spoken replies (defaults to the server's configured voice) */
  preferredVoice?: string;
  /** Fetch the active Voxtral models from the server for display */
  loadConfig?: boolean;
  lang?: string;
}

let cachedConfig: VoiceConfig | null = null;
let configRequest: Promise<VoiceConfig | null> | null = null;

function loadVoiceConfig(): Promise<VoiceConfig | null> {
  if (cachedConfig) return Promise.resolve(cachedConfig);
  if (!configRequest) {
    configRequest = Promise.resolve()
      .then(() => voiceApi.getConfig())
      .then((res) => {
        const data = res?.data?.data;
        if (data?.sttModel) cachedConfig = data;
        return cachedConfig;
      })
      .catch(() => null)
      .finally(() => {
        configRequest = null;
      });
  }
  return configRequest;
}

/**
 * Microphone input (Voxtral speech-to-text with live browser hints and automatic stop on pause)
 * and spoken replies (Voxtral text-to-speech with a browser fallback).
 */
export function useSpeechRecognition(options?: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState<boolean>(() => VoiceInputEngine.isSupported());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [config, setConfig] = useState<VoiceConfig | null>(() => cachedConfig);

  const engineRef = useRef<VoiceInputEngine | null>(null);
  const outputRef = useRef<SpeechOutput | null>(null);
  const voiceEnabledRef = useRef(true);
  const onResultRef = useRef(options?.onResult);
  const lang = options?.lang;
  const shouldLoadConfig = options?.loadConfig ?? false;
  const voice = options?.preferredVoice || config?.voice || DEFAULT_VOICE;
  const voiceRef = useRef(voice);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    const engine = new VoiceInputEngine(
      {
        onListeningChange: setIsListening,
        onTranscribingChange: setIsTranscribing,
        onInterim: setInterimTranscript,
        onError: setError,
        onResult: (text) => {
          setTranscript(text);
          onResultRef.current?.(text);
        },
      },
      lang
    );
    const output = new SpeechOutput(setIsSpeaking);
    engineRef.current = engine;
    outputRef.current = output;
    return () => {
      engine.dispose();
      output.stop();
      engineRef.current = null;
      outputRef.current = null;
    };
  }, [lang]);

  useEffect(() => {
    if (!shouldLoadConfig) return;
    let active = true;
    loadVoiceConfig().then((loaded) => {
      if (active && loaded) setConfig(loaded);
    });
    return () => {
      active = false;
    };
  }, [shouldLoadConfig]);

  /**
   * Stops any reply being spoken
   */
  const stopSpeaking = useCallback(() => {
    outputRef.current?.stop();
  }, []);

  /**
   * Speaks a reply. Resolves true when it finished playing (immediately when muted or
   * nothing could play), false when it was interrupted.
   */
  const speak = useCallback((text: string): Promise<boolean> => {
    const output = outputRef.current;
    if (!output || !voiceEnabledRef.current || !text || text.trim().length === 0) return Promise.resolve(true);
    return output.speak(text.trim(), voiceRef.current);
  }, []);

  /**
   * Start listening; recording stops by itself when the speaker pauses
   */
  const startListening = useCallback(async () => {
    outputRef.current?.stop();
    await engineRef.current?.start();
  }, []);

  /**
   * Stop listening and transcribe what was said
   */
  const stopListening = useCallback(() => {
    engineRef.current?.stop('manual');
  }, []);

  /**
   * Stop listening and discard the recording
   */
  const cancelListening = useCallback(() => {
    engineRef.current?.cancel();
  }, []);

  const toggleVoiceAudio = useCallback(() => {
    const next = !voiceEnabledRef.current;
    voiceEnabledRef.current = next;
    setVoiceEnabled(next);
    if (!next) outputRef.current?.stop();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isListening,
    isTranscribing,
    transcript,
    interimTranscript,
    error,
    isSupported,
    isSpeaking,
    voiceEnabled,
    sttModel: config?.sttModel || DEFAULT_STT_MODEL,
    ttsModel: config?.ttsModel || DEFAULT_TTS_MODEL,
    voice,
    voiceLabel: config?.voiceLabel || DEFAULT_VOICE_LABEL,
    voiceGender: config?.gender || 'female',
    startListening,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
    toggleVoiceAudio,
    setTranscript,
    clearError,
  };
}
