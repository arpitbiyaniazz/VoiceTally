import { Router } from 'express';
import { AuthController } from './controllers/AuthController.js';
import { authMiddleware } from '../../core/middleware/auth.js';
import { rateLimiter } from '../../core/middleware/rateLimiter.js';

const router = Router();

// Rate limit auth endpoints more aggressively
const authRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,           // 20 attempts per window
  keyPrefix: 'rl:auth',
});

router.post('/register', authRateLimit, AuthController.register);
router.post('/login', authRateLimit, AuthController.login);
router.post('/refresh', authRateLimit, AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);

export { router as authRoutes };
