import { prisma } from '../../../core/database/prisma.js';
import { VoiceAgentService } from '../../voice/services/VoiceAgentService.js';

export interface TelegramIncomingUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    voice?: {
      file_id: string;
      duration: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name?: string;
    };
    data: string; // e.g. "CONFIRM_YES" or "CONFIRM_CANCEL"
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
  };
}

export interface TelegramBotReply {
  chatId: number | string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  userId?: string;
  actionTaken?: 'PREVIEW' | 'POSTED' | 'CANCELLED' | 'QUERY' | 'PAIRED' | 'UNLINKED' | 'COMMAND' | 'UNKNOWN';
}

export class TelegramBotService {
  /**
   * Resolves a user by their linked Telegram chat ID
   */
  public static async getUserByChatId(chatId: string | number) {
    const idStr = chatId.toString();
    const user = await prisma.user.findFirst({
      where: { telegramChatId: idStr },
    });
    return user;
  }

  /**
   * Process an incoming Telegram update (Text, Voice, /start, Callback Query)
   */
  public static async handleUpdate(update: TelegramIncomingUpdate): Promise<TelegramBotReply> {
    const chatId = update.callback_query?.message?.chat?.id || update.message?.chat?.id || 0;
    const fromId = update.callback_query?.from?.id || update.message?.from?.id || 0;
    const text = update.callback_query?.data || update.message?.text || '';

    let user = await this.getUserByChatId(chatId || fromId);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TELEGRAM ACCOUNT PAIRING LOGIC (/start <pairingCode>)
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const code = parts[1]?.trim().toUpperCase();

      if (code) {
        const matchedUser = await prisma.user.findFirst({
          where: { botPairingCode: code },
        });

        if (matchedUser) {
          await prisma.user.update({
            where: { id: matchedUser.id },
            data: {
              telegramChatId: (chatId || fromId).toString(),
              botPairingCode: null,
            },
          });

          return {
            chatId,
            text: `🎉 <b>Welcome, ${matchedUser.name}!</b>\n\nYour Telegram is now securely paired with VoiceTally.\n\nYou can now send text or voice messages to log double-entry vouchers:\n• <i>"Paid 500 for lunch from Cash"</i>\n• <i>"Rahul paid 10000 in bank"</i>\n• <i>"What is my bank balance?"</i>`,
            parseMode: 'HTML',
            userId: matchedUser.id,
            actionTaken: 'PAIRED',
          };
        }
      }

      if (!user) {
        return {
          chatId,
          text: `👋 <b>Welcome to VoiceTally Telegram Companion!</b>\n\nTo pair your account:\n1. Open your VoiceTally Web App\n2. Go to <b>Bot Integrations</b>\n3. Click <b>Pair Telegram</b> or send <code>/start &lt;YOUR_6_DIGIT_CODE&gt;</code> here.`,
          parseMode: 'HTML',
          actionTaken: 'UNLINKED',
        };
      }
    }

    if (!user) {
      return {
        chatId,
        text: `🔒 <b>Account Not Linked</b>\n\nPlease pair your Telegram account in VoiceTally Settings to use the Voice Ledger Bot.\nSend <code>/start &lt;CODE&gt;</code> to connect.`,
        parseMode: 'HTML',
        actionTaken: 'UNLINKED',
      };
    }

    if (!text) {
      return {
        chatId,
        text: '🎙️ <b>Voice note received.</b> Processing double-entry ledger commands...',
        parseMode: 'HTML',
        userId: user.id,
        actionTaken: 'UNKNOWN',
      };
    }

