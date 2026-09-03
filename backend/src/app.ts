import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { requestIdMiddleware } from './core/middleware/requestId.js';
import { errorHandler } from './core/middleware/errorHandler.js';
import { rateLimiter } from './core/middleware/rateLimiter.js';
import { authRoutes } from './modules/auth/index.js';
import { ledgerRoutes } from './modules/ledger/index.js';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('short'));
app.use(requestIdMiddleware);

// Global rate limiter (generous baseline — auth routes have their own tighter limits)
app.use(
  '/api',
  rateLimiter({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 100,      // 100 requests per minute
    keyPrefix: 'rl:api',
  })
);

// ─── Health Check ─────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  // TODO: check DB and Redis connectivity
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

// ─── Module Routes ────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/ledger', ledgerRoutes);

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
