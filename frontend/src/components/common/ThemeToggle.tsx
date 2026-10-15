import { useTheme } from '../../context/useTheme';
import { Sun, Moon } from 'lucide-react';
import './ThemeToggle.css';

interface ThemeToggleProps {
  variant?: 'icon' | 'row' | 'floating';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  if (variant === 'row') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isLight}
        aria-label={`Switch to ${isLight ? 'Dark' : 'Light'} Theme`}
        className={`theme-toggle-row ${className}`}
        onClick={toggleTheme}
        title={`Current: ${isLight ? 'Light' : 'Dark'} theme. Click to switch.`}
      >
        <div className="theme-toggle-row-left">
          <span className="theme-toggle-row-icon" aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
            {isLight ? <Sun size={18} /> : <Moon size={18} />}
          </span>
          <div>
            <div className="theme-toggle-row-text">
              {isLight ? 'Light Theme' : 'Dark Theme'}
            </div>
            <div className="theme-toggle-row-subtext">
              {isLight ? 'Sunlit obsidian UI' : 'Deep obsidian OLED'}
            </div>
          </div>
        </div>

        <div className="theme-switch-track" aria-hidden="true">
          <div className="theme-switch-thumb" />
        </div>
      </button>
    );
  }

  const isFloating = variant === 'floating';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${isLight ? 'Dark' : 'Light'} theme`}
      className={`theme-toggle-btn theme-toggle-icon-only ${isFloating ? 'theme-toggle-floating' : ''} ${className}`}
      onClick={toggleTheme}
      title={`Switch to ${isLight ? 'Dark' : 'Light'} theme`}
    >
      <span className="theme-toggle-icon-wrap" aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isLight ? <Sun size={18} /> : <Moon size={18} />}
      </span>
    </button>
  );
}
