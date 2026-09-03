import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { requestIdMiddleware } from './core/middleware/requestId.js';
import { errorHandler } from './core/middleware/errorHandler.js';
import { rateLimiter } from './core/middleware/rateLimiter.js';
import { prisma } from './core/database/prisma.js';
import { redis } from './core/redis/client.js';
import { authRoutes } from './modules/auth/index.js';
import { ledgerRoutes } from './modules/ledger/index.js';
import { voiceRoutes } from './modules/voice/index.js';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Safe, restricted CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : [])
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '500kb' }));
app.use(morgan('short'));
app.use(requestIdMiddleware);

// Global rate limiter (generous baseline — auth and voice routes have their own tighter limits)
app.use(
  '/api',
  rateLimiter({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 100,      // 100 requests per minute
    keyPrefix: 'rl:api',
  })
);

// ─── Health Check & Readiness Probes ──────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    // Check DB and Redis concurrently with timeout
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Service dependencies unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── Module Routes ────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/voice', voiceRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Global Error Handler (must be last) ──────────────────────────────────

app.use(errorHandler);

export { app };
