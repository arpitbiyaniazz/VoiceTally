import { Queue } from 'bullmq';
import { redis } from '../redis/client.js';

// ─── Job Type Definitions ─────────────────────────────────────────────────

export interface LedgerPostingJobData {
  journalEntryId: string;
}

export const LEDGER_POSTING_QUEUE = 'ledger-posting';

// ─── Queue Instance ───────────────────────────────────────────────────────

export const ledgerPostingQueue = new Queue<LedgerPostingJobData>(
  LEDGER_POSTING_QUEUE,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  }
);

/**
 * Enqueue a ledger-posting job for a newly created journal entry.
 * Called by JournalEntryModel after the Phase A atomic write succeeds.
 */
export async function enqueueLedgerPosting(
  journalEntryId: string
): Promise<void> {
  await ledgerPostingQueue.add(
    'post-to-ledger',
    { journalEntryId },
    {
      jobId: `ledger-post-${journalEntryId}`, // Deduplication key
    }
  );
}
