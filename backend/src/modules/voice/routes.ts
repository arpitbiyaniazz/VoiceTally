import { Router } from 'express';
import { VoiceController } from './controllers/VoiceController.js';
import { authMiddleware } from '../../core/middleware/auth.js';
import { rateLimiter } from '../../core/middleware/rateLimiter.js';

const router = Router();

// All voice routes require authentication
router.use(authMiddleware);

// Rate limit voice processing (e.g. 30 requests/min per user)
const voiceRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl:voice',
});

// Process natural language voice transcript or text query/command
router.post('/process', voiceRateLimit, VoiceController.process);

// Get Voice AI telemetry & observability metrics
router.get('/metrics', VoiceController.getMetrics);

export { router as voiceRoutes };
