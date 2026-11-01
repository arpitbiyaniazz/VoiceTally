import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { VoiceAgentModal } from '../components/voice/VoiceAgentModal';
import { VoiceStudioPage } from '../pages/VoiceStudioPage';
import { voiceApi } from '../api/voice';

vi.mock('../api/voice', () => ({
  voiceApi: {
    process: vi.fn(),
    transcribeAudio: vi.fn().mockResolvedValue({
      transcript: 'Paid 500 for lunch from cash',
      model: 'voxtral-mini-latest',
    }),
    synthesizeSpeech: vi.fn().mockResolvedValue(new Blob(['dummy-audio'], { type: 'audio/mpeg' })),
    getConfig: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          sttModel: 'voxtral-mini-latest',
          ttsModel: 'voxtral-mini-tts-2603',
          voice: 'neutral_female',
          voiceId: 'gb_jane_neutral',
          voiceLabel: 'Jane (Neutral)',
          gender: 'female',
          provider: 'mistral-voxtral',
          isConfigured: true,
        },
      },
    }),
  },
}));

const clarificationReply = {
  data: {
    success: true,
    data: {
      intent: { type: 'CLARIFICATION', field: 'paymentMode', rawText: 'Paid 500 for lunch' },
      spokenResponse: 'Did you pay 500 rupees in cash or from your bank account?',
      displayTitle: 'Payment Mode Needed',
      data: { status: 'NEEDS_DETAILS' },
      executed: false,
      needsClarification: true,
      clarification: {
        field: 'paymentMode',
        question: 'Did you pay 500 rupees in cash or from your bank account?',
        options: ['Cash', 'Bank / UPI'],
        draft: { flowLabel: 'Payment', formattedAmount: '₹500.00', categoryName: 'Food & Dining' },
      },
      conversation: {
        stage: 'COLLECTING',
        clarification: {
          field: 'paymentMode',
          question: 'Did you pay 500 rupees in cash or from your bank account?',
          options: ['Cash', 'Bank / UPI'],
          draft: { flowLabel: 'Payment', formattedAmount: '₹500.00', categoryName: 'Food & Dining' },
        },
      },
    },
  },
};

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
    expect(screen.getByText(/Bank balance/i)).toBeInTheDocument();
    expect(screen.getByText(/ATM cash withdrawal/i)).toBeInTheDocument();
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
      expect(screen.getByText(/PREVIEW: CONTRA/i)).toBeInTheDocument();
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
      expect(screen.getByText(/CONTRA RECORDED/i)).toBeInTheDocument();
      expect(onExecutedMock).toHaveBeenCalled();
    });
  });

  it('renders VoiceStudioPage, triggers confirmation popup, and confirms', async () => {
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

    const input = screen.getByPlaceholderText(/Say or type/i);
    fireEvent.change(input, { target: { value: 'Paid 500 for lunch from Cash' } });
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    await waitFor(() => {
      expect(screen.getByText('Confirm Transaction')).toBeInTheDocument();
      expect(screen.getByText('Do you want to proceed with this transaction?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Yes, Confirm & Post/i })).toBeInTheDocument();
    });
  });

  it('displays the active Voxtral STT and TTS models in UI indicators', async () => {
    render(
      <BrowserRouter>
        <VoiceStudioPage />
      </BrowserRouter>
    );

    // Subtitle shows the models the server actually uses
    expect(screen.getByText(/Voice engine powered by Voxtral/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/voxtral-mini-latest/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/voxtral-mini-transcribe-realtime-2602/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/voxtral-mini-tts-2603/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Female/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jane \(Neutral\)/i).length).toBeGreaterThan(0);
  });

  it('renders a follow-up question with answer options and does not open the confirmation popup', async () => {
    (voiceApi.process as any).mockResolvedValueOnce(clarificationReply);

    render(<VoiceAgentModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'Paid 500 for lunch' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Did you pay 500 rupees in cash or from your bank account?')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bank / UPI' })).toBeInTheDocument();
    // What has been understood so far, with the missing detail marked
    expect(screen.getByText('₹500.00')).toBeInTheDocument();
    expect(screen.getByText('Food & Dining')).toBeInTheDocument();
    expect(screen.getByText('Paid via')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Transaction')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type your answer/i)).toBeInTheDocument();
  });

  it('sends the option text as the answer when an option is clicked', async () => {
    (voiceApi.process as any).mockClear();
    (voiceApi.process as any).mockResolvedValueOnce(clarificationReply).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: { type: 'TRANSACTION', action: 'DIRECT_PAYMENT', voucherType: 'PAYMENT', amount: 500, rawText: 'Cash' },
          spokenResponse: "I'm ready to record 500 rupees payment voucher. Shall I confirm and post this?",
          displayTitle: 'Preview: PAYMENT Voucher',
          data: {
            isPreview: true,
            voucherType: 'PAYMENT',
            amount: 500,
            formattedAmount: '₹500.00',
            debitAccount: 'Food & Dining',
            creditAccount: 'Cash',
            narration: 'Paid for Food & Dining via Cash (₹500)',
          },
          executed: false,
          needsConfirmation: true,
        },
      },
    });

    render(<VoiceAgentModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'Paid 500 for lunch' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    const cashOption = await screen.findByRole('button', { name: 'Cash' });
    fireEvent.click(cashOption);

    await waitFor(() => {
      expect(voiceApi.process).toHaveBeenLastCalledWith({ transcript: 'Cash', execute: false });
      expect(screen.getByText('Confirm Transaction')).toBeInTheDocument();
    });
    // The answered question no longer offers options
    expect(screen.queryByRole('button', { name: 'Bank / UPI' })).not.toBeInTheDocument();
  });

  it('opens the confirmation popup for a preview with its date and new accounts', async () => {
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: { type: 'TRANSACTION', action: 'GIVE_TO_PERSON', voucherType: 'PAYMENT', amount: 2000, rawText: 'gave 2000 to Mohan yesterday' },
          spokenResponse: "I'm ready to record 2,000 rupees payment voucher. Shall I confirm and post this?",
          displayTitle: 'Preview: PAYMENT Voucher',
          data: {
            isPreview: true,
            voucherType: 'PAYMENT',
            amount: 2000,
            formattedAmount: '₹2,000.00',
            debitAccount: 'Mohan',
            creditAccount: 'Cash',
            narration: 'Payment / Lent to Mohan via Cash (₹2,000)',
            date: '2026-10-25',
            isBackdated: true,
            newAccounts: [{ name: 'Mohan', kind: 'contact' }],
          },
          executed: false,
          needsConfirmation: true,
          conversation: {
            stage: 'AWAITING_CONFIRMATION',
            preview: {
              isPreview: true,
              voucherType: 'PAYMENT',
              amount: 2000,
              formattedAmount: '₹2,000.00',
              debitAccount: 'Mohan',
              creditAccount: 'Cash',
              narration: 'Payment / Lent to Mohan via Cash (₹2,000)',
              date: '2026-10-25',
              isBackdated: true,
              newAccounts: [{ name: 'Mohan', kind: 'contact' }],
            },
          },
        },
      },
    });

    render(<VoiceAgentModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'gave 2000 to Mohan yesterday' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Transaction' });
    expect(within(dialog).getByText(/Dated 25 Oct 2026/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Will create Mohan \(contact\)/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Answer by voice/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Yes, Confirm & Post/i })).toBeInTheDocument();
  });

  it('does not open the popup when a transaction is rejected', async () => {
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: { type: 'TRANSACTION', action: 'WITHDRAWAL', voucherType: 'CONTRA', amount: -5000, rawText: 'withdrew -5000' },
          spokenResponse: 'Transaction amounts must be positive numbers greater than zero.',
          displayTitle: 'Invalid Transaction Amount',
          data: { error: 'Transaction amounts must be positive numbers greater than zero.' },
          executed: false,
          conversation: { stage: 'IDLE' },
        },
      },
    });

    render(<VoiceAgentModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'withdrew -5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/must be positive numbers/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Confirm Transaction')).not.toBeInTheDocument();
    expect(screen.queryByText(/₹undefined/)).not.toBeInTheDocument();
  });

  it('offers suggestion chips when the request is not understood', async () => {
    (voiceApi.process as any).mockClear();
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: { type: 'UNKNOWN', rawText: 'blah blah', reason: 'not understood' },
          spokenResponse: "I'm not sure I understood that financial request.",
          displayTitle: 'Query Not Understood',
          data: { suggestions: ['What is my bank balance?', 'Paid 450 for groceries from Cash'] },
          executed: false,
          conversation: { stage: 'IDLE' },
        },
      },
    });
    (voiceApi.process as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          intent: { type: 'QUERY', target: 'BANK_BALANCE', rawText: 'What is my bank balance?' },
          spokenResponse: 'Your Bank balance is 1,000 rupees.',
          displayTitle: 'Bank Balance',
          data: { account: 'Bank', balance: 1000, formattedBalance: '₹1,000.00' },
          executed: true,
          conversation: { stage: 'IDLE' },
        },
      },
    });

    render(<VoiceAgentModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'blah blah' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    const chip = await screen.findByRole('button', { name: 'What is my bank balance?' });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(voiceApi.process).toHaveBeenLastCalledWith({ transcript: 'What is my bank balance?', execute: false });
      expect(screen.getByText('Your Bank balance is 1,000 rupees.')).toBeInTheDocument();
    });
  });

  it('shows the open question with options in the Voice Studio cockpit', async () => {
    (voiceApi.process as any).mockResolvedValueOnce(clarificationReply);

    render(
      <BrowserRouter>
        <VoiceStudioPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Say or type/i), { target: { value: 'Paid 500 for lunch' } });
    fireEvent.click(screen.getByRole('button', { name: /Execute/i }));

    // The question appears in the feed and in the cockpit's open-question panel, which holds the options
    await waitFor(() => {
      expect(screen.getAllByText('Did you pay 500 rupees in cash or from your bank account?').length).toBe(2);
    });
    expect(screen.getByRole('button', { name: 'Bank / UPI' })).toBeInTheDocument();
    expect(screen.queryByText('Confirm Transaction')).not.toBeInTheDocument();
  });
});

