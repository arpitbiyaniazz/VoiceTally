import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { describe, it, expect, vi } from 'vitest';

// Mock useAuth
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: '123', name: 'John Doe', email: 'john@example.com' },
    logout: vi.fn(),
  }),
}));

describe('UI: Sidebar Component', () => {
  it('renders all required navigation links', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    expect(screen.getByText('VoiceTally')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Voucher Entry')).toBeInTheDocument();
    expect(screen.getByText('Journal Book')).toBeInTheDocument();
    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders authenticated user profile and logout button', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
