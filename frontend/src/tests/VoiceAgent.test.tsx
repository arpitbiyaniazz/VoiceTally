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
      expect(screen.getByRole('button', { name: /✓ Confirm & Post/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /✕ Cancel/i })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /✓ Confirm & Post/i }));

    await waitFor(() => {
      expect(screen.getByText(/Confirmed! Successfully recorded/i)).toBeInTheDocument();
      expect(screen.getByText(/✓ CONTRA RECORDED/i)).toBeInTheDocument();
      expect(onExecutedMock).toHaveBeenCalled();
    });
  });

  it('renders VoiceStudioPage with playbook categories and interactive mic', () => {
    render(
      <BrowserRouter>
        <VoiceStudioPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Voice Agent Studio')).toBeInTheDocument();
    expect(screen.getByText('📚 Voice Command Playbook')).toBeInTheDocument();
    expect(screen.getByText('🏧 Banking & Contra')).toBeInTheDocument();
    expect(screen.getByText('🛍️ Debtor & Sales on Credit')).toBeInTheDocument();
    expect(screen.getByText('📊 Inquiries & Intelligence')).toBeInTheDocument();
  });
});
