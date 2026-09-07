import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { VoucherEntryPage } from '../pages/VoucherEntryPage';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ledgerApi } from '../api/ledger';

vi.mock('../api/ledger', () => ({
  ledgerApi: {
    listAccounts: vi.fn(),
    postVoucher: vi.fn(),
  },
}));

describe('UI: VoucherEntryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ledgerApi.listAccounts as any).mockResolvedValue({
      data: {
        data: [
          { id: '1', name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK' },
          { id: '2', name: 'Bank', type: 'ASSET', subtype: 'CASH_BANK' },
          { id: '3', name: 'Groceries', type: 'EXPENSE', subtype: 'EXPENSE_CATEGORY' },
        ],
      },
    });
  });

  it('renders voucher type cards (Payment, Receipt, Contra, Journal)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <VoucherEntryPage />
        </BrowserRouter>
      );
    });

    expect(screen.getByText('Payment Voucher')).toBeInTheDocument();
    expect(screen.getByText('Receipt Voucher')).toBeInTheDocument();
    expect(screen.getByText('Contra Voucher')).toBeInTheDocument();
    expect(screen.getByText('Journal Entry')).toBeInTheDocument();
  });

  it('switches between voucher tabs and dynamically updates form layout', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <VoucherEntryPage />
        </BrowserRouter>
      );
    });

    // Switch to Contra tab
    const contraTab = screen.getByText('Contra Voucher');
    await act(async () => {
      fireEvent.click(contraTab);
    });

    expect(screen.getByText('From Account')).toBeInTheDocument();
    expect(screen.getByText('To Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post contra/i })).toBeInTheDocument();

    // Switch to Journal tab
    const journalTab = screen.getByText('Journal Entry');
    await act(async () => {
      fireEvent.click(journalTab);
    });

    expect(screen.getByText(/journal lines/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ add line/i })).toBeInTheDocument();
  });
});
