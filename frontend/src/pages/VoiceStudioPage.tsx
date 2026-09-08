import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { voiceApi, type VoiceProcessResponse } from '../api/voice';
import '../components/voice/VoiceAgentModal.css';
import './VoiceStudioPage.css';

interface LogItem {
  id: string;
  transcript: string;
  response: VoiceProcessResponse;
  timestamp: Date;
}

export const VoiceStudioPage: React.FC = () => {
  const [inputVal, setInputVal] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'transactions' | 'queries'>('all');
  const [pendingPreview, setPendingPreview] = useState<VoiceProcessResponse | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef<(text: string) => void>(() => {});

  const handleProcessText = useCallback(
    async (textToSend: string, forceExecute?: boolean) => {
      if (!textToSend.trim() || isProcessing) return;

      setIsProcessing(true);
      setInputVal('');

      try {
        const shouldExecute = forceExecute !== undefined ? forceExecute : false;
        const res = await voiceApi.process({ transcript: textToSend, execute: shouldExecute });
        const voiceData = res.data.data;

        const logItem: LogItem = {
          id: Date.now().toString(),
          transcript: textToSend,
          response: voiceData,
          timestamp: new Date(),
        };

        setLogs((prev) => [...prev, logItem]);

        // If preview mode, trigger pending confirmation popup
        if (voiceData.needsConfirmation || (voiceData.intent?.type === 'TRANSACTION' && !voiceData.executed && voiceData.data)) {
          setPendingPreview(voiceData);
        } else {
          setPendingPreview(null);
        }

        if (voiceData.spokenResponse) {
          speakRef.current(voiceData.spokenResponse);
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || 'Failed to process voice command.';
        speakRef.current(errorMsg);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const handleConfirmPending = () => {
    if (isProcessing) return;
    handleProcessText('confirm');
  };

  const handleCancelPending = () => {
    if (isProcessing) return;
    handleProcessText('cancel');
  };

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
  } = useSpeechRecognition({ onResult: handleProcessText });

  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // Auto-scroll log
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, isProcessing]);

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      stopSpeaking();
      startListening();
    }
  };

  const handlePromptClick = (text: string) => {
    clearError();
    setInputVal(text);
    handleProcessText(text);
  };

  const filteredLogs = logs.filter((l) => {
    if (activeTab === 'transactions') return l.response.intent.type === 'TRANSACTION';
    if (activeTab === 'queries') return l.response.intent.type === 'QUERY';
    return true;
  });

  return (
    <div className="page voice-studio-page">
      {/* Page Header */}
      <header className="voice-studio-header">
        <div className="voice-studio-title-wrap">
          <div className="voice-studio-title-row">
            <h1 className="voice-studio-title">
              <span>🎙️</span> Voice Agent Studio
            </h1>
            <span className="voice-live-pill">
              <span className="voice-live-dot" />
              Live Ledger AI
            </span>
          </div>
          <p className="voice-studio-subtitle">
            Natural language conversational interface powered by zero-discrepancy double-entry ledgers.
          </p>
        </div>

        <div className="voice-studio-header-actions">
          <button
            className={`voice-audio-toggle-btn ${voiceEnabled ? 'active' : ''}`}
            onClick={toggleVoiceAudio}
            title={voiceEnabled ? 'Mute Speech Synthesis' : 'Unmute Speech Synthesis'}
            type="button"
          >
            <span>{voiceEnabled ? '🔊' : '🔇'}</span>
            <span>{voiceEnabled ? 'Audio Speech Synthesis: ON' : 'Audio Speech Synthesis: OFF'}</span>
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
              {isListening && <div className="voice-mic-ripple" />}
              <button
                type="button"
                className={`voice-cockpit-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={handleMicToggle}
                title={isListening ? 'Stop Listening' : 'Start Voice Dictation'}
                aria-label={isListening ? 'Stop Listening' : 'Start Voice Dictation'}
              >
                {isListening ? '⏹' : '🎙️'}
              </button>
            </div>

            <h2 className="voice-cockpit-title">
              {isListening
                ? 'Listening to your voice...'
                : isProcessing
                ? 'Processing Command...'
                : 'Click Mic to Speak or Type Below'}
            </h2>

            <p className="voice-cockpit-desc">
              {isListening
                ? 'Speak naturally: "Paid 500 for lunch from Cash", "Sharma paid 5000 in bank", or "What is my bank balance?"'
                : isSupported
                ? 'Web Speech API is ready. Press microphone to dictate or type commands.'
                : 'Speech recognition not supported in this browser. Please type commands below.'}
            </p>

            {/* Soundwave Equalizer when active */}
            {(isListening || isSpeaking || isProcessing) && (
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
                🎙️ "{interimTranscript}..."
              </div>
            )}

            {/* Speech Error Banner */}
            {speechError && (
              <div className="voice-cockpit-error">
                <span>ℹ️ {speechError}</span>
                <button
                  type="button"
                  onClick={clearError}
                  className="voice-cockpit-error-dismiss"
                  title="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Text Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleProcessText(inputVal);
              }}
              className="voice-cockpit-input-form"
            >
              <div className="voice-cockpit-input-box">
                <input
                  type="text"
                  className="voice-cockpit-input-field"
                  placeholder='Say or type e.g. "Paid 500 for lunch from Cash"...'
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    if (speechError) clearError();
                  }}
                  disabled={isProcessing}
                />
                <button
                  type="submit"
                  className="voice-cockpit-exec-btn"
                  disabled={!inputVal.trim() || isProcessing}
                >
                  {isProcessing ? 'Processing...' : 'Execute'}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Voice Prompts */}
          <div className="voice-prompts-card">
            <div className="voice-prompts-header">
              <h3 className="voice-prompts-title">
                <span>⚡</span> Quick Voice Prompts
              </h3>
              <span className="voice-prompts-hint">Click any prompt to run</span>
            </div>

            <div className="voice-prompts-group">
              <span className="voice-prompts-group-label">💳 Transactions & Vouchers</span>
              <div className="voice-prompts-chips-wrap">
                {[
                  'Paid 500 for lunch from Cash',
                  'Sharma paid 5000 in bank',
                  'Withdrew 2000 from Bank',
                  'Purchased office stationery for 1200 on credit',
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="voice-prompt-pill"
                    onClick={() => handlePromptClick(sample)}
                  >
                    ⚡ {sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="voice-prompts-group" style={{ marginTop: '4px' }}>
              <span className="voice-prompts-group-label">📊 Balances & Financial Queries</span>
              <div className="voice-prompts-chips-wrap">
                {[
                  'What is my bank balance?',
                  'What is my net worth?',
                  'What is my cash balance?',
                  'Show total expense this month',
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="voice-prompt-pill"
                    onClick={() => handlePromptClick(sample)}
                  >
                    🔍 {sample}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Trust & Security Badges */}
          <div className="voice-trust-grid">
            <div className="voice-trust-card">
              <span className="voice-trust-icon">🛡️</span>
              <div className="voice-trust-info">
                <span className="voice-trust-name">Prompt Guard</span>
                <span className="voice-trust-desc">Real-time injection sanitization before LLM reasoning.</span>
              </div>
            </div>

            <div className="voice-trust-card">
              <span className="voice-trust-icon">⚖️</span>
              <div className="voice-trust-info">
                <span className="voice-trust-name">Double-Entry</span>
                <span className="voice-trust-desc">Strict Dr = Cr mathematical parity check on every voucher.</span>
              </div>
            </div>

            <div className="voice-trust-card">
              <span className="voice-trust-icon">🔐</span>
              <div className="voice-trust-info">
                <span className="voice-trust-name">2-Step Verify</span>
                <span className="voice-trust-desc">Confirmation preview dialog protects financial ledger state.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Live Execution Stream */}
        <section className="voice-studio-feed">
          <div className="voice-feed-header">
            <div className="voice-feed-title-wrap">
              <h3 className="voice-feed-title">Live Execution Feed</h3>
              <span className="voice-feed-count-badge">{logs.length}</span>
            </div>

            <div className="voice-feed-controls">
              <button
                className={`voice-feed-filter-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
                type="button"
              >
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

              {logs.length > 0 && (
                <button
                  type="button"
                  className="voice-feed-clear-btn"
                  onClick={() => setLogs([])}
                  title="Clear feed history"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div ref={terminalRef} className="voice-feed-list">
            {filteredLogs.length === 0 && (
              <div className="voice-feed-empty">
                <div className="voice-feed-empty-orb">📡</div>
                <h4 className="voice-feed-empty-title">Ready for Voice Commands</h4>
                <p className="voice-feed-empty-desc">
                  Dictate or type transactions and queries. Real-time vouchers, debit/credit journal breakdowns, and balance reports will stream here.
                </p>
              </div>
            )}

            {filteredLogs.map((item) => (
              <div key={item.id} className="voice-feed-item">
                <div className="voice-feed-item-top">
                  <span className="voice-feed-prompt-pill">
                    🗣️ "{item.transcript}"
                  </span>
                  <span className="voice-feed-timestamp">
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                </div>

                <div className="voice-feed-response-text">
                  {item.response.spokenResponse}
                </div>

                {/* Preview Transaction Details with Confirmation Actions */}
                {item.response.needsConfirmation && item.response.data && (
                  <div className="voice-card preview" style={{ marginTop: 6 }}>
                    <div className="voice-card-header">
                      <span className="voice-card-badge preview">
                        ⚠️ PREVIEW: {item.response.data.voucherType || 'VOUCHER'}
                      </span>
                      <span className="voice-card-amount">
                        {item.response.data.formattedAmount || `₹${item.response.data.amount}`}
                      </span>
                    </div>
                    <div className="voice-card-split">
                      <div className="voice-card-split-item">
                        <div className="label">Debit (Dr)</div>
                        <div className="val">{item.response.data.debitAccount}</div>
                      </div>
                      <div className="voice-card-split-item">
                        <div className="label">Credit (Cr)</div>
                        <div className="val">{item.response.data.creditAccount}</div>
                      </div>
                    </div>
                    {item.response.data.narration && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        📝 {item.response.data.narration}
                      </div>
                    )}
                    <div className="voice-confirm-actions" style={{ marginTop: 8 }}>
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

                {/* Executed Transaction Details */}
                {item.response.executed && item.response.intent.type === 'TRANSACTION' && item.response.data && (
                  <div className="voice-card-split" style={{ marginTop: 4 }}>
                    <div className="voice-card-split-item">
                      <div className="label">Voucher & Amount</div>
                      <div className="val" style={{ color: '#38bdf8' }}>
                        {item.response.data.voucherType} — {item.response.data.formattedAmount || `₹${item.response.data.amount}`}
                      </div>
                    </div>
                    <div className="voice-card-split-item">
                      <div className="label">Dr ➔ Cr Split</div>
                      <div className="val">
                        {item.response.data.debitAccount} (Dr) ➔ {item.response.data.creditAccount} (Cr)
                      </div>
                    </div>
                  </div>
                )}

                {/* Query Details */}
                {item.response.intent.type === 'QUERY' && item.response.data && (
                  <div className="voice-card-split" style={{ marginTop: 4 }}>
                    <div className="voice-card-split-item">
                      <div className="label">Metric Target</div>
                      <div className="val">{item.response.displayTitle}</div>
                    </div>
                    <div className="voice-card-split-item">
                      <div className="label">Balance / Value</div>
                      <div className="val" style={{ color: '#22c55e' }}>
                        {item.response.data.formattedBalance ||
                          item.response.data.formattedNetWorth ||
                          item.response.data.formattedTotalExpense ||
                          item.response.data.formattedTotalRevenue ||
                          `₹${item.response.data.amount || 0}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Transaction Confirmation Popup Dialog Overlay */}
      {pendingPreview && pendingPreview.data && (
        <div
          className="voice-popup-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-popup-title"
        >
          <div className="voice-popup-dialog">
            <div className="voice-popup-header">
              <div className="voice-popup-badge-wrap">
                <span className="voice-popup-badge-icon">⚡</span>
                <div>
                  <h4 id="studio-popup-title" className="voice-popup-title">
                    Confirm Transaction
                  </h4>
                  <p className="voice-popup-subtitle">Review before recording into double-entry ledger</p>
                </div>
              </div>
              <button
                type="button"
                className="voice-popup-close-btn"
                onClick={handleCancelPending}
                disabled={isProcessing}
                title="Cancel Transaction"
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>

            <div className="voice-popup-body">
              <div className="voice-popup-question-banner">
                <span className="voice-popup-question-icon">❓</span>
                <span>Do you want to proceed with this transaction?</span>
              </div>

              <div className="voice-popup-summary-card">
                <div className="voice-popup-summary-top">
                  <span
                    className={`voice-card-badge ${
                      pendingPreview.data.voucherType?.toLowerCase() || 'journal'
                    }`}
                  >
                    {pendingPreview.data.voucherType || 'TRANSACTION'} VOUCHER
                  </span>
                  <span className="voice-popup-amount">
                    {pendingPreview.data.formattedAmount || `₹${pendingPreview.data.amount}`}
                  </span>
                </div>

                <div className="voice-popup-ledger-grid">
                  <div className="voice-popup-ledger-box debit">
                    <span className="ledger-tag dr">Debit (Dr)</span>
                    <span className="ledger-account-name">{pendingPreview.data.debitAccount}</span>
                  </div>
                  <div className="voice-popup-arrow">➔</div>
                  <div className="voice-popup-ledger-box credit">
                    <span className="ledger-tag cr">Credit (Cr)</span>
                    <span className="ledger-account-name">{pendingPreview.data.creditAccount}</span>
                  </div>
                </div>

                {pendingPreview.data.narration && (
                  <div className="voice-popup-narration-box">
                    <span className="narration-icon">📝</span>
                    <span className="narration-text">{pendingPreview.data.narration}</span>
                  </div>
                )}

                {pendingPreview.data.warning && (
                  <div className="voice-popup-warning-box">
                    <span>⚡</span>
                    <span>{pendingPreview.data.warning}</span>
                  </div>
                )}
              </div>

              <div className="voice-popup-voice-hint">
                🎙️ Speak <strong>"Yes"</strong> / <strong>"Confirm"</strong>, or <strong>"Cancel"</strong> / <strong>"No"</strong>
              </div>
            </div>

            <div className="voice-popup-footer">
              <button
                type="button"
                className="voice-popup-btn confirm"
                onClick={handleConfirmPending}
                disabled={isProcessing}
              >
                {isProcessing ? 'Posting...' : '✓ Yes, Confirm & Post'}
              </button>
              <button
                type="button"
                className="voice-popup-btn cancel"
                onClick={handleCancelPending}
                disabled={isProcessing}
              >
                ✕ No, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
