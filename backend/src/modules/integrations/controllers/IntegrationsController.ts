import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../core/database/prisma.js';
import { WhatsAppBotService } from '../services/WhatsAppBotService.js';
import { TelegramBotService } from '../services/TelegramBotService.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const IntegrationsController = {
  /**
   * Meta WhatsApp Webhook Challenge Verification (GET)
   */
  async verifyWhatsAppWebhook(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'voicetally_webhook_secret_2026';

    if (mode === 'subscribe' && token === expectedToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: 'Forbidden: Invalid verify token' });
    }
  },

  /**
   * Incoming WhatsApp Webhook (POST) - Supports Meta Cloud API & Twilio Form/JSON
   */
  async handleWhatsAppWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let fromNumber = '';
      let bodyText = '';
      let buttonPayload = '';

      // Meta Cloud API format
      if (req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = req.body.entry[0].changes[0].value.messages[0];
        fromNumber = msg.from;
        if (msg.type === 'text') bodyText = msg.text?.body || '';
        if (msg.type === 'interactive') {
          buttonPayload = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '';
        }
      }
      // Twilio format (From, Body)
      else if (req.body?.From || req.body?.from) {
        fromNumber = req.body.From || req.body.from;
        bodyText = req.body.Body || req.body.body || '';
        buttonPayload = req.body.ButtonPayload || '';
      }
      // Direct JSON simulator payload format
      else if (req.body?.sender || req.body?.phone) {
        fromNumber = req.body.sender || req.body.phone;
        bodyText = req.body.message || req.body.text || '';
      }

      if (!fromNumber) {
        res.status(400).json({ error: 'Missing sender phone number in payload' });
        return;
      }

      const reply = await WhatsAppBotService.handleMessage({
        from: fromNumber,
        body: bodyText,
        buttonPayload,
      });

      res.status(200).json({
        success: true,
        reply,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Incoming Telegram Webhook (POST)
   */
  async handleTelegramWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // SECURITY: The public webhook must never accept a caller-supplied identity.
      // 'simulatedUserId' is an internal-only field used by the authenticated
      // simulator endpoint; strip it so external callers cannot impersonate users.
      const { simulatedUserId: _stripped, ...update } = req.body ?? {};
      const reply = await TelegramBotService.handleUpdate(update);

      res.status(200).json({
        success: true,
        reply,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current user's integration status and pairing code (GET /status)
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      let user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          telegramChatId: true,
          botPairingCode: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // If no pairing code, generate one automatically
      if (!user.botPairingCode) {
        const newCode = generateRandomCode();
        user = await prisma.user.update({
          where: { id: userId },
          data: { botPairingCode: newCode },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            telegramChatId: true,
            botPairingCode: true,
          },
        });
      }

      res.status(200).json({
        success: true,
        data: {
          phone: user.phone,
          isPhoneLinked: !!user.phone,
          telegramChatId: user.telegramChatId,
          isTelegramLinked: !!user.telegramChatId,
          pairingCode: user.botPairingCode,
          whatsappBotNumber: process.env.WHATSAPP_BOT_NUMBER || '+1 415 523 8886',
          telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'VoiceTallyBot',
          webhookUrls: {
            whatsapp: '/api/integrations/whatsapp/webhook',
            telegram: '/api/integrations/telegram/webhook',
            whatsappV1: '/api/v1/integrations/whatsapp/webhook',
            telegramV1: '/api/v1/integrations/telegram/webhook',
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Link or update user's WhatsApp phone number (POST /link-phone)
   */
  async linkPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { phone } = req.body;

      if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
        throw new ValidationError('Valid phone number is required', {
          phone: ['Please provide a valid phone number with country code'],
        });
      }

      const normalized = WhatsAppBotService.normalizePhone(phone);

      // Check if already used by another user
      const existing = await prisma.user.findFirst({
        where: {
          phone: normalized,
          id: { not: userId },
        },
      });

      if (existing) {
        throw new ValidationError('Phone number already linked to another account', {
          phone: ['This phone number is already registered to another VoiceTally user.'],
        });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { phone: normalized },
        select: { id: true, phone: true },
      });

      res.status(200).json({
        success: true,
        data: {
          phone: updated.phone,
          message: 'WhatsApp phone number successfully linked!',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Link or update user's Telegram Chat ID or handle (POST /link-telegram)
   */
  async linkTelegram(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { telegramChatId } = req.body;

      if (!telegramChatId || typeof telegramChatId !== 'string' || telegramChatId.trim().length < 2) {
        throw new ValidationError('Valid Telegram Chat ID or username is required', {
          telegramChatId: ['Please provide a valid Telegram username or numeric Chat ID'],
        });
      }

      const cleaned = telegramChatId.trim().replace(/^@/, '');

      // Check if already used by another user
      const existing = await prisma.user.findFirst({
        where: {
          telegramChatId: cleaned,
          id: { not: userId },
        },
      });

      if (existing) {
        throw new ValidationError('Telegram account already linked to another user', {
          telegramChatId: ['This Telegram account is already associated with another VoiceTally account.'],
        });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: cleaned },
        select: { id: true, telegramChatId: true },
      });

      res.status(200).json({
        success: true,
        data: {
          telegramChatId: updated.telegramChatId,
          message: 'Telegram account successfully linked!',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Generate a fresh pairing code (POST /generate-code)
   */
  async generatePairingCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const code = generateRandomCode();

      await prisma.user.update({
        where: { id: userId },
        data: { botPairingCode: code },
      });

      res.status(200).json({
        success: true,
        data: { pairingCode: code },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Unlink WhatsApp or Telegram channel (POST /unlink)
   */
  async unlinkChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { channel } = req.body; // 'WHATSAPP' | 'TELEGRAM'

      if (channel === 'WHATSAPP') {
        await prisma.user.update({
          where: { id: userId },
          data: { phone: null },
        });
      } else if (channel === 'TELEGRAM') {
        await prisma.user.update({
          where: { id: userId },
          data: { telegramChatId: null },
        });
      }

      res.status(200).json({
        success: true,
        message: `${channel} unlinked successfully.`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Interactive Simulator Chat Endpoint (POST /simulator/chat)
   */
  async simulateChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { channel, message, isVoice } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (channel === 'TELEGRAM') {
        const chatId = user.telegramChatId ? parseInt(user.telegramChatId, 10) || 99887766 : 99887766;
        const reply = await TelegramBotService.handleUpdate({
          update_id: Date.now(),
          message: {
            message_id: Date.now(),
            from: { id: chatId, first_name: user.name },
            chat: { id: chatId, type: 'private' },
            text: message,
          },
          simulatedUserId: userId,
        });

        res.status(200).json({
          success: true,
          data: reply,
        });
        return;
      }

      // Default: WhatsApp simulation. Use a unique placeholder per call so an
      // unlinked user's PAIR command never overwrites another user's phone,
      // and never persists a placeholder phone onto a real linked account.
      const phone = user.phone || `+9999${Date.now().toString().slice(-9)}`;
      const reply = await WhatsAppBotService.handleMessage({
        from: phone,
        body: message,
        type: isVoice ? 'voice' : 'text',
        simulatedUserId: userId,
      });

      res.status(200).json({
        success: true,
        data: reply,
      });
    } catch (error) {
      next(error);
    }
  },
};
