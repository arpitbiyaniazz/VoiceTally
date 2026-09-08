import { useState, useEffect, useRef, useCallback } from 'react';

// Web Speech API interfaces
interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

interface UseSpeechRecognitionOptions {
  onResult?: (finalText: string) => void;
}

export function useSpeechRecognition(options?: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as IWindow;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(options?.onResult);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setError(null);
        setInterimTranscript('');
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
          setTranscript(trimmed);
          if (onResultRef.current) {
            onResultRef.current(trimmed);
          }
        }
        setInterimTranscript(interim.trim());
      };

      rec.onerror = (event: any) => {
        console.warn('Speech recognition event error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          setError('Microphone access was denied. Please allow microphone permissions in your browser address bar.');
        } else if (event.error === 'network') {
          setError('Browser speech service is unreachable (network/firewall restriction). You can type commands or click sample chips below.');
        } else if (event.error === 'audio-capture') {
          setError('No microphone was detected on your device.');
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
          // Normal timeout or manual abort — do not display error banner
          setError(null);
        } else {
          setError(`Speech recognition notice: ${event.error}. You can type commands below.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
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

  const startListening = useCallback(() => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        // Recognition already started or error
        console.warn('Could not start recognition:', err);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN';

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      setIsSpeaking(false);
    }
  }, [voiceEnabled]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
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
    transcript,
    interimTranscript,
    error,
    isSupported,
    isSpeaking,
    voiceEnabled,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceAudio,
    setTranscript,
    clearError,
  };
}
