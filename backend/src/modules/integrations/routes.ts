import { Router } from 'express';
import { IntegrationsController } from './controllers/IntegrationsController.js';
import { authMiddleware } from '../../core/middleware/auth.js';

const router = Router();

// ─── Public Webhooks (Called by Meta WhatsApp & Telegram servers) ─────────
router.get('/whatsapp/webhook', IntegrationsController.verifyWhatsAppWebhook);
router.post('/whatsapp/webhook', IntegrationsController.handleWhatsAppWebhook);
router.post('/telegram/webhook', IntegrationsController.handleTelegramWebhook);

// ─── Authenticated User Integration Management ───────────────────────────
router.get('/status', authMiddleware, IntegrationsController.getStatus);
router.post('/link-phone', authMiddleware, IntegrationsController.linkPhone);
router.post('/link-telegram', authMiddleware, IntegrationsController.linkTelegram);
router.post('/generate-code', authMiddleware, IntegrationsController.generatePairingCode);
router.post('/unlink', authMiddleware, IntegrationsController.unlinkChannel);
router.post('/simulator/chat', authMiddleware, IntegrationsController.simulateChat);

export { router as integrationRoutes };
