import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { voiceApi, type VoiceProcessResponse } from '../../api/voice';
import './VoiceAgentModal.css';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  response?: VoiceProcessResponse;
  timestamp: Date;
}

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransactionExecuted?: () => void;
}

export const VoiceAgentModal: React.FC<VoiceAgentModalProps> = ({
  isOpen,
  onClose,
  onTransactionExecuted,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<VoiceProcessResponse | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef<(text: string) => void>(() => {});

  const handleSendText = useCallback(
    async (textToSend: string, forceExecute?: boolean) => {
      if (!textToSend.trim() || isProcessing) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        sender: 'user',
        text: textToSend,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputVal('');
      setIsProcessing(true);

      try {
        // If forceExecute is true or user is confirming, execute = true
        const shouldExecute = forceExecute !== undefined ? forceExecute : false;
        const res = await voiceApi.process(
          { transcript: textToSend, execute: shouldExecute }
        );
        const voiceData = res.data.data;

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: voiceData.spokenResponse,
          response: voiceData,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // If preview mode, store pending state
        if (voiceData.needsConfirmation) {
          setPendingPreview(voiceData);
        } else {
          setPendingPreview(null);
        }

        // Speak response aloud if TTS enabled
        if (voiceData.spokenResponse) {
          speakRef.current(voiceData.spokenResponse);
        }

        // Notify parent if a transaction was recorded
        if (voiceData.executed && onTransactionExecuted) {
          onTransactionExecuted();
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || 'Sorry, could not process that request.';
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: errorMsg,
            timestamp: new Date(),
          },
        ]);
        speakRef.current(errorMsg);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, onTransactionExecuted]
  );

  const {
    isListening,
    interimTranscript,
    error: speechError,
    isSupported,
    isSpeaking,
    voiceEnabled,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceAudio,
    clearError,
  } = useSpeechRecognition({ onResult: (transcript) => handleSendText(transcript) });

  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, interimTranscript, isProcessing]);

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      stopSpeaking();
      startListening();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendText(inputVal);
  };

  const handleConfirmPending = () => {
    if (isProcessing) return;
    handleSendText('confirm');
  };

  const handleCancelPending = () => {
    if (isProcessing) return;
    handleSendText('cancel');
  };

  const suggestions = [
    { label: '🏦 Bank balance', query: 'what is my bank balance' },
    { label: '🏧 ATM cash withdrawal', query: 'i made the withdrawal from the bank 5000' },
    { label: '🛍️ Customer credit purchase', query: 'Rahul bought goods for 12000' },
    { label: '💵 Collect money from contact', query: 'i take 4000 muny from Rahul in cash' },
    { label: '💎 Net worth query', query: 'what is my net worth' },
    { label: '📈 Monthly expenses', query: 'how much did i spend this month' },
  ];

  if (!isOpen) return null;

  return (
    <div className="voice-modal-backdrop" onClick={onClose}>
      <div
        className="voice-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="VoiceTally AI Voice Assistant"
      >
        {/* Header */}
        <div className="voice-header">
          <div className="voice-title-wrap">
            <div className="voice-orb-icon">🎙️</div>
            <div>
              <h3 className="voice-title">VoiceTally AI Assistant</h3>
              <p className="voice-subtitle">Spoken Accounting & Natural Language Ledgers</p>
            </div>
          </div>
          <div className="voice-controls">
            <button
              className={`voice-btn-icon ${voiceEnabled ? 'active' : ''}`}
              onClick={toggleVoiceAudio}
              title={voiceEnabled ? 'Mute Spoken Audio' : 'Unmute Spoken Audio'}
              type="button"
            >
              {voiceEnabled ? '🔊 Audio ON' : '🔇 Audio OFF'}
            </button>
            <button className="voice-btn-icon" onClick={onClose} title="Close Assistant" type="button">
              ✕
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="voice-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="voice-welcome-card">
              <div className="voice-welcome-orb">✨</div>
              <h4 className="voice-welcome-title">Speak or Type Your Financial Request</h4>
              <p className="voice-welcome-desc">
                Record bank withdrawals, credit sales, expense payments, or ask any balance and net worth question.
                All transactions will be previewed for confirmation before posting.
              </p>

              <div className="voice-chips-grid">
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    className="voice-chip"
                    onClick={() => handleSendText(item.query)}
                    type="button"
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`voice-msg ${msg.sender}`}>
              <div className="voice-bubble">
                <div>{msg.text}</div>

                {/* 1. Preview / Reconfirmation Voucher Card */}
                {msg.response?.needsConfirmation && msg.response?.data && (
                  <div className="voice-card preview">
                    <div className="voice-card-header">
                      <span className="voice-card-badge preview">
                        ⚠️ PREVIEW: {msg.response.data.voucherType || 'VOUCHER'}
                      </span>
                      <span className="voice-card-amount">
                        {msg.response.data.formattedAmount || `₹${msg.response.data.amount}`}
                      </span>
                    </div>

                    <div className="voice-card-split">
                      <div className="voice-card-split-item">
                        <div className="label">Debit (Dr)</div>
                        <div className="val">{msg.response.data.debitAccount}</div>
                      </div>
                      <div className="voice-card-split-item">
                        <div className="label">Credit (Cr)</div>
                        <div className="val">{msg.response.data.creditAccount}</div>
                      </div>
                    </div>

                    {msg.response.data.narration && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        📝 {msg.response.data.narration}
                      </div>
                    )}

                    {msg.response.data.warning && (
                      <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: 4 }}>
                        ⚡ {msg.response.data.warning}
                      </div>
                    )}

                    {/* Interactive Confirmation Actions */}
                    <div className="voice-confirm-actions">
                      <button
                        type="button"
                        className="voice-confirm-btn"
                        onClick={handleConfirmPending}
                        disabled={isProcessing}
                      >
                        ✓ Confirm & Post
                      </button>
                      <button
                        type="button"
                        className="voice-cancel-btn"
                        onClick={handleCancelPending}
                        disabled={isProcessing}
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Executed Transaction Voucher Card */}
                {msg.response?.executed && msg.response?.intent?.type === 'TRANSACTION' && msg.response?.data && (
                  <div className="voice-card">
                    <div className="voice-card-header">
                      <span
                        className={`voice-card-badge ${
                          msg.response.data.voucherType?.toLowerCase() || 'journal'
                        }`}
                      >
                        ✓ {msg.response.data.voucherType || 'VOUCHER'} RECORDED
                      </span>
                      <span className="voice-card-amount">
                        {msg.response.data.formattedAmount || `₹${msg.response.data.amount}`}
                      </span>
                    </div>

                    <div className="voice-card-split">
                      <div className="voice-card-split-item">
                        <div className="label">Debit (Dr)</div>
                        <div className="val">{msg.response.data.debitAccount}</div>
                      </div>
                      <div className="voice-card-split-item">
                        <div className="label">Credit (Cr)</div>
                        <div className="val">{msg.response.data.creditAccount}</div>
                      </div>
                    </div>

                    {msg.response.data.narration && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        📝 {msg.response.data.narration}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Query Financial Position Card */}
                {msg.response?.intent?.type === 'QUERY' && msg.response?.data && (
                  <div className="voice-card">
                    <div className="voice-card-header">
                      <span className="voice-card-badge journal">
                        📊 {msg.response.displayTitle}
                      </span>
                      <span className="voice-card-amount">
                        {msg.response.data.formattedBalance ||
                          msg.response.data.formattedNetWorth ||
                          msg.response.data.formattedTotalExpense ||
                          msg.response.data.formattedTotalRevenue ||
                          `₹${msg.response.data.amount || 0}`}
                      </span>
                    </div>

                    {msg.response.data.role && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                        Status: <strong>{msg.response.data.role}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Interim listening transcript */}
          {isListening && interimTranscript && (
            <div className="voice-msg user">
              <div className="voice-bubble" style={{ opacity: 0.8, fontStyle: 'italic' }}>
                🎙️ "{interimTranscript}..."
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="voice-msg assistant">
              <div className="voice-bubble" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="voice-wave-container">
                  <div className="voice-wave-bar" />
                  <div className="voice-wave-bar" />
                  <div className="voice-wave-bar" />
                  <div className="voice-wave-bar" />
                  <div className="voice-wave-bar" />
                </div>
                <span>Processing financial ledger logic...</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer & Mic Controls */}
        <div className="voice-footer">
          <div className={`voice-live-status ${isListening ? 'listening' : ''}`}>
            <span>
              {isListening
                ? '🔴 Listening to your voice... Speak now'
                : isSpeaking
                ? '🔊 Assistant is speaking...'
                : pendingPreview
                ? '⚡ Transaction awaiting confirmation. Say "Yes" or click Confirm.'
                : speechError || (isSupported ? 'Click mic or type command below' : 'Text mode active')}
            </span>
            {isListening && (
              <div className="voice-wave-container">
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
                <div className="voice-wave-bar" />
              </div>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="voice-input-row">
            <button
              type="button"
              className={`voice-mic-main-btn ${isListening ? 'listening' : ''}`}
              onClick={handleMicToggle}
              title={isListening ? 'Stop Listening' : 'Start Voice Input'}
            >
              {isListening ? '⏹' : '🎙️'}
            </button>

            <div className="voice-text-input-wrap">
              <input
                type="text"
                className="voice-text-input"
                placeholder={
                  pendingPreview
                    ? 'Type "confirm" or "cancel"...'
                    : 'Say or type e.g. "I made the withdrawal from the bank 5000"...'
                }
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  if (speechError) clearError();
                }}
                disabled={isProcessing}
              />
              <button
                type="submit"
                className="voice-send-btn"
                disabled={!inputVal.trim() || isProcessing}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