    if (text === '/help' || text.toLowerCase() === 'help') {
      return {
        chatId,
        text: `🤖 <b>VoiceTally Bot Help & Commands</b>\n\n<b>Quick Shortcuts:</b>\n• /bank — Check bank balance\n• /cash — Check cash balance\n• /pnl — Monthly income & profit\n• /networth — Financial position\n• /recent — Recent vouchers\n\n<b>Natural Voice & Text Commands:</b>\n• <i>"Paid 500 for lunch from Cash"</i>\n• <i>"Sharma paid 5000 in bank"</i>\n• <i>"Withdrew 2000 from Bank"</i>`,
        parseMode: 'HTML',
        inlineKeyboard: [
          [
            { text: '🏦 /bank', callback_data: '/bank' },
            { text: '💵 /cash', callback_data: '/cash' },
          ],
          [
            { text: '📈 /pnl', callback_data: '/pnl' },
            { text: '💎 /networth', callback_data: '/networth' },
          ],
        ],
        userId: user.id,
        actionTaken: 'COMMAND',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. QUICK SLASH COMMAND SHORTCUTS
    // ─────────────────────────────────────────────────────────────────────────
    let queryText = text;
    if (text === '/balance' || text === '/bank') queryText = 'What is my bank balance?';
    if (text === '/cash') queryText = 'What is my cash balance?';
    if (text === '/networth') queryText = 'What is my net worth?';
    if (text === '/expenses') queryText = 'What are my total expenses this month?';
    if (text === '/income' || text === '/pnl') queryText = 'What is my total income this month?';
    if (text === '/recent') queryText = 'Show recent transactions';
    if (text === 'CONFIRM_YES') queryText = 'yes';
    if (text === 'CONFIRM_CANCEL') queryText = 'cancel';

    // ─────────────────────────────────────────────────────────────────────────
    // 3. RUN CONVERSATIONAL ACCOUNTING AGENT
    // ─────────────────────────────────────────────────────────────────────────
    const result = await VoiceAgentService.process(user.id, queryText, false);

    // Format Telegram reply message based on execution status
    if (result.executed && (result.voucher || result.data?.voucherId)) {
      return {
        chatId,
        text: `✅ <b>Voucher Recorded Successfully!</b>\n\n${result.spokenResponse}`,
        parseMode: 'HTML',
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
          chatId,
          text: `✅ <b>Voucher Recorded Successfully!</b>\n\n${result.spokenResponse}`,
          parseMode: 'HTML',
          userId: user.id,
          actionTaken: 'POSTED',
        };
      } else {
        return {
          chatId,
          text: `❌ <b>${result.displayTitle}</b>\n\n${result.spokenResponse}`,
          parseMode: 'HTML',
          userId: user.id,
          actionTaken: 'CANCELLED',
        };
      }
    }

    if (result.intent.type === 'QUERY') {
      return {
        chatId,
        text: `📊 <b>${result.displayTitle}</b>\n\n${result.spokenResponse}`,
        parseMode: 'HTML',
        userId: user.id,
        actionTaken: 'QUERY',
      };
    }

    if (result.intent.type === 'TRANSACTION') {
      const data = result.data;
      if (data?.isPreview) {
        const previewMsg = [
          `📋 <b>Voucher Preview (${data.voucherType})</b>`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `• <b>Amount:</b> ${data.formattedAmount}`,
          `• <b>Debit:</b> ${data.debitAccount} (Dr)`,
          `• <b>Credit:</b> ${data.creditAccount} (Cr)`,
          `• <b>Narration:</b> ${data.narration}`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `<i>⚖️ Double-entry mathematical balance verified.</i>`,
        ].join('\n');

        return {
          chatId,
          text: previewMsg,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              { text: '✅ Confirm & Post', callback_data: 'CONFIRM_YES' },
              { text: '❌ Cancel', callback_data: 'CONFIRM_CANCEL' },
            ],
          ],
          userId: user.id,
          actionTaken: 'PREVIEW',
        };
      }
    }

    return {
      chatId,
      text: `🤖 <b>VoiceTally Assistant</b>\n\n${result.spokenResponse}`,
      parseMode: 'HTML',
      userId: user.id,
      actionTaken: 'UNKNOWN',
    };
  }
}
