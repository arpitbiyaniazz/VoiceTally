import React, { useState, useEffect, useRef } from 'react';
import { useVoiceConversation, type ConversationTurn } from '../../hooks/useVoiceConversation';
import { ClarificationCard, ConfirmTransactionDialog, PreviewNotes, SuggestionChips } from './VoiceConversationParts';
import {
  Mic,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  AlertTriangle,
  FileText,
  Zap,
  Check,
  CheckCircle2,
  Landmark,
  TrendingUp,
  ShoppingBag,
  Banknote,
  Gem,
  Square,
  BarChart3,
  Radio,
  AudioLines,
  HelpCircle,
  Utensils,
} from 'lucide-react';
import './VoiceAgentModal.css';

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransactionExecuted?: () => void;
}

const SUGGESTIONS = [
  { icon: <Landmark size={14} />, label: 'Bank balance', query: 'what is my bank balance' },
  { icon: <Banknote size={14} />, label: 'ATM cash withdrawal', query: 'i made the withdrawal from the bank 5000' },
  { icon: <Utensils size={14} />, label: 'Quick expense', query: 'Paid 500 for lunch' },
  { icon: <ShoppingBag size={14} />, label: 'Customer credit purchase', query: 'Rahul bought goods for 12000' },
  { icon: <Gem size={14} />, label: 'Net worth query', query: 'what is my net worth' },
  { icon: <TrendingUp size={14} />, label: 'Monthly expenses', query: 'how much did i spend this month' },
];

const inlineIcon = { display: 'inline', verticalAlign: 'middle', marginRight: 4 } as const;

