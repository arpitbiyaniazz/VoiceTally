import { describe, it, expect } from 'vitest';
import { VoiceParser } from '../../src/modules/voice/services/VoiceParser.js';

describe('VoiceParser — Unit Tests', () => {
  it('parses Bank ATM withdrawal correctly', () => {
    const res = VoiceParser.parse('i made the withdrawal from the bank 10000');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('WITHDRAWAL');
      expect(res.voucherType).toBe('CONTRA');
      expect(res.amount).toBe(10000);
      expect(res.paymentMode).toBe('BANK');
    }
  });

  it('parses cash withdrawal with colloquial phrasing', () => {
    const res = VoiceParser.parse('withdrew 5k from atm');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('WITHDRAWAL');
      expect(res.voucherType).toBe('CONTRA');
      expect(res.amount).toBe(5000);
    }
  });

  it('parses cash deposit into bank', () => {
    const res = VoiceParser.parse('deposited 8000 cash in bank');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('DEPOSIT');
      expect(res.voucherType).toBe('CONTRA');
      expect(res.amount).toBe(8000);
    }
  });

  it('parses "i take this much muny from that person"', () => {
    const res = VoiceParser.parse('i take 5000 muny from Rahul');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('RECEIVE_FROM_PERSON');
      expect(res.voucherType).toBe('RECEIPT');
      expect(res.amount).toBe(5000);
      expect(res.personName).toBe('Rahul');
    }
  });

  it('parses "this person bought something" (Debtor / Sale)', () => {
    const res = VoiceParser.parse('Rahul bought laptop for 45000');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('PERSON_BOUGHT');
      expect(res.voucherType).toBe('JOURNAL');
      expect(res.amount).toBe(45000);
      expect(res.personName).toBe('Rahul');
    }
  });

  it('parses user purchasing from vendor on credit', () => {
    const res = VoiceParser.parse('I bought stationery from Apex Traders for 3500');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('USER_BOUGHT');
      expect(res.voucherType).toBe('JOURNAL');
      expect(res.amount).toBe(3500);
      expect(res.personName).toBe('Apex');
      expect(res.categoryName).toBe('Stationery');
    }
  });

  it('parses lending money to a person', () => {
    const res = VoiceParser.parse('I gave 4000 to John using bank');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('GIVE_TO_PERSON');
      expect(res.voucherType).toBe('PAYMENT');
      expect(res.amount).toBe(4000);
      expect(res.personName).toBe('John');
      expect(res.paymentMode).toBe('BANK');
    }
  });

  it('parses direct expense payment', () => {
    const res = VoiceParser.parse('Paid 450 for groceries using cash');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('DIRECT_PAYMENT');
      expect(res.voucherType).toBe('PAYMENT');
      expect(res.amount).toBe(450);
      expect(res.categoryName).toBe('Groceries');
      expect(res.paymentMode).toBe('CASH');
    }
  });

  it('parses direct income receipt', () => {
    const res = VoiceParser.parse('Received salary 75000 in bank');
    expect(res.type).toBe('TRANSACTION');
    if (res.type === 'TRANSACTION') {
      expect(res.action).toBe('DIRECT_INCOME');
      expect(res.voucherType).toBe('RECEIPT');
      expect(res.amount).toBe(75000);
      expect(res.categoryName).toBe('Salary');
    }
  });

  it('parses "what is the bank balance"', () => {
    const res = VoiceParser.parse('what is the bank balance?');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('BANK_BALANCE');
    }
  });

  it('parses "how much money do i have in my bank account"', () => {
    const res = VoiceParser.parse('how much money do i have in my bank account');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('BANK_BALANCE');
    }
  });

  it('parses "how much money do i have in my bank"', () => {
    const res = VoiceParser.parse('how much money do i have in my bank');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('BANK_BALANCE');
    }
  });

  it('parses cash balance query', () => {
    const res = VoiceParser.parse('how much cash do i have?');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('CASH_BALANCE');
    }
  });

  it('parses net worth query', () => {
    const res = VoiceParser.parse('what is my net worth?');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('NET_WORTH');
    }
  });

  it('parses person balance query', () => {
    const res = VoiceParser.parse('how much does John owe me?');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('PERSON_BALANCE');
      expect(res.personName).toBe('John');
    }
  });

  it('parses monthly expense query', () => {
    const res = VoiceParser.parse('how much did i spend this month?');
    expect(res.type).toBe('QUERY');
    if (res.type === 'QUERY') {
      expect(res.target).toBe('TOTAL_EXPENSES');
    }
  });
});
