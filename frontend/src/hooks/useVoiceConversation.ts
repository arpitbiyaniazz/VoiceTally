import { useCallback, useEffect, useRef, useState } from 'react';
import {
  voiceApi,
  type ConversationStage,
  type VoiceClarification,
  type VoicePreviewData,
  type VoiceProcessResponse,
} from '../api/voice';
import { useSpeechRecognition } from './useSpeechRecognition';

export type TurnSource = 'voice' | 'text' | 'option';

export interface ConversationTurn {
  id: string;
  transcript: string;
  source: TurnSource;
  timestamp: Date;
  response?: VoiceProcessResponse;
  error?: string;
}

export interface ConversationView {
  stage: ConversationStage;
  clarification: VoiceClarification | null;
  preview: VoicePreviewData | null;
}

const IDLE_VIEW: ConversationView = { stage: 'IDLE', clarification: null, preview: null };

/**
 * What the UI should show after an agent reply: a follow-up question, a voucher awaiting
 * confirmation, or nothing pending. Replies without `conversation` (older servers) fall back
 * to needsConfirmation / needsClarification.
 */
export function conversationFromResponse(res: VoiceProcessResponse, previous: ConversationView): ConversationView {
  const conv = res.conversation;
  if (conv) {
    if (conv.stage === 'COLLECTING') {
      return { stage: 'COLLECTING', clarification: conv.clarification ?? res.clarification ?? previous.clarification, preview: null };
    }
    if (conv.stage === 'AWAITING_CONFIRMATION') {
      const preview = conv.preview ?? (res.needsConfirmation ? res.data : null) ?? previous.preview;
      return preview ? { stage: 'AWAITING_CONFIRMATION', clarification: null, preview } : IDLE_VIEW;
    }
    return IDLE_VIEW;
  }
  if (res.needsConfirmation && res.data) return { stage: 'AWAITING_CONFIRMATION', clarification: null, preview: res.data };
  if (res.needsClarification && res.clarification) return { stage: 'COLLECTING', clarification: res.clarification, preview: null };
  // A security deflection leaves any entry in progress as it was
  if (res.data?.threatType) return previous;
  return IDLE_VIEW;
}

function errorMessage(err: any): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    'Sorry, I could not process that request. Please try again.'
  );
}

let turnCounter = 0;

/**
 * Shared conversation state for the voice assistant (modal and Voice Studio): sends utterances,
 * tracks follow-up questions and pending vouchers, speaks replies, and keeps listening
 * hands-free while an entry is in progress.
 */
export function useVoiceConversation(options?: { onTransactionExecuted?: () => void; isActive?: boolean }) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [view, setView] = useState<ConversationView>(IDLE_VIEW);

  const isActive = options?.isActive ?? true;
  const processingRef = useRef(false);
  const viewRef = useRef<ConversationView>(IDLE_VIEW);
  const activeRef = useRef(isActive);
  /** Bumped whenever the user takes over, so a pending hands-free restart is dropped */
  const autoListenTokenRef = useRef(0);
  const onExecutedRef = useRef(options?.onTransactionExecuted);
  const sendRef = useRef<(text: string, source?: TurnSource) => Promise<void>>(async () => undefined);

  useEffect(() => {
    onExecutedRef.current = options?.onTransactionExecuted;
  }, [options?.onTransactionExecuted]);

  const speech = useSpeechRecognition({
    loadConfig: true,
    onResult: (text) => {
      void sendRef.current(text, 'voice');
    },
  });
  const { speak, startListening, stopListening, cancelListening, stopSpeaking, isListening } = speech;

  const send = useCallback(
    async (text: string, source: TurnSource = 'text') => {
      const transcript = text.trim();
      if (!transcript || processingRef.current) return;
      processingRef.current = true;
      autoListenTokenRef.current++;
      cancelListening(); // a typed or tapped answer replaces any recording in progress
      stopSpeaking();
      setIsProcessing(true);

      const id = `turn-${Date.now()}-${++turnCounter}`;
      setTurns((prev) => [...prev, { id, transcript, source, timestamp: new Date() }]);

      try {
        const res = await voiceApi.process({ transcript, execute: false });
        const data = res.data.data;
        const next = conversationFromResponse(data, viewRef.current);
        viewRef.current = next;
        setView(next);
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, response: data } : t)));

        if (data.executed && (data.intent?.type === 'TRANSACTION' || data.voucher || data.data?.voucherId)) {
          onExecutedRef.current?.();
        }

        // Hands-free: after a spoken question or preview, listen for the answer once the reply finishes
        const keepListening = source === 'voice' && next.stage !== 'IDLE';
        const token = ++autoListenTokenRef.current;
        void speak(data.spokenResponse || '').then((finished) => {
          if (finished && keepListening && activeRef.current && token === autoListenTokenRef.current) {
            void startListening();
          }
        });
      } catch (err) {
        const message = errorMessage(err);
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: message } : t)));
        void speak(message);
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [cancelListening, speak, startListening, stopSpeaking]
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Closing the assistant stops the microphone and any reply being spoken
  useEffect(() => {
    activeRef.current = isActive;
    if (!isActive) {
      autoListenTokenRef.current++;
      cancelListening();
      stopSpeaking();
    }
  }, [isActive, cancelListening, stopSpeaking]);

  const toggleMic = useCallback(() => {
    autoListenTokenRef.current++;
    if (isListening) stopListening();
    else void startListening();
  }, [isListening, startListening, stopListening]);

  /** The user started typing: don't reopen the microphone after the current reply */
  const cancelAutoListen = useCallback(() => {
    autoListenTokenRef.current++;
  }, []);

  const confirm = useCallback(() => send('confirm', 'option'), [send]);
  const cancel = useCallback(() => send('cancel', 'option'), [send]);
  const clearTurns = useCallback(() => setTurns([]), []);

  return {
    turns,
    isProcessing,
    stage: view.stage,
    clarification: view.clarification,
    preview: view.preview,
    send,
    confirm,
    cancel,
    clearTurns,
    toggleMic,
    cancelAutoListen,
    speech,
  };
}
