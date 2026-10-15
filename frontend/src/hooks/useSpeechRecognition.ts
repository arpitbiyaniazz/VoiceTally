import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceApi } from '../api/voice';

// Web Speech API interfaces
interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export const VOXTRAL_STT_MODEL = 'voxtral-mini-transcribe-realtime-2602';
export const VOXTRAL_TTS_MODEL = 'voxtral-mini-tts-2603';

interface UseSpeechRecognitionOptions {
  onResult?: (finalText: string) => void;
  preferredVoice?: string;
}

export function useSpeechRecognition(options?: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as IWindow;
    const hasMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasSpeech = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
    return hasMedia || hasSpeech;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const webSpeechFinalTextRef = useRef<string>('');

  const onResultRef = useRef(options?.onResult);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  // Initialize Web Speech API for real-time interim hints
  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

      rec.onstart = () => {
        setError(null);
        setInterimTranscript('');
        webSpeechFinalTextRef.current = '';
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          const trimmed = final.trim();
          webSpeechFinalTextRef.current = trimmed;
          setTranscript(trimmed);
        }
        setInterimTranscript(interim.trim());
      };

      rec.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          setError('Microphone access was denied. Please allow microphone permissions in your browser address bar.');
        } else if (event.error === 'network') {
          // Non-fatal because Voxtral STT audio recording handles backend transcription
          console.warn('Browser SpeechRecognition network notice, relying on Voxtral STT.');
        } else if (event.error === 'audio-capture') {
          setError('No microphone was detected on your device.');
        }
      };

      rec.onend = () => {
        // Recognition completed
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  /**
   * Browser SpeechSynthesis fallback when Voxtral TTS is offline or unconfigured
   */
  const fallbackBrowserSpeak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      setIsSpeaking(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1; // Clear, pleasant pitch for female persona
      utterance.lang = 'en-IN';

      // Auto-select female voice from available browser speech voices
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            /female|veena|samantha|victoria|zira|karen|tessa|moira|serena|fiona|kavya/i.test(v.name)
        ) ||
        voices.find((v) => /female|veena|samantha|victoria|zira|karen|tessa|moira/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith('en-IN') || v.lang.startsWith('en'));

      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Stops any active speech (either Voxtral Audio player or browser SpeechSynthesis)
   */
  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {
        // Ignore
      }
      audioPlayerRef.current = null;
    }

    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch {
        // Ignore
      }
      activeAudioUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    setIsSpeaking(false);
  }, []);

  /**
   * Speaks using female Voxtral voice (neutral_female) with automatic graceful fallback
   */
  const speak = useCallback(
    async (text: string) => {
      if (!voiceEnabled || !text || text.trim().length === 0) return;

      stopSpeaking();

      try {
        setIsSpeaking(true);
        // Call backend Voxtral TTS endpoint powered by voxtral-mini-tts-2603 with female voice
        const chosenVoice = options?.preferredVoice || 'neutral_female';
        const audioBlob = await voiceApi.synthesizeSpeech(
          text,
          chosenVoice
        );

        if (!audioBlob || audioBlob.size === 0) {
          fallbackBrowserSpeak(text);
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        activeAudioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          stopSpeaking();
        };
        audio.onerror = () => {
          console.warn('[Voxtral TTS] Audio element playback error, falling back to browser synthesis');
          stopSpeaking();
          fallbackBrowserSpeak(text);
        };

        await audio.play();
      } catch (err) {
        console.warn('[Voxtral TTS] Could not synthesize speech with voxtral-mini-tts-2603, falling back to browser speech:', err);
        fallbackBrowserSpeak(text);
      }
    },
    [voiceEnabled, stopSpeaking, fallbackBrowserSpeak, options?.preferredVoice]
  );

  /**
   * Start listening: records microphone audio for voxtral-mini-transcribe-realtime-2602
   */
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    webSpeechFinalTextRef.current = '';
    audioChunksRef.current = [];

    // Stop ongoing speech before recording
    stopSpeaking();

    // 1. Start browser speech recognition for instant visual interim tokens
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        console.warn('Could not start interim speech recognition:', err);
      }
    }

    // 2. Start MediaRecorder to capture audio for Voxtral STT if supported
    if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        // Pick preferred supported mime type
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (!MediaRecorder.isTypeSupported('audio/webm') && MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          }
        }

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;

        recorder.onstart = () => {
          setIsListening(true);
        };

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start(100); // Collect 100ms chunks for smooth capture
      } catch (err: any) {
        console.warn('[Voxtral STT] Microphone MediaRecorder notice:', err.message || err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone access was denied. Please allow microphone permissions in your browser.');
        }
      }
    }
  }, [stopSpeaking]);

  /**
   * Stop listening: finishes audio recording and transcribes via voxtral-mini-transcribe-realtime-2602
   */
  const stopListening = useCallback(() => {
    setIsListening(false);

    // Stop interim recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }

    // Stop MediaRecorder and transcribe with Voxtral
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        // Clean up audio stream tracks
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size > 500) {
          setIsTranscribing(true);
          try {
            // Transcribe using Voxtral Realtime (voxtral-mini-transcribe-realtime-2602)
            const result = await voiceApi.transcribeAudio(audioBlob);

            if (result && result.transcript && result.transcript.trim().length > 0) {
              const cleaned = result.transcript.trim();
              setTranscript(cleaned);
              setInterimTranscript('');
              if (onResultRef.current) {
                onResultRef.current(cleaned);
              }
              setIsTranscribing(false);
              return;
            }
          } catch (sttErr) {
            console.warn('[Voxtral STT] Voxtral transcription notice, falling back to Web Speech transcript:', sttErr);
          } finally {
            setIsTranscribing(false);
          }
        }

        // Graceful fallback to client Web Speech API result if available
        const fallbackText = webSpeechFinalTextRef.current.trim();
        if (fallbackText) {
          setTranscript(fallbackText);
          setInterimTranscript('');
          if (onResultRef.current) {
            onResultRef.current(fallbackText);
          }
        }
      };

      try {
        recorder.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
      }
    } else {
      // Release stream tracks if recorder was not active
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      const fallbackText = webSpeechFinalTextRef.current.trim();
      if (fallbackText && onResultRef.current) {
        onResultRef.current(fallbackText);
      }
    }
  }, []);

  const toggleVoiceAudio = useCallback(() => {
    setVoiceEnabled((prev) => {
      if (prev) {
        stopSpeaking();
      }
      return !prev;
    });
  }, [stopSpeaking]);

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
    sttModel: VOXTRAL_STT_MODEL,
    ttsModel: VOXTRAL_TTS_MODEL,
    voice: options?.preferredVoice || 'neutral_female',
    voiceGender: 'female',
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceAudio,
    setTranscript,
    clearError,
  };
}
