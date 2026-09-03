import { Worker } from 'bullmq';
import { createRedisConnection } from './core/redis/client.js';
import { LEDGER_POSTING_QUEUE } from './core/queue/ledgerPostingQueue.js';
import { ledgerPostingProcessor } from './workers/ledgerPostingProcessor.js';

/**
 * Worker entry point — separate Node.js process from the API server.
 * Run with: npm run worker (tsx watch src/worker.ts)
 *
 * Processes ledger-posting jobs from Phase A (journal writes).
 * Each worker needs its own Redis connection (BullMQ requirement).
 */

const connection = createRedisConnection();

const worker = new Worker(
  LEDGER_POSTING_QUEUE,
  ledgerPostingProcessor,
  {
    connection,
    concurrency: 5,    // Process up to 5 jobs in parallel
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);

// ─── Event Handlers ───────────────────────────────────────────────────────

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err.message);
});

worker.on('ready', () => {
  console.log(`✓ Ledger posting worker ready (queue: ${LEDGER_POSTING_QUEUE})`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────

async function shutdown() {
  console.log('[Worker] Shutting down gracefully...');
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`✓ Starting ledger posting worker on queue: ${LEDGER_POSTING_QUEUE}`);
