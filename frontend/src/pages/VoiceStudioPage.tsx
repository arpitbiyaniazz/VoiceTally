import React, { useState, useEffect, useRef } from 'react';
import { useVoiceConversation } from '../hooks/useVoiceConversation';
import {
  ClarificationCard,
  ConfirmTransactionDialog,
  PreviewNotes,
  SuggestionChips,
} from '../components/voice/VoiceConversationParts';
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Zap,
  CreditCard,
  BarChart3,
  Search,
  FileText,
  Check,
  X,
  HelpCircle,
  AlertTriangle,
  AudioLines,
  Info,
  Radio,
  MessageSquare,
} from 'lucide-react';
import '../components/voice/VoiceAgentModal.css';
import './VoiceStudioPage.css';

const inlineIcon = { display: 'inline', verticalAlign: 'middle', marginRight: 4 } as const;

export const VoiceStudioPage: React.FC = () => {
  const [inputVal, setInputVal] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'transactions' | 'queries'>('all');
  const terminalRef = useRef<HTMLDivElement>(null);

  const { turns, isProcessing, stage, clarification, preview, send, confirm, cancel, clearTurns, toggleMic, cancelAutoListen, speech } =
    useVoiceConversation();
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

  // Auto-scroll log
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [turns, isProcessing]);

  const answeredTurns = turns.filter((t) => t.response);
  const lastTurnId = turns[turns.length - 1]?.id;

  const handlePromptClick = (text: string) => {
    clearError();
    void send(text, 'option');
  };

  const filteredTurns = answeredTurns.filter((t) => {
    const type = t.response!.intent.type;
    if (activeTab === 'transactions') {
      return type === 'TRANSACTION' || type === 'CLARIFICATION' || type === 'DETAILS' || (t.response!.executed && !!t.response!.data?.voucherId);
    }
    if (activeTab === 'queries') return type === 'QUERY';
    return true;
  });

  return (
    <div className="page voice-studio-page">
      {/* Page Header */}
      <header className="voice-studio-header">
        <div className="voice-studio-title-wrap">
          <div className="voice-studio-title-row">
            <h1 className="voice-studio-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mic size={26} /> Voice Agent Studio
            </h1>
            <span className="voice-live-pill">
              <span className="voice-live-dot" />
              Live Ledger AI
            </span>
          </div>
          <p className="voice-studio-subtitle">
            Voice engine powered by Voxtral (STT: {sttModel} • TTS: {ttsModel} • Female voice: {voiceLabel}). Incomplete
            requests get a follow-up question; every voucher is double-entry and previewed before posting.
          </p>
        </div>

        <div className="voice-studio-header-actions">
          <button
            className={`voice-audio-toggle-btn ${voiceEnabled ? 'active' : ''}`}
            onClick={toggleVoiceAudio}
            title={voiceEnabled ? 'Mute Speech Synthesis' : 'Unmute Speech Synthesis'}
            type="button"
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{voiceEnabled ? `Voxtral Female TTS (${ttsModel}): ON` : `Voxtral Female TTS (${ttsModel}): OFF`}</span>
          </button>
        </div>
      </header>

      {/* 2-Column Workstation Grid */}
      <div className="voice-studio-grid">
        {/* Left Column: Command & Voice Cockpit */}
        <section className="voice-studio-cockpit">
          {/* Main Hero Dictation Card */}
          <div className="voice-cockpit-hero">
            <div className="voice-cockpit-glow" />

            <div className="voice-mic-trigger-wrap">
              {(isListening || isTranscribing) && <div className="voice-mic-ripple" />}
              <button
                type="button"
                className={`voice-cockpit-mic-btn ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                onClick={() => {
                  clearError();
                  toggleMic();
                }}
                title={isListening ? 'Stop Listening & Transcribe' : 'Start Voice Dictation'}
                aria-label={isListening ? 'Stop Listening & Transcribe' : 'Start Voice Dictation'}
                disabled={isTranscribing || isProcessing}
              >
                {isListening ? <Square size={22} fill="currentColor" /> : <Mic size={26} />}
              </button>
            </div>

            <h2 className="voice-cockpit-title">
              {isTranscribing
                ? 'Transcribing your request...'
                : isListening
                ? 'Listening...'
                : isSpeaking
                ? 'Speaking...'
                : isProcessing
                ? 'Processing Command...'
                : stage === 'COLLECTING'
                ? 'Waiting for Your Answer'
                : stage === 'AWAITING_CONFIRMATION'
                ? 'Ready to Post'
                : 'Click Mic to Speak or Type Below'}
            </h2>

            <p className="voice-cockpit-desc">
              {isTranscribing
                ? `Voxtral speech-to-text (${sttModel}) is transcribing your accounting request.`
                : isListening
                ? "Speak naturally — recording stops by itself when you pause. Tap the button to finish now."
                : stage === 'COLLECTING'
                ? 'Answer the question below by voice, by typing, or by tapping an option.'
                : stage === 'AWAITING_CONFIRMATION'
                ? 'Say "yes" to post, "cancel", or what to change (e.g. "make it 600").'
                : isSupported
                ? 'Ready for voice commands. Say a transaction or ask about a balance.'
                : 'Speech recognition not supported in this browser. Please type commands below.'}
            </p>

            {/* Soundwave Equalizer when active */}
            {(isListening || isSpeaking || isProcessing || isTranscribing) && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div className="voice-wave-container" style={{ height: '36px', gap: '6px' }}>
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                  <div className="voice-wave-bar" style={{ width: 6 }} />
                </div>
              </div>
            )}

            {/* Live Interim Transcript */}
            {isListening && interimTranscript && (
              <div className="voice-cockpit-interim">
                <AudioLines size={14} style={inlineIcon} /> "{interimTranscript}..."
              </div>
            )}

            {/* Speech Error Banner */}
            {speechError && (
              <div className="voice-cockpit-error">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Info size={14} /> {speechError}
                </span>
                <button type="button" onClick={clearError} className="voice-cockpit-error-dismiss" title="Dismiss notification">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* The question the assistant is waiting on */}
            {stage === 'COLLECTING' && clarification && (
              <div className="voice-active-question">
                <ClarificationCard
                  clarification={clarification}
                  interactive
                  showQuestion
                  disabled={isProcessing}
                  onSelect={handlePromptClick}
                />
              </div>
            )}

            {/* Text Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inputVal.trim()) return;
                void send(inputVal, 'text');
                setInputVal('');
              }}
              className="voice-cockpit-input-form"
            >
              <div className="voice-cockpit-input-box">
                <input
                  type="text"
                  className="voice-cockpit-input-field"
                  placeholder={
                    stage === 'COLLECTING'
                      ? 'Say or type your answer...'
                      : stage === 'AWAITING_CONFIRMATION'
                      ? 'Say or type "confirm", "cancel", or a change...'
                      : 'Say or type e.g. "Paid 500 for lunch from Cash"...'
                  }
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    cancelAutoListen();
                    if (speechError) clearError();
                  }}
                  disabled={isProcessing}
                />
                <button type="submit" className="voice-cockpit-exec-btn" disabled={!inputVal.trim() || isProcessing}>
                  {isProcessing ? 'Processing...' : 'Execute'}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Voice Prompts */}
          <div className="voice-prompts-card">
            <div className="voice-prompts-header">
              <h3 className="voice-prompts-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={16} /> Quick Voice Prompts
              </h3>
              <span className="voice-prompts-hint">Click any prompt to run</span>
            </div>

            <div className="voice-prompts-group">
              <span className="voice-prompts-group-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={14} /> Transactions & Vouchers
              </span>
              <div className="voice-prompts-chips-wrap">
                {[
                  'Paid 500 for lunch from Cash',
                  'Sharma paid 5000 in bank',
                  'Withdrew 2000 from Bank',
                  'Purchased office stationery for 1200 on credit',
                ].map((sample) => (
                  <button key={sample} type="button" className="voice-prompt-pill" onClick={() => handlePromptClick(sample)}>
                    <Zap size={12} style={inlineIcon} />
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="voice-prompts-group" style={{ marginTop: '4px' }}>
              <span className="voice-prompts-group-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} /> Incomplete — the assistant will ask
              </span>
              <div className="voice-prompts-chips-wrap">
                {['Paid 800 for dinner', 'Gave money to Rahul', 'Rahul 5000'].map((sample) => (
                  <button key={sample} type="button" className="voice-prompt-pill" onClick={() => handlePromptClick(sample)}>
                    <HelpCircle size={12} style={inlineIcon} />
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="voice-prompts-group" style={{ marginTop: '4px' }}>
              <span className="voice-prompts-group-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={14} /> Balances & Financial Queries
              </span>
              <div className="voice-prompts-chips-wrap">
                {['What is my bank balance?', 'What is my net worth?', 'What is my cash balance?', 'Show total expense this month'].map(
                  (sample) => (
                    <button key={sample} type="button" className="voice-prompt-pill" onClick={() => handlePromptClick(sample)}>
                      <Search size={12} style={inlineIcon} />
                      {sample}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Live Execution Stream */}
        <section className="voice-studio-feed">
          <div className="voice-feed-header">
            <div className="voice-feed-title-wrap">
              <h3 className="voice-feed-title">Live Execution Feed</h3>
              <span className="voice-feed-count-badge">{answeredTurns.length}</span>
            </div>

            <div className="voice-feed-controls">
              <button className={`voice-feed-filter-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')} type="button">
                All
              </button>
              <button
                className={`voice-feed-filter-btn ${activeTab === 'transactions' ? 'active' : ''}`}
                onClick={() => setActiveTab('transactions')}
                type="button"
              >
                Vouchers
              </button>
              <button
                className={`voice-feed-filter-btn ${activeTab === 'queries' ? 'active' : ''}`}
                onClick={() => setActiveTab('queries')}
                type="button"
              >
                Queries
              </button>

              {turns.length > 0 && (
                <button type="button" className="voice-feed-clear-btn" onClick={clearTurns} title="Clear feed history">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div ref={terminalRef} className="voice-feed-list">
            {filteredTurns.length === 0 && (
              <div className="voice-feed-empty">
                <div className="voice-feed-empty-orb">
                  <Radio size={26} />
                </div>
                <h4 className="voice-feed-empty-title">Ready for Voice Commands</h4>
                <p className="voice-feed-empty-desc">
                  Dictate or type transactions and queries. Real-time vouchers, debit/credit journal breakdowns, and balance reports will
                  stream here.
                </p>
              </div>
            )}

            {filteredTurns.map((turn) => {
              const res = turn.response!;
              const data = res.data;
              const isLatest = turn.id === lastTurnId;
              const turnClarification =
                res.clarification ?? (res.conversation?.stage === 'COLLECTING' ? res.conversation.clarification : undefined);

              return (
                <div key={turn.id} className="voice-feed-item">
                  <div className="voice-feed-item-top">
                    <span className="voice-feed-prompt-pill">
                      {turn.source === 'voice' ? <Mic size={12} style={inlineIcon} /> : <MessageSquare size={12} style={inlineIcon} />}
                      {`"${turn.transcript}"`}
                    </span>
                    <span className="voice-feed-timestamp">{turn.timestamp.toLocaleTimeString()}</span>
                  </div>

                  <div className="voice-feed-response-text">{res.spokenResponse}</div>

                  {/* Follow-up question: what has been captured so far */}
                  {turnClarification && (
                    <ClarificationCard clarification={turnClarification} interactive={false} onSelect={handlePromptClick} />
                  )}

                  {/* Preview Transaction Details with Confirmation Actions */}
                  {res.needsConfirmation && data && (
                    <div className="voice-card preview" style={{ marginTop: 6 }}>
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
                        <div
                          style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <FileText size={13} /> {data.narration}
                        </div>
                      )}
                      <PreviewNotes preview={data} />
                      {isLatest && stage === 'AWAITING_CONFIRMATION' && (
                        <div className="voice-confirm-actions" style={{ marginTop: 8 }}>
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

                  {/* Executed Transaction Details */}
                  {res.executed && (res.intent.type === 'TRANSACTION' || data?.voucherId) && data && (
                    <div className="voice-card-split" style={{ marginTop: 4 }}>
                      <div className="voice-card-split-item">
                        <div className="label">Voucher & Amount</div>
                        <div className="val" style={{ color: '#38bdf8' }}>
                          {data.voucherType} — {data.formattedAmount || `₹${data.amount}`}
                        </div>
                      </div>
                      <div className="voice-card-split-item">
                        <div className="label">Dr → Cr Split</div>
                        <div className="val">
                          {data.debitAccount} (Dr) → {data.creditAccount} (Cr)
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Query Details */}
                  {res.intent.type === 'QUERY' && data && (
                    <div className="voice-card-split" style={{ marginTop: 4 }}>
                      <div className="voice-card-split-item">
                        <div className="label">Metric Target</div>
                        <div className="val">{res.displayTitle}</div>
                      </div>
                      <div className="voice-card-split-item">
                        <div className="label">Balance / Value</div>
                        <div className="val" style={{ color: '#22c55e' }}>
                          {data.formattedBalance ||
                            data.formattedNetWorth ||
                            data.formattedTotalExpense ||
                            data.formattedTotalRevenue ||
                            `₹${data.amount || 0}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {isLatest && res.intent.type === 'UNKNOWN' && Array.isArray(data?.suggestions) && data.suggestions.length > 0 && (
                    <SuggestionChips suggestions={data.suggestions} disabled={isProcessing} onSelect={handlePromptClick} />
                  )}
                </div>
              );
            })}

            {turns
              .filter((t) => t.error)
              .slice(-1)
              .map((t) => (
                <div key={t.id} className="voice-feed-item">
                  <div className="voice-feed-response-text" style={{ color: 'var(--color-danger)' }}>
                    {t.error}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      {/* Transaction Confirmation Popup Dialog Overlay */}
      {stage === 'AWAITING_CONFIRMATION' && preview && (
        <ConfirmTransactionDialog
          preview={preview}
          titleId="studio-popup-title"
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
  );
};
