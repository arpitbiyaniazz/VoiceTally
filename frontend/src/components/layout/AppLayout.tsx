import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { VoiceAgentModal } from '../voice/VoiceAgentModal';
import { VoiceFloatingButton } from '../voice/VoiceFloatingButton';
import { useAuth } from '../../context/useAuth';
import './AppLayout.css';

export function AppLayout() {
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Topbar */}
      <header className="mobile-topbar" aria-label="Mobile Header">
        <div className="mobile-brand" onClick={() => navigate('/')}>
          <div className="mobile-logo">₹</div>
          <span className="mobile-brand-title">VoiceTally</span>
        </div>
        <div className="mobile-topbar-actions">
          <button 
            className="mobile-voice-trigger" 
            onClick={() => setIsVoiceModalOpen(true)}
            title="Ask Voice Assistant"
          >
            🎙️
          </button>
          <div className="mobile-user-avatar" title={user?.name || 'User'}>
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <NavLink to="/" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`} end>
          <span className="mobile-nav-icon">📊</span>
          <span className="mobile-nav-label">Overview</span>
        </NavLink>

        <NavLink to="/vouchers" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <span className="mobile-nav-icon">📝</span>
          <span className="mobile-nav-label">Voucher</span>
        </NavLink>

        {/* Center Raised Voice Button */}
        <button 
          className="mobile-nav-voice-btn" 
          onClick={() => setIsVoiceModalOpen(true)}
          aria-label="Open Voice Assistant"
        >
          <div className="mobile-nav-voice-orb">
            🎙️
          </div>
          <span className="mobile-nav-voice-label">Voice</span>
        </button>

        <NavLink to="/journal" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <span className="mobile-nav-icon">📒</span>
          <span className="mobile-nav-label">Journal</span>
        </NavLink>

        <NavLink to="/reports" className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
          <span className="mobile-nav-icon">📈</span>
          <span className="mobile-nav-label">Reports</span>
        </NavLink>
      </nav>

      {/* Desktop Floating Voice Assistant */}
      <div className="desktop-voice-fab">
        <VoiceFloatingButton onClick={() => setIsVoiceModalOpen(true)} />
      </div>

      {/* Voice Assistant Modal */}
      <VoiceAgentModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
      />
    </div>
  );
}
