import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { VoiceAgentModal } from '../components/voice/VoiceAgentModal';
import { VoiceStudioPage } from '../pages/VoiceStudioPage';
import { voiceApi } from '../api/voice';

vi.mock('../api/voice', () => ({
  voiceApi: {
    process: vi.fn(),
  },
}));

describe('UI: VoiceAgentModal & Studio Components', () => {
  it('renders VoiceAgentModal with title, chips, and input', () => {
    render(
      <VoiceAgentModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('VoiceTally AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Speak or Type Your Financial Request')).toBeInTheDocument();
    expect(screen.getByText('🏦 Bank balance')).toBeInTheDocument();
    expect(screen.getByText('🏧 ATM cash withdrawal')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Say or type/i)).toBeInTheDocument();
  });

  it('renders preview card with reconfirmation buttons and confirms on click', async () => {
    // 1. Mock preview response
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: {
            type: 'TRANSACTION',
            action: 'WITHDRAWAL',
            voucherType: 'CONTRA',
            amount: 5000,
            rawText: 'i made the withdrawal from the bank 5000',
          },
          spokenResponse: 'Ready to record 5,000 rupees contra voucher: Debiting Cash and Crediting Bank. Shall I confirm and post this?',
          displayTitle: 'Preview: CONTRA Voucher',
          data: {
            isPreview: true,
            voucherType: 'CONTRA',
            amount: 5000,
            formattedAmount: '₹5,000.00',
            debitAccount: 'Cash',
            creditAccount: 'Bank',
            narration: 'ATM / Cash withdrawal from Bank',
          },
          executed: false,
          needsConfirmation: true,
        },
      },
    });

    const onExecutedMock = vi.fn();
    render(
      <VoiceAgentModal
        isOpen={true}
        onClose={vi.fn()}
        onTransactionExecuted={onExecutedMock}
      />
    );

    const input = screen.getByPlaceholderText(/Say or type/i);
    fireEvent.change(input, { target: { value: 'i made the withdrawal from the bank 5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/Ready to record 5,000 rupees/i)).toBeInTheDocument();
      expect(screen.getByText(/⚠️ PREVIEW: CONTRA/i)).toBeInTheDocument();
      // Popup confirmation dialog is rendered
      expect(screen.getByText('Confirm Transaction')).toBeInTheDocument();
      expect(screen.getByText('Do you want to proceed with this transaction?')).toBeInTheDocument();
      expect(screen.getAllByText(/Confirm & Post/i).length).toBeGreaterThan(0);
    });

    // 2. Mock confirmation response (returns the posted transaction intent)
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: {
            type: 'TRANSACTION',
            action: 'WITHDRAWAL',
            voucherType: 'CONTRA',
            amount: 5000,
            rawText: 'confirm',
          },
          spokenResponse: 'Confirmed! Successfully recorded 5,000 rupees contra voucher.',
          displayTitle: 'CONTRA Voucher Posted',
          data: {
            voucherType: 'CONTRA',
            amount: 5000,
            formattedAmount: '₹5,000.00',
            debitAccount: 'Cash',
            creditAccount: 'Bank',
          },
          executed: true,
        },
      },
    });

    // Click confirm inside the popup
    const confirmBtn = screen.getByRole('button', { name: /Yes, Confirm & Post/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Confirmed! Successfully recorded/i)).toBeInTheDocument();
      expect(screen.getByText(/✓ CONTRA RECORDED/i)).toBeInTheDocument();
      expect(onExecutedMock).toHaveBeenCalled();
    });
  });

  it('renders VoiceStudioPage with playbook categories, triggers confirmation popup, and confirms', async () => {
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: {
            type: 'TRANSACTION',
            action: 'DIRECT_PAYMENT',
            voucherType: 'PAYMENT',
            amount: 500,
            categoryName: 'Food & Dining',
            paymentMode: 'CASH',
            rawText: 'Paid 500 for lunch from Cash',
          },
          spokenResponse: 'Ready to record 500 rupees payment voucher: Debiting Food & Dining and Crediting Cash. Shall I confirm and post this?',
          displayTitle: 'Preview: PAYMENT Voucher',
          data: {
            isPreview: true,
            voucherType: 'PAYMENT',
            amount: 500,
            formattedAmount: '₹500.00',
            debitAccount: 'Food & Dining',
            creditAccount: 'Cash',
            narration: 'Paid 500 for lunch from Cash',
          },
          executed: false,
          needsConfirmation: true,
        },
      },
    });

    render(
      <BrowserRouter>
        <VoiceStudioPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Voice Agent Studio')).toBeInTheDocument();
    expect(screen.getByText('📚 Voice Command Playbook')).toBeInTheDocument();
    expect(screen.getByText('🏧 Banking & Contra')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Say or type/i);
    fireEvent.change(input, { target: { value: 'Paid 500 for lunch from Cash' } });
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => {
      expect(screen.getByText('Confirm Transaction')).toBeInTheDocument();
      expect(screen.getByText('Do you want to proceed with this transaction?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Yes, Confirm & Post/i })).toBeInTheDocument();
    });
  });
});
