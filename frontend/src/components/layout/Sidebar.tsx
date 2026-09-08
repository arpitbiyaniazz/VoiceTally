import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import './Sidebar.css';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊', description: 'Financial Overview' },
  { path: '/analytics', label: 'Analytics', icon: '🌊', description: 'Sankey & Visual BI', badge: 'BI' },
  { path: '/voice', label: 'Voice Studio', icon: '🎙️', description: 'AI Voice Ledger', badge: 'AI' },
  { path: '/integrations', label: 'Bot Integrations', icon: '💬', description: 'WhatsApp & Telegram', badge: 'BOT' },
  { path: '/vouchers', label: 'Voucher Entry', icon: '📝', description: 'Payment & Receipts' },
  { path: '/journal', label: 'Journal Book', icon: '📒', description: 'Double-Entry Log' },
  { path: '/accounts', label: 'Chart of Accounts', icon: '📋', description: 'Categories & Balances' },
  { path: '/people', label: 'People', icon: '👥', description: 'Counterparties & Debts' },
  { path: '/reports', label: 'Reports', icon: '📈', description: 'Financial Statements' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div className="sidebar-brand">
        <div className="sidebar-logo">₹</div>
        <div className="sidebar-brand-text-wrap">
          <span className="sidebar-brand-text">VoiceTally</span>
          <span className="sidebar-brand-tag">Double-Entry Ledger</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === '/' 
            ? location.pathname === '/' 
            : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`sidebar-link${isActive ? ' active' : ''}`}
              end={item.path === '/'}
              title={`${item.label} — ${item.description}`}
            >
              <span className="sidebar-link-icon" aria-hidden="true">{item.icon}</span>
              <div className="sidebar-link-content">
                <span className="sidebar-link-text">{item.label}</span>
                <span className="sidebar-link-desc">{item.description}</span>
              </div>
              {item.badge && <span className="sidebar-badge">{item.badge}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
            <span className="sidebar-user-status-dot" title="Active session" />
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || 'User'}</div>
            <div className="sidebar-user-email">{user?.email || 'user@voicetally.app'}</div>
          </div>
        </div>
        <button 
          className="btn btn-ghost btn-sm w-full mt-sm sidebar-logout-btn" 
          onClick={logout}
          title="Sign out of VoiceTally"
        >
          <span>🚪</span> Sign Out
        </button>
      </div>
    </aside>
  );
}
