-- AlterEnum
ALTER TYPE "EntrySource" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "EntrySource" ADD VALUE IF NOT EXISTS 'TELEGRAM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "botPairingCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "Account_userId_subtype_idx" ON "Account"("userId", "subtype");
CREATE INDEX IF NOT EXISTS "Account_personId_idx" ON "Account"("personId");
CREATE INDEX IF NOT EXISTS "JournalEntry_userId_postedAt_idx" ON "JournalEntry"("userId", "postedAt");
CREATE INDEX IF NOT EXISTS "JournalEntry_userId_voucherType_idx" ON "JournalEntry"("userId", "voucherType");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_debitAmount_creditAmount_idx" ON "JournalLine"("accountId", "debitAmount", "creditAmount");
