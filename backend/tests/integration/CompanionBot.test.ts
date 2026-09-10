import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';
import { WhatsAppBotService } from '../../src/modules/integrations/services/WhatsAppBotService.js';
import { TelegramBotService } from '../../src/modules/integrations/services/TelegramBotService.js';
import jwt from 'jsonwebtoken';

describe('WhatsApp & Telegram Companion Bot Suite', () => {
  let userId: string;
  let authToken: string;
  const suffix = Date.now().toString().slice(-6);
  let userPhone = `+91987${suffix}`;
  let telegramChatId = `123${suffix}`;
  let pairingCode = `BT${suffix.slice(-4)}`;

  beforeAll(async () => {
    // Delete any stale test user with conflicting fields
    const staleUsers = await prisma.user.findMany({
      where: {
        OR: [
          { phone: userPhone },
          { telegramChatId: telegramChatId },
          { botPairingCode: pairingCode },
        ],
      },
      select: { id: true },
    });

    for (const u of staleUsers) {
      await prisma.journalLine.deleteMany({ where: { account: { userId: u.id } } });
      await prisma.journalEntry.deleteMany({ where: { userId: u.id } });
      await prisma.account.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `bot_test_${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Bot Tester',
        phone: userPhone,
        telegramChatId: telegramChatId,
        botPairingCode: pairingCode,
      },
    });
    userId = user.id;

    authToken = jwt.sign(
      { userId, email: user.email },
      process.env.JWT_SECRET || 'test_secret',
      { expiresIn: '1h' }
    );

    // Create Bank and Expense accounts
    await prisma.account.create({
      data: { userId, name: 'Bank', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 50000 },
    });
    await prisma.account.create({
      data: { userId, name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 10000 },
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.journalLine.deleteMany({ where: { account: { userId } } });
      await prisma.journalEntry.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  describe('WhatsApp Companion Bot', () => {
    it('returns unlinked onboarding instructions for unknown phone number', async () => {
      const reply = await WhatsAppBotService.handleMessage({
        from: '+919999900000',
        body: 'Hello',
      });

      expect(reply.actionTaken).toBe('UNLINKED');
      expect(reply.text).toContain('Welcome to VoiceTally WhatsApp Companion');
    });

    it('pairs a new phone number when valid 6-digit pairing code is provided', async () => {
      // Create user with active code
      const newUser = await prisma.user.create({
        data: {
          email: `pair_test_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Pairing Candidate',
          botPairingCode: 'PAIR99',
        },
      });

      const reply = await WhatsAppBotService.handleMessage({
        from: '+919811122233',
        body: 'PAIR99',
      });

      expect(reply.actionTaken).toBe('PAIRED');
      expect(reply.text).toContain('Account Successfully Linked');

      const updated = await prisma.user.findUnique({ where: { id: newUser.id } });
      expect(updated?.phone).toBe('+919811122233');

      // Cleanup
      await prisma.user.delete({ where: { id: newUser.id } });
    });

    it('processes transaction request and returns double-entry preview card with YES/CANCEL guidance', async () => {
      const reply = await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'Paid 3500 for electricity bill using Bank',
      });

      expect(reply.actionTaken).toBe('PREVIEW');
      expect(reply.text).toContain('Voucher Preview');
      expect(reply.text).toContain('₹3,500.00');
      expect(reply.text).toContain('Debit:');
      expect(reply.text).toContain('Credit:');
      expect(reply.quickReplies).toContain('YES');
    });

    it('confirms and records the pending voucher when user replies YES', async () => {
      // First preview
      await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'Paid 1500 for groceries from Cash',
      });

      // Confirm
      const reply = await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'YES',
      });

      expect(reply.actionTaken).toBe('POSTED');
      expect(reply.text).toContain('Voucher Successfully Recorded');
      expect(reply.text).toContain('1,500 rupees');
    });

    it('answers read-only balance queries over WhatsApp', async () => {
      const reply = await WhatsAppBotService.handleMessage({
        from: userPhone,
        body: 'What is my bank balance?',
      });

      expect(reply.actionTaken).toBe('QUERY');
      expect(reply.text).toContain('Bank Balance');
    });
  });

  describe('Telegram Companion Bot', () => {
    it('answers /balance and /bank shortcuts', async () => {
      const reply = await TelegramBotService.handleUpdate({
        update_id: 101,
        message: {
          message_id: 1,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: '/bank',
        },
      });

      expect(reply.actionTaken).toBe('QUERY');
      expect(reply.text).toContain('Bank balance');
    });

    it('generates transaction preview and supports inline callback CONFIRM_YES', async () => {
      const preview = await TelegramBotService.handleUpdate({
        update_id: 102,
        message: {
          message_id: 2,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: 'Paid 2500 for office supplies from Bank',
        },
      });

      expect(preview.actionTaken).toBe('PREVIEW');
      expect(preview.inlineKeyboard).toBeDefined();

      // Send callback confirmation
      const confirmReply = await TelegramBotService.handleUpdate({
        update_id: 103,
        callback_query: {
          id: 'cb_123',
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          data: 'CONFIRM_YES',
          message: {
            message_id: 2,
            chat: { id: parseInt(telegramChatId, 10) },
          },
        },
      });

      expect(confirmReply.actionTaken).toBe('POSTED');
      expect(confirmReply.text).toContain('Voucher Recorded Successfully');
    });
    it('answers /help command on Telegram with inline shortcuts', async () => {
      const reply = await TelegramBotService.handleUpdate({
        update_id: 104,
        message: {
          message_id: 4,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: '/help',
        },
      });

      expect(reply.actionTaken).toBe('COMMAND');
      expect(reply.text).toContain('VoiceTally Bot Help & Commands');
      expect(reply.inlineKeyboard).toBeDefined();
    });

    it('cancels pending voucher when user clicks CONFIRM_CANCEL or replies NO', async () => {
      // Create preview
      await TelegramBotService.handleUpdate({
        update_id: 105,
        message: {
          message_id: 5,
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          chat: { id: parseInt(telegramChatId, 10), type: 'private' },
          text: 'Paid 800 for snacks using Cash',
        },
      });

      // Cancel
      const cancelReply = await TelegramBotService.handleUpdate({
        update_id: 106,
        callback_query: {
          id: 'cb_cancel_1',
          from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
          data: 'CONFIRM_CANCEL',
          message: {
            message_id: 5,
            chat: { id: parseInt(telegramChatId, 10) },
          },
        },
      });

      expect(cancelReply.actionTaken).toBe('CANCELLED');
      expect(cancelReply.text).toContain('Transaction cancelled');
    });
  });

  describe('Integrations HTTP Endpoints & Webhook Security', () => {
    it('verifies Meta WhatsApp webhook challenge on GET with valid token', async () => {
      const res = await request(app)
        .get('/api/integrations/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN || 'voicetally_webhook_secret_2026',
          'hub.challenge': 'CHALLENGE_ACCEPTED_123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('CHALLENGE_ACCEPTED_123');
    });

    it('returns 403 on invalid verify token', async () => {
      const res = await request(app)
        .get('/api/integrations/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_secret',
          'hub.challenge': 'CHALLENGE_FAIL',
        });

      expect(res.status).toBe(403);
    });

    it('processes incoming Meta format WhatsApp webhook POST', async () => {
      const res = await request(app)
        .post('/api/integrations/whatsapp/webhook')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: userPhone,
                        type: 'text',
                        text: { body: 'What is my bank balance?' },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reply.text).toContain('Bank Balance');
    });

    it('processes incoming Telegram webhook POST', async () => {
      const res = await request(app)
        .post('/api/integrations/telegram/webhook')
        .send({
          update_id: 999,
          message: {
            message_id: 1,
            from: { id: parseInt(telegramChatId, 10), first_name: 'Tester' },
            chat: { id: parseInt(telegramChatId, 10), type: 'private' },
            text: '/cash',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reply.text).toContain('Cash in Hand');
    });

    it('fetches integration status and pairing code for authenticated user', async () => {
      const res = await request(app)
        .get('/api/integrations/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe(userPhone);
      expect(res.body.data.isPhoneLinked).toBe(true);
      expect(res.body.data.pairingCode).toBeDefined();
    });

    it('generates a fresh pairing code on POST /generate-code', async () => {
      const res = await request(app)
        .post('/api/integrations/generate-code')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pairingCode).toBeDefined();
      expect(res.body.data.pairingCode.length).toBe(6);
    });

    it('updates WhatsApp phone number for authenticated user', async () => {
      const res = await request(app)
        .post('/api/integrations/link-phone')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ phone: '+919988776655' });

      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe('+919988776655');

      // Revert phone
      await prisma.user.update({
        where: { id: userId },
        data: { phone: userPhone },
      });
    });

    it('unlinks channel on POST /unlink', async () => {
      const res = await request(app)
        .post('/api/integrations/unlink')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ channel: 'TELEGRAM' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.telegramChatId).toBeNull();

      // Restore telegramChatId for remaining tests
      await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId },
      });
    });

    it('handles interactive simulator chat endpoint for both WhatsApp and Telegram', async () => {
      const waRes = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'WHATSAPP',
          message: 'What is my cash balance?',
          isVoice: false,
        });

      expect(waRes.status).toBe(200);
      expect(waRes.body.success).toBe(true);
      expect(waRes.body.data.text).toContain('Cash in Hand');

      const tgRes = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'TELEGRAM',
          message: '/pnl',
        });

      expect(tgRes.status).toBe(200);
      expect(tgRes.body.success).toBe(true);
      expect(tgRes.body.data.text).toContain('Revenue');
    });

    it('links Telegram account via POST /link-telegram', async () => {
      const res = await request(app)
        .post('/api/integrations/link-telegram')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ telegramChatId: '@audit_tester' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.telegramChatId).toBe('audit_tester');

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.telegramChatId).toBe('audit_tester');
    });

    it('supports webhook calls via /api/v1/integrations alias', async () => {
      const res = await request(app)
        .get('/api/v1/integrations/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'voicetally_webhook_secret_2026',
          'hub.challenge': 'V1_CHALLENGE_TEST',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('V1_CHALLENGE_TEST');
    });

    it('allows unlinked users to seamlessly test simulator without Account Not Linked error', async () => {
      // Create user without linked phone or telegram
      const unlinkedUser = await prisma.user.create({
        data: {
          email: `sim_unlinked_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Sim Unlinked User',
        },
      });

      const unlinkedToken = jwt.sign(
        { userId: unlinkedUser.id, email: unlinkedUser.email },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '1h' }
      );

      // Create a Cash account for them
      await prisma.account.create({
        data: { userId: unlinkedUser.id, name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 7500 },
      });

      // Test WhatsApp simulator without phone linked
      const waRes = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${unlinkedToken}`)
        .send({
          channel: 'WHATSAPP',
          message: 'What is my cash balance?',
          isVoice: false,
        });

      expect(waRes.status).toBe(200);
      expect(waRes.body.success).toBe(true);
      expect(waRes.body.data.text).toContain('Cash');

      // Test Telegram simulator without chat ID linked
      const tgRes = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${unlinkedToken}`)
        .send({
          channel: 'TELEGRAM',
          message: '/cash',
          isVoice: false,
        });

      expect(tgRes.status).toBe(200);
      expect(tgRes.body.success).toBe(true);
      expect(tgRes.body.data.text).toContain('Cash');

      // Cleanup
      await prisma.account.deleteMany({ where: { userId: unlinkedUser.id } });
      await prisma.user.delete({ where: { id: unlinkedUser.id } });
    });

    it('rejects simulatedUserId spoofing on the public Telegram webhook', async () => {
      // Victim: a user with NO telegram linked but with accounts
      const victim = await prisma.user.create({
        data: {
          email: `spoof_victim_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Spoof Victim',
        },
      });
      await prisma.account.create({
        data: { userId: victim.id, name: 'Cash', type: 'ASSET', subtype: 'CASH_BANK', cachedBalance: 4242 },
      });

      // Attacker hits the PUBLIC webhook with the victim's user id injected
      const res = await request(app)
        .post('/api/integrations/telegram/webhook')
        .send({
          update_id: 777,
          message: {
            message_id: 7,
            from: { id: 555000, first_name: 'Attacker' },
            chat: { id: 555000, type: 'private' },
            text: '/cash',
          },
          simulatedUserId: victim.id,
        });

      expect(res.status).toBe(200);
      // Must be treated as unlinked — NOT processed against the victim's ledger
      expect(res.body.reply.actionTaken).toBe('UNLINKED');
      expect(res.body.reply.text).not.toContain('4242');

      await prisma.account.deleteMany({ where: { userId: victim.id } });
      await prisma.user.delete({ where: { id: victim.id } });
    });

    it('simulator PAIR does not overwrite another user\u0027s phone or persist placeholder phone', async () => {
      // userA stays linked with a real phone; userB is unlinked with a pairing code
      const phoneA = `+9181000${Date.now().toString().slice(-6)}`;
      const userA = await prisma.user.create({
        data: {
          email: `pair_a_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Linked User A',
          phone: phoneA,
        },
      });
      const codeB = `PB${Date.now().toString().slice(-4)}`;
      const userB = await prisma.user.create({
        data: {
          email: `pair_b_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Unlinked User B',
          botPairingCode: codeB,
        },
      });
      const tokenB = jwt.sign(
        { userId: userB.id, email: userB.email },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ channel: 'WHATSAPP', message: `PAIR ${codeB}`, isVoice: false });

      expect(res.status).toBe(200);
      expect(res.body.data.actionTaken).toBe('PAIRED');

      const afterA = await prisma.user.findUnique({ where: { id: userA.id } });
      const afterB = await prisma.user.findUnique({ where: { id: userB.id } });

      // userA's real phone untouched; userB gets NO fake placeholder phone
      expect(afterA?.phone).toBe(phoneA);
      expect(afterB?.phone).toBeNull();
      expect(afterB?.botPairingCode).toBeNull(); // pairing code still consumed

      await prisma.user.delete({ where: { id: userA.id } });
      await prisma.user.delete({ where: { id: userB.id } });
    });

    it('simulator /start pairing does not overwrite a real linked Telegram chat ID', async () => {
      // userC real-linked Telegram; userD unlinked with a pairing code
      const chatIdC = `777${Date.now().toString().slice(-6)}`;
      const userC = await prisma.user.create({
        data: {
          email: `tg_c_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Real Tg User C',
          telegramChatId: chatIdC,
        },
      });
      const codeD = `TD${Date.now().toString().slice(-4)}`;
      const userD = await prisma.user.create({
        data: {
          email: `tg_d_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Sim Tg User D',
          botPairingCode: codeD,
        },
      });
      const tokenD = jwt.sign(
        { userId: userD.id, email: userD.email },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${tokenD}`)
        .send({ channel: 'TELEGRAM', message: `/start ${codeD}`, isVoice: false });

      expect(res.status).toBe(200);
      expect(res.body.data.actionTaken).toBe('PAIRED');

      const afterC = await prisma.user.findUnique({ where: { id: userC.id } });
      const afterD = await prisma.user.findUnique({ where: { id: userD.id } });

      // userC's real chat ID untouched; userD does NOT get a fake chat ID
      expect(afterC?.telegramChatId).toBe(chatIdC);
      expect(afterD?.telegramChatId).toBeNull();
      expect(afterD?.botPairingCode).toBeNull();

      // userD can still use the simulator afterwards (identity via auth session)
      const cashRes = await request(app)
        .post('/api/integrations/simulator/chat')
        .set('Authorization', `Bearer ${tokenD}`)
        .send({ channel: 'TELEGRAM', message: '/cash', isVoice: false });
      expect(cashRes.status).toBe(200);
      expect(cashRes.body.success).toBe(true);

      await prisma.user.delete({ where: { id: userC.id } });
      await prisma.user.delete({ where: { id: userD.id } });
    });
  });
});

