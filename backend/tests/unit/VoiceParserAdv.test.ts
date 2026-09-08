import { describe, it, expect } from 'vitest';
import { VoiceParser } from '../../src/modules/voice/services/VoiceParser.js';

describe('VoiceParser — Advanced & Edge Case Unit Tests', () => {
  describe('Indian Currency Multipliers & Number Formats', () => {
    it('parses lakh / lac notations', () => {
      expect(VoiceParser.parseAmount('withdrew 2.5 lakh from bank')).toBe(250000);
      expect(VoiceParser.parseAmount('paid 1 lac to vendor')).toBe(100000);
      expect(VoiceParser.parseAmount('5 lakhs sales revenue')).toBe(500000);
    });

    it('parses crore / cr notations', () => {
      expect(VoiceParser.parseAmount('1.5 crore investment')).toBe(15000000);
      expect(VoiceParser.parseAmount('2 cr property purchase')).toBe(20000000);
    });

    it('parses k / thousand notations', () => {
      expect(VoiceParser.parseAmount('collected 50k from client')).toBe(50000);
      expect(VoiceParser.parseAmount('5.5 thousand rent')).toBe(5500);
      expect(VoiceParser.parseAmount('10k deposit')).toBe(10000);
    });

    it('parses Indian comma-separated numbers and currency signs', () => {
      expect(VoiceParser.parseAmount('₹45,000 paid for laptop')).toBe(45000);
      expect(VoiceParser.parseAmount('Rs 1,25,000 received')).toBe(125000);
      expect(VoiceParser.parseAmount('500 bucks for coffee')).toBe(500);
    });

    it('detects negative numbers safely', () => {
      expect(VoiceParser.parseAmount('-5000')).toBe(-5000);
      expect(VoiceParser.parseAmount('minus 2000')).toBe(-2000);
    });
  });

  describe('Confirmation Intents', () => {
    it('parses affirmative confirmations', () => {
      const affirmations = ['yes', 'confirm', 'proceed', 'record it', 'post voucher', 'sure', 'ok', 'haan', 'theek hai'];
      for (const word of affirmations) {
        const res = VoiceParser.parse(word);
        expect(res.type).toBe('CONFIRMATION');
        if (res.type === 'CONFIRMATION') {
          expect(res.decision).toBe('CONFIRM');
        }
      }
    });

    it('parses cancellation responses', () => {
      const cancellations = ['no', 'cancel', 'nevermind', 'abort', 'stop', 'nahi', 'mat karo'];
      for (const word of cancellations) {
        const res = VoiceParser.parse(word);
        expect(res.type).toBe('CONFIRMATION');
        if (res.type === 'CONFIRMATION') {
          expect(res.decision).toBe('CANCEL');
        }
      }
    });
  });

  describe('Hinglish & Indian Colloquial Phrasings', () => {
    it('parses "Rahul ko 5000 diya" (Give to person)', () => {
      const res = VoiceParser.parse('Rahul ko 5000 diya');
      expect(res.type).toBe('TRANSACTION');
      if (res.type === 'TRANSACTION') {
        expect(res.action).toBe('GIVE_TO_PERSON');
        expect(res.amount).toBe(5000);
        expect(res.personName).toBe('Rahul');
        expect(res.voucherType).toBe('PAYMENT');
      }
    });

    it('parses "Sharma se 10k mila" (Receive from person)', () => {
      const res = VoiceParser.parse('Sharma se 10k mila');
      expect(res.type).toBe('TRANSACTION');
      if (res.type === 'TRANSACTION') {
        expect(res.action).toBe('RECEIVE_FROM_PERSON');
        expect(res.amount).toBe(10000);
        expect(res.personName).toBe('Sharma');
        expect(res.voucherType).toBe('RECEIPT');
      }
    });

    it('parses "Bank se cash nikala 20000" (Withdrawal)', () => {
      const res = VoiceParser.parse('Bank se cash nikala 20000');
      expect(res.type).toBe('TRANSACTION');
      if (res.type === 'TRANSACTION') {
        expect(res.action).toBe('WITHDRAWAL');
        expect(res.amount).toBe(20000);
        expect(res.voucherType).toBe('CONTRA');
      }
    });

    it('parses "Bank me 15000 jama kiye" (Deposit)', () => {
      const res = VoiceParser.parse('Bank me 15000 jama kiye');
      expect(res.type).toBe('TRANSACTION');
      if (res.type === 'TRANSACTION') {
        expect(res.action).toBe('DEPOSIT');
        expect(res.amount).toBe(15000);
        expect(res.voucherType).toBe('CONTRA');
      }
    });

    it('parses "Bank balance batao" (Bank query in Hindi)', () => {
      const res = VoiceParser.parse('Bank balance batao');
      expect(res.type).toBe('QUERY');
      if (res.type === 'QUERY') {
        expect(res.target).toBe('BANK_BALANCE');
      }
    });

    it('parses "Kitna kharcha hua" (Total expense query in Hindi)', () => {
      const res = VoiceParser.parse('Kitna kharcha hua');
      expect(res.type).toBe('QUERY');
      if (res.type === 'QUERY') {
        expect(res.target).toBe('TOTAL_EXPENSES');
      }
    });
  });

  describe('Edge Cases & Resilient Handling', () => {
    it('handles empty or whitespace-only inputs gracefully', () => {
      const res = VoiceParser.parse('   ');
      expect(res.type).toBe('UNKNOWN');
    });

    it('handles gibberish without crashing', () => {
      const res = VoiceParser.parse('blablabla xyz random words lorem ipsum');
      expect(res.type).toBe('UNKNOWN');
    });

    it('handles missing amount gracefully in transaction commands', () => {
      const res = VoiceParser.parse('I withdrew money from bank');
      expect(res.type).toBe('TRANSACTION');
      if (res.type === 'TRANSACTION') {
        expect(res.amount).toBe(0);
      }
    });
  });
});
