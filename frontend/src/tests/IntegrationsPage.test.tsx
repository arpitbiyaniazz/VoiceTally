import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { integrationsApi } from '../api/ledger';

vi.mock('../api/ledger', () => ({
  integrationsApi: {
    getStatus: vi.fn(),
    linkPhone: vi.fn(),
    linkTelegram: vi.fn(),
    generatePairingCode: vi.fn(),
    unlinkChannel: vi.fn(),
    simulateChat: vi.fn(),
  },
}));

describe('IntegrationsPage & Smartphone Simulator', () => {
  const mockStatus = {
    phone: '+919876543210',
    isPhoneLinked: true,
    telegramChatId: '123456789',
    isTelegramLinked: true,
    pairingCode: 'PAIR99',
    whatsappBotNumber: '+1 415 523 8886',
    telegramBotUsername: 'VoiceTallyBot',
    webhookUrls: {
      whatsapp: '/api/v1/integrations/whatsapp/webhook',
      telegram: '/api/v1/integrations/telegram/webhook',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (integrationsApi.getStatus as any).mockResolvedValue({
      data: { success: true, data: mockStatus },
    });
  });

  it('renders integration status, pairing code, and channel cards', async () => {
    render(<IntegrationsPage />);

    expect(await screen.findByText('PAIR99')).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp Voice Companion/i)).toBeInTheDocument();
    expect(screen.getByText(/Telegram Bot Companion/i)).toBeInTheDocument();
    expect(screen.getAllByText('🟢 Connected').length).toBeGreaterThan(0);
  });

  it('allows user to generate a new pairing code', async () => {
    (integrationsApi.generatePairingCode as any).mockResolvedValue({
      data: { success: true, data: { pairingCode: 'NEW999' } },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const newCodeBtn = screen.getByText('🔄 New Code');
    fireEvent.click(newCodeBtn);

    await waitFor(() => {
      expect(integrationsApi.generatePairingCode).toHaveBeenCalled();
      expect(screen.getByText('NEW999')).toBeInTheDocument();
    });
  });

  it('allows user to link a new phone number with non-blocking toast', async () => {
    (integrationsApi.linkPhone as any).mockResolvedValue({
      data: { success: true, data: { phone: '+919988776655' } },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: '+919988776655' } });

    const saveBtns = screen.getAllByText('Save & Link');
    fireEvent.click(saveBtns[0]);

    await waitFor(() => {
      expect(integrationsApi.linkPhone).toHaveBeenCalledWith('+919988776655');
      expect(screen.getByText(/WhatsApp phone number linked successfully/i)).toBeInTheDocument();
    });
  });

  it('allows user to link a Telegram username or Chat ID', async () => {
    (integrationsApi.linkTelegram as any).mockResolvedValue({
      data: { success: true, data: { telegramChatId: '@voicetallyuser' } },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const tgInput = screen.getByPlaceholderText('@username or numeric Chat ID');
    fireEvent.change(tgInput, { target: { value: '@voicetallyuser' } });

    const saveBtns = screen.getAllByText('Save & Link');
    fireEvent.click(saveBtns[1]);

    await waitFor(() => {
      expect(integrationsApi.linkTelegram).toHaveBeenCalledWith('@voicetallyuser');
      expect(screen.getByText(/Telegram account linked successfully/i)).toBeInTheDocument();
    });
  });

  it('switches between WhatsApp and Telegram channel skins in simulator', async () => {
    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const telegramBtn = screen.getByRole('button', { name: /^Telegram$/i });
    fireEvent.click(telegramBtn);

    expect(await screen.findByText(/online • Double-Entry Agent/i)).toBeInTheDocument();
  });

  it('sends message via simulator and displays preview card with confirmation buttons', async () => {
    (integrationsApi.simulateChat as any).mockResolvedValue({
      data: {
        success: true,
        data: {
          text: '📋 Voucher Preview (PAYMENT)\n• Amount: ₹1,500.00\n• Debit: Groceries (Dr)\n• Credit: Cash (Cr)',
          previewCard: {
            voucherType: 'PAYMENT',
            formattedAmount: '₹1,500.00',
            debitAccount: 'Groceries',
            creditAccount: 'Cash',
            narration: 'Paid for groceries from Cash',
          },
          actionTaken: 'PREVIEW',
        },
      },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const input = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(input, { target: { value: 'Paid 1500 for groceries from cash' } });

    const sendBtn = screen.getByRole('button', { name: 'Send message' });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(integrationsApi.simulateChat).toHaveBeenCalledWith('WHATSAPP', 'Paid 1500 for groceries from cash', false);
      expect(screen.getByText('⚖️ Double-Entry Preview')).toBeInTheDocument();
      expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
      expect(screen.getByText('✅ Confirm & Post')).toBeInTheDocument();
    });

    // Test clicking Confirm button
    (integrationsApi.simulateChat as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          text: '✅ Voucher Successfully Recorded!\nConfirmed! Successfully recorded 1,500 rupees payment voucher.',
          actionTaken: 'POSTED',
        },
      },
    });

    const confirmBtn = screen.getByText('✅ Confirm & Post');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(integrationsApi.simulateChat).toHaveBeenCalledWith('WHATSAPP', 'YES', false);
      expect(screen.getByText(/Voucher Successfully Recorded/i)).toBeInTheDocument();
    });
  });

  it('toggles voice simulation mode in smartphone simulator', async () => {
    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const voiceToggleBtn = screen.getByRole('button', { name: 'Voice input toggle' });
    fireEvent.click(voiceToggleBtn);

    expect(screen.getByPlaceholderText(/Spoken voice note simulated/i)).toBeInTheDocument();
  });

  it('allows user to disconnect/unlink a channel with confirmation', async () => {
    (integrationsApi.unlinkChannel as any).mockResolvedValue({
      data: { success: true, message: 'WHATSAPP unlinked successfully.' },
    });
    window.confirm = vi.fn().mockReturnValue(true);

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const disconnectBtn = screen.getByText('Disconnect WhatsApp');
    fireEvent.click(disconnectBtn);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('disconnect WHATSAPP'));
      expect(integrationsApi.unlinkChannel).toHaveBeenCalledWith('WHATSAPP');
    });
  });

  it('triggers quick prompt chips in smartphone simulator', async () => {
    (integrationsApi.simulateChat as any).mockResolvedValue({
      data: {
        success: true,
        data: {
          text: '📊 Bank Balance: ₹50,000.00',
          actionTaken: 'QUERY',
        },
      },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const promptChip = screen.getByText('🏦 Bank Balance');
    fireEvent.click(promptChip);

    await waitFor(() => {
      expect(integrationsApi.simulateChat).toHaveBeenCalledWith('WHATSAPP', 'What is my bank balance?', false);
      expect(screen.getByText(/Bank Balance: ₹50,000.00/i)).toBeInTheDocument();
    });
  });

  it('toggles the Webhooks & API info drawer', async () => {
    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    expect(screen.queryByText(/Meta Verify Token/i)).not.toBeInTheDocument();
    const toggleBtn = screen.getByText(/Webhook & API Info/i);
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Meta Verify Token/i)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/integrations\/whatsapp\/webhook/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Hide Webhooks/i));
    expect(screen.queryByText(/Meta Verify Token/i)).not.toBeInTheDocument();
  });

  it('handles structured API errors gracefully without throwing React error', async () => {
    (integrationsApi.linkPhone as any).mockRejectedValue({
      response: {
        data: {
          success: false,
          error: {
            code: 'INVALID_PHONE',
            message: 'Phone number format is invalid',
          },
        },
      },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const phoneInput = screen.getByPlaceholderText('+91 98765 43210');
    fireEvent.change(phoneInput, { target: { value: 'invalid-num' } });

    const saveBtns = screen.getAllByText('Save & Link');
    fireEvent.click(saveBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Phone number format is invalid')).toBeInTheDocument();
    });
  });

  it('allows 1-click quick pairing directly inside simulator when unlinked', async () => {
    (integrationsApi.getStatus as any).mockResolvedValue({
      data: {
        success: true,
        data: { ...mockStatus, isPhoneLinked: false, phone: null },
      },
    });
    (integrationsApi.simulateChat as any).mockResolvedValue({
      data: {
        success: true,
        data: {
          text: 'Account linked successfully! You can now send voice notes.',
          actionTaken: 'PAIRING',
        },
      },
    });

    render(<IntegrationsPage />);
    await screen.findByText('PAIR99');

    const quickPairBtn = screen.getByRole('button', { name: /⚡ Pair in 1-Click/i });
    fireEvent.click(quickPairBtn);

    await waitFor(() => {
      expect(integrationsApi.simulateChat).toHaveBeenCalledWith('WHATSAPP', 'PAIR PAIR99', false);
    });
  });
});