export const VoiceAgentModal: React.FC<VoiceAgentModalProps> = ({ isOpen, onClose, onTransactionExecuted }) => {
  const [inputVal, setInputVal] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const { turns, isProcessing, stage, clarification, preview, send, confirm, cancel, toggleMic, cancelAutoListen, speech } =
    useVoiceConversation({ onTransactionExecuted, isActive: isOpen });
  const {
    isListening,
    isTranscribing,
    interimTranscript,
    error: speechError,
    isSupported,
    isSpeaking,
    voiceEnabled,
    sttModel,
    ttsModel,
    voiceLabel,
    toggleVoiceAudio,
    clearError,
  } = speech;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [turns, interimTranscript, isProcessing]);

  const lastTurnId = turns[turns.length - 1]?.id;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    void send(inputVal, 'text');
    setInputVal('');
  };

  const handleOption = (option: string) => {
    clearError();
    void send(option, 'option');
  };

  if (!isOpen) return null;

  const statusText = isTranscribing
    ? `Transcribing with ${sttModel}…`
    : isListening
    ? stage === 'IDLE'
      ? "Listening… I'll stop when you pause, or tap to finish."
      : "Listening for your answer… I'll stop when you pause."
    : isSpeaking
    ? `Speaking (${voiceLabel})…`
    : speechError
    ? speechError
    : stage === 'AWAITING_CONFIRMATION'
    ? 'Entry ready — say "yes" to post, "cancel", or what to change.'
    : stage === 'COLLECTING'
    ? 'Answer the question above — speak, type, or tap an option.'
    : isSupported
    ? 'Tap the mic or type a command below'
    : 'Text mode active';

  const renderResponse = (turn: ConversationTurn) => {
    const res = turn.response;
    if (!res) return null;
    const isLatest = turn.id === lastTurnId;
    const data = res.data;
    const turnClarification =
      res.clarification ?? (res.conversation?.stage === 'COLLECTING' ? res.conversation.clarification : undefined);
    const clarificationIsOpen = isLatest && stage === 'COLLECTING' && !!clarification;
    const previewIsOpen = isLatest && stage === 'AWAITING_CONFIRMATION';

    return (
      <>
        {/* 1. Follow-up question: what has been understood so far, plus answer options */}
        {(clarificationIsOpen ? clarification : turnClarification) && (
          <ClarificationCard
            clarification={(clarificationIsOpen ? clarification : turnClarification)!}
            interactive={clarificationIsOpen}
            disabled={isProcessing}
            onSelect={handleOption}
          />
        )}

        {/* 2. Preview / Reconfirmation Voucher Card */}
        {res.needsConfirmation && data && (
          <div className="voice-card preview">
            <div className="voice-card-header">
              <span className="voice-card-badge preview">
                <AlertTriangle size={14} style={inlineIcon} /> PREVIEW: {data.voucherType || 'VOUCHER'}
              </span>
              <span className="voice-card-amount">{data.formattedAmount || `₹${data.amount}`}</span>
            </div>

            <div className="voice-card-split">
              <div className="voice-card-split-item">
                <div className="label">Debit (Dr)</div>
                <div className="val">{data.debitAccount}</div>
              </div>
              <div className="voice-card-split-item">
                <div className="label">Credit (Cr)</div>
                <div className="val">{data.creditAccount}</div>
              </div>
            </div>

            {data.narration && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                <FileText size={14} style={inlineIcon} /> {data.narration}
              </div>
            )}

            <PreviewNotes preview={data} />

            {data.warning && (
              <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: 4 }}>
                <Zap size={14} style={inlineIcon} /> {data.warning}
              </div>
            )}

            {previewIsOpen && (
              <div className="voice-confirm-actions">
                <button type="button" className="voice-confirm-btn" onClick={confirm} disabled={isProcessing}>
                  <Check size={14} style={inlineIcon} /> Confirm & Post
                </button>
                <button type="button" className="voice-cancel-btn" onClick={cancel} disabled={isProcessing}>
                  <X size={14} style={inlineIcon} /> Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. Executed Transaction Voucher Card */}
        {res.executed && (res.intent?.type === 'TRANSACTION' || data?.voucherId) && data && (
          <div className="voice-card">
            <div className="voice-card-header">
              <span className={`voice-card-badge ${data.voucherType?.toLowerCase() || 'journal'}`}>
                <CheckCircle2 size={14} style={inlineIcon} /> {data.voucherType || 'VOUCHER'} RECORDED
              </span>
              <span className="voice-card-amount">{data.formattedAmount || `₹${data.amount}`}</span>
            </div>

            <div className="voice-card-split">
              <div className="voice-card-split-item">
                <div className="label">Debit (Dr)</div>
                <div className="val">{data.debitAccount}</div>
              </div>
              <div className="voice-card-split-item">
                <div className="label">Credit (Cr)</div>
                <div className="val">{data.creditAccount}</div>
              </div>
            </div>

            {data.narration && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                <FileText size={14} style={inlineIcon} /> {data.narration}
              </div>
            )}
          </div>
        )}

        {/* 4. Query Financial Position Card */}
        {res.intent?.type === 'QUERY' && data && (
          <div className="voice-card">
            <div className="voice-card-header">
              <span className="voice-card-badge journal">
                <BarChart3 size={14} style={inlineIcon} /> {res.displayTitle}
              </span>
              <span className="voice-card-amount">
                {data.formattedBalance ||
                  data.formattedNetWorth ||
                  data.formattedTotalExpense ||
                  data.formattedTotalRevenue ||
                  `₹${data.amount || 0}`}
              </span>
            </div>

            {Array.isArray(data.accounts) && data.accounts.length > 1 && (
              <div className="voice-query-breakdown">
                {data.accounts.map((acc: { name: string; formattedBalance?: string; balance?: number }) => (
                  <div key={acc.name} className="voice-query-row">
                    <span>{acc.name}</span>
                    <span>{acc.formattedBalance ?? `₹${acc.balance ?? 0}`}</span>
                  </div>
                ))}
              </div>
            )}

            {data.formattedCash && data.formattedBank && (
              <div className="voice-query-breakdown">
                <div className="voice-query-row">
                  <span>Cash</span>
                  <span>{data.formattedCash}</span>
                </div>
                <div className="voice-query-row">
                  <span>Bank</span>
                  <span>{data.formattedBank}</span>
                </div>
              </div>
            )}

            {data.role && (
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Status: <strong>{data.role}</strong>
              </div>
            )}
          </div>
        )}

        {/* 5. Example requests when the assistant did not understand */}
        {isLatest && res.intent?.type === 'UNKNOWN' && Array.isArray(data?.suggestions) && data.suggestions.length > 0 && (
          <SuggestionChips suggestions={data.suggestions} disabled={isProcessing} onSelect={handleOption} />
        )}
      </>
    );
  };

  return (
    <div className="voice-modal-backdrop" onClick={onClose}>
      <div className="voice-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="VoiceTally AI Voice Assistant">
        {/* Header */}
        <div className="voice-header">
          <div className="voice-title-wrap">
            <div className="voice-orb-icon">
              <Mic size={22} />
            </div>
            <div>
              <h3 className="voice-title">VoiceTally AI Assistant</h3>
              <p className="voice-subtitle" title={`STT: ${sttModel} | TTS: ${ttsModel} (${voiceLabel})`}>
                Voxtral • {voiceLabel}
              </p>
            </div>
          </div>
          <div className="voice-controls">
            <span
              className="voice-voice-indicator"
              style={{
                fontSize: '0.78rem',
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(236, 72, 153, 0.12)',
                border: '1px solid rgba(236, 72, 153, 0.28)',
                color: '#f472b6',
                fontWeight: 500,
              }}
              title={`Female voice persona (${voiceLabel})`}
            >
              Female Voice
            </span>
            <button
              className={`voice-btn-icon ${voiceEnabled ? 'active' : ''}`}
              onClick={toggleVoiceAudio}
              title={voiceEnabled ? 'Mute Spoken Audio' : 'Unmute Spoken Audio'}
              type="button"
            >
              {voiceEnabled ? (
                <>
                  <Volume2 size={15} style={inlineIcon} /> Audio ON
                </>
              ) : (
                <>
                  <VolumeX size={15} style={inlineIcon} /> Audio OFF
                </>
              )}
            </button>
            <button className="voice-btn-icon" onClick={onClose} title="Close Assistant" type="button">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="voice-body" ref={bodyRef}>
          {turns.length === 0 && (
            <div className="voice-welcome-card">
              <div className="voice-welcome-orb">
                <Sparkles size={28} />
              </div>
              <h4 className="voice-welcome-title">Speak or Type Your Financial Request</h4>
              <p className="voice-welcome-desc">
                Record withdrawals, credit sales, expenses, or ask about balances and net worth. If something is missing —
                like the amount or how you paid — I'll ask. Every entry is previewed for confirmation before posting.
              </p>

              <div className="voice-chips-grid">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item.label}
                    className="voice-chip"
                    onClick={() => handleOption(item.query)}
                    type="button"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <React.Fragment key={turn.id}>
              <div className="voice-msg user">
                <div className="voice-bubble">
                  {turn.source === 'voice' && <Mic size={13} style={inlineIcon} />}
                  {turn.transcript}
                </div>
              </div>
              {(turn.response || turn.error) && (
                <div className="voice-msg assistant">
                  <div className="voice-bubble">
                    <div>{turn.response ? turn.response.spokenResponse : turn.error}</div>
                    {renderResponse(turn)}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Interim listening transcript */}
          {isListening && interimTranscript && (
            <div className="voice-msg user">
              <div className="voice-bubble" style={{ opacity: 0.8, fontStyle: 'italic' }}>
                <AudioLines size={13} style={inlineIcon} /> "{interimTranscript}..."
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
          <div className={`voice-live-status ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isListening ? (
                <Radio size={14} />
              ) : stage === 'COLLECTING' ? (
                <HelpCircle size={14} />
              ) : stage === 'AWAITING_CONFIRMATION' ? (
                <Zap size={14} />
              ) : null}
              {statusText}
            </span>
            {(isListening || isTranscribing) && (
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
              className={`voice-mic-main-btn ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}
              onClick={() => {
                clearError();
                toggleMic();
              }}
              title={isListening ? 'Stop Listening & Transcribe' : 'Start Voice Input'}
              aria-label={isListening ? 'Stop Listening & Transcribe' : 'Start Voice Input'}
              disabled={isTranscribing || isProcessing}
            >
              {isListening ? <Square size={18} /> : <Mic size={20} />}
            </button>

            <div className="voice-text-input-wrap">
              <input
                type="text"
                className="voice-text-input"
                placeholder={
                  stage === 'AWAITING_CONFIRMATION'
                    ? 'Type "confirm", "cancel", or a change…'
                    : stage === 'COLLECTING'
                    ? 'Type your answer…'
                    : 'Say or type e.g. "I made the withdrawal from the bank 5000"...'
                }
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  cancelAutoListen();
                  if (speechError) clearError();
                }}
                disabled={isProcessing}
              />
              <button type="submit" className="voice-send-btn" disabled={!inputVal.trim() || isProcessing}>
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Transaction Confirmation Popup Dialog Overlay */}
        {stage === 'AWAITING_CONFIRMATION' && preview && (
          <ConfirmTransactionDialog
            preview={preview}
            titleId="voice-popup-title"
            isProcessing={isProcessing}
            isListening={isListening}
            isTranscribing={isTranscribing}
            interimTranscript={interimTranscript}
            onConfirm={confirm}
            onCancel={cancel}
            onMicToggle={() => {
              clearError();
              toggleMic();
            }}
            onSubmitText={(text) => void send(text, 'text')}
            onTyping={cancelAutoListen}
          />
        )}
      </div>
    </div>
  );
};
