import React from 'react';
import './VoiceAgentModal.css';

interface VoiceFloatingButtonProps {
  onClick: () => void;
}

export const VoiceFloatingButton: React.FC<VoiceFloatingButtonProps> = ({ onClick }) => {
  return (
    <button
      className="voice-fab"
      onClick={onClick}
      aria-label="Open Voice AI Assistant"
      title="Voice AI Assistant — Spoken Accounting"
      type="button"
    >
      <div className="voice-fab-orb">🎙️</div>
      <span>Voice Agent</span>
    </button>
  );
};
