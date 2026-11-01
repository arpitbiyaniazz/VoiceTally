import { describe, it, expect, beforeAll } from 'vitest';
import { UserModel } from '../../src/modules/auth/models/UserModel.js';
import { AccountModel } from '../../src/modules/ledger/models/AccountModel.js';
import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';
import { prisma } from '../../src/core/database/prisma.js';
import { redis } from '../../src/core/redis/client.js';

describe('VoiceAgentService — follow-up questions against the real ledger', () => {
  let userId: string;
  const say = (text: string, execute = false) => VoiceAgentService.process(userId, text, execute);

  beforeAll(async () => {
    const user = await UserModel.register(`voice_followup_${Date.now()}@voicetally.app`, 'securePassword123', 'Follow Up User');
    userId = user.id;
    // A contact with history, so "who?" questions can offer it
    await say('Rahul bought goods for 1000', true);
  });

  it('asks who was paid, offers recent contacts, and posts after confirmation', async () => {
    const q = await say('Paid 500 in cash');
    expect(q.clarification?.field).toBe('counterparty');
    expect(q.clarification?.options).toContain('Rahul');

    // The session survives in Redis between turns
    const stored = JSON.parse((await redis.get(`voice:pending:${userId}`))!);
    expect(stored).toMatchObject({ stage: 'COLLECTING', awaiting: 'counterparty' });

    const preview = await say('Rahul');
    expect(preview.data).toMatchObject({ voucherType: 'PAYMENT', debitAccount: 'Rahul', creditAccount: 'Cash', amount: 500 });
    expect(preview.data.newAccounts).toEqual([]);

    const posted = await say('yes');
    expect(posted.executed).toBe(true);
    const entry = await prisma.journalEntry.findUnique({ where: { id: posted.data.voucherId }, include: { lines: { include: { account: true } } } });
    expect(entry?.source).toBe('VOICE');
    expect(entry?.lines.map((l) => [l.account.name, Number(l.debitAmount), Number(l.creditAmount)])).toEqual(
      expect.arrayContaining([
        ['Rahul', 500, 0],
        ['Cash', 0, 500],
      ])
    );
  });

  it('asks for the supplier of a credit purchase and creates the contact only when posting', async () => {
    const q = await say('Purchased office stationery for 1200 on credit');
    expect(q.clarification?.field).toBe('person');
    expect(await prisma.person.findFirst({ where: { userId, name: 'Apex Traders' } })).toBeNull();

    const preview = await say('Apex Traders');
    expect(preview.data).toMatchObject({ voucherType: 'JOURNAL', debitAccount: 'Stationery', creditAccount: 'Apex Traders' });
    expect(await prisma.person.findFirst({ where: { userId, name: 'Apex Traders' } })).toBeNull();

    await say('confirm');
    const supplier = await prisma.person.findFirst({ where: { userId, name: 'Apex Traders' }, include: { accounts: true } });
    expect(supplier?.label).toBe('Voice Contact');
    expect(supplier?.accounts[0].subtype).toBe('PERSON');
    expect(await prisma.account.findUnique({ where: { userId_name: { userId, name: 'Stationery' } } })).not.toBeNull();
  });

  it('cancelling leaves no new contact behind', async () => {
    await say('Gave 700 to Zubin');
    await say('cash');
    expect((await say('cancel')).spokenResponse).toContain('Transaction cancelled');
    expect(await prisma.person.findFirst({ where: { userId, name: 'Zubin' } })).toBeNull();
    expect(await redis.get(`voice:pending:${userId}`)).toBeNull();
  });

  it('uses the bank account the user names when there are several', async () => {
    await AccountModel.create(userId, { name: 'HDFC Bank Account', type: 'ASSET', subtype: 'CASH_BANK', cashFlowCategory: 'OPERATING' });

    const hdfc = await say('Received 3000 from Rahul in HDFC');
    expect(hdfc.data).toMatchObject({ debitAccount: 'HDFC Bank Account', creditAccount: 'Rahul' });

    // "Bank" names the default account when one is literally called Bank
    const plain = await say('Received 3000 from Rahul in bank');
    expect(plain.data).toMatchObject({ debitAccount: 'Bank', creditAccount: 'Rahul' });
    await say('cancel');
  });

  it('reports cash and bank together', async () => {
    const res = await say('how much money do I have');
    expect(res.intent.type).toBe('QUERY');
    expect(res.spokenResponse).toMatch(/in cash and .* in the bank/);
  });
});
