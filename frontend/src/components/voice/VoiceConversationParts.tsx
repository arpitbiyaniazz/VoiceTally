import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  HelpCircle,
  Lightbulb,
  Mic,
  Square,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import type { ClarificationField, DraftSummary, VoiceClarification, VoicePreviewData } from '../../api/voice';

type DraftKey = 'flow' | 'amount' | 'party' | 'mode' | 'date';

const FIELD_INFO: Record<ClarificationField, { key: DraftKey; label: string }> = {
  flow: { key: 'flow', label: 'Type' },
  amount: { key: 'amount', label: 'Amount' },
  counterparty: { key: 'party', label: 'Who / what for' },
  counterpartyKind: { key: 'party', label: 'Who / what for' },
  person: { key: 'party', label: 'Contact' },
  personChoice: { key: 'party', label: 'Contact' },
  paymentMode: { key: 'mode', label: 'Paid via' },
  bankChoice: { key: 'mode', label: 'Bank account' },
  cashChoice: { key: 'mode', label: 'Cash account' },
  date: { key: 'date', label: 'Date' },
};

/** "2026-10-20" → "20 Oct 2026" */
function formatEntryDate(date: string | undefined): string {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * What the assistant has understood so far, with the detail it is asking for marked
 */
export const DraftSummaryView: React.FC<{ draft: DraftSummary; field?: ClarificationField }> = ({ draft, field }) => {
  const items: Array<{ key: DraftKey; label: string; value: string }> = [];
  if (draft.flowLabel) items.push({ key: 'flow', label: 'Type', value: draft.flowLabel });
  if (draft.formattedAmount) items.push({ key: 'amount', label: 'Amount', value: draft.formattedAmount });
  if (draft.personName) items.push({ key: 'party', label: 'Contact', value: draft.personName });
  if (draft.categoryName) items.push({ key: 'party', label: 'For', value: draft.categoryName });
  if (draft.paymentMode) {
    const mode = draft.paymentMode === 'BANK' ? 'Bank' : 'Cash';
    items.push({ key: 'mode', label: 'Paid via', value: draft.accountName ? `${mode} · ${draft.accountName}` : mode });
  }
  if (draft.date) items.push({ key: 'date', label: 'Date', value: formatEntryDate(draft.date) });

  const asking = field ? FIELD_INFO[field] : undefined;
  const askingAnswered = !!asking && items.some((item) => item.key === asking.key);

  if (items.length === 0 && !asking) return null;

  return (
    <div className="voice-draft-grid" aria-label="Entry details so far">
      {items.map((item) => (
        <div
          key={`${item.key}-${item.label}`}
          className={`voice-draft-item ${asking && asking.key === item.key ? 'asking' : ''}`}
        >
          <span className="voice-draft-label">{item.label}</span>
          <span className="voice-draft-value">{item.value}</span>
        </div>
      ))}
      {asking && !askingAnswered && (
        <div className="voice-draft-item missing">
          <span className="voice-draft-label">{asking.label}</span>
          <span className="voice-draft-value">?</span>
        </div>
      )}
    </div>
  );
};

/**
 * A follow-up question's details and answer options (options only on the question still open)
 */
export const ClarificationCard: React.FC<{
  clarification: VoiceClarification;
  interactive: boolean;
  disabled?: boolean;
  onSelect: (option: string) => void;
  showQuestion?: boolean;
}> = ({ clarification, interactive, disabled, onSelect, showQuestion }) => (
  <div className="voice-clarify-card">
    {showQuestion && (
      <div className="voice-clarify-question">
        <HelpCircle size={15} />
        <span>{clarification.question}</span>
      </div>
    )}
    {clarification.draft && <DraftSummaryView draft={clarification.draft} field={interactive ? clarification.field : undefined} />}
    {interactive && clarification.options.length > 0 && (
      <div className="voice-option-row" role="group" aria-label="Answer options">
        {clarification.options.map((option) => (
          <button key={option} type="button" className="voice-option-chip" disabled={disabled} onClick={() => onSelect(option)}>
            {option}
          </button>
        ))}
      </div>
    )}
    {interactive && (
      <div className="voice-clarify-hint">
        <Mic size={12} /> Answer by voice, type it, or tap an option
      </div>
    )}
  </div>
);

/**
 * Example requests offered when the assistant did not understand
 */
export const SuggestionChips: React.FC<{ suggestions: string[]; disabled?: boolean; onSelect: (text: string) => void }> = ({
  suggestions,
  disabled,
  onSelect,
}) => (
  <div className="voice-suggestion-block">
    <div className="voice-suggestion-label">
      <Lightbulb size={12} /> Try saying
    </div>
    <div className="voice-option-row">
      {suggestions.map((s) => (
        <button key={s} type="button" className="voice-option-chip subtle" disabled={disabled} onClick={() => onSelect(s)}>
          {s}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Back-dated entry and accounts that posting will create
 */
export const PreviewNotes: React.FC<{ preview: VoicePreviewData }> = ({ preview }) => {
  const newAccounts = preview.newAccounts ?? [];
  if (!(preview.isBackdated && preview.date) && newAccounts.length === 0) return null;
  return (
    <div className="voice-preview-notes">
      {preview.isBackdated && preview.date && (
        <div className="voice-preview-note">
          <CalendarDays size={13} /> Dated {formatEntryDate(preview.date)}
        </div>
      )}
      {newAccounts.length > 0 && (
        <div className="voice-preview-note new">
          <UserPlus size={13} /> Will create {newAccounts.map((a) => `${a.name} (${a.kind})`).join(', ')}
        </div>
      )}
    </div>
  );
};

/**
 * Voucher confirmation dialog. It has its own microphone because the overlay covers the main one.
 */
export const ConfirmTransactionDialog: React.FC<{
  preview: VoicePreviewData;
  titleId: string;
  isProcessing: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  interimTranscript: string;
  onConfirm: () => void;
  onCancel: () => void;
  onMicToggle: () => void;
  onSubmitText: (text: string) => void;
  onTyping?: () => void;
}> = ({
  preview,
  titleId,
  isProcessing,
  isListening,
  isTranscribing,
  interimTranscript,
  onConfirm,
  onCancel,
  onMicToggle,
  onSubmitText,
  onTyping,
}) => {
  const [correction, setCorrection] = useState('');

  return (
    <div className="voice-popup-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="voice-popup-dialog">
        <div className="voice-popup-header">
          <div className="voice-popup-badge-wrap">
            <span className="voice-popup-badge-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <Zap size={16} />
            </span>
            <div>
              <h4 id={titleId} className="voice-popup-title">
                Confirm Transaction
              </h4>
              <p className="voice-popup-subtitle">Review before recording into double-entry ledger</p>
            </div>
          </div>
          <button
            type="button"
            className="voice-popup-close-btn"
            onClick={onCancel}
            disabled={isProcessing}
            title="Cancel Transaction"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="voice-popup-body">
          <div className="voice-popup-question-banner">
            <span className="voice-popup-question-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <AlertTriangle size={16} />
            </span>
            <span>Do you want to proceed with this transaction?</span>
          </div>

          <div className="voice-popup-summary-card">
            <div className="voice-popup-summary-top">
              <span className={`voice-card-badge ${preview.voucherType?.toLowerCase() || 'journal'}`}>
                {preview.voucherType || 'TRANSACTION'} VOUCHER
              </span>
              <span className="voice-popup-amount">{preview.formattedAmount || `₹${preview.amount ?? 0}`}</span>
            </div>

            <div className="voice-popup-ledger-grid">
              <div className="voice-popup-ledger-box debit">
                <span className="ledger-tag dr">Debit (Dr)</span>
                <span className="ledger-account-name">{preview.debitAccount}</span>
              </div>
              <div className="voice-popup-arrow">
                <ArrowRight size={16} />
              </div>
              <div className="voice-popup-ledger-box credit">
                <span className="ledger-tag cr">Credit (Cr)</span>
                <span className="ledger-account-name">{preview.creditAccount}</span>
              </div>
            </div>

            {preview.narration && (
              <div className="voice-popup-narration-box">
                <span className="narration-icon">
                  <FileText size={14} />
                </span>
                <span className="narration-text">{preview.narration}</span>
              </div>
            )}

            <PreviewNotes preview={preview} />

            {preview.warning && (
              <div className="voice-popup-warning-box">
                <span>
                  <Zap size={14} />
                </span>
                <span>{preview.warning}</span>
              </div>
            )}
          </div>

          <div className="voice-popup-mic-row">
            <button
              type="button"
              className={`voice-popup-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={onMicToggle}
              disabled={isTranscribing || isProcessing}
              title={isListening ? 'Stop listening' : 'Answer by voice'}
              aria-label={isListening ? 'Stop listening' : 'Answer by voice'}
            >
              {isListening ? <Square size={15} /> : <Mic size={16} />}
            </button>
            <div className="voice-popup-mic-text" aria-live="polite">
              {isTranscribing ? (
                'Transcribing…'
              ) : isListening ? (
                interimTranscript ? `“${interimTranscript}”` : 'Listening…'
              ) : (
                <>
                  Say <strong>"yes"</strong> to post, <strong>"cancel"</strong>, or what to change (e.g. <em>"make it 600"</em>)
                </>
              )}
            </div>
          </div>

          <form
            className="voice-popup-correction"
            onSubmit={(e) => {
              e.preventDefault();
              if (!correction.trim()) return;
              onSubmitText(correction);
              setCorrection('');
            }}
          >
            <input
              type="text"
              className="voice-popup-correction-input"
              placeholder='Or type a change, e.g. "paid from bank"'
              value={correction}
              onChange={(e) => {
                setCorrection(e.target.value);
                onTyping?.();
              }}
              disabled={isProcessing}
              aria-label="Type a change to this entry"
            />
            <button type="submit" className="voice-popup-correction-btn" disabled={!correction.trim() || isProcessing}>
              Update
            </button>
          </form>
        </div>

        <div className="voice-popup-footer">
          <button type="button" className="voice-popup-btn confirm" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? (
              'Posting...'
            ) : (
              <>
                <Check size={14} /> Yes, Confirm & Post
              </>
            )}
          </button>
          <button type="button" className="voice-popup-btn cancel" onClick={onCancel} disabled={isProcessing}>
            <X size={14} /> No, Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
