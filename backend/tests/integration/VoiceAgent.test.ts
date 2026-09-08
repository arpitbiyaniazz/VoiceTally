import { describe, it, expect, beforeAll } from 'vitest';
import { UserModel } from '../../src/modules/auth/models/UserModel.js';
import { VoiceAgentService } from '../../src/modules/voice/services/VoiceAgentService.js';
import { prisma } from '../../src/core/database/prisma.js';

describe('VoiceAgentService — Integration Tests', () => {
  let userId: string;

  beforeAll(async () => {
    const email = `voice_test_${Date.now()}@voicetally.app`;
    const user = await UserModel.register(email, 'securePassword123', 'Voice Test User');
    userId = user.id;

    // Seed initial bank balance of 100,000 via Capital
    const accounts = await prisma.account.findMany({ where: { userId } });
    const bank = accounts.find((a) => a.name === 'Bank')!;
    const capital = accounts.find((a) => a.name === 'Opening Capital')!;

    await prisma.$transaction([
      prisma.account.update({ where: { id: bank.id }, data: { cachedBalance: 100000 } }),
      prisma.account.update({ where: { id: capital.id }, data: { cachedBalance: 100000 } }),
    ]);
  });

  it('processes bank withdrawal and updates double-entry ledger', async () => {
    const res = await VoiceAgentService.process(userId, 'i made the withdrawal from the bank 10000', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('TRANSACTION');
    expect(res.data.voucherType).toBe('CONTRA');
    expect(res.data.amount).toBe(10000);
    expect(res.data.debitAccount).toBe('Cash');
    expect(res.data.creditAccount).toBe('Bank');
    expect(res.spokenResponse).toContain('10,000');

    // Verify DB entry exists with 2 lines
    const entry = await prisma.journalEntry.findUnique({
      where: { id: res.data.voucherId },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('VOICE');
    expect(entry?.lines).toHaveLength(2);
  });

  it('processes "this person bought something" (Debtor on credit)', async () => {
    const res = await VoiceAgentService.process(userId, 'Rahul bought goods for 45000', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('TRANSACTION');
    expect(res.data.debitAccount).toBe('Rahul');
    expect(res.data.creditAccount).toBe('Sales Revenue');
    expect(res.data.amount).toBe(45000);

    // Verify Rahul was auto-created as a Person and linked account
    const person = await prisma.person.findFirst({
      where: { userId, name: 'Rahul' },
      include: { accounts: true },
    });
    expect(person).toBeDefined();
    expect(person?.accounts[0].name).toBe('Rahul');
  });

  it('processes "i take this much muny from that person" (Settlement / Receipt)', async () => {
    const res = await VoiceAgentService.process(userId, 'i take 5000 muny from Rahul in cash', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('TRANSACTION');
    expect(res.data.voucherType).toBe('RECEIPT');
    expect(res.data.debitAccount).toBe('Cash');
    expect(res.data.creditAccount).toBe('Rahul');
    expect(res.data.amount).toBe(5000);
  });

  it('answers "what is the bank balance" correctly', async () => {
    const res = await VoiceAgentService.process(userId, 'what is the bank balance?', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('QUERY');
    expect(res.data.account).toBe('Bank');
    expect(res.spokenResponse).toMatch(/Bank balance is/i);
    expect(res.data.balance).toBeDefined();
  });

  it('answers person balance query "how much does Rahul owe me"', async () => {
    const res = await VoiceAgentService.process(userId, 'how much does Rahul owe me?', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('QUERY');
    expect(res.data.person).toBe('Rahul');
    expect(res.spokenResponse).toContain('Rahul');
  });

  it('answers net worth query', async () => {
    const res = await VoiceAgentService.process(userId, 'what is my net worth?', true);

    expect(res.executed).toBe(true);
    expect(res.intent.type).toBe('QUERY');
    expect(res.data.netWorth).toBeDefined();
    expect(res.spokenResponse).toMatch(/Net Worth is/i);
  });
});
