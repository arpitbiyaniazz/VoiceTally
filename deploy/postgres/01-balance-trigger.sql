-- ─── Balance Invariant Trigger ─────────────────────────────────────────────
-- Deferred constraint trigger: fires at COMMIT time and verifies that
-- SUM(debit_amount) == SUM(credit_amount) for every journal entry touched
-- in the transaction. This is the database-level safety net backing up
-- the application-level check in JournalEntryModel.
--
-- Applied after Prisma migrations run (not managed by Prisma).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    imbalance NUMERIC;
BEGIN
    SELECT ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0))
    INTO imbalance
    FROM "JournalLine"
    WHERE "journalEntryId" = NEW."journalEntryId";

    IF imbalance > 0.001 THEN
        RAISE EXCEPTION 'Journal entry % is out of balance: debits ≠ credits (imbalance: %)',
            NEW."journalEntryId", imbalance;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present (idempotent re-runs)
DROP TRIGGER IF EXISTS trg_check_journal_balance ON "JournalLine";

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_balance();
