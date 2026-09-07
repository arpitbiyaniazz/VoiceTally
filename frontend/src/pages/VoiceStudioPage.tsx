import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { voiceApi, type VoiceProcessResponse } from '../api/voice';
import '../components/voice/VoiceAgentModal.css';

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
  const terminalRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef<(text: string) => void>(() => {});

  const handleProcessText = useCallback(async (textToSend: string) => {
    if (!textToSend.trim() || isProcessing) return;

    setIsProcessing(true);
    setInputVal('');

    try {
      const res = await voiceApi.process({ transcript: textToSend, execute: true });
      const voiceData = res.data.data;

      const logItem: LogItem = {
        id: Date.now().toString(),
        transcript: textToSend,
        response: voiceData,
        timestamp: new Date(),
      };

      setLogs((prev) => [...prev, logItem]);

      if (voiceData.spokenResponse) {
        speakRef.current(voiceData.spokenResponse);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to process voice command.';
      speakRef.current(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

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

  const commandPlaybook = [
    {
      category: '🏧 Banking & Contra',
      description: 'Cash withdrawals, deposits, and bank transfers',
      examples: [
        { label: 'Bank Withdrawal', text: 'i made the withdrawal from the bank 10000' },
        { label: 'Cash Deposit', text: 'deposited 8000 cash into bank' },
      ],
    },
    {
      category: '🛍️ Debtor & Sales on Credit',
      description: 'Track customer purchases and receivables',
      examples: [
        { label: 'Client Credit Purchase', text: 'Rahul bought laptop for 45000' },
        { label: 'Cash Collection', text: 'i take 5000 muny from Rahul in cash' },
        { label: 'Bank Settlement', text: 'Vikram paid 15000 via bank transfer' },
      ],
    },
    {
      category: '💳 Payments & Creditors',
      description: 'Vendor bills, office expenses, and supplier credit',
      examples: [
        { label: 'Direct Expense', text: 'paid 3500 for electricity bill using Bank' },
        { label: 'Cash Expense', text: 'spent 650 on office snacks using cash' },
        { label: 'Vendor Credit Purchase', text: 'purchased 20000 inventory from Sharma on credit' },
      ],
    },
    {
      category: '📊 Inquiries & Intelligence',
      description: 'Ask instant queries on balances, debts, and net worth',
      examples: [
        { label: 'Bank Balance', text: 'what is the bank balance' },
        { label: 'Cash In Hand', text: 'how much cash do i have' },
        { label: 'Customer Balance', text: 'how much does Rahul owe me' },
        { label: 'Net Worth', text: 'what is my net worth' },
        { label: 'Monthly Expenses', text: 'how much did i spend this month' },
      ],
    },
  ];

  const filteredLogs = logs.filter((l) => {
    if (activeTab === 'transactions') return l.response.intent.type === 'TRANSACTION';
    if (activeTab === 'queries') return l.response.intent.type === 'QUERY';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎙️</span> Voice Agent Studio
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.95rem' }}>
            Natural language conversational interface powered by zero-discrepancy double-entry ledgers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className={`voice-btn-icon ${voiceEnabled ? 'active' : ''}`}
            onClick={toggleVoiceAudio}
            title={voiceEnabled ? 'Mute Speech Synthesis' : 'Unmute Speech Synthesis'}
            type="button"
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
          >
            {voiceEnabled ? '🔊 Audio Speech Synthesis: ON' : '🔇 Audio: OFF'}
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 'var(--space-xl)' }}>
        
        {/* Left Column: Live Mic Console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-xl)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Background Glow */}
            <div
              style={{
                position: 'absolute',
                top: '-50px',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ marginBottom: 'var(--space-md)' }}>
              <button
                type="button"
                className={`voice-mic-main-btn ${isListening ? 'listening' : ''}`}
                onClick={handleMicToggle}
                style={{ width: '84px', height: '84px', fontSize: '2.2rem', margin: '0 auto' }}
                title={isListening ? 'Stop Listening' : 'Start Voice Input'}
              >
                {isListening ? '⏹' : '🎙️'}
              </button>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
              {isListening ? 'Listening to your voice...' : 'Click Mic to Speak or Type Below'}
            </h3>
            
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '0 0 var(--space-lg) 0', maxWidth: '420px' }}>
              {isListening
                ? 'Speak naturally: "I made the withdrawal from the bank 5000", "Rahul bought goods for 12000", or "What is my bank balance?"'
                : isSupported
                ? 'Web Speech API is ready. Press microphone to dictate or type commands.'
                : 'Speech recognition not supported in this browser. Please type commands below.'}
            </p>

            {/* Soundwave Animation during active state */}
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
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  color: '#818cf8',
                  fontSize: '0.9rem',
                  fontStyle: 'italic',
                  marginBottom: 'var(--space-md)',
                  width: '100%',
                }}
              >
                🎙️ "{interimTranscript}..."
              </div>
            )}

            {speechError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: 'var(--space-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <span>ℹ️ {speechError}</span>
                <button
                  type="button"
                  onClick={clearError}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '2px 6px',
                  }}
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
              style={{ width: '100%', display: 'flex', gap: 'var(--space-sm)' }}
            >
              <div className="voice-text-input-wrap" style={{ width: '100%' }}>
                <input
                  type="text"
                  className="voice-text-input"
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
                  className="voice-send-btn"
                  disabled={!inputVal.trim() || isProcessing}
                >
                  {isProcessing ? 'Processing...' : 'Execute'}
                </button>
              </div>
            </form>

            {/* Quick One-Tap Test Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'var(--space-sm)', justifyContent: 'center', width: '100%' }}>
              {[
                'Paid 500 for lunch from Cash',
                'Sharma paid 5000 in bank',
                'Withdrew 2000 from Bank',
                'What is my bank balance?',
                'What is my net worth?',
              ].map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    clearError();
                    setInputVal(sample);
                    handleProcessText(sample);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '20px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                >
                  ⚡ {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Activity / Transaction Stream */}
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-md)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                Live Execution Feed ({logs.length})
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`voice-btn-icon ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                  type="button"
                >
                  All
                </button>
                <button
                  className={`voice-btn-icon ${activeTab === 'transactions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transactions')}
                  type="button"
                >
                  Vouchers
                </button>
                <button
                  className={`voice-btn-icon ${activeTab === 'queries' ? 'active' : ''}`}
                  onClick={() => setActiveTab('queries')}
                  type="button"
                >
                  Queries
                </button>
              </div>
            </div>

            <div
              ref={terminalRef}
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-md)',
                paddingRight: '4px',
              }}
            >
              {filteredLogs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                  No voice commands processed in this session yet. Speak or select a command from the playbook.
                </div>
              )}

              {filteredLogs.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                      🗣️ "{item.transcript}"
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {item.timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    {item.response.spokenResponse}
                  </div>

                  {/* Transaction Details */}
                  {item.response.intent.type === 'TRANSACTION' && item.response.data && (
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
          </div>
        </div>

        {/* Right Column: Voice Command Playbook */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{ padding: '0 var(--space-xs)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 4px 0' }}>
              📚 Voice Command Playbook
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Click any sample prompt below to execute instantly or say it into your microphone.
            </p>
          </div>

          {commandPlaybook.map((group, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 2px 0', color: 'var(--color-text-primary)' }}>
                  {group.category}
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {group.description}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.examples.map((ex, exIdx) => (
                  <button
                    key={exIdx}
                    type="button"
                    onClick={() => handleProcessText(ex.text)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.84rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                      e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                    }}
                  >
                    <span>🎙️ "{ex.text}"</span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {ex.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
