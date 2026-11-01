import { describe, it, expect } from 'vitest';
import { VoiceParser } from '../../src/modules/voice/services/VoiceParser.js';

const details = (text: string) => VoiceParser.extractDetails(text);
const tx = (text: string) => {
  const r = VoiceParser.parse(text);
  expect(r.type).toBe('TRANSACTION');
  return r as Extract<typeof r, { type: 'TRANSACTION' }>;
};

describe('VoiceParser — natural sentences (explicit details only)', () => {
  describe('amounts', () => {
    it.each([
      ['I paid fifteen thousand for rent', 15000],
      ['Spent two thousand five hundred on petrol using card', 2500],
      ['one lakh fifty thousand received from Vikram', 150000],
      ['1 lakh 50 thousand received from Vikram', 150000],
      ['Rahul bought 2 laptops for 90000', 90000],
      ['Paid 2 bills of 500 each', 1000],
      ['paid 1,25,000 rent for october 2026', 125000],
      ['gave 5000 to Rahul on 20th', 5000],
      ['paid 500rs for coffee', 500],
      ['Rs. 450 groceries cash', 450],
      ['Sharma ji se dedh lakh mile bank me', 150000],
      ['do hazaar ka petrol dalwaya card se', 2000],
      ['sava lakh received from Vikram', 125000],
      ['sadhe teen hazaar diye Mohan ko cash', 3500],
      ['withdrew 5k from atm', 5000],
      ['Paid five hundred for tea', 500],
    ])('%s → %d', (text, amount) => {
      expect(VoiceParser.parseAmount(text)).toBe(amount);
    });

    it('ignores times, phone numbers and percentages', () => {
      expect(VoiceParser.parseAmount('withdrew 2000 from atm at 5 pm')).toBe(2000);
      expect(VoiceParser.parseAmount('paid 300 to 9876543210')).toBe(300);
      expect(VoiceParser.parseAmount('got 10 percent discount, paid 900')).toBe(900);
    });

    it('detects whether a transcript contains any number at all', () => {
      expect(VoiceParser.hasNumberContent('Paid for groceries')).toBe(false);
      expect(VoiceParser.hasNumberContent('paid fifteen hundred')).toBe(true);
      expect(VoiceParser.hasNumberContent('राहुल को 5000 रुपए दे')).toBe(true);
    });
  });

  describe('direction and counterparty', () => {
    it('"Sharma paid 5000 in bank" is money received from Sharma', () => {
      const r = tx('Sharma paid 5000 in bank');
      expect(r.action).toBe('RECEIVE_FROM_PERSON');
      expect(r.personName).toBe('Sharma');
      expect(r.details?.paymentMode).toBe('BANK');
    });

    it('"Paid electricity bill of 2200 from bank" is an expense, not a payment to a person', () => {
      const r = tx('Paid electricity bill of 2200 from bank');
      expect(r.action).toBe('DIRECT_PAYMENT');
      expect(r.categoryName).toBe('Electricity');
      expect(r.personName).toBeUndefined();
    });

    it('"Purchased office stationery for 1200 on credit" is a credit purchase with the supplier still unknown', () => {
      const r = tx('Purchased office stationery for 1200 on credit');
      expect(r.action).toBe('USER_BOUGHT');
      expect(r.categoryName).toBe('Stationery');
      expect(r.details?.personName).toBeUndefined();
    });

    it('withdrawals without the word bank, and "took 5000 from the bank"', () => {
      expect(tx('I withdrew 5000').action).toBe('WITHDRAWAL');
      expect(tx('I took 5000 from the bank').action).toBe('WITHDRAWAL');
      expect(tx('Deposited 8000 in my bank account').action).toBe('DEPOSIT');
      expect(tx('transferred 5000 to my HDFC account').action).toBe('DEPOSIT');
    });

    it('salary from an employer is income, not a contact', () => {
      const r = tx('Got salary of 60000 from company');
      expect(r.action).toBe('DIRECT_INCOME');
      expect(r.categoryName).toBe('Salary');
      expect(r.personName).toBeUndefined();
    });

    it('keeps full and multi-word names, without honorifics', () => {
      expect(tx('Received 5000 from Rahul Sharma via UPI').personName).toBe('Rahul Sharma');
      expect(tx('received 12,500 from Vikramaditya Sharma through UPI.').personName).toBe('Vikramaditya Sharma');
      expect(tx('Amit Das paid 3000 via gpay').personName).toBe('Amit Das');
      expect(tx('Sharma ji se 2000 mile').personName).toBe('Sharma');
    });

    it('does not invent contacts from generic words', () => {
      expect(tx('Lent 2000 to a friend').details?.personName).toBeUndefined();
      expect(tx('He paid me 500').details?.personName).toBeUndefined();
      expect(tx('Paid rent 15000').details?.personName).toBeUndefined();
    });

    it('expense paid to a named person keeps both', () => {
      const r = tx('Paid Rahul 5000 for rent');
      expect(r.action).toBe('DIRECT_PAYMENT');
      expect(r.personName).toBe('Rahul');
      expect(r.categoryName).toBe('Rent');
    });

    it('credit sales and cash sales', () => {
      expect(tx('Sold goods to Sarah for 3000').action).toBe('PERSON_BOUGHT');
      const cashSale = tx('Sold items for 3000 in cash');
      expect(cashSale.action).toBe('DIRECT_INCOME');
      expect(cashSale.categoryName).toBe('Sales Revenue');
    });

    it('Hinglish lending and borrowing', () => {
      expect(tx('Rahul ko 5000 udhaar diya')).toMatchObject({ action: 'GIVE_TO_PERSON', personName: 'Rahul' });
      expect(tx('Rahul se 5000 udhaar liya')).toMatchObject({ action: 'RECEIVE_FROM_PERSON', personName: 'Rahul' });
    });

    it('Devanagari transcripts from Voxtral', () => {
      const r = tx('राहुल को 5000 रुपए दे');
      expect(r).toMatchObject({ action: 'GIVE_TO_PERSON', amount: 5000, personName: 'Rahul' });
    });

    it('picks the purpose, not an incidental place ("for office rent", "lunch at office")', () => {
      expect(tx('Paid 1500 for Office Rent from Cash').categoryName).toBe('Rent');
      expect(tx('Paid 500 for lunch at office').categoryName).toBe('Food & Dining');
      expect(tx('Paid 500 for current bill').categoryName).toBe('Electricity');
    });
  });

  describe('missing details stay missing', () => {
    it('no amount, no payment mode', () => {
      expect(details('Paid for groceries')).toEqual({ flow: 'OUT', categoryName: 'Groceries' });
      expect(details('Gave money to Rahul')).toEqual({ flow: 'OUT', personName: 'Rahul' });
    });

    it('a verbless "Rahul 5000" is details without a direction', () => {
      const r = VoiceParser.parse('Rahul 5000');
      expect(r).toMatchObject({ type: 'DETAILS', details: { amount: 5000, personName: 'Rahul' } });
    });

    it('a small bare number is not a transaction', () => {
      expect(VoiceParser.parse('call me at 5').type).toBe('UNKNOWN');
    });
  });

  describe('dates', () => {
    const now = new Date(2026, 9, 25, 15, 0); // Sunday 25 October 2026

    it.each([
      ['Paid 500 for lunch yesterday', '2026-10-24'],
      ['Paid five hundred for tea three days ago', '2026-10-22'],
      ['Paid 900 for dinner last Friday', '2026-10-23'],
      ['Received 4500 from Priya on 3rd October', '2026-10-03'],
      ['gave 5000 to Rahul on 20th', '2026-10-20'],
      ['paid 700 on 24/10/2026', '2026-10-24'],
    ])('%s → %s', (text, date) => {
      expect(VoiceParser.detectDate(text, now)).toBe(date);
    });

    it('today is not a backdated entry; a day later than today means last month', () => {
      expect(VoiceParser.detectDate('Paid 500 for lunch today', now)).toBeUndefined();
      expect(VoiceParser.detectDate('paid 500 on 30th', now)).toBe('2026-09-30');
    });
  });

  describe('questions are never postings', () => {
    it('spending questions become category queries', () => {
      expect(VoiceParser.parse('What did I spend on groceries?')).toMatchObject({ type: 'QUERY', target: 'EXPENSE_CATEGORY', categoryName: 'Groceries' });
      expect(VoiceParser.parse('how much did i spend on food this month')).toMatchObject({ target: 'EXPENSE_CATEGORY', categoryName: 'Food & Dining' });
    });

    it('profit, cash + bank and person balance questions', () => {
      expect(VoiceParser.parse('How much profit did I make this month?')).toMatchObject({ type: 'QUERY', target: 'TOTAL_INCOME' });
      expect(VoiceParser.parse('how much money do I have')).toMatchObject({ type: 'QUERY', target: 'CASH_AND_BANK' });
      expect(VoiceParser.parse("what is Rahul's balance")).toMatchObject({ type: 'QUERY', target: 'PERSON_BALANCE', personName: 'Rahul' });
      expect(VoiceParser.parse('show my HDFC balance')).toMatchObject({ type: 'QUERY', target: 'BANK_BALANCE', accountHint: 'HDFC' });
    });

    it('polite requests are still commands', () => {
      expect(VoiceParser.parse('can you record 500 for lunch').type).toBe('TRANSACTION');
    });
  });

  describe('yes / no replies', () => {
    it.each(['yeah go ahead', 'okay, post it', 'Yes, that is correct.', 'haan kar do', 'sure, go ahead and post it', 'looks good'])(
      '%s → CONFIRM',
      (text) => expect(VoiceParser.parseConfirmation(text)).toBe('CONFIRM')
    );

    it.each(["don't post it", 'forget it', 'no thanks', 'rehne do', 'ok cancel it'])('%s → CANCEL', (text) =>
      expect(VoiceParser.parseConfirmation(text)).toBe('CANCEL')
    );

    it('a reply with new details is not a bare yes / no', () => {
      expect(VoiceParser.parseConfirmation('No, it was 600')).toBeNull();
      expect(VoiceParser.parseConfirmation('no 600')).toBeNull();
      expect(VoiceParser.parseConfirmation('yes from bank')).toBeNull();
    });
  });

  describe('follow-up answers', () => {
    it('reads short answers for the field being asked', () => {
      expect(VoiceParser.parseFollowUp('cash', 'paymentMode', 'OUT').details).toEqual({ paymentMode: 'CASH' });
      expect(VoiceParser.parseFollowUp('Through UPI', 'paymentMode', 'OUT').details.paymentMode).toBe('BANK');
      expect(VoiceParser.parseFollowUp('not cash, bank', 'paymentMode', 'OUT').details.paymentMode).toBe('BANK');
      expect(VoiceParser.parseFollowUp('fifteen hundred', 'amount', 'OUT').details.amount).toBe(1500);
      expect(VoiceParser.parseFollowUp('five', 'amount', 'OUT').details.amount).toBe(5);
      expect(VoiceParser.parseFollowUp('salary', 'counterparty', 'IN').details.categoryName).toBe('Salary');
      expect(VoiceParser.parseFollowUp('to Priya', 'counterparty', 'OUT').details.personName).toBe('Priya');
    });

    it('a weak verb does not flip the direction of the entry', () => {
      expect(VoiceParser.parseFollowUp('bank transfer', 'paymentMode', 'IN').details).toEqual({ paymentMode: 'BANK' });
    });

    it('an outright statement does change it', () => {
      expect(VoiceParser.parseFollowUp('Actually I paid in cash', 'person', 'CREDIT_PURCHASE').details).toMatchObject({ flow: 'OUT', paymentMode: 'CASH' });
    });

    it('leaves unknown words as a bare answer with a person / purpose hint', () => {
      expect(VoiceParser.parseFollowUp('Rahul Sharma', 'counterparty', 'IN').bareAnswer).toBe('Rahul Sharma');
      expect(VoiceParser.parseFollowUp('for office repairs', 'counterparty', 'OUT')).toMatchObject({ bareHint: 'category' });
    });

    it('recognises correction requests and what they refer to', () => {
      expect(VoiceParser.correctionTarget('change the amount')).toBe('amount');
      expect(VoiceParser.correctionTarget('wrong person')).toBe('counterparty');
      expect(VoiceParser.correctionTarget('that is wrong')).toBe('any');
      expect(VoiceParser.correctionTarget('change it to bank')).toBeNull();
      expect(VoiceParser.correctionTarget('make it 600')).toBeNull();
    });
  });
});
