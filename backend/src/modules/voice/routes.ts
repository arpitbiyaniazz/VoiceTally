import { Router } from 'express';
import { VoiceController } from './controllers/VoiceController.js';
import { authMiddleware } from '../../core/middleware/auth.js';
import { rateLimiter } from '../../core/middleware/rateLimiter.js';

const router = Router();

// All voice routes require authentication
router.use(authMiddleware);

// Rate limit voice processing per user. Each spoken turn uses transcribe + process + tts, and an
// entry can take a few follow-up turns, so every endpoint gets its own bucket.
const processRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 40,
  keyPrefix: 'rl:voice:process',
});
const transcribeRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl:voice:stt',
});
const ttsRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'rl:voice:tts',
});

// Process natural language voice transcript or text query/command
router.post('/process', processRateLimit, VoiceController.process);

// Voxtral Speech-to-Text: Transcribe recorded audio (voxtral-mini-latest)
router.post('/transcribe', transcribeRateLimit, VoiceController.transcribe);

// Voxtral Text-to-Speech: Natural voice audio using voxtral-mini-tts-2603
router.post('/tts', ttsRateLimit, VoiceController.tts);

// Voxtral model configuration and status
router.get('/config', VoiceController.getConfig);

// Get Voice AI telemetry & observability metrics
router.get('/metrics', VoiceController.getMetrics);


export { router as voiceRoutes };
