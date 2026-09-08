import { prisma } from '../core/database/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';
import type { Job } from 'bullmq';
import type { LedgerPostingJobData } from '../core/queue/ledgerPostingQueue.js';

/**
 * Phase B — Ledger Posting Processor
 *
 * Processes a journal entry that was atomically written in Phase A:
 * 1. Reads the journal entry and its lines
 * 2. Checks idempotency (if postedAt is already set, no-ops)
 * 3. Updates each affected account's cachedBalance
 * 4. Sets postedAt on the journal entry and postedThrough on accounts
 * 5. All updates in a single transaction
 *
 * This worker is IDEMPOTENT — processing the same journalEntryId twice
 * will not double-post the balance, because it checks postedAt first.
 */
export async function ledgerPostingProcessor(
  job: Job<LedgerPostingJobData>
): Promise<void> {
  const { journalEntryId } = job.data;

  console.log(`[Worker] Processing ledger posting for entry: ${journalEntryId}`);

  // Read the journal entry with lines
  const entry = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: {
      lines: true,
    },
  });

  if (!entry) {
    console.warn(`[Worker] Journal entry ${journalEntryId} not found — skipping`);
    return;
  }

  // ── Idempotency check ────────────────────────────────────────────────
  if (entry.postedAt !== null) {
    console.log(`[Worker] Entry ${journalEntryId} already posted at ${entry.postedAt} — no-op`);
    return;
  }

  // ── Atomic ledger posting with concurrency claim ─────────────────────
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Atomically claim this entry inside the transaction. If another concurrent
    // worker posted it between our findUnique and now, count will be 0.
    const claim = await tx.journalEntry.updateMany({
      where: { id: journalEntryId, postedAt: null },
      data: { postedAt: now },
    });

    if (claim.count === 0) {
      console.log(`[Worker] Entry ${journalEntryId} was already claimed/posted concurrently — skipping`);
      return;
    }

    // Update each affected account's cached balance
    for (const line of entry.lines) {
      const delta = new Decimal(line.debitAmount.toString())
        .minus(new Decimal(line.creditAmount.toString()));

      await tx.account.update({
        where: { id: line.accountId },
        data: {
          cachedBalance: {
            increment: delta,
          },
          postedThrough: now,
        },
      });
    }
  });

  console.log(
    `[Worker] Successfully posted entry ${journalEntryId} — ` +
    `${entry.lines.length} accounts updated`
  );
}
