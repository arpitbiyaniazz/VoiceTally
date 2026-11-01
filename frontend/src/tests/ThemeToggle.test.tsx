import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../context';
import { ThemeToggle } from '../components/common/ThemeToggle';

describe('Theme Context & ThemeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('initializes with default dark theme when localStorage is empty', () => {
    const TestConsumer = () => {
      const { theme } = useTheme();
      return <div data-testid="current-theme">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores light theme when saved in localStorage', () => {
    localStorage.setItem('voicetally_theme', 'light');

    const TestConsumer = () => {
      const { theme } = useTheme();
      return <div data-testid="current-theme">{theme}</div>;
    };

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles theme when toggleTheme is called and updates DOM and localStorage', () => {
    const TestConsumer = () => {
      const { theme, toggleTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme-val">{theme}</span>
          <button onClick={toggleTheme}>Toggle</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('theme-val').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('voicetally_theme')).toBe('light');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('voicetally_theme')).toBe('dark');
  });

  it('renders ThemeToggle as an accessible switch and updates theme on click', () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="row" />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByRole('switch');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('renders icon and floating variants without crashing', () => {
    const { rerender } = render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );
    expect(screen.getByRole('switch')).toHaveClass('theme-toggle-icon-only');

    rerender(
      <ThemeProvider>
        <ThemeToggle variant="floating" />
      </ThemeProvider>
    );
    expect(screen.getByRole('switch')).toHaveClass('theme-toggle-floating');
  });
});
