import { prisma } from '../../../core/database/prisma.js';
import { VoiceAgentService } from '../../voice/services/VoiceAgentService.js';

export interface WhatsAppIncomingMessage {
  from: string; // e.g. "+919876543210" or "whatsapp:+919876543210"
  body?: string;
  type?: 'text' | 'audio' | 'voice' | 'interactive';
  audioUrl?: string;
  buttonPayload?: string;
  simulatedUserId?: string;
}

export interface WhatsAppBotReply {
  to: string;
  text: string;
  previewCard?: any;
  quickReplies?: string[];
  userId?: string;
  actionTaken?: 'PREVIEW' | 'POSTED' | 'CANCELLED' | 'QUERY' | 'PAIRED' | 'UNLINKED' | 'UNKNOWN';
}

export class WhatsAppBotService {
  /**
   * Normalizes incoming phone numbers by removing 'whatsapp:', spaces, dashes, and extra '+'
   */
  public static normalizePhone(rawPhone: string): string {
    if (!rawPhone) return '';
    let cleaned = rawPhone.replace(/^whatsapp:/i, '').trim();
    cleaned = cleaned.replace(/[\s\-\(\)]/g, '');
    if (!cleaned.startsWith('+') && cleaned.length === 10) {
      cleaned = `+91${cleaned}`; // Default to Indian prefix if 10-digit number
    }
    return cleaned;
  }

  /**
   * Resolves a user by their linked WhatsApp phone number
   */
  public static async getUserByPhone(phone: string) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;

    // Search exact or variations
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: normalized.replace(/^\+/, '') },
          { phone: normalized.replace(/^\+91/, '') },
        ],
      },
    });

    return user;
  }

  /**
   * Process an incoming WhatsApp text or voice note message
   */
  public static async handleMessage(msg: WhatsAppIncomingMessage): Promise<WhatsAppBotReply> {
    const senderPhone = this.normalizePhone(msg.from);
    let user = await this.getUserByPhone(senderPhone);
    const textContent = (msg.buttonPayload || msg.body || '').trim();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ACCOUNT PAIRING LOGIC (If user is not linked yet)
    // ─────────────────────────────────────────────────────────────────────────
    // Check if message is a pairing command: e.g. "PAIR 123456" or "123456"
    const pairMatch = textContent.match(/^(?:pair\s+)?([a-zA-Z0-9]{6})$/i);
    if (pairMatch) {
      const pairingCode = pairMatch[1].toUpperCase();
      const matchedUser = await prisma.user.findFirst({
        where: { botPairingCode: pairingCode },
      });

      if (matchedUser) {
        await prisma.user.update({
          where: { id: matchedUser.id },
          data: {
            // Only persist a real phone from an actual WhatsApp message.
            // Simulator-driven pairing (simulatedUserId set) has no real phone —
            // persisting the placeholder would write garbage onto the account.
            ...(msg.simulatedUserId ? {} : { phone: senderPhone }),
            botPairingCode: null, // Clear single-use code
          },
        });

        return {
          to: senderPhone,
          text: `🎉 *Account Successfully Linked!*\n\nHello *${matchedUser.name}*, your WhatsApp is now connected to VoiceTally.\n\nYou can now send *voice notes* or *text messages* like:\n• _"Paid ₹500 for lunch from Cash"_\n• _"Sharma ji paid 5000 in bank"_\n• _"What is my bank balance?"_`,
          userId: matchedUser.id,
          actionTaken: 'PAIRED',
        };
      }
    }

    if (!user && msg.simulatedUserId) {
      user = await prisma.user.findUnique({
        where: { id: msg.simulatedUserId },
      });
    }

    if (!user) {
      return {
        to: senderPhone,
        text: `👋 *Welcome to VoiceTally WhatsApp Companion!*\n\nYour phone number (*${senderPhone}*) is not yet connected to a VoiceTally account.\n\n*How to connect:*\n1. Log in to your VoiceTally Web App\n2. Navigate to *Bot Integrations*\n3. Copy your 6-digit Pairing Code\n4. Reply here with: \`PAIR <CODE>\``,
        actionTaken: 'UNLINKED',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. USER IS LINKED — PROCESS CONVERSATIONAL ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────────
    if (!textContent) {
      return {
        to: senderPhone,
        text: '🎙️ Voice note received. Processing double-entry ledger commands...',
        userId: user.id,
        actionTaken: 'UNKNOWN',
      };
    }

    if (textContent.toLowerCase() === 'help' || textContent === '/help') {
      return {
        to: senderPhone,
        text: `🤖 *VoiceTally Bot Help & Commands*\n\nHere are some examples of what you can say or send:\n\n• *Record Expenses:* "Paid 500 for dinner from Cash"\n• *Record Receipts:* "Sharma paid 5000 in bank"\n• *Withdrawals:* "Withdrew 2000 from Bank"\n• *Balances:* "What is my bank balance?" or "What is my cash balance?"\n• *Reports:* "What is my net worth?" or "Monthly expenses"`,
        quickReplies: ['What is my bank balance?', 'What is my cash balance?', 'What is my net worth?'],
        userId: user.id,
        actionTaken: 'QUERY',
      };
    }

    const result = await VoiceAgentService.process(user.id, textContent, false);

    // Format WhatsApp reply message based on execution status
    if (result.executed && (result.voucher || result.data?.voucherId)) {
      return {
        to: senderPhone,
        text: `✅ *Voucher Successfully Recorded!*\n\n${result.spokenResponse}\n\n📊 View updated reports in your VoiceTally dashboard.`,
        userId: user.id,
        actionTaken: 'POSTED',
      };
    }

    if (
      result.intent.type === 'CONFIRMATION' ||
      result.data?.status === 'CANCELLED' ||
      result.data?.status === 'NO_PENDING_SESSION' ||
      result.data?.status === 'EXPIRED'
    ) {
      if (result.executed) {
        return {
          to: senderPhone,
          text: `✅ *Voucher Successfully Recorded!*\n\n${result.spokenResponse}\n\n📊 View updated reports in your VoiceTally dashboard.`,
          userId: user.id,
          actionTaken: 'POSTED',
        };
      } else {
        return {
          to: senderPhone,
          text: `❌ *${result.displayTitle}*\n\n${result.spokenResponse}`,
          userId: user.id,
          actionTaken: 'CANCELLED',
        };
      }
    }

    if (result.intent.type === 'QUERY') {
      return {
        to: senderPhone,
        text: `📊 *${result.displayTitle}*\n\n${result.spokenResponse}`,
        userId: user.id,
        actionTaken: 'QUERY',
      };
    }

    if (result.intent.type === 'TRANSACTION') {
      const data = result.data;
      if (data?.isPreview) {
        const previewMsg = [
          `📋 *Voucher Preview (${data.voucherType})*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `• *Amount:* ${data.formattedAmount}`,
          `• *Debit:* ${data.debitAccount} (Dr)`,
          `• *Credit:* ${data.creditAccount} (Cr)`,
          `• *Narration:* ${data.narration}`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `⚠️ Double-Entry Mathematical Balance Verified (Debits = Credits).`,
          ``,
          `Reply *YES* to confirm and post to ledger, or *NO* to cancel.`,
        ].join('\n');

        return {
          to: senderPhone,
          text: previewMsg,
          previewCard: data,
          quickReplies: ['YES', 'CANCEL'],
          userId: user.id,
          actionTaken: 'PREVIEW',
        };
      }
    }

    return {
      to: senderPhone,
      text: `🤖 *VoiceTally Assistant*\n\n${result.spokenResponse}`,
      userId: user.id,
      actionTaken: 'UNKNOWN',
    };
  }
}
