import React, { useState, useEffect, useRef } from 'react';
import { integrationsApi } from '../api/ledger';
import './IntegrationsPage.css';

interface IntegrationStatus {
  phone: string | null;
  isPhoneLinked: boolean;
  telegramChatId: string | null;
  isTelegramLinked: boolean;
  pairingCode: string;
  whatsappBotNumber: string;
  telegramBotUsername: string;
  webhookUrls: {
    whatsapp: string;
    telegram: string;
  };
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isVoice?: boolean;
  previewCard?: any;
  quickReplies?: string[];
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
}

export const IntegrationsPage: React.FC = () => {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Simulator State
  const [simChannel, setSimChannel] = useState<'WHATSAPP' | 'TELEGRAM'>('WHATSAPP');
  const [simMessages, setSimMessages] = useState<ChatMessage[]>([]);
  const [simInput, setSimInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVoiceSim, setIsVoiceSim] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    // Initial bot welcome message
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (simChannel === 'WHATSAPP') {
      setSimMessages([
        {
          id: 'w1',
          sender: 'bot',
          text: `👋 Hello! I am your VoiceTally WhatsApp Ledger Companion.\n\nYou can send voice notes or text commands like:\n• "Paid ₹500 for lunch from Cash"\n• "Sharma ji paid 5000 in bank"\n• "What is my bank balance?"`,
          time: now,
          quickReplies: ['What is my bank balance?', 'What is my cash balance?', 'Show recent transactions'],
        },
      ]);
    } else {
      setSimMessages([
        {
          id: 't1',
          sender: 'bot',
          text: `⚡ <b>VoiceTally Telegram Bot</b> ready!\n\nUse quick commands:\n/bank — Check bank balance\n/cash — Check cash balance\n/pnl — Monthly profit & loss\n/recent — Last transactions`,
          time: now,
          inlineKeyboard: [
            [
              { text: '🏦 Bank Balance', callback_data: '/bank' },
              { text: '💵 Cash in Hand', callback_data: '/cash' },
            ],
            [
              { text: '📈 Profit & Loss', callback_data: '/pnl' },
              { text: '🕒 Recent Vouchers', callback_data: '/recent' },
            ],
          ],
        },
      ]);
    }
  }, [simChannel]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [simMessages]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await integrationsApi.getStatus();
      if (res.data.success) {
        setStatus(res.data.data);
        if (res.data.data.phone) {
          setPhoneInput(res.data.data.phone);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load integration settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (status?.pairingCode) {
      navigator.clipboard.writeText(status.pairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleGenerateNewCode = async () => {
    try {
      const res = await integrationsApi.generatePairingCode();
      if (res.data.success && status) {
        setStatus({ ...status, pairingCode: res.data.data.pairingCode });
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate new code');
    }
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;

    try {
      setIsSavingPhone(true);
      const res = await integrationsApi.linkPhone(phoneInput.trim());
      if (res.data.success && status) {
        setStatus({ ...status, phone: res.data.data.phone, isPhoneLinked: true });
        alert('✅ WhatsApp phone number linked successfully!');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to link phone number');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleUnlink = async (channel: 'WHATSAPP' | 'TELEGRAM') => {
    if (!window.confirm(`Are you sure you want to disconnect ${channel}?`)) return;

    try {
      await integrationsApi.unlinkChannel(channel);
      if (status) {
        if (channel === 'WHATSAPP') {
          setStatus({ ...status, phone: null, isPhoneLinked: false });
          setPhoneInput('');
        } else {
          setStatus({ ...status, telegramChatId: null, isTelegramLinked: false });
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.error || `Failed to unlink ${channel}`);
    }
  };

  const handleSendMessage = async (customText?: string, isVoiceNote?: boolean) => {
    const textToSend = (customText || simInput).trim();
    if (!textToSend || isSending) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time,
      isVoice: isVoiceNote ?? isVoiceSim,
    };

    setSimMessages((prev) => [...prev, userMsg]);
    if (!customText) setSimInput('');
    setIsSending(true);

    try {
      const res = await integrationsApi.simulateChat(simChannel, textToSend, isVoiceNote ?? isVoiceSim);
      if (res.data.success && res.data.data) {
        const reply = res.data.data;
        const botMsg: ChatMessage = {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: reply.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          previewCard: reply.previewCard,
          quickReplies: reply.quickReplies,
          inlineKeyboard: reply.inlineKeyboard,
        };
        setSimMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'bot',
        text: `⚠️ Error: ${err.response?.data?.error || 'Failed to communicate with bot service'}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setSimMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container integrations-page">
        <div className="skeleton-loader" style={{ height: 200, borderRadius: 20, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="skeleton-loader" style={{ height: 400, borderRadius: 20 }} />
          <div className="skeleton-loader" style={{ height: 400, borderRadius: 20 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container integrations-page">
      {/* ─── Page Header ────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">💬 WhatsApp & Telegram Companion Bots</h1>
          <p className="page-subtitle">
            Log double-entry vouchers and check real-time account balances directly from WhatsApp & Telegram
          </p>
        </div>
        <div className="integrations-header-controls">
          <button className="btn btn-secondary" onClick={fetchStatus}>
            🔄 Refresh Status
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-lg)' }}>
          {error}
        </div>
      )}

      {/* ─── Top Universal Pairing Banner ────────────────────────────── */}
      <div className="pairing-code-banner" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="pairing-banner-info">
          <div className="pairing-banner-title">
            <span>🔑 6-Digit Universal Bot Pairing Code</span>
          </div>
          <p className="pairing-banner-desc">
            Send this code to the WhatsApp or Telegram bot to instantly link your accounting ledger.
          </p>
        </div>

        <div className="pairing-code-display">
          <span className="pairing-code-text" data-testid="pairing-code-val">
            {status?.pairingCode || '------'}
          </span>
          <button
            className="btn-icon-copy"
            onClick={handleCopyCode}
            title="Copy pairing code"
            aria-label="Copy pairing code"
          >
            {copiedCode ? '✅ Copied' : '📋 Copy'}
          </button>
          <button
            className="btn-icon-copy"
            onClick={handleGenerateNewCode}
            title="Generate fresh code"
            aria-label="Generate fresh code"
          >
            🔄 New Code
          </button>
        </div>
      </div>

      {/* ─── Main 2-Column Studio Layout ─────────────────────────────── */}
      <div className="integrations-main-grid">
        {/* ─── Left Column: Channel Configurations ───────────────────── */}
        <div className="integrations-channels-col">
          {/* WhatsApp Card */}
          <div className="integration-card whatsapp card-glass">
            <div className="channel-card-header">
              <div className="channel-identity">
                <div className="channel-icon-badge whatsapp">💬</div>
                <div>
                  <h2 className="channel-name">WhatsApp Voice Companion</h2>
                  <p className="channel-subtitle">Natural voice notes & SMS commands</p>
                </div>
              </div>
              <span className={`status-badge ${status?.isPhoneLinked ? 'connected' : 'disconnected'}`}>
                {status?.isPhoneLinked ? '🟢 Connected' : '⚪ Not Linked'}
              </span>
            </div>

            <div className="channel-content-body">
              <form onSubmit={handleSavePhone} className="channel-form-row">
                <div className="input-with-label">
                  <label htmlFor="wa-phone">Your Registered WhatsApp Phone Number</label>
                  <input
                    id="wa-phone"
                    type="text"
                    className="input"
                    placeholder="+91 98765 43210"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-end' }}
                  disabled={isSavingPhone}
                >
                  {isSavingPhone ? 'Saving...' : 'Save & Link'}
                </button>
              </form>

              <div className="channel-help-box">
                <div className="help-title">💡 How to use with WhatsApp:</div>
                <ul className="help-list">
                  <li>
                    Save our bot number: <strong>{status?.whatsappBotNumber}</strong>
                  </li>
                  <li>
                    Send: <code>PAIR {status?.pairingCode}</code> to connect your account.
                  </li>
                  <li>
                    Send Spoken Voice Notes or Text:
                    <div className="command-pills-row">
                      <span className="cmd-pill">"Paid 450 for lunch from Cash"</span>
                      <span className="cmd-pill">"Sharma ji paid 5000 in bank"</span>
                      <span className="cmd-pill">"What is my bank balance?"</span>
                    </div>
                  </li>
                </ul>
              </div>

              {status?.isPhoneLinked && (
                <div className="channel-actions-row">
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Linked Phone: <strong>{status.phone}</strong>
                  </span>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleUnlink('WHATSAPP')}>
                    Disconnect WhatsApp
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Telegram Card */}
          <div className="integration-card telegram card-glass">
            <div className="channel-card-header">
              <div className="channel-identity">
                <div className="channel-icon-badge telegram">✈️</div>
                <div>
                  <h2 className="channel-name">Telegram Bot Companion</h2>
                  <p className="channel-subtitle">Instant interactive keyboard & slash shortcuts</p>
                </div>
              </div>
              <span className={`status-badge ${status?.isTelegramLinked ? 'connected' : 'disconnected'}`}>
                {status?.isTelegramLinked ? '🟢 Connected' : '⚪ Not Linked'}
              </span>
            </div>

            <div className="channel-content-body">
              <div className="channel-help-box">
                <div className="help-title">⚡ Quick Telegram Setup:</div>
                <ul className="help-list">
                  <li>
                    Search for <strong>@{status?.telegramBotUsername}</strong> on Telegram.
                  </li>
                  <li>
                    Click <strong>Start</strong> or send <code>/start {status?.pairingCode}</code>.
                  </li>
                  <li>
                    Supported Slash Shortcuts:
                    <div className="command-pills-row">
                      <span className="cmd-pill">/bank</span>
                      <span className="cmd-pill">/cash</span>
                      <span className="cmd-pill">/pnl</span>
                      <span className="cmd-pill">/networth</span>
                      <span className="cmd-pill">/recent</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="channel-actions-row">
                <a
                  href={`https://t.me/${status?.telegramBotUsername}?start=${status?.pairingCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  🚀 Open in Telegram
                </a>
                {status?.isTelegramLinked && (
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleUnlink('TELEGRAM')}>
                    Disconnect Telegram
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Interactive Smartphone Simulator ─────────── */}
        <div className="simulator-col">
          <div className="phone-simulator-frame">
            <div className="phone-screen">
              {/* Notch */}
              <div className="phone-top-bar">
                <span>9:41</span>
                <div className="phone-dynamic-island" />
                <span>5G 📶 100%</span>
              </div>

              {/* Channel Switcher Header */}
              <div className={`simulator-channel-header ${simChannel.toLowerCase()}`}>
                <div className="sim-bot-profile">
                  <div className="sim-bot-avatar">{simChannel === 'WHATSAPP' ? '🤖' : '✈️'}</div>
                  <div>
                    <div className="sim-bot-name">VoiceTally Bot</div>
                    <div className="sim-bot-status">online • Double-Entry Agent</div>
                  </div>
                </div>

                <div className="sim-channel-toggle-btns">
                  <button
                    className={`btn-toggle-channel ${simChannel === 'WHATSAPP' ? 'active' : ''}`}
                    onClick={() => setSimChannel('WHATSAPP')}
                  >
                    WhatsApp
                  </button>
                  <button
                    className={`btn-toggle-channel ${simChannel === 'TELEGRAM' ? 'active' : ''}`}
                    onClick={() => setSimChannel('TELEGRAM')}
                  >
                    Telegram
                  </button>
                </div>
              </div>

              {/* Message Feed */}
              <div className={`sim-messages-scroll ${simChannel.toLowerCase()}`}>
                {simMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`sim-message-bubble ${msg.sender} ${simChannel.toLowerCase()}`}
                  >
                    {msg.isVoice && (
                      <div className="voice-note-pill" style={{ marginBottom: 4 }}>
                        <span>🎙️ Voice Note</span>
                        <div className="voice-wave-anim">
                          <div className="voice-wave-bar" />
                          <div className="voice-wave-bar" />
                          <div className="voice-wave-bar" />
                          <div className="voice-wave-bar" />
                          <div className="voice-wave-bar" />
                        </div>
                      </div>
                    )}

                    <div
                      style={{ whiteSpace: 'pre-line' }}
                      dangerouslySetInnerHTML={{
                        __html: msg.text.replace(/\*(.*?)\*/g, '<strong>$1</strong>'),
                      }}
                    />

                    {/* Voucher Preview Card */}
                    {msg.previewCard && (
                      <div className="sim-preview-box">
                        <div className="sim-preview-title">⚖️ Double-Entry Preview</div>
                        <div className="sim-preview-row">
                          <span>Amount:</span>
                          <strong>{msg.previewCard.formattedAmount}</strong>
                        </div>
                        <div className="sim-preview-row">
                          <span>Debit:</span>
                          <span>{msg.previewCard.debitAccount} (Dr)</span>
                        </div>
                        <div className="sim-preview-row">
                          <span>Credit:</span>
                          <span>{msg.previewCard.creditAccount} (Cr)</span>
                        </div>
                        <div className="sim-preview-row">
                          <span>Narration:</span>
                          <span>{msg.previewCard.narration}</span>
                        </div>

                        <div className="sim-inline-actions">
                          <button
                            className="btn-sim-action confirm"
                            onClick={() => handleSendMessage('YES')}
                          >
                            ✅ Confirm & Post
                          </button>
                          <button
                            className="btn-sim-action cancel"
                            onClick={() => handleSendMessage('CANCEL')}
                          >
                            ❌ Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Telegram Inline Keyboards */}
                    {msg.inlineKeyboard && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                        {msg.inlineKeyboard.map((row, rIdx) => (
                          <div key={rIdx} style={{ display: 'flex', gap: 4 }}>
                            {row.map((btn, bIdx) => (
                              <button
                                key={bIdx}
                                className="btn-sim-action"
                                style={{
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.4)',
                                }}
                                onClick={() => handleSendMessage(btn.callback_data)}
                              >
                                {btn.text}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bubble-time">{msg.time}</div>
                  </div>
                ))}

                {isSending && (
                  <div className={`sim-message-bubble bot ${simChannel.toLowerCase()}`}>
                    <span>Bot is typing & computing ledger lines... ✍️</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Pills */}
              <div className="sim-quick-prompts">
                <button
                  className="btn-prompt-chip"
                  onClick={() => handleSendMessage('Paid 1200 for petrol using Bank')}
                >
                  ⛽ Petrol 1200
                </button>
                <button
                  className="btn-prompt-chip"
                  onClick={() => handleSendMessage('Sharma paid 5000 in cash')}
                >
                  👤 Sharma 5000
                </button>
                <button
                  className="btn-prompt-chip"
                  onClick={() => handleSendMessage('What is my bank balance?')}
                >
                  🏦 Bank Balance
                </button>
                <button
                  className="btn-prompt-chip"
                  onClick={() => handleSendMessage('What is my net worth?')}
                >
                  💎 Net Worth
                </button>
              </div>

              {/* Input Footer */}
              <div className={`sim-input-footer ${simChannel.toLowerCase()}`}>
                <button
                  type="button"
                  className={`sim-voice-btn ${isVoiceSim ? 'recording' : ''}`}
                  onClick={() => setIsVoiceSim(!isVoiceSim)}
                  title={isVoiceSim ? 'Voice Simulation Active' : 'Switch to Voice Note mode'}
                >
                  {isVoiceSim ? '🔴' : '🎙️'}
                </button>
                <input
                  type="text"
                  className={`sim-text-input ${simChannel.toLowerCase()}`}
                  placeholder={
                    isVoiceSim
                      ? '🎙️ Spoken voice note simulated...'
                      : 'Type a message or slash command...'
                  }
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isSending}
                />
                <button
                  className={`sim-send-btn ${simChannel.toLowerCase()}`}
                  onClick={() => handleSendMessage()}
                  disabled={!simInput.trim() || isSending}
                  aria-label="Send message"
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default IntegrationsPage;
