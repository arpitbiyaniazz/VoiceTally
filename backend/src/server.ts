import { app } from './app.js';
import { config } from './core/config/index.js';
import { prisma } from './core/database/prisma.js';
import { redis } from './core/redis/client.js';

const port = config.apiPort;

const server = app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║        VoiceTally API Server                 ║
║        Port: ${String(port).padEnd(31)}║
║        Env:  ${config.nodeEnv.padEnd(31)}║
╚══════════════════════════════════════════════╝
  `);
});

// ─── Graceful Shutdown & Process Lifecycle ──────────────────────────────────

async function gracefulShutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('[Server] HTTP server closed.');

    try {
      await Promise.all([
        prisma.$disconnect(),
        redis.quit(),
      ]);
      console.log('[Server] Database and Redis connections closed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[Server] Error during connection shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10s if connections fail to close
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  process.exit(1);
});
