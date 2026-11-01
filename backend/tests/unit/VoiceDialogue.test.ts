import { describe, it, expect } from 'vitest';
import { VoiceDialogue } from '../../src/modules/voice/services/VoiceDialogue.js';

describe('VoiceDialogue — slot filling rules', () => {
  it('asks for direction, then amount, then counterparty, then payment mode', () => {
    expect(VoiceDialogue.nextMissingField({ amount: 500 })).toBe('flow');
    expect(VoiceDialogue.nextMissingField({ flow: 'OUT' })).toBe('amount');
    expect(VoiceDialogue.nextMissingField({ flow: 'OUT', amount: 500 })).toBe('counterparty');
    expect(VoiceDialogue.nextMissingField({ flow: 'OUT', amount: 500, categoryName: 'Rent' })).toBe('paymentMode');
    expect(VoiceDialogue.nextMissingField({ flow: 'OUT', amount: 500, categoryName: 'Rent', paymentMode: 'CASH' })).toBeNull();
  });

  it('needs no counterparty or mode for contra entries, and a contact for credit entries', () => {
    expect(VoiceDialogue.nextMissingField({ flow: 'WITHDRAWAL', amount: 2000 })).toBeNull();
    expect(VoiceDialogue.nextMissingField({ flow: 'CREDIT_SALE', amount: 2000 })).toBe('person');
    expect(VoiceDialogue.nextMissingField({ flow: 'CREDIT_PURCHASE', amount: 2000, personName: 'Apex' })).toBeNull();
  });

  it('merges replies, letting newly stated facts win', () => {
    const draft = { flow: 'OUT' as const, amount: 500, categoryName: 'Food & Dining', paymentMode: 'CASH' as const };
    expect(VoiceDialogue.merge(draft, { amount: 600 })).toMatchObject({ amount: 600, paymentMode: 'CASH' });
    expect(VoiceDialogue.merge(draft, { paymentMode: 'BANK', bankHint: 'HDFC' })).toMatchObject({ paymentMode: 'BANK', bankHint: 'HDFC' });
  });

  it('re-maps or drops a category when the direction changes', () => {
    expect(VoiceDialogue.merge({ flow: 'OUT', amount: 5000, categoryName: 'Rent' }, { flow: 'IN' }).categoryName).toBe('Rental Income');
    expect(VoiceDialogue.merge({ flow: 'OUT', amount: 500, categoryName: 'Food & Dining' }, { flow: 'IN' }).categoryName).toBeUndefined();
    expect(VoiceDialogue.merge({ flow: 'OUT', amount: 500, personName: 'Rahul' }, { flow: 'WITHDRAWAL' }).personName).toBeUndefined();
  });

  it('forgets an earlier contact or bank choice when the user names a different one', () => {
    const draft = {
      flow: 'IN' as const,
      amount: 500,
      personName: 'Rahul',
      paymentMode: 'BANK' as const,
      bankHint: 'HDFC',
      chosenPerson: { name: 'Rahul Sharma', accountId: 'a1' },
      chosenBankAccount: { id: 'b1', name: 'HDFC Bank Account' },
    };
    const merged = VoiceDialogue.merge(draft, { personName: 'Amit', bankHint: 'ICICI' });
    expect(merged.chosenPerson).toBeUndefined();
    expect(merged.chosenBankAccount).toBeUndefined();
  });

  it('treats only a complete, contradicting statement as a fresh command', () => {
    const lunch = { flow: 'OUT' as const, amount: 500, categoryName: 'Food & Dining' };
    expect(VoiceDialogue.isFreshCommand({ flow: 'IN', amount: 2000, personName: 'Rahul' }, lunch)).toBe(true);
    expect(VoiceDialogue.isFreshCommand({ flow: 'WITHDRAWAL', amount: 2000 }, lunch)).toBe(true);
    expect(VoiceDialogue.isFreshCommand({ flow: 'OUT', amount: 600 }, lunch)).toBe(false);
    expect(VoiceDialogue.isFreshCommand({ flow: 'IN', amount: 600 }, lunch)).toBe(false);
    expect(VoiceDialogue.isFreshCommand({ paymentMode: 'BANK' }, lunch)).toBe(false);
  });

  it('matches replies to offered options by ordinal, name or unique word', () => {
    const banks = ['HDFC Bank Account', 'ICICI Savings Account'];
    expect(VoiceDialogue.matchOption('the second one', banks)).toBe(1);
    expect(VoiceDialogue.matchOption('ICICI', banks)).toBe(1);
    expect(VoiceDialogue.matchOption('hdfc bank account', banks)).toBe(0);
    expect(VoiceDialogue.matchOption('savings', banks)).toBe(1);
    expect(VoiceDialogue.matchOption('something else', banks)).toBe(-1);

    const people = ['Rahul Sharma', 'Rahul Verma', 'New contact "Rahul"'];
    expect(VoiceDialogue.matchOption('Verma', people)).toBe(1);
    expect(VoiceDialogue.matchOption('Rahul', people)).toBe(-1);
  });

  it('phrases questions around what is already known', () => {
    expect(VoiceDialogue.prompt('amount', { flow: 'IN', personName: 'Priya' }).question).toBe('How much did you receive from Priya?');
    expect(VoiceDialogue.prompt('paymentMode', { flow: 'OUT', amount: 1500 }).question).toBe(
      'Did you pay 1,500 rupees in cash or from your bank account?'
    );
    expect(VoiceDialogue.prompt('flow', { amount: 5000, personName: 'Rahul' }).options).toEqual([
      'Gave to Rahul',
      'Received from Rahul',
      'Rahul bought on credit',
    ]);
  });
});
