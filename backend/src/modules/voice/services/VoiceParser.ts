import type { VoucherType } from '@prisma/client';

/**
 * High-level classification of user voice utterance
 */
export type VoiceIntentType = 'QUERY' | 'TRANSACTION' | 'DETAILS' | 'CONFIRMATION' | 'UNKNOWN';

/**
 * Read-only accounting inquiries
 */
export interface VoiceQueryIntent {
  type: 'QUERY';
  target:
    | 'BANK_BALANCE'
    | 'CASH_BALANCE'
    | 'CASH_AND_BANK'
    | 'NET_WORTH'
    | 'TOTAL_ASSETS'
    | 'TOTAL_LIABILITIES'
    | 'TOTAL_INCOME'
    | 'TOTAL_EXPENSES'
    | 'PERSON_BALANCE'
    | 'EXPENSE_CATEGORY'
    | 'RECENT_TRANSACTIONS';
  personName?: string;
  categoryName?: string;
  /** A specific bank account the user named, e.g. "HDFC" */
  accountHint?: string;
  rawText: string;
}

export type TransactionAction =
  | 'WITHDRAWAL'          // Contra: Bank -> Cash (ATM/Bank cash withdrawal)
  | 'DEPOSIT'             // Contra: Cash -> Bank (Cash deposit into bank)
  | 'RECEIVE_FROM_PERSON' // Receipt: Debtor -> Cash/Bank (Payment collected from debtor)
  | 'GIVE_TO_PERSON'      // Payment: Cash/Bank -> Person (Lending / Debt repayment)
  | 'PERSON_BOUGHT'       // Journal: Person Dr, Sales Cr (Debtor purchase on credit)
  | 'USER_BOUGHT'         // Journal: Expense Dr, Creditor Cr (User purchase from vendor on credit)
  | 'DIRECT_PAYMENT'      // Payment: Expense Dr, Cash/Bank Cr (Direct expense payment)
  | 'DIRECT_INCOME';      // Receipt: Cash/Bank Dr, Income Cr (Direct salary/revenue receipt)

/**
 * Direction of the money movement, independent of the counterparty.
 * OUT / IN become a person entry or an expense / income entry once the counterparty is known.
 */
export type TransactionFlow = 'OUT' | 'IN' | 'WITHDRAWAL' | 'DEPOSIT' | 'CREDIT_SALE' | 'CREDIT_PURCHASE';

export type PaymentMode = 'CASH' | 'BANK';

/**
 * Facts the user explicitly stated. Anything not said stays undefined,
 * so the voice agent can ask a follow-up question instead of guessing.
 */
export interface TransactionDetails {
  flow?: TransactionFlow;
  amount?: number;
  personName?: string;
  categoryName?: string;
  paymentMode?: PaymentMode;
  /** A specific bank account the user named, e.g. "HDFC" or "savings" */
  bankHint?: string;
  /** Entry date (YYYY-MM-DD) when the user said when it happened */
  date?: string;
  /** Short free-text description (supplied by the LLM) */
  narration?: string;
}

/**
 * Double-entry ledger mutation commands
 */
export interface VoiceTransactionIntent {
  type: 'TRANSACTION';
  action: TransactionAction;
  voucherType: VoucherType;
  amount: number;
  personName?: string;
  categoryName?: string;
  paymentMode: PaymentMode;
  narration: string;
  rawText: string;
  /** Only the explicitly stated facts (defaults above are filled in for backwards compatibility) */
  details?: TransactionDetails;
}

/**
 * Transaction facts without a complete command, e.g. "Rahul 5000" or a follow-up answer like "from bank"
 */
export interface VoiceDetailsIntent {
  type: 'DETAILS';
  details: TransactionDetails;
  rawText: string;
}

/**
 * Conversational user confirmation responses ("yes", "confirm", "proceed", "cancel")
 */
export interface VoiceConfirmationIntent {
  type: 'CONFIRMATION';
  decision: 'CONFIRM' | 'CANCEL';
  rawText: string;
}

/**
 * Unrecognized or out-of-domain utterances
 */
export interface VoiceUnknownIntent {
  type: 'UNKNOWN';
  rawText: string;
  reason: string;
}

export type VoiceParsedResult =
  | VoiceQueryIntent
  | VoiceTransactionIntent
  | VoiceDetailsIntent
  | VoiceConfirmationIntent
  | VoiceUnknownIntent;

export interface CategoryMatch {
  name: string;
  type: 'EXPENSE' | 'INCOME';
  /** Words used to recognise an existing ledger account for this category */
  keywords: string[];
}

export interface PaymentModeMatch {
  mode: PaymentMode;
  bankHint?: string;
}

/**
 * What a short follow-up reply contained ("cash", "5000", "it was Rahul", "for office repairs")
 */
export interface FollowUpAnswer {
  details: TransactionDetails;
  /** Leftover free-form answer after filler words are removed, e.g. "Rahul" or "office repairs" */
  bareAnswer?: string;
  /** "to"/"from" before the bare answer suggests a person, "for"/"on" suggests a purpose */
  bareHint?: 'person' | 'category';
}

// ─── Vocabulary ───────────────────────────────────────────────────────────

const UNIT_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Romanised Hindi
  ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, aath: 8, nau: 9,
  das: 10, gyarah: 11, barah: 12, baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16,
  satrah: 17, atharah: 18, unnis: 19, bees: 20, pachees: 25, pachis: 25, tees: 30, chalis: 40,
  chaalis: 40, pachas: 50, pachaas: 50, sattar: 70, assi: 80, nabbe: 90,
};

/** Hindi number words that are also English words — they only count right before a scale ("do hazaar") */
const SCALE_ONLY_WORDS: Record<string, number> = { do: 2, saat: 7, saath: 60 };

/** Hindi fractional multipliers: "dedh lakh" = 1.5 lakh, "dhai hazaar" = 2,500, "sava lakh" = 1.25 lakh */
const FRACTION_WORDS: Record<string, number> = { dedh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, sava: 1.25 };

const HUNDRED_WORDS = new Set(['hundred', 'hundreds', 'sau']);

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3, thousands: 1e3, k: 1e3, hazaar: 1e3, hazar: 1e3, hajar: 1e3, hajaar: 1e3,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lack: 1e5,
  million: 1e6, millions: 1e6,
  crore: 1e7, crores: 1e7, cr: 1e7, karod: 1e7, karor: 1e7,
  billion: 1e9,
};

/** Scale words that are also ordinary words/letters — they need a number before them */
const WEAK_SCALES = new Set(['k', 'cr', 'lack', 'lac', 'lacs']);

const CURRENCY_BEFORE = new Set(['rs', 'inr', 'rupees', 'rupee', 'amount', 'amt']);
const CURRENCY_AFTER = new Set([
  'rupees', 'rupee', 'rupaye', 'rupaiye', 'rupay', 'rupiya', 'rupiye', 'rs', 'inr', 'bucks', 'only',
]);

const AMOUNT_CUES = new Set([
  'for', 'of', 'worth', 'total', 'paid', 'pay', 'paying', 'spent', 'spend', 'received', 'receive', 'got',
  'get', 'gave', 'give', 'deposited', 'deposit', 'withdrew', 'withdraw', 'withdrawn', 'withdrawal', 'lent',
  'lend', 'borrowed', 'collected', 'transferred', 'transfer', 'sent', 'send', 'charged', 'cost', 'costs',
  'costing', 'price', 'priced', 'bill', 'salary', 'fee', 'fees', 'emi', 'rent', 'credited', 'debited',
  'took', 'take', 'about', 'around', 'approx', 'nearly', 'was', 'is', 'make', 'it', 'be', 'to',
]);

const QUANTITY_WORDS = new Set([
  'items', 'item', 'pieces', 'piece', 'pcs', 'pc', 'units', 'unit', 'kg', 'kgs', 'kilo', 'kilos', 'grams',
  'gram', 'gm', 'gms', 'litre', 'litres', 'liter', 'liters', 'ltr', 'ml', 'packets', 'packet', 'boxes',
  'box', 'bottles', 'bottle', 'bags', 'bag', 'dozen', 'people', 'persons', 'person', 'members', 'guests',
  'days', 'day', 'weeks', 'week', 'months', 'month', 'years', 'year', 'hours', 'hour', 'hrs', 'minutes',
  'mins', 'times', 'nights', 'night', 'tickets', 'ticket', 'km', 'kms', 'percent', 'am', 'pm', 'baje',
  'log', 'din', 'mahine', 'saal', 'cups', 'cup', 'plates', 'plate',
]);

const IDENTIFIER_WORDS = new Set([
  'no', 'number', 'num', 'flat', 'room', 'house', 'plot', 'order', 'invoice', 'ticket', 'pnr', 'otp', 'pin',
  'id', 'version', 'model', 'seat', 'table', 'gate', 'platform', 'sector', 'block', 'floor',
]);

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10,
  november: 10, dec: 11, december: 11,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const BANK_NAMES =
  'hdfc|icici|sbi|axis|kotak|pnb|canara|idfc|indusind|yes\\s+bank|federal|rbl|bob|baroda|union\\s+bank|citi|citibank|hsbc|standard\\s+chartered|idbi|bandhan|au\\s+bank';

const BANK_MODE_RE = new RegExp(
  `\\b(bank|banks|account|online|upi|gpay|g\\s+pay|google\\s+pay|phonepe|phone\\s+pe|paytm|bhim|neft|rtgs|imps|cheque|card|net\\s*banking|transfer|transferred|wire|wired|swipe|swiped|tapped|khate|khata|${BANK_NAMES})\\b`,
  'gi'
);
const CASH_MODE_RE = /\b(cash|nakad|naqad|nagad|nagadi|in\s+hand|hand\s+cash|petty\s+cash|wallet)\b/gi;
const BANK_HINT_RE = new RegExp(`\\b(${BANK_NAMES}|savings|current\\s+account|salary\\s+account)\\b`, 'i');
const MODE_PREPOSITIONS = new Set(['in', 'via', 'through', 'using', 'by', 'from', 'into', 'with', 'on', 'se', 'me', 'mein', 'thru']);

/** Words that can never be (part of) a person's name */
const NON_NAME_WORDS = new Set([
  // pronouns & determiners
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'he', 'him', 'his',
  'she', 'her', 'hers', 'they', 'them', 'their', 'it', 'its', 'this', 'that', 'these', 'those', 'the', 'a',
  'an', 'some', 'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody', 'nobody', 'none',
  'one', 'other', 'another', 'each', 'every', 'all', 'both', 'who', 'whom', 'whose', 'what', 'which',
  'where', 'when', 'why', 'how', 'there', 'here', 'friend', 'friends', 'colleague', 'neighbour', 'neighbor',
  'cousin', 'guy', 'man', 'woman', 'lady', 'boy', 'girl', 'customer', 'client', 'vendor', 'supplier',
  'shopkeeper', 'party', 'person', 'people', 'company', 'employer', 'office', 'shop', 'store', 'market',
  'mall', 'home', 'house', 'flat', 'room', 'school', 'college', 'hospital', 'doctor', 'landlord', 'tenant',
  // prepositions & conjunctions
  'for', 'from', 'to', 'in', 'into', 'on', 'onto', 'at', 'by', 'via', 'through', 'thru', 'using', 'with',
  'without', 'of', 'off', 'as', 'and', 'or', 'but', 'so', 'than', 'then', 'about', 'after', 'before',
  'during', 'till', 'until', 'upto', 'under', 'over', 'towards', 'toward', 'against', 'between', 'per',
  // verbs & auxiliaries
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'done', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'paid', 'pay', 'pays',
  'paying', 'gave', 'give', 'given', 'gives', 'giving', 'got', 'get', 'gets', 'getting', 'received',
  'receive', 'receives', 'receiving', 'took', 'take', 'takes', 'taken', 'taking', 'sent', 'send', 'sends',
  'sending', 'lent', 'lend', 'lends', 'lending', 'borrowed', 'borrow', 'spent', 'spend', 'spends',
  'spending', 'bought', 'buy', 'buys', 'buying', 'purchased', 'purchase', 'sold', 'sell', 'sells',
  'deposited', 'deposit', 'withdrew', 'withdraw', 'withdrawn', 'withdrawal', 'transferred', 'transfer',
  'collected', 'collect', 'returned', 'return', 'repaid', 'repay', 'owe', 'owes', 'owed', 'made', 'make',
  'makes', 'record', 'recorded', 'add', 'added', 'enter', 'entered', 'post', 'posted', 'note', 'noted',
  'log', 'logged', 'settled', 'settle', 'cleared', 'clear', 'billed', 'invoiced', 'charged', 'credited',
  'debited', 'earned', 'earn', 'loaned', 'tipped', 'donated', 'ordered', 'booked', 'renewed', 'recharged',
  'swiped', 'accepted', 'came', 'call', 'called', 'tell', 'told', 'show', 'remind', 'need', 'needs', 'want',
  'wants', 'let', 'minus', 'plus', 'each', 'apiece',
  // money & accounting words
  'money', 'muny', 'amount', 'payment', 'payments', 'cash', 'bank', 'banks', 'account', 'accounts', 'atm',
  'upi', 'gpay', 'paytm', 'phonepe', 'bhim', 'card', 'debit', 'credit', 'cheque', 'check', 'neft', 'rtgs',
  'imps', 'online', 'wallet', 'net', 'banking', 'netbanking', 'rupees', 'rupee', 'rs', 'inr', 'bucks',
  'balance', 'entry', 'entries', 'voucher', 'vouchers', 'transaction', 'transactions', 'expense',
  'expenses', 'income', 'loan', 'emi', 'bill', 'bills', 'fee', 'fees', 'charges', 'charge', 'due', 'dues',
  'advance', 'salary', 'rent', 'interest', 'dividend', 'refund', 'cashback', 'bonus', 'sales', 'sale',
  'revenue', 'profit', 'tax', 'gst', 'udhaar', 'udhar', 'hisaab', 'hisab', 'kharcha', 'kharch', 'goods',
  'items', 'item', 'stuff', 'things', 'thing', 'products', 'something', 'anything', 'nothing', 'saman',
  'maal', 'gift',
  // time words
  'today', 'yesterday', 'tomorrow', 'tonight', 'morning', 'evening', 'afternoon', 'night', 'week', 'weeks',
  'month', 'months', 'year', 'years', 'day', 'days', 'last', 'next', 'ago', 'now', 'later', 'earlier',
  'daily', 'monthly', 'weekly', 'aaj', 'kal', 'parso',
  // conversational
  'yes', 'no', 'ok', 'okay', 'sure', 'please', 'thanks', 'thank', 'hello', 'hi', 'hey', 'confirm',
  'cancel', 'proceed', 'haan', 'nahi', 'ji', 'bhai', 'sir', 'madam', 'maam', 'sahab', 'saheb', 'yaar',
  'just', 'also', 'only', 'actually', 'really', 'very', 'much', 'many', 'more', 'less', 'total', 'few',
  'lot', 'lots', 'again', 'same', 'new',
  // hinglish function words
  'ko', 'se', 'ne', 'ka', 'ke', 'ki', 'mein', 'pe', 'par', 'aur', 'ya', 'hai', 'tha', 'thi', 'hua', 'hui',
  'diya', 'diye', 'di', 'de', 'mila', 'mile', 'mili', 'liya', 'liye', 'li', 'bheja', 'bheje', 'aaya',
  'aaye', 'maine', 'mujhe', 'mujhse', 'humne', 'hamne', 'mera', 'meri', 'mere', 'apna', 'apne', 'wala',
  'wali', 'kiya', 'kiye', 'karo', 'kar', 'kardo', 'jama', 'nikala', 'nikale', 'becha', 'kharida', 'kitna',
  'kitne', 'batao', 'dikhao', 'lautaya', 'wapas',
  // banks & account types (a bank is never a contact)
  'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'pnb', 'canara', 'idfc', 'indusind', 'federal', 'rbl', 'bob',
  'baroda', 'citi', 'citibank', 'hsbc', 'idbi', 'bandhan', 'savings', 'current',
]);

/** English number words stop a name ("Rahul five hundred"); Hindi ones don't, because "Das" is a common surname */
const ENGLISH_NUMBER_WORDS = new Set(Object.keys(UNIT_WORDS).filter((w) => /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)$/.test(w)));

const NAME_PREFIXES = new Set(['my', 'the', 'a', 'an', 'our', 'mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'sri', 'smt', 'mister', 'to', 'from', 'by']);
const NAME_SUFFIXES = new Set(['ji', 'sir', 'bhai', 'bhaiya', 'sahab', 'saheb', 'madam', 'maam', 'uncle', 'aunty', 'didi']);
const SELF_WORDS = new Set(['i', 'we', 'maine', 'humne', 'hamne', 'mein', 'main']);
/** Third parties without a usable name: the agent asks who it was */
const ANONYMOUS_THIRD_PARTIES = new Set([
  'he', 'she', 'they', 'usne', 'unhone', 'customer', 'client', 'tenant', 'friend', 'someone', 'somebody',
  'party', 'buyer', 'debtor', 'landlord', 'owner', 'vendor', 'supplier', 'shopkeeper', 'seller', 'employee',
  'staff', 'maid', 'driver', 'plumber', 'electrician', 'mechanic', 'doctor', 'neighbour', 'neighbor', 'colleague',
]);

/** Verbs that only suggest a direction ("took a cab", "got groceries") unless "from" / "to" settles it */
const WEAK_IN_VERBS = new Set(['got', 'get', 'getting', 'gets', 'took', 'take', 'taken', 'taking', 'credited', 'li', 'liya', 'liye']);
const WEAK_OUT_VERBS = new Set(['debited', 'de', 'di']);

// ─── Category rules ──────────────────────────────────────────────────────

interface CategoryRule {
  name: string;
  pattern: RegExp;
  keywords: string[];
}

const EXPENSE_RULES: CategoryRule[] = [
  { name: 'Groceries', pattern: /\b(groceries|grocery|kirana|ration|vegetables?|veggies|sabzi|sabji|fruits?|milk|doodh|supermarket|bigbasket|blinkit|zepto|dmart|instamart)\b/, keywords: ['groceries', 'grocery', 'kirana', 'ration', 'vegetable', 'supermarket'] },
  { name: 'Food & Dining', pattern: /\b(food|lunch|dinner|breakfast|brunch|snacks?|meals?|restaurant|cafe|coffee|tea|chai|pizza|burger|biryani|swiggy|zomato|dining|eating\s+out|khana|nashta|dosa|samosa)\b/, keywords: ['food', 'dining', 'restaurant', 'meal', 'lunch', 'dinner', 'cafe', 'snack'] },
  { name: 'Rent', pattern: /\b(rent|rental|kiraya)\b/, keywords: ['rent', 'rental'] },
  { name: 'Electricity', pattern: /\b(electricity|electric\s+bill|power\s+bill|light\s+bill|current\s+bill|bijli)\b/, keywords: ['electricity', 'electric', 'power'] },
  { name: 'Utilities', pattern: /\b(water\s+bill|gas\s+bill|gas\s+cylinder|cylinder|lpg|internet|wifi|wi-fi|broadband|phone\s+bill|mobile\s+bill|recharge|dth|utility|utilities|postpaid|prepaid)\b/, keywords: ['utilities', 'utility', 'internet', 'phone', 'mobile', 'recharge', 'water', 'gas', 'broadband'] },
  { name: 'Travel & Fuel', pattern: /\b(travel|trip|cab|taxi|uber|ola|rapido|auto|rickshaw|bus|train|metro|flight|petrol|diesel|fuel|cng|toll|parking|commute|fastag)\b/, keywords: ['travel', 'fuel', 'petrol', 'transport', 'commute', 'cab', 'taxi', 'conveyance'] },
  { name: 'Medical & Health', pattern: /\b(medicines?|medical|doctor|hospital|clinic|pharmacy|chemist|dawai|dawa|health|checkup|dental|dentist|diagnostic)\b/, keywords: ['medical', 'medicine', 'doctor', 'hospital', 'pharmacy', 'clinic'] },
  { name: 'Fitness', pattern: /\b(gym|fitness|yoga|workout|trainer)\b/, keywords: ['gym', 'fitness'] },
  { name: 'Education', pattern: /\b(school|college|tuition|course|classes|coaching|books?|exam|education|fees)\b/, keywords: ['education', 'school', 'tuition', 'fees', 'course'] },
  { name: 'Shopping', pattern: /\b(shopping|clothes|clothing|shoes|dress|amazon|flipkart|myntra|ajio|meesho|cosmetics)\b/, keywords: ['shopping', 'clothes', 'clothing'] },
  { name: 'Entertainment', pattern: /\b(movies?|cinema|netflix|hotstar|spotify|concert|party|outing|games?)\b/, keywords: ['entertainment', 'movie', 'leisure'] },
  { name: 'Subscriptions & Software', pattern: /\b(subscriptions?|software|saas|cloud|aws|azure|hosting|domain|github|chatgpt)\b/, keywords: ['software', 'saas', 'cloud', 'subscription'] },
  { name: 'Stationery', pattern: /\b(stationery|stationary|pens?|notebooks?|paper|printing|xerox|photocopy)\b/, keywords: ['stationery'] },
  { name: 'Office Supplies', pattern: /\b(office\s+supplies|office\s+expenses?|office)\b/, keywords: ['office'] },
  { name: 'Equipment', pattern: /\b(laptops?|computers?|desktop|monitor|printer|hardware|electronics|tablet|ipad|macbook|smartphone|new\s+(?:phone|mobile))\b/, keywords: ['equipment', 'hardware', 'electronics', 'computer'] },
  { name: 'Repairs & Maintenance', pattern: /\b(repairs?|maintenance|servicing|plumber|electrician|mechanic|carpenter)\b/, keywords: ['repair', 'maintenance'] },
  { name: 'Insurance', pattern: /\b(insurance|premium|lic)\b/, keywords: ['insurance'] },
  { name: 'Taxes', pattern: /\b(tax|taxes|gst|tds)\b/, keywords: ['tax'] },
  { name: 'Loan EMI', pattern: /\b(emi|loan\s+repayment|instal+ments?)\b/, keywords: ['emi', 'loan'] },
  { name: 'Household', pattern: /\b(maid|cook|laundry|dhobi|household|cleaning|house\s+help|servant)\b/, keywords: ['household', 'maid', 'domestic'] },
  { name: 'Personal Care', pattern: /\b(salon|haircut|parlou?r|spa|grooming|barber)\b/, keywords: ['personal care', 'salon', 'grooming'] },
  { name: 'Charity & Donations', pattern: /\b(donations?|donated|charity|temple|mandir|church|mosque|gurudwara|daan)\b/, keywords: ['donation', 'charity'] },
  { name: 'Salaries & Wages', pattern: /\b(salary|salaries|wages|payroll|staff|employees?)\b/, keywords: ['salaries', 'wages', 'payroll', 'staff'] },
  { name: 'Interest Paid', pattern: /\binterest\b/, keywords: ['interest'] },
  { name: 'Bank Charges', pattern: /\b(bank\s+charges|annual\s+fee|late\s+fee|penalty|service\s+charges?)\b/, keywords: ['charges', 'penalty'] },
];

const INCOME_RULES: CategoryRule[] = [
  { name: 'Salary', pattern: /\b(salary|wages|paycheck|payslip|tankhwah|tankha|vetan|stipend)\b/, keywords: ['salary', 'compensation', 'wages'] },
  { name: 'Bonus', pattern: /\b(bonus|incentive)\b/, keywords: ['bonus', 'incentive'] },
  { name: 'Freelance Income', pattern: /\b(freelance|freelancing|gig)\b/, keywords: ['freelance'] },
  { name: 'Consulting Revenue', pattern: /\b(consulting|consultancy|consultation)\b/, keywords: ['consulting', 'consultancy'] },
  { name: 'Investment Income', pattern: /\b(interest|dividends?|returns|mutual\s+funds?|fixed\s+deposit|fd|stocks?|shares|capital\s+gains?)\b/, keywords: ['interest', 'dividend', 'investment'] },
  { name: 'Commission', pattern: /\b(commission|brokerage)\b/, keywords: ['commission'] },
  { name: 'Refunds & Cashback', pattern: /\b(refund|refunded|cashback|reimbursement|reimbursed)\b/, keywords: ['refund', 'cashback', 'reimbursement'] },
  { name: 'Gifts Received', pattern: /\b(gift|gifted|shagun)\b/, keywords: ['gift'] },
  { name: 'Rental Income', pattern: /\b(rent|rental|kiraya)\b/, keywords: ['rental', 'rent'] },
  { name: 'Sales Revenue', pattern: /\b(sales|sale|sold|business\s+income|revenue|turnover)\b/, keywords: ['sales', 'revenue'] },
];

/** Income rules that are clear even without a verb ("salary 50000") */
const UNAMBIGUOUS_INCOME = new Set(['Salary', 'Bonus', 'Freelance Income', 'Consulting Revenue', 'Investment Income', 'Commission', 'Refunds & Cashback']);

const GENERIC_CATEGORY_WORDS = new Set([
  'general', 'misc', 'miscellaneous', 'other', 'others', 'expense', 'expenses', 'payment', 'payments',
  'income', 'receipt', 'transaction', 'money', 'unknown', 'none', 'na', 'n/a', 'stuff', 'things', 'item',
  'items', 'purchase', 'purchases', 'total', 'my', 'all', 'the', 'monthly',
]);

// ─── Flow vocabulary ─────────────────────────────────────────────────────

const OUT_VERB_RE = /\b(paid|pay|paying|pays|spent|spend|spending|spends|gave|give|given|giving|lent|lend|lending|loaned|sent|send|sending|transferred|transfer|transferring|debited|donated|donate|tipped|repaid|repay|returned|return|settled|cleared|swiped|recharged|booked|renewed|subscribed|kharcha|kharch|kharche|kharchi|diya|diye|di|de|bheja|bheje|bheji|chukaya|chukaye|bhara|bhare|bhari)\b/;
const IN_VERB_RE = /\b(received|receive|receiving|receives|got|get|getting|gets|collected|collect|collecting|took|take|taken|taking|accepted|accept|earned|earn|credited|borrowed|borrow|refunded|mila|mile|mili|liya|liye|li|aaya|aaye|aayi|aya|prapt)\b/;
const WITHDRAW_RE = /\b(withdrew|withdrawn|withdraw|withdrawal|withdrawing|withdraws|took\s+out|take\s+out|taken\s+out|nikala|nikale|nikali|nikaala|nikalwaye)\b/;
const DEPOSIT_RE = /\b(deposited|deposit|depositing|deposits|jama)\b/;
const FROM_BANK_RE = new RegExp(`\\b(?:from|se)\\s+(?:the\\s+|my\\s+|our\\s+)?(?:bank|atm|account|savings|${BANK_NAMES})\\b|\\b(?:bank|atm)\\s+se\\b`);
const PUT_IN_BANK_RE = new RegExp(
  String.raw`\b(?:put|added|kept|dala|daala|daale|dale|rakha|rakhe)\b.*\b(?:in|into|to|me|mein|main)\s+(?:the\s+|my\s+)?(?:bank|account)\b|\b(?:bank|account)\s+(?:me|mein|main)\s+(?:dala|daala|daale|dale|jama)\b|\b(?:transferred|transfer|moved|move|sent)\b.*\bto\s+my\s+(?:own\s+)?(?:bank|account|savings|${BANK_NAMES})\b`
);
const BANK_TO_CASH_RE = /\bfrom\s+(?:the\s+|my\s+)?bank\s+to\s+(?:cash|hand|wallet)\b/;
const CASH_TO_BANK_RE = /\bfrom\s+cash\s+to\s+(?:the\s+|my\s+)?(?:bank|account)\b/;
const ON_CREDIT_RE = /\b(?:on\s+credit|credit\s+(?:pe|par|me)|udhaa?r|udhaari|on\s+account|on\s+(?:a\s+)?tab|pay\s+later|baad\s+me(?:in)?\s+(?:dunga|dungi|denge|dena))\b/;
const SALE_RE = /\b(sold|sell|selling|sells|becha|beche|bechi|billed|invoiced|supplied)\b/;
const BUY_RE = /\b(bought|buy|buying|purchased|purchase|purchasing|kharida|kharide|kharidi|ordered)\b/;
const GOODS_RE = /\b(goods|items?|stuff|products?|things|material|saman|maal|groceries|clothes|laptops?|phones?|shoes)\b/;
const PAID_ME_RE = /\b(?:paid|gave|sent|transferred|returned|repaid|lent)\s+(?:me|us)\b|\bgot\s+paid\b|\b(?:lautaya|lautaye|wapas\s+(?:kiya|kiye|diya|diye))\b/;

const SUBJECT_VERBS = 'paid|gave|sent|transferred|returned|repaid|deposited|settled|cleared|credited|lent|bought|purchased|took|ordered|owes|owed|borrowed|got|received|collected|ne';
const SUBJECT_RE = new RegExp(
  `^\\s*(?:(?:so|today|yesterday|okay|ok|hey|and|also|actually|then|aaj|kal|um|uh|well)\\s+)*([A-Za-z][A-Za-z.'-]*(?:\\s+[A-Za-z][A-Za-z.'-]*){0,3}?)\\s+(?:ji\\s+)?(?:has\\s+|have\\s+|had\\s+|just\\s+|already\\s+)?(${SUBJECT_VERBS})\\b`,
  'i'
);

// ─── Confirmation vocabulary ─────────────────────────────────────────────

const AFFIRM_CORE = new Set([
  'yes', 'yess', 'yeah', 'yea', 'yep', 'yup', 'ya', 'yah', 'sure', 'ok', 'okay', 'okey', 'k', 'kk', 'alright',
  'right', 'correct', 'confirm', 'confirmed', 'proceed', 'post', 'record', 'save', 'submit', 'approve',
  'approved', 'accept', 'fine', 'good', 'great', 'perfect', 'absolutely', 'definitely', 'exactly', 'done',
  'go', 'haan', 'han', 'haa', 'ha', 'haanji', 'hanji', 'theek', 'thik', 'bilkul', 'sahi', 'chalega',
]);
const AFFIRM_FILLER = new Set([
  'please', 'pls', 'plz', 'kindly', 'ji', 'sir', 'madam', 'maam', 'bhai', 'yaar', 'do', 'it', 'that',
  'this', 'is', 'its', 'thats', 'looks', 'all', 'set', 'ahead', 'and', 'the', 'entry', 'voucher',
  'transaction', 'now', 'then', 'just', 'kar', 'karo', 'kardo', 'karde', 'de', 'hai', 'sab', 'everything',
  'so', 'well', 'um', 'uh', 'hmm', 'oh', 'also', 'very', 'much', 'thank', 'thanks', 'you', 'book', 'add',
  'to', 'ledger', 'books', 'same', 'one', 'go', 'with', 'in',
]);
const CANCEL_CORE = new Set([
  'cancel', 'cancelled', 'canceled', 'abort', 'stop', 'discard', 'delete', 'remove', 'scrap', 'reject',
  'nevermind', 'forget', 'leave', 'skip', 'rehne', 'chhodo', 'chodo',
]);
const NEGATORS = new Set(['no', 'nope', 'nah', 'not', 'dont', 'never', 'nahi', 'nahin', 'na', 'mat']);
const CANCEL_FILLER = new Set([
  'it', 'that', 'this', 'the', 'entry', 'transaction', 'voucher', 'please', 'about', 'do', 'karo', 'de',
  'dena', 'now', 'then', 'just', 'thanks', 'thank', 'you', 'ji', 'bhai', 'sir', 'all', 'everything', 'post',
  'record', 'save', 'confirm', 'add', 'yaar', 'hai', 'mind', 'chahiye', 'need', 'want', 'go', 'ahead',
  'with', 'one', 'wrong', 'and', 'ok', 'okay',
]);

// ─── Devanagari romanisation ─────────────────────────────────────────────

const DEVANAGARI_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries({
    'रुपए': 'rupees', 'रुपये': 'rupees', 'रुपया': 'rupees', 'रूपए': 'rupees', 'रूपये': 'rupees', 'रुपयों': 'rupees', 'रु': 'rs',
    'हज़ार': 'hazaar', 'हजार': 'hazaar', 'लाख': 'lakh', 'करोड़': 'crore', 'करोड': 'crore', 'सौ': 'sau',
    'को': 'ko', 'से': 'se', 'ने': 'ne', 'में': 'me', 'मे': 'me', 'का': 'ka', 'के': 'ke', 'की': 'ki', 'और': 'aur',
    'दिया': 'diya', 'दिए': 'diye', 'दिये': 'diye', 'दी': 'di', 'दे': 'diye',
    'मिला': 'mila', 'मिले': 'mile', 'मिली': 'mili', 'लिया': 'liya', 'लिए': 'liye', 'लिये': 'liye', 'ली': 'li',
    'भेजा': 'bheja', 'भेजे': 'bheje', 'भेजी': 'bheji', 'आया': 'aaya', 'आए': 'aaye', 'आये': 'aaye', 'आई': 'aayi',
    'नकद': 'cash', 'नगद': 'cash', 'कैश': 'cash', 'बैंक': 'bank', 'खाते': 'account', 'खाता': 'account',
    'ऑनलाइन': 'online', 'यूपीआई': 'upi', 'कार्ड': 'card', 'चेक': 'cheque', 'पेटीएम': 'paytm', 'फोनपे': 'phonepe',
    'ट्रांसफर': 'transfer',
    'खर्च': 'kharcha', 'खर्चा': 'kharcha', 'किराया': 'rent', 'किराए': 'rent', 'किराये': 'rent', 'खाना': 'food',
    'खाने': 'food', 'बिजली': 'electricity', 'पेट्रोल': 'petrol', 'दवाई': 'medicine', 'दवा': 'medicine',
    'राशन': 'groceries', 'सब्ज़ी': 'vegetables', 'सब्जी': 'vegetables', 'सैलरी': 'salary', 'वेतन': 'salary',
    'तनख्वाह': 'salary', 'तनख़्वाह': 'salary', 'ब्याज': 'interest', 'बिल': 'bill',
    'जमा': 'jama', 'निकाले': 'nikale', 'निकाला': 'nikala', 'निकाली': 'nikali',
    'उधार': 'udhaar', 'बेचा': 'becha', 'बेचे': 'beche', 'खरीदा': 'kharida', 'ख़रीदा': 'kharida', 'खरीदे': 'kharide',
    'हाँ': 'haan', 'हां': 'haan', 'हा': 'haan', 'नहीं': 'nahi', 'नही': 'nahi', 'ठीक': 'theek', 'है': 'hai',
    'कल': 'kal', 'आज': 'aaj', 'परसों': 'parso',
    'एक': 'ek', 'दो': 'do', 'तीन': 'teen', 'चार': 'chaar', 'पांच': 'paanch', 'पाँच': 'paanch', 'छह': 'chhe',
    'सात': 'saat', 'आठ': 'aath', 'नौ': 'nau', 'दस': 'das', 'बीस': 'bees', 'पच्चीस': 'pachees', 'तीस': 'tees',
    'चालीस': 'chalis', 'पचास': 'pachaas', 'साठ': 'saath', 'सत्तर': 'sattar', 'अस्सी': 'assi', 'नब्बे': 'nabbe',
    'डेढ़': 'dedh', 'डेढ': 'dedh', 'ढाई': 'dhai',
    'जी': 'ji', 'भाई': 'bhai', 'मैंने': 'maine', 'मैने': 'maine', 'मुझे': 'mujhe', 'हमने': 'humne',
  }).map(([k, v]) => [k.normalize('NFKC'), v])
);

const DV_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o',
};
const DV_MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
};
const DV_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
};
const DV_NUKTA_FORMS: Record<string, string> = { 'क': 'q', 'ख': 'kh', 'ग': 'gh', 'ज': 'z', 'ड': 'd', 'ढ': 'rh', 'फ': 'f' };
const DV_NUKTA = '़';
const DV_VIRAMA = '्';

// ─── Tokenizer ───────────────────────────────────────────────────────────

interface Token {
  raw: string;
  lower: string;
  start: number;
  end: number;
  kind: 'num' | 'word' | 'ordinal' | 'date' | 'time' | 'sym';
  value?: number;
  scaleSuffix?: number;
}

interface AmountCandidate {
  value: number;
  first: number;
  last: number;
  hasDigits: boolean;
  hasScale: boolean;
  score: number;
  /** Followed by a unit or plural noun ("2 bills", "3 kg") — a count, not money */
  isQuantity?: boolean;
}

const TOKEN_RE =
  /(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4})|(\d{1,2}:\d{2})|(\d+(?:st|nd|rd|th))(?![a-z])|(\d+(?:,\d+)*(?:\.\d+)?)(k|cr)?(?![a-z\d])|(\d+(?:,\d+)*(?:\.\d+)?)|([a-z]+(?:'[a-z]+)?)|(\/-|[₹%#+&-])/gi;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    const base = { raw, lower: raw.toLowerCase(), start: m.index, end: m.index + raw.length };
    if (m[1]) tokens.push({ ...base, kind: 'date' });
    else if (m[2]) tokens.push({ ...base, kind: 'time' });
    else if (m[3]) tokens.push({ ...base, kind: 'ordinal' });
    else if (m[4]) {
      const suffix = m[5]?.toLowerCase();
      tokens.push({
        ...base,
        kind: 'num',
        value: parseFloat(m[4].replace(/,/g, '')),
        scaleSuffix: suffix === 'k' ? 1e3 : suffix === 'cr' ? 1e7 : undefined,
      });
    } else if (m[6]) tokens.push({ ...base, kind: 'num', value: parseFloat(m[6].replace(/,/g, '')) });
    else if (m[7]) tokens.push({ ...base, kind: 'word' });
    else tokens.push({ ...base, kind: 'sym' });
  }
  return tokens;
}

function isScaleWord(word: string | undefined): boolean {
  return !!word && (HUNDRED_WORDS.has(word) || word in SCALE_WORDS);
}

function isValueToken(t: Token | undefined): boolean {
  return !!t && (t.kind === 'num' || (t.kind === 'word' && t.lower in UNIT_WORDS));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCaseWord(word: string): string {
  // Keep deliberate casing such as "HDFC", "TechCorp" or "McDonald"
  if (/[A-Z]/.test(word.slice(1)) || (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word))) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * VoiceParser — Natural Language Financial Parser & Intent Classifier
 *
 * Deterministically parses spoken and typed financial utterances with Indian numbering
 * conventions, Hinglish / Devanagari accounting colloquialisms, and strict double-entry classifications.
 * It only reports what the user actually said, so missing details can be asked for.
 */
export class VoiceParser {
  // ─── Normalisation ─────────────────────────────────────────────────────

  /**
   * Normalise a transcript: Devanagari → Latin, unified quotes, spaced currency markers
   */
  public static normalize(text: string): string {
    let s = (text || '').normalize('NFKC').replace(/[।॥]/g, ' ');
    if (/[ऀ-ॿ]/.test(s)) {
      s = this.romanizeDevanagari(s);
    }
    return s
      .replace(/[“”]/g, '"')
      .replace(/[‘’`]/g, "'")
      .replace(/\ba\/c\b/gi, 'account')
      .replace(/\brs\.?(?=\s*\d)/gi, 'rs ')
      .replace(/\binr(?=\d)/gi, 'inr ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Transliterate Devanagari words (as returned by Voxtral for Hindi speech) to romanised Hinglish
   */
  public static romanizeDevanagari(text: string): string {
    const digitsFixed = text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
    return digitsFixed.replace(/[ऀ-ॿ]+/g, (word) => DEVANAGARI_WORDS[word] ?? this.transliterateWord(word));
  }

  private static transliterateWord(word: string): string {
    const chars = [...word];
    let out = '';
    let endsWithInherentA = false;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (DV_CONSONANTS[ch]) {
        let latin = DV_CONSONANTS[ch];
        if (chars[i + 1] === DV_NUKTA) {
          latin = DV_NUKTA_FORMS[ch] ?? latin;
          i++;
        }
        const next = chars[i + 1];
        if (next === DV_VIRAMA) {
          out += latin;
          i++;
          endsWithInherentA = false;
        } else if (next && DV_MATRAS[next]) {
          out += latin + DV_MATRAS[next];
          i++;
          endsWithInherentA = false;
        } else {
          out += `${latin}a`;
          endsWithInherentA = true;
        }
      } else if (DV_VOWELS[ch]) {
        out += DV_VOWELS[ch];
        endsWithInherentA = false;
      } else if (ch === 'ं' || ch === 'ँ') {
        out += 'n';
        endsWithInherentA = false;
      } else if (ch === 'ः') {
        out += 'h';
        endsWithInherentA = false;
      } else if (ch !== DV_NUKTA) {
        out += ch;
        endsWithInherentA = false;
      }
    }

    // Final schwa deletion: राहुल → rahul (not rahula)
    if (endsWithInherentA && out.length > 2) out = out.slice(0, -1);
    return out.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
  }

  // ─── Amounts ───────────────────────────────────────────────────────────

  /**
   * Parse amounts including Indian numbering multipliers (k, lakh, crore, cr), spoken number words
   * ("fifteen hundred", "one lakh fifty thousand", "do hazaar") and negative numbers.
   * When several numbers are present, the one that looks most like money wins
   * (currency markers, "for"/"of", not quantities, dates, times or ordinals).
   */
  public static parseAmount(text: string, options?: { allowSmallWords?: boolean }): number | null {
    if (!text || typeof text !== 'string') return null;
    const norm = this.normalize(text);
    const tokens = tokenize(norm);
    const candidates = this.amountCandidates(norm, tokens, options?.allowSmallWords ?? false);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score || Math.abs(b.value) - Math.abs(a.value));
    const best = candidates[0];
    let value = best.value;

    // "2 bills of 500 each", "3 kg at 200 per kg" → quantity × unit price
    if (/\b(?:each|apiece|a\s+piece|per\s+(?:person|head|piece|item|unit|kg|kilo|plate|ticket|month|day))\b/i.test(norm)) {
      const quantity = candidates.find(
        (c) => c !== best && c.isQuantity && Number.isInteger(c.value) && c.value > 1 && c.value < 1000
      );
      if (quantity) value = best.value * quantity.value;
    }
    return Math.round(value * 100) / 100;
  }

  /**
   * True if the text contains anything that could be a number (digits or number words)
   */
  public static hasNumberContent(text: string): boolean {
    const norm = this.normalize(text);
    if (/\d/.test(norm)) return true;
    return tokenize(norm).some(
      (t) => t.kind === 'word' && (t.lower in UNIT_WORDS || t.lower in FRACTION_WORDS || HUNDRED_WORDS.has(t.lower) || (t.lower in SCALE_WORDS && !WEAK_SCALES.has(t.lower)))
    );
  }

  private static amountCandidates(norm: string, tokens: Token[], allowSmallWords: boolean): AmountCandidate[] {
    const candidates: AmountCandidate[] = [];
    let i = 0;

    while (i < tokens.length) {
      const phrase = this.readNumberPhrase(tokens, i);
      if (!phrase) {
        i++;
        continue;
      }
      i = phrase.last + 1;

      const before = tokens[phrase.first - 1];
      const before2 = tokens[phrase.first - 2];
      const after = tokens[phrase.last + 1];
      const firstTok = tokens[phrase.first];

      // ── Exclusions: things that are numbers but not money ──
      const isMonth = (t?: Token) => !!t && t.kind === 'word' && t.lower in MONTHS && (t.lower !== 'may' || phrase.value <= 31);
      if (isMonth(before) || isMonth(after)) {
        if (phrase.value <= 31 || (phrase.value >= 1900 && phrase.value <= 2100)) continue;
      }
      if (after && (after.raw === '%' || after.lower === 'percent' || after.lower === 'am' || after.lower === 'pm' || after.lower === "o'clock")) continue;
      if (before && before.raw === '+') continue;
      if (firstTok.kind === 'num' && phrase.first === phrase.last && /^\d{10,}$/.test(firstTok.raw)) continue;
      if (phrase.value === 0) continue;
      if (!phrase.hasDigits && !phrase.hasScale && phrase.value < 10 && !allowSmallWords) continue;

      // ── Scoring: how much does this look like the transaction amount? ──
      let score = 0;
      if (phrase.hasScale) score += 1;
      if (phrase.hasDigits) score += 0.5;

      const prevWord = before?.kind === 'word' ? before.lower : undefined;
      if (before?.raw === '₹' || (prevWord && CURRENCY_BEFORE.has(prevWord))) score += 3;
      else if (prevWord && AMOUNT_CUES.has(prevWord)) score += 2;
      else if (before2?.raw === '₹') score += 2;

      if (after && ((after.kind === 'word' && CURRENCY_AFTER.has(after.lower)) || after.raw === '/-')) score += 3;
      let isQuantity = false;
      if (after?.kind === 'word') {
        if (QUANTITY_WORDS.has(after.lower)) {
          score -= 4;
          isQuantity = true;
        } else if (
          after.lower.length > 3 &&
          after.lower.endsWith('s') &&
          !CURRENCY_AFTER.has(after.lower) &&
          !AMOUNT_CUES.has(after.lower) &&
          !phrase.hasScale &&
          phrase.value < 100
        ) {
          score -= 2; // "2 laptops", "3 shirts"
          isQuantity = true;
        }
      }
      if (prevWord && IDENTIFIER_WORDS.has(prevWord)) score -= 3;

      // ── Sign: "-5000" or "minus 5000", but not ranges like "2020-21" ──
      let value = phrase.value;
      const minusSign =
        before?.raw === '-' &&
        /^\s*$/.test(norm.slice(before.end, firstTok.start)) &&
        (before.start === 0 || /\s/.test(norm.charAt(before.start - 1)));
      if (minusSign || prevWord === 'minus') value = -Math.abs(value);

      candidates.push({ ...phrase, value, score, isQuantity });
    }

    return candidates;
  }

  private static readNumberPhrase(tokens: Token[], start: number): AmountCandidate | null {
    let total = 0;
    let current = 0;
    let pendingAdd = 0;
    let last: 'value' | 'tens' | 'hundred' | 'scale' | null = null;
    let hasDigits = false;
    let hasScale = false;
    let consumed = false;
    let lastIndex = start - 1;

    for (let j = start; j < tokens.length; j++) {
      const t = tokens[j];
      const next = tokens[j + 1];

      if (t.kind === 'num') {
        if (last === 'value' || last === 'tens') break;
        current += (t.value ?? 0) + pendingAdd;
        pendingAdd = 0;
        if (t.scaleSuffix) {
          total += current * t.scaleSuffix;
          current = 0;
          last = 'scale';
          hasScale = true;
        } else {
          last = 'value';
        }
        hasDigits = true;
        consumed = true;
        lastIndex = j;
        continue;
      }

      if (t.kind !== 'word') break;
      const w = t.lower;

      if (w in UNIT_WORDS) {
        const v = UNIT_WORDS[w];
        if (last === 'value') break;
        if (last === 'tens' && v >= 10) break;
        current += v + pendingAdd;
        pendingAdd = 0;
        last = v >= 20 && v % 10 === 0 ? 'tens' : 'value';
        consumed = true;
        lastIndex = j;
        continue;
      }

      if (w in SCALE_ONLY_WORDS && isScaleWord(next?.lower) && last !== 'value') {
        current += SCALE_ONLY_WORDS[w];
        last = 'value';
        consumed = true;
        lastIndex = j;
        continue;
      }

      if (w in FRACTION_WORDS && isScaleWord(next?.lower) && last !== 'value') {
        current += FRACTION_WORDS[w];
        last = 'value';
        consumed = true;
        lastIndex = j;
        continue;
      }

      if ((w === 'sadhe' || w === 'saade' || w === 'sava') && isValueToken(next)) {
        pendingAdd = w === 'sava' ? 0.25 : 0.5;
        continue;
      }

      if (HUNDRED_WORDS.has(w)) {
        current = (current || 1) * 100;
        last = 'hundred';
        hasScale = true;
        consumed = true;
        lastIndex = j;
        continue;
      }

      if (w in SCALE_WORDS) {
        if (WEAK_SCALES.has(w) && current === 0) break;
        total += (current || 1) * SCALE_WORDS[w];
        current = 0;
        last = 'scale';
        hasScale = true;
        consumed = true;
        lastIndex = j;
        continue;
      }

      if ((w === 'and' || w === 'aur') && consumed && isValueToken(next)) continue;
      if ((w === 'a' || w === 'an') && !consumed && isScaleWord(next?.lower)) continue;
      break;
    }

    if (!consumed) return null;
    return { value: total + current, first: start, last: lastIndex, hasDigits, hasScale, score: 0 };
  }

  // ─── Payment mode ──────────────────────────────────────────────────────

  /**
   * Detect an explicitly mentioned payment mode. Returns undefined when the user did not say.
   */
  public static detectPaymentMode(text: string): PaymentModeMatch | undefined {
    const lower = this.normalize(text).toLowerCase();
    const hits: Array<{ mode: PaymentMode; index: number; word: string }> = [];
    const wordBefore = (index: number) => lower.slice(0, index).trim().split(/\s+/).pop() ?? '';
    for (const m of lower.matchAll(BANK_MODE_RE)) hits.push({ mode: 'BANK', index: m.index ?? 0, word: m[1] });
    for (const m of lower.matchAll(CASH_MODE_RE)) hits.push({ mode: 'CASH', index: m.index ?? 0, word: m[1] });

    // "not cash, bank" — a negated mode is the one being ruled out
    const affirmed = hits.filter((h) => !['not', 'nahi', 'no'].includes(wordBefore(h.index)));
    if (affirmed.length === 0) return undefined;

    // "transfer"/"account" are weak cues: ignore them when an explicit cash/bank word is present
    const strong = affirmed.filter((h) => !['transfer', 'transferred', 'account'].includes(h.word));
    const pool = (strong.length > 0 ? strong : affirmed).sort((a, b) => a.index - b.index);
    const modes = new Set(pool.map((h) => h.mode));

    let chosen = pool[0];
    if (modes.size > 1) {
      // "change cash to bank" names the new mode after "to"; otherwise prefer the cue introduced
      // by a preposition ("paid via UPI", "in cash")
      chosen =
        pool.find((h) => wordBefore(h.index) === 'to' && /\b(?:change|switch|make|not)\b/.test(lower)) ??
        pool.find((h) => lower.slice(0, h.index).trim().split(/\s+/).slice(-2).some((w) => MODE_PREPOSITIONS.has(w))) ??
        pool[0];
    }

    return chosen.mode === 'BANK' ? { mode: 'BANK', bankHint: this.bankHint(lower) } : { mode: 'CASH' };
  }

  /**
   * Determine payment mode (Cash vs Bank/UPI/GPay/PhonePe/Transfer). Defaults to CASH when not stated.
   */
  public static parsePaymentMode(text: string): PaymentMode {
    return this.detectPaymentMode(text)?.mode ?? 'CASH';
  }

  private static bankHint(lower: string): string | undefined {
    const m = lower.match(BANK_HINT_RE);
    if (!m) return undefined;
    const hint = m[1].replace(/\s+account$/, '').replace(/\s+/g, ' ');
    // Acronyms like "hdfc" / "sbi" read better upper-cased
    return /^(?:hdfc|icici|sbi|pnb|rbl|bob|idfc|idbi|hsbc)$/.test(hint) ? hint.toUpperCase() : hint;
  }

  // ─── Dates ─────────────────────────────────────────────────────────────

  /**
   * Detect when the transaction happened ("yesterday", "on 20th", "3 days ago", "last Monday").
   * Returns a local YYYY-MM-DD string, or undefined for today / unspecified / future dates.
   */
  public static detectDate(text: string, now: Date = new Date()): string | undefined {
    const lower = this.normalize(text).toLowerCase();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const shift = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
    let date: Date | undefined;

    const daysAgo = lower.match(/\b(\d+|one|two|three|four|five|six|seven|ten)\s+(?:days?\s+ago|din\s+pehle)\b/);
    if (/\b(?:day\s+before\s+yesterday|parso)\b/.test(lower)) date = shift(2);
    else if (/\b(?:yesterday|kal)\b/.test(lower)) date = shift(1);
    else if (daysAgo) {
      const n = /^\d+$/.test(daysAgo[1]) ? parseInt(daysAgo[1], 10) : UNIT_WORDS[daysAgo[1]];
      if (n > 0 && n < 400) date = shift(n);
    } else {
      const weekday = lower.match(/\b(?:last|on|this\s+past)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
      const monthFirst = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/);
      const dayFirst = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:,?\s+(\d{4}))?/);
      const numeric = lower.match(/\b(\d{1,4})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
      const dayOnly = lower.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);

      if (weekday) {
        const target = WEEKDAYS.indexOf(weekday[1]);
        let diff = (today.getDay() - target + 7) % 7;
        if (diff === 0 && !weekday[0].startsWith('on')) diff = 7;
        date = shift(diff);
      } else if (monthFirst || dayFirst) {
        const monthWord = monthFirst ? monthFirst[1] : dayFirst![2];
        const day = parseInt(monthFirst ? monthFirst[2] : dayFirst![1], 10);
        const yearRaw = monthFirst ? monthFirst[3] : dayFirst![3];
        const month = MONTHS[monthWord] ?? MONTHS[monthWord.slice(0, 3)];
        let year = yearRaw ? parseInt(yearRaw, 10) : today.getFullYear();
        let candidate = new Date(year, month, day);
        if (!yearRaw && candidate > today) candidate = new Date(--year, month, day);
        if (candidate.getMonth() === month) date = candidate;
      } else if (numeric && !/\d{10,}/.test(lower)) {
        const [a, b, c] = [numeric[1], numeric[2], numeric[3]];
        let year: number;
        let month: number;
        let day: number;
        if (a.length === 4) {
          [year, month, day] = [parseInt(a, 10), parseInt(b, 10) - 1, parseInt(c ?? '1', 10)];
        } else {
          day = parseInt(a, 10);
          month = parseInt(b, 10) - 1;
          year = c ? parseInt(c.length === 2 ? `20${c}` : c, 10) : today.getFullYear();
        }
        const candidate = new Date(year, month, day);
        if (month >= 0 && month < 12 && candidate.getDate() === day) {
          date = !c && candidate > today ? new Date(year - 1, month, day) : candidate;
        }
      } else if (dayOnly) {
        const day = parseInt(dayOnly[1], 10);
        let candidate = new Date(today.getFullYear(), today.getMonth(), day);
        if (candidate > today) candidate = new Date(today.getFullYear(), today.getMonth() - 1, day);
        if (candidate.getDate() === day) date = candidate;
      }
    }

    if (!date || date.getTime() >= today.getTime() || date > now) return undefined;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // ─── Categories ────────────────────────────────────────────────────────

  /**
   * Detect an expense or income category from item/purpose words ("lunch" → Food & Dining)
   */
  public static detectCategory(text: string, flow?: TransactionFlow): CategoryMatch | undefined {
    const lower = this.normalize(text).toLowerCase();

    // The purpose phrase ("for office rent", "on petrol") is the strongest signal; within it the
    // last noun is the head ("office rent" is rent, not office supplies)
    const purpose = lower.match(/\b(?:for|on|towards)\s+(?!\d)((?:(?!\b(?:from|via|using|through|in|at|with|to|by|and)\b)[a-z&'-]+\s*)+)/);
    const purposeStart = purpose ? (purpose.index ?? 0) + purpose[0].length - purpose[1].length : -1;
    const purposeEnd = purpose ? purposeStart + purpose[1].length : -1;

    const pick = (rules: CategoryRule[], type: 'EXPENSE' | 'INCOME', only?: Set<string>): CategoryMatch | undefined => {
      let best: { rule: CategoryRule; score: number } | undefined;
      rules.forEach((rule, idx) => {
        if (only && !only.has(rule.name)) return;
        const m = rule.pattern.exec(lower);
        if (!m) return;
        const at = m.index;
        const inPurpose = at >= purposeStart && at < purposeEnd;
        const score = inPurpose ? 10 + (at - purposeStart) / 100 : -idx * 0.1;
        if (!best || score > best.score) best = { rule, score };
      });
      return best ? { name: best.rule.name, type, keywords: best.rule.keywords } : undefined;
    };

    if (flow === 'IN') return pick(INCOME_RULES, 'INCOME');
    if (flow === 'OUT' || flow === 'CREDIT_PURCHASE') return pick(EXPENSE_RULES, 'EXPENSE');
    if (flow === 'CREDIT_SALE' || flow === 'WITHDRAWAL' || flow === 'DEPOSIT') return undefined;
    return pick(INCOME_RULES, 'INCOME', UNAMBIGUOUS_INCOME) ?? pick(EXPENSE_RULES, 'EXPENSE');
  }

  /**
   * Map free-text category words (e.g. from an LLM: "Lunch", "Meals") onto a canonical category
   */
  public static canonicalCategory(name: string, type: 'EXPENSE' | 'INCOME'): CategoryMatch | undefined {
    return this.detectCategory(name, type === 'INCOME' ? 'IN' : 'OUT');
  }

  /**
   * Category names that carry no information ("General", "Misc", "Expense")
   */
  public static isGenericCategory(name: string | undefined): boolean {
    if (!name) return true;
    const words = name.toLowerCase().replace(/[^a-z\s/]/g, ' ').split(/\s+/).filter(Boolean);
    return words.length === 0 || words.every((w) => GENERIC_CATEGORY_WORDS.has(w));
  }

  /**
   * Keywords for matching an existing ledger account to a category name
   */
  public static categoryKeywords(name: string, type: 'EXPENSE' | 'INCOME'): string[] {
    const rules = type === 'INCOME' ? INCOME_RULES : EXPENSE_RULES;
    const rule = rules.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (rule) return rule.keywords;
    return name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !GENERIC_CATEGORY_WORDS.has(w) && w !== 'and');
  }

  // ─── People ────────────────────────────────────────────────────────────

  /**
   * Extract person / counterparty name from conversational utterance.
   * The flow decides which role to look for ("from X" for money in, "to X" for money out).
   */
  public static extractPersonName(text: string, flow?: TransactionFlow): string | null {
    const norm = this.normalize(text);
    const nameRe = String.raw`([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3})`;

    const finders: Record<string, () => string | null> = {
      from: () => this.firstValidName(norm, new RegExp(String.raw`\bfrom\s+${nameRe}`, 'gi'), 'leading'),
      to: () => this.firstValidName(norm, new RegExp(String.raw`\bto\s+${nameRe}`, 'gi'), 'leading'),
      by: () => this.firstValidName(norm, new RegExp(String.raw`\b(?:paid|sent|given|transferred)\s+by\s+${nameRe}`, 'gi'), 'leading'),
      object: () =>
        this.firstValidName(
          norm,
          new RegExp(String.raw`\b(?:paid|pay|gave|give|lent|lend|sent|send|loaned|repaid|reimbursed|tipped|owe|transferred|billed|invoiced)\s+${nameRe}`, 'gi'),
          'leading'
        ),
      ko: () => this.firstValidName(norm, new RegExp(String.raw`${nameRe}\s+(?:ji\s+)?ko\b`, 'gi'), 'trailing'),
      se: () => this.firstValidName(norm, new RegExp(String.raw`${nameRe}\s+(?:ji\s+)?se\b`, 'gi'), 'trailing'),
      ne: () => this.firstValidName(norm, new RegExp(String.raw`${nameRe}\s+(?:ji\s+)?ne\b`, 'gi'), 'trailing'),
      subject: () => {
        const m = norm.match(SUBJECT_RE);
        return m ? this.cleanName(m[1], 'leading') : null;
      },
      role: () =>
        this.firstValidName(
          norm,
          new RegExp(String.raw`\b(?:customer|client|vendor|supplier|party|friend|landlord|tenant|employee|contractor|person)\s+${nameRe}`, 'gi'),
          'leading'
        ),
      query: () => {
        const patterns: Array<[RegExp, 'leading' | 'trailing']> = [
          [new RegExp(String.raw`\bhow\s+much\s+(?:money\s+)?(?:does|did|do)\s+${nameRe}\s+owes?\b`, 'i'), 'leading'],
          [new RegExp(String.raw`\bdoes\s+${nameRe}\s+owe\b`, 'i'), 'leading'],
          [new RegExp(String.raw`\bowe\s+${nameRe}`, 'i'), 'leading'],
          [new RegExp(String.raw`\b${nameRe}(?:'s|s')\s+(?:balance|dues|account|outstanding)`, 'i'), 'trailing'],
          [new RegExp(String.raw`\b(?:balance|dues|outstanding|hisaab|hisab)\s+(?:of|for|with)\s+${nameRe}`, 'i'), 'leading'],
          [new RegExp(String.raw`\b(?:is|has)\s+${nameRe}\s+(?:owe|have|balance)`, 'i'), 'leading'],
          [new RegExp(String.raw`${nameRe}\s+(?:ka|ke|ki)\s+(?:kitna\s+)?(?:hisaab|hisab|balance|baki|baaki|udhaar)`, 'i'), 'trailing'],
        ];
        for (const [pattern, mode] of patterns) {
          const m = norm.match(pattern);
          const name = m ? this.cleanName(m[1], mode) : null;
          if (name) return name;
        }
        return null;
      },
    };

    const order: Record<string, string[]> = {
      IN: ['subject', 'from', 'by', 'se', 'ne', 'role'],
      OUT: ['to', 'object', 'ko', 'role'],
      CREDIT_SALE: ['subject', 'object', 'to', 'ko', 'ne', 'role'],
      CREDIT_PURCHASE: ['from', 'se', 'role'],
      WITHDRAWAL: [],
      DEPOSIT: [],
      ANY: ['query', 'from', 'to', 'ko', 'se', 'ne', 'subject', 'object', 'role'],
    };

    for (const key of order[flow ?? 'ANY']) {
      const name = finders[key]();
      if (name) return name;
    }
    return null;
  }

  private static firstValidName(text: string, re: RegExp, mode: 'leading' | 'trailing'): string | null {
    for (const m of text.matchAll(re)) {
      const name = this.cleanName(m[1], mode);
      if (name) return name;
    }
    return null;
  }

  /**
   * Validate a contact name from another source (e.g. the LLM): drops honorifics and
   * rejects generic words such as "customer", "landlord" or "electricity board"
   */
  public static sanitizePersonName(name: string | undefined): string | null {
    return this.cleanName(name ? this.normalize(name) : undefined, 'leading');
  }

  /**
   * Turn a captured phrase into a clean contact name, or null if it is not a name
   * (leading: name follows a preposition; trailing: name precedes "ko"/"se"/"ne")
   */
  private static cleanName(phrase: string | undefined, mode: 'leading' | 'trailing'): string | null {
    if (!phrase) return null;
    const words = phrase.trim().split(/\s+/).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, '')).filter(Boolean);
    if (words.length === 0) return null;
    const isStop = (w: string) => {
      const lw = w.toLowerCase().replace(/'s$/, '');
      return NON_NAME_WORDS.has(lw) || /^\d/.test(lw) || ENGLISH_NUMBER_WORDS.has(lw) || lw in SCALE_WORDS || this.isCategoryWord(lw);
    };

    let picked: string[] = [];
    if (mode === 'leading') {
      let i = 0;
      while (i < words.length && NAME_PREFIXES.has(words[i].toLowerCase().replace(/\.$/, ''))) i++;
      for (; i < words.length; i++) {
        const w = words[i];
        if (NAME_SUFFIXES.has(w.toLowerCase())) break;
        if (isStop(w)) break;
        picked.push(w);
      }
    } else {
      let i = words.length - 1;
      while (i >= 0 && NAME_SUFFIXES.has(words[i].toLowerCase())) i--;
      for (; i >= 0; i--) {
        const w = words[i];
        if (isStop(w) || NAME_PREFIXES.has(w.toLowerCase())) break;
        picked.unshift(w);
      }
    }

    picked = picked.slice(0, 4).map((w) => w.replace(/'s$/i, ''));
    if (picked.length === 0) return null;
    const name = picked.map(titleCaseWord).join(' ');
    if (name.length < 2 || name.length > 40) return null;
    return name;
  }

  private static isCategoryWord(word: string): boolean {
    return [...EXPENSE_RULES, ...INCOME_RULES].some((r) => r.pattern.test(word));
  }

  // ─── Questions, confirmations & corrections ────────────────────────────

  /**
   * True when the utterance is a question rather than a command (polite requests like
   * "can you record 500 for lunch" are commands)
   */
  public static isQuestion(text: string): boolean {
    const lower = this.normalize(text).toLowerCase().trim();
    if (/^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:record|add|enter|note|log|make|post|put|book|create|save)\b/.test(lower)) return false;
    if (/^(?:please\s+)?(?:record|add|enter|note|log|post|book|save)\b/.test(lower)) return false;
    if (lower.endsWith('?')) return true;
    if (/^do\s+(?:hazaar|hazar|sau|lakh|crore|thousand|hundred)\b/.test(lower)) return false;
    return /^(?:what|what's|whats|how|how's|show|tell|list|give\s+me|display|check|view|which|when|where|who|whom|whose|why|did|do|does|is|are|am|was|were|has|kitna|kitne|kitni|kya|kab|kisne|kaun|batao|dikhao)\b/.test(lower);
  }

  /**
   * Detect a pure yes / no reply ("yeah go ahead", "okay post it", "haan kar do", "no, cancel it").
   * Returns null when the reply contains other information ("no, it was 600").
   */
  public static parseConfirmation(text: string): 'CONFIRM' | 'CANCEL' | null {
    // A reply with a number in it ("no, 600") carries details, it is not a bare yes / no
    if (/\d/.test(text)) return null;
    const clean = this.normalize(text)
      .toLowerCase()
      .replace(/don't|do not/g, 'dont')
      .replace(/never\s+mind/g, 'nevermind')
      .replace(/that's|that is/g, 'thats')
      .replace(/it's|it is/g, 'its')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return null;
    const words = clean.split(' ');
    if (words.length > 8) return null;

    const hasCancelCore = words.some((w) => CANCEL_CORE.has(w));
    const hasNegator = words.some((w) => NEGATORS.has(w));
    const allCancelVocab = words.every((w) => CANCEL_CORE.has(w) || NEGATORS.has(w) || CANCEL_FILLER.has(w));
    if ((hasCancelCore || hasNegator) && allCancelVocab) return 'CANCEL';

    const hasAffirm = words.some((w) => AFFIRM_CORE.has(w));
    const allAffirmVocab = words.every((w) => AFFIRM_CORE.has(w) || AFFIRM_FILLER.has(w));
    if (hasAffirm && allAffirmVocab && !hasNegator && !hasCancelCore) return 'CONFIRM';
    return null;
  }

  /**
   * "That's wrong" / "change the amount" without giving the new value.
   * Returns which part to change ('any' when unspecified), or null if this isn't a correction request.
   */
  public static correctionTarget(text: string): 'amount' | 'counterparty' | 'paymentMode' | 'date' | 'any' | null {
    const norm = this.normalize(text);
    const lower = norm.toLowerCase();
    if (!/\b(?:wrong|incorrect|not\s+(?:right|correct)|galat|galti|change|edit|modify|fix|mistake|update)\b/.test(lower)) return null;
    // "change it to bank" / "make it 600" already carry the new value — those are corrections, not requests
    if (this.parseAmount(norm) !== null || this.extractPersonName(norm) || this.detectCategory(norm) || this.detectPaymentMode(norm)) {
      return null;
    }
    if (/\b(?:amount|price|value|rupees|kitna|paise)\b/.test(lower)) return 'amount';
    if (/\b(?:person|name|contact|party|category|purpose|head)\b/.test(lower)) return 'counterparty';
    if (/\b(?:mode|payment\s+method|method)\b/.test(lower)) return 'paymentMode';
    if (/\b(?:date|day|when)\b/.test(lower)) return 'date';
    return 'any';
  }

  /**
   * "That's wrong" / "change it" without saying what to change
   */
  public static isCorrectionRequest(text: string): boolean {
    return this.correctionTarget(text) !== null;
  }

  // ─── Follow-up answers ─────────────────────────────────────────────────

  /**
   * Parse a reply to a follow-up question. `contextFlow` is the flow of the entry being built,
   * so "rent" means Rent for a payment but Rental Income for a receipt.
   */
  public static parseFollowUp(text: string, awaiting: string, contextFlow?: TransactionFlow): FollowUpAnswer {
    const norm = this.normalize(text);
    const lower = norm.toLowerCase();
    const details: TransactionDetails = {};
    const isChoice = awaiting === 'personChoice' || awaiting === 'bankChoice' || awaiting === 'cashChoice';

    if (!isChoice) {
      const amount = this.parseAmount(norm, { allowSmallWords: awaiting === 'amount' });
      if (amount !== null) details.amount = amount;
    }

    const mode = this.detectPaymentMode(norm);
    if (mode) {
      details.paymentMode = mode.mode;
      if (mode.bankHint) details.bankHint = mode.bankHint;
    }

    const date = this.detectDate(norm);
    if (date) details.date = date;

    // Only change the direction of the entry when asked, or when the user says it outright
    // ("actually I paid cash"); a weak verb in "bank transfer" must not flip a receipt into a payment
    const explicitFlow =
      awaiting === 'flow' ||
      /\b(?:i|we|maine|humne)\s+(?:paid|gave|received|got|took|sent|bought|sold|lent|borrowed|withdrew|deposited|spent)\b/.test(lower) ||
      SUBJECT_RE.test(norm);
    const flow = explicitFlow ? this.detectFlow(norm, lower).flow ?? this.flowFromNoun(lower) : undefined;
    if (flow) details.flow = flow;

    const effectiveFlow = details.flow ?? contextFlow;
    if (!isChoice) {
      const person = this.extractPersonName(norm, effectiveFlow) ?? (effectiveFlow ? this.extractPersonName(norm) : null);
      if (person) details.personName = person;
      const category = this.detectCategory(norm, effectiveFlow);
      if (category) details.categoryName = category.name;
    }

    const bare = this.bareAnswer(norm);
    return { details, bareAnswer: bare?.text, bareHint: bare?.hint };
  }

  private static flowFromNoun(lower: string): TransactionFlow | undefined {
    if (/\b(?:credit\s+sale|sold\s+on\s+credit|bought\s+(?:it\s+)?on\s+credit\s+from\s+me)\b/.test(lower)) return 'CREDIT_SALE';
    if (/\b(?:credit\s+purchase|i\s+bought\s+(?:it\s+)?on\s+credit)\b/.test(lower)) return 'CREDIT_PURCHASE';
    if (/\b(?:payment|expense|outgoing|paid\s+out|i\s+paid)\b/.test(lower)) return 'OUT';
    if (/\b(?:receipt|income|incoming|i\s+received|received)\b/.test(lower)) return 'IN';
    if (/\b(?:withdrawal)\b/.test(lower)) return 'WITHDRAWAL';
    if (/\b(?:deposit)\b/.test(lower)) return 'DEPOSIT';
    return undefined;
  }

  /**
   * Strip filler around a short answer: "it was Rahul" → "Rahul", "for office repairs" → "office repairs"
   */
  private static bareAnswer(norm: string): { text: string; hint?: 'person' | 'category' } | undefined {
    let s = norm.replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    let hint: 'person' | 'category' | undefined;
    const prefixRe = /^(?:it\s+was|it\s+is|its|it's|that\s+was|thats|that's|this\s+is|i\s+think|i\s+paid|i\s+gave|paid|gave|received|got|the|my|a|an|mr\.?|mrs\.?|ms\.?|dr\.?|shri|to|from|for|on|towards|with|by|um|uh|okay|ok|so|well|actually)\s+/i;
    for (let guard = 0; guard < 6; guard++) {
      const m = s.match(prefixRe);
      if (!m) break;
      const word = m[0].trim().toLowerCase();
      if (['to', 'from', 'by', 'with'].includes(word) && !hint) hint = 'person';
      if (['for', 'on', 'towards'].includes(word) && !hint) hint = 'category';
      s = s.slice(m[0].length);
    }
    s = s.replace(/\s+(?:ji|sir|please|only|bhai|hai)$/i, '').trim();
    if (!s || /\d/.test(s)) return undefined;
    const words = s.split(/\s+/);
    if (words.length > 5) return undefined;
    if (words.every((w) => NON_NAME_WORDS.has(w.toLowerCase()))) return undefined;
    return { text: s, hint };
  }

  // ─── Main entry point ──────────────────────────────────────────────────

  /**
   * Parse natural language voice text into a structured intent
   */
  public static parse(transcript: string): VoiceParsedResult {
    const text = (transcript || '').trim();
    if (!text) {
      return {
        type: 'UNKNOWN',
        rawText: text,
        reason: 'Empty voice transcript provided',
      };
    }

    const norm = this.normalize(text);
    const lower = norm.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // 0. CONFIRMATION INTENTS ("yes", "confirm", "proceed", "cancel", "no")
    // ─────────────────────────────────────────────────────────────────────────
    const decision = this.parseConfirmation(text);
    if (decision) {
      return { type: 'CONFIRMATION', decision, rawText: text };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. QUERY INTENTS (Questions, Balances & Reports)
    // ─────────────────────────────────────────────────────────────────────────
    const query = this.parseQueryIntent(lower, norm, text);
    if (query) return query;

    if (this.isQuestion(norm)) {
      return {
        type: 'UNKNOWN',
        rawText: text,
        reason: 'Question is outside the supported balance and report queries',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TRANSACTION INTENTS (Double-Entry Commands)
    // ─────────────────────────────────────────────────────────────────────────
    const transaction = this.parseTransactionIntent(norm, lower, text);
    if (transaction) return transaction;

    return {
      type: 'UNKNOWN',
      rawText: text,
      reason: 'Could not confidently determine financial intent or amount',
    };
  }

  /**
   * Extract only the explicitly stated transaction facts from an utterance
   */
  public static extractDetails(text: string): TransactionDetails | null {
    const parsed = this.parse(text);
    if (parsed.type === 'TRANSACTION') return parsed.details ?? null;
    if (parsed.type === 'DETAILS') return parsed.details;
    return null;
  }

  // ─── Query parsing ─────────────────────────────────────────────────────

  /**
   * Helper: Parse read-only queries
   */
  private static parseQueryIntent(lower: string, norm: string, text: string): VoiceQueryIntent | null {
    const queryLike =
      this.isQuestion(norm) || /\b(?:show|tell|check|view|batao|dikhao|what|how\s+much|kitna|kitni|report|summary)\b/.test(lower);
    const txVerb = /\b(?:paid|spent|received|gave|got|took|withdrew|deposited|lent|sent|bought|transferred)\b/.test(lower);

    // Recent Transactions
    if (
      /\b(?:recent|last|latest|previous|pichl[ae])\s+(?:\d+\s+|few\s+|five\s+|ten\s+)?(?:transactions?|entries|entry|vouchers?|records?)\b/.test(lower) ||
      /\b(?:transaction|entry|voucher)\s+history\b|\bshow\s+(?:my\s+)?history\b|\bwhat\s+did\s+i\s+(?:record|enter|add)\b/.test(lower)
    ) {
      return { type: 'QUERY', target: 'RECENT_TRANSACTIONS', rawText: text };
    }

    // Person Balance Query
    if (
      /\bhow\s+much\s+(?:money\s+)?(?:does|did|do)\s+[a-z0-9_.' -]+?\s+owes?\b/.test(lower) ||
      /\bhow\s+much\s+do\s+i\s+owe\s+[a-z]/.test(lower) ||
      /\bdoes\s+[a-z]+(?:\s+[a-z]+)?\s+owe\b/.test(lower) ||
      /\b(?:what\s+is|what's|whats|show|check|tell\s+me)\s+[a-z]+(?:\s+[a-z]+)?(?:'s|s')\s+(?:balance|dues|account|outstanding)\b/.test(lower) ||
      /\bcheck\s+balance\s+of\s+[a-z]/.test(lower) ||
      /\b(?:balance|dues|outstanding)\s+(?:of|for|with)\s+[a-z]/.test(lower) ||
      /\b[a-z]+\s+(?:ka|ke|ki)\s+(?:kitna\s+)?(?:hisaab|hisab|balance|baki|baaki)\b/.test(lower)
    ) {
      const personName = this.extractPersonName(norm);
      if (personName && !/^(?:bank|cash|my)$/i.test(personName)) {
        return { type: 'QUERY', target: 'PERSON_BALANCE', personName, rawText: text };
      }
    }

    // Specific Expense Category Query
    const categoryQuery =
      lower.match(/\bhow\s+much\s+(?:money\s+)?(?:did\s+i|have\s+i|did\s+we|i|we|was)\s+(?:spend|spent|spending)\s+(?:on|for)\s+([a-z &]+?)(?:\s+(?:this|last|in)\s+(?:month|week|year)|\s+so\s+far|\?|$)/) ||
      lower.match(/\bwhat\s+did\s+i\s+spend\s+on\s+([a-z &]+?)(?:\s+(?:this|last|in)\s+(?:month|week|year)|\?|$)/) ||
      lower.match(/\bwhat\s+(?:are|were|is)\s+my\s+([a-z &]+?)\s+expenses?\b/) ||
      lower.match(/\b([a-z &]+?)\s+(?:pe|par|me|mein)\s+kitna\s+(?:kharcha|kharch|spend)/);
    if (categoryQuery) {
      const raw = categoryQuery[1].replace(/^(?:the|my)\s+/, '').trim();
      if (!this.isGenericCategory(raw)) {
        const canonical = this.detectCategory(raw, 'OUT');
        return {
          type: 'QUERY',
          target: 'EXPENSE_CATEGORY',
          categoryName: canonical?.name ?? raw.replace(/\b\w/g, (c) => c.toUpperCase()),
          rawText: text,
        };
      }
    }

    // Total Expenses
    if (
      /\btotal\s+expenses?\b|\bhow\s+much\s+(?:money\s+)?(?:did\s+i|have\s+i|did\s+we|i)\s+(?:spend|spent)\b|\bmonthly\s+expenses?\b|\bkitna\s+kharcha\b|\bexpenses?\s+(?:this|last)\s+month\b|\bshow\s+(?:my\s+)?(?:total\s+)?expenses?\b|\bmy\s+spending\b/.test(lower)
    ) {
      return { type: 'QUERY', target: 'TOTAL_EXPENSES', rawText: text };
    }

    // Total Income / Profit
    if (
      /\btotal\s+(?:income|revenue|earnings)\b|\bhow\s+much\s+(?:money\s+)?(?:did\s+i|have\s+i|i)\s+(?:earn|earned|make|made)\b|\bmonthly\s+income\b|\bkamai\b|\bkitna\s+kamaya\b|\bincome\s+(?:this|last)\s+month\b/.test(lower) ||
      (queryLike && /\b(?:net\s+)?profit\b|\bp\s*(?:&|and|n)\s*l\b|\bprofit\s+and\s+loss\b/.test(lower))
    ) {
      return { type: 'QUERY', target: 'TOTAL_INCOME', rawText: text };
    }

    // Net Worth & Assets & Liabilities
    if (/\bnet\s*worth\b|\bwealth\b|\btotal\s+worth\b/.test(lower)) {
      return { type: 'QUERY', target: 'NET_WORTH', rawText: text };
    }

    if (/\btotal\s+assets\b/.test(lower) || (queryLike && /\b(?:my\s+)?assets\b/.test(lower))) {
      return { type: 'QUERY', target: 'TOTAL_ASSETS', rawText: text };
    }

    if (
      /\btotal\s+liabilit(?:y|ies)\b/.test(lower) ||
      (queryLike && !txVerb && /\b(?:liabilit(?:y|ies)|loans|debts)\b/.test(lower)) ||
      /\bhow\s+much\s+do\s+i\s+owe\s*(?:in\s+total|overall|altogether)?\s*\??$/.test(lower)
    ) {
      return { type: 'QUERY', target: 'TOTAL_LIABILITIES', rawText: text };
    }

    // Bank Balance
    const accountHint = this.bankHint(lower);
    if (
      /(?:what\s+is|show|tell|check|how\s+much|what|get|view).*?(?:bank\s+balance|bank\s+account|balance.*?bank|money.*?(?:in|have).*?bank|in\s+(?:the\s+|my\s+)?bank)/i.test(lower) ||
      /(?:how\s+much\s+(?:money\s+)?(?:do\s+i\s+have|is\s+(?:there|left)|have\s+i\s+got)\s+in\s+(?:my\s+|the\s+)?bank(?:\s+account)?)/i.test(lower) ||
      /(?:bank\s+(?:me\s+)?kitna\s+paisa\s+hai|bank\s+(?:ka\s+)?balance\s+batao|bank\s+me\s+kitna\s+hai)/i.test(lower) ||
      /^(?:bank\s+balance|check\s+bank|bank\s+account|my\s+bank\s+balance)$/i.test(lower.replace(/[?.!]+$/, '')) ||
      (queryLike && new RegExp(`\\b(?:${BANK_NAMES}|savings)\\b.*\\bbalance\\b|\\bbalance\\b.*\\b(?:${BANK_NAMES})\\b`).test(lower))
    ) {
      if (!txVerb || /\b(?:balance|do\s+i\s+have|left)\b/.test(lower)) {
        return { type: 'QUERY', target: 'BANK_BALANCE', accountHint, rawText: text };
      }
    }

    // Cash Balance
    if (
      /(?:what\s+is|show|tell|check|how\s+much|what|get|view).*?(?:cash\s+balance|cash\s+in\s+hand|money.*?cash|cash|wallet\s+balance|money.*?wallet)/i.test(lower) ||
      /(?:cash\s+(?:me\s+)?kitna\s+(?:hai|paisa\s+hai)|rokar\s+kitna\s+hai|haath\s+me\s+kitna\s+cash\s+hai)/i.test(lower) ||
      /^(?:cash\s+balance|check\s+cash|my\s+cash\s+balance|cash\s+in\s+hand|cash)$/i.test(lower.replace(/[?.!]+$/, ''))
    ) {
      if (!txVerb || /\b(?:balance|do\s+i\s+have|left|in\s+hand)\b/.test(lower)) {
        return { type: 'QUERY', target: 'CASH_BALANCE', rawText: text };
      }
    }

    // Cash + Bank together ("how much money do I have", "what's my balance")
    if (
      /\bhow\s+much\s+(?:money|paisa)\s+(?:do\s+i\s+have|have\s+i\s+got|is\s+(?:there|left)|do\s+we\s+have)\b/.test(lower) ||
      /^(?:what\s+is|what's|whats|show|check|tell\s+me)\s+(?:my\s+)?(?:total\s+)?balance\s*\??$/.test(lower) ||
      /\bkitna\s+paisa\s+hai\b/.test(lower)
    ) {
      return { type: 'QUERY', target: 'CASH_AND_BANK', rawText: text };
    }

    return null;
  }

  // ─── Transaction parsing ───────────────────────────────────────────────

  /**
   * Work out the direction of money from verbs, the sentence subject and Hinglish markers
   */
  private static detectFlow(norm: string, lower: string): { flow?: TransactionFlow; subjectName?: string; strong: boolean } {
    const said = (flow: TransactionFlow, subjectName?: string) => ({ flow, subjectName, strong: true });

    // Who is acting? "Sharma paid 5000" means money came in from Sharma.
    const subjectMatch = norm.match(SUBJECT_RE);
    let subject: { kind: 'self' | 'third'; name?: string; verb: string } | undefined;
    if (subjectMatch) {
      const rawSubject = subjectMatch[1].trim().toLowerCase();
      const verb = subjectMatch[2].toLowerCase();
      const withoutPrefix = rawSubject.replace(/^(?:my|the|our|a|mr\.?|mrs\.?|ms\.?|dr\.?|shri)\s+/, '');
      if (SELF_WORDS.has(rawSubject)) subject = { kind: 'self', verb };
      else if (ANONYMOUS_THIRD_PARTIES.has(withoutPrefix)) subject = { kind: 'third', verb };
      else {
        // The whole subject must be a name ("Rohan Sharma paid"), not "electricity bill paid"
        const name = this.cleanName(subjectMatch[1], 'leading');
        if (name && name.toLowerCase() === withoutPrefix) subject = { kind: 'third', name, verb };
      }
    }

    if (subject?.kind === 'third') {
      const v = subject.verb;
      const name = subject.name;
      if (['bought', 'purchased', 'ordered'].includes(v)) {
        const paidNow = !!this.detectPaymentMode(norm) && !ON_CREDIT_RE.test(lower);
        return said(paidNow ? 'IN' : 'CREDIT_SALE', name);
      }
      if (v === 'took') {
        if (GOODS_RE.test(lower) || ON_CREDIT_RE.test(lower)) return said('CREDIT_SALE', name);
        if (/\bfrom\s+me\b|\bmujhse\b/.test(lower)) return said('OUT', name);
        return { subjectName: name, strong: false };
      }
      // Someone else got / received the money: it went out from the user ("my landlord got his rent")
      if (['got', 'received', 'collected'].includes(v)) return said('OUT', name);
      if (v === 'owes' || v === 'owed') return { subjectName: name, strong: false };
      if (v === 'borrowed') return said('OUT', name);
      if (v === 'ne') {
        if (/\b(?:kharida|kharide|liya|liye)\b/.test(lower) && (GOODS_RE.test(lower) || ON_CREDIT_RE.test(lower))) {
          return said('CREDIT_SALE', name);
        }
        if (/\b(?:diya|diye|di|bheja|bheje|lautaya|lautaye|jama|paid|transfer)\b/.test(lower)) return said('IN', name);
        return { subjectName: name, strong: false };
      }
      return said('IN', name);
    }

    // Contra: own money between bank and cash
    if (BANK_TO_CASH_RE.test(lower)) return said('WITHDRAWAL');
    if (CASH_TO_BANK_RE.test(lower)) return said('DEPOSIT');
    if (WITHDRAW_RE.test(lower)) return said('WITHDRAWAL');
    // "took 5000 from the bank" is a withdrawal; "received salary from HDFC" is still income
    if (IN_VERB_RE.test(lower) && FROM_BANK_RE.test(lower) && !this.detectCategory(norm, 'IN')) return said('WITHDRAWAL');
    if (DEPOSIT_RE.test(lower)) {
      if (/\b(?:security\s+deposit|deposit\s+(?:to|for)\b|paid\b.*\bdeposit)\b/.test(lower)) return said('OUT');
      if (/\bfrom\s+[a-z]+/.test(lower) && !/\bfrom\s+(?:the\s+|my\s+)?(?:cash|hand|wallet)\b/.test(lower)) {
        const source = this.extractPersonName(norm, 'IN');
        if (source) return said('IN');
      }
      return said('DEPOSIT');
    }
    if (PUT_IN_BANK_RE.test(lower)) return said('DEPOSIT');

    // Credit transactions
    if (SALE_RE.test(lower)) {
      const paidNow = !!this.detectPaymentMode(norm) && !ON_CREDIT_RE.test(lower);
      return said(paidNow ? 'IN' : 'CREDIT_SALE');
    }
    if (BUY_RE.test(lower)) {
      if (ON_CREDIT_RE.test(lower)) return said('CREDIT_PURCHASE');
      const vendor = this.extractPersonName(norm, 'CREDIT_PURCHASE');
      if (vendor && !this.detectPaymentMode(norm)) return said('CREDIT_PURCHASE');
      return said('OUT');
    }

    // Plain money out / in — the earliest verb wins
    if (PAID_ME_RE.test(lower)) return said('IN');
    const outMatch = lower.match(OUT_VERB_RE);
    const inMatch = lower.match(IN_VERB_RE);
    let flow: TransactionFlow | undefined;
    let verb = '';
    if (outMatch && (!inMatch || (outMatch.index ?? 0) <= (inMatch.index ?? 0))) {
      flow = 'OUT';
      verb = outMatch[1];
    } else if (inMatch) {
      flow = 'IN';
      verb = inMatch[1];
    }
    if (!flow) return { strong: false };

    // "took a cab", "got a haircut" only hint at a direction until "from" / "to" settles it
    const weak =
      flow === 'IN'
        ? WEAK_IN_VERBS.has(verb) && !/\b(?:from|se|back)\b/.test(lower)
        : WEAK_OUT_VERBS.has(verb) && !/\b(?:to|ko)\b/.test(lower);
    if (weak && flow === 'IN' && this.detectCategory(norm, 'OUT') && !this.detectCategory(norm, 'IN')) {
      return { flow: 'OUT', strong: false };
    }
    return { flow, strong: !weak };
  }

  /**
   * The direction the user stated outright (subject, unambiguous verb, contra or credit wording)
   */
  public static explicitFlow(text: string): TransactionFlow | undefined {
    const norm = this.normalize(text);
    const result = this.detectFlow(norm, norm.toLowerCase());
    return result.strong ? result.flow : undefined;
  }

  /**
   * Is there anything at all that suggests a direction (a verb, or a purpose such as rent or salary)?
   */
  public static hasDirectionCue(text: string): boolean {
    const norm = this.normalize(text);
    const lower = norm.toLowerCase();
    return !!this.detectFlow(norm, lower).flow || !!this.detectCategory(norm) || /\b(?:payment|expense|income|receipt)\b/.test(lower);
  }

  /**
   * Helper: Parse double-entry ledger mutation commands
   */
  private static parseTransactionIntent(norm: string, lower: string, text: string): VoiceTransactionIntent | VoiceDetailsIntent | null {
    const details: TransactionDetails = {};

    const amount = this.parseAmount(norm);
    if (amount !== null) details.amount = amount;

    const mode = this.detectPaymentMode(norm);
    if (mode) {
      details.paymentMode = mode.mode;
      if (mode.bankHint) details.bankHint = mode.bankHint;
    }

    const date = this.detectDate(norm);
    if (date) details.date = date;

    const { flow: verbFlow, subjectName } = this.detectFlow(norm, lower);
    let flow = verbFlow;

    let category = this.detectCategory(norm, flow);
    if (!flow && category) {
      flow = category.type === 'INCOME' ? 'IN' : 'OUT';
    }
    if (flow) details.flow = flow;

    if (flow !== 'WITHDRAWAL' && flow !== 'DEPOSIT') {
      let person = subjectName ?? this.extractPersonName(norm, flow) ?? (flow ? null : this.looseName(norm));
      // "Got back the 3,000 I had lent to Priya" — a repayment names the person after "to"
      if (!person && flow === 'IN' && /\b(?:back|returned|repaid|wapas)\b/.test(lower)) person = this.extractPersonName(norm, 'OUT');
      if (person) details.personName = person;
      if (category) details.categoryName = category.name;
    }

    if (!details.flow) {
      // Without a verb we need a believable amount ("Rahul 5000"); "call me at 5" is not a transaction
      const hasCurrency = /\b(?:rs|rupees|inr|bucks)\b|₹/.test(lower);
      if (details.amount === undefined || (Math.abs(details.amount) < 10 && !hasCurrency)) return null;
    }

    if (!details.flow) {
      return { type: 'DETAILS', details, rawText: text };
    }

    const action = this.actionFor(details)!;
    category = category && details.categoryName ? category : undefined;
    return {
      type: 'TRANSACTION',
      action,
      voucherType: this.voucherTypeFor(action),
      amount: details.amount ?? 0,
      personName: details.personName,
      categoryName: details.categoryName,
      paymentMode: details.paymentMode ?? (flow === 'WITHDRAWAL' ? 'BANK' : 'CASH'),
      narration: this.describeTransaction(action, details),
      rawText: text,
      details,
    };
  }

  /**
   * A name in a verbless utterance like "Rahul 5000" or "5000 Sharma ji"
   */
  private static looseName(norm: string): string | null {
    const words = norm
      .replace(/[₹,.!?]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !/\d/.test(w) && !(w.toLowerCase() in SCALE_WORDS) && !HUNDRED_WORDS.has(w.toLowerCase()) && !(w.toLowerCase() in UNIT_WORDS));
    if (words.length === 0 || words.length > 4) return null;
    return this.cleanName(words.join(' '), 'leading');
  }

  // ─── Accounting helpers ────────────────────────────────────────────────

  /**
   * Decide the ledger action once the flow and counterparty are known
   */
  public static actionFor(d: TransactionDetails): TransactionAction | undefined {
    switch (d.flow) {
      case 'WITHDRAWAL':
        return 'WITHDRAWAL';
      case 'DEPOSIT':
        return 'DEPOSIT';
      case 'CREDIT_SALE':
        return 'PERSON_BOUGHT';
      case 'CREDIT_PURCHASE':
        return 'USER_BOUGHT';
      case 'OUT':
        return d.personName && !d.categoryName ? 'GIVE_TO_PERSON' : 'DIRECT_PAYMENT';
      case 'IN':
        return d.personName && !d.categoryName ? 'RECEIVE_FROM_PERSON' : 'DIRECT_INCOME';
      default:
        return undefined;
    }
  }

  public static voucherTypeFor(action: TransactionAction): VoucherType {
    switch (action) {
      case 'WITHDRAWAL':
      case 'DEPOSIT':
        return 'CONTRA';
      case 'RECEIVE_FROM_PERSON':
      case 'DIRECT_INCOME':
        return 'RECEIPT';
      case 'GIVE_TO_PERSON':
      case 'DIRECT_PAYMENT':
        return 'PAYMENT';
      case 'PERSON_BOUGHT':
      case 'USER_BOUGHT':
        return 'JOURNAL';
    }
  }

  public static flowForAction(action: TransactionAction): TransactionFlow {
    switch (action) {
      case 'WITHDRAWAL':
        return 'WITHDRAWAL';
      case 'DEPOSIT':
        return 'DEPOSIT';
      case 'PERSON_BOUGHT':
        return 'CREDIT_SALE';
      case 'USER_BOUGHT':
        return 'CREDIT_PURCHASE';
      case 'GIVE_TO_PERSON':
      case 'DIRECT_PAYMENT':
        return 'OUT';
      case 'RECEIVE_FROM_PERSON':
      case 'DIRECT_INCOME':
        return 'IN';
    }
  }

  /**
   * Human-readable narration for a voucher
   */
  public static describeTransaction(
    action: TransactionAction,
    d: TransactionDetails,
    names?: { fund?: string; person?: string; category?: string }
  ): string {
    const amt = d.amount && d.amount > 0 ? ` (₹${d.amount.toLocaleString('en-IN')})` : ' (amount pending)';
    const fund = names?.fund ?? (d.paymentMode === 'BANK' ? 'Bank' : 'Cash');
    const person = names?.person ?? d.personName ?? 'contact';
    const category = names?.category ?? d.categoryName ?? 'expense';
    const note = d.narration ? ` — ${d.narration}` : '';

    switch (action) {
      case 'WITHDRAWAL':
        return `ATM / Cash withdrawal from ${names?.fund ?? 'Bank'}${amt}${note}`;
      case 'DEPOSIT':
        return `Cash deposit into ${names?.fund ?? 'Bank'}${amt}${note}`;
      case 'RECEIVE_FROM_PERSON':
        return `Payment received from ${person} via ${fund}${amt}${note}`;
      case 'GIVE_TO_PERSON':
        return `Payment / Lent to ${person} via ${fund}${amt}${note}`;
      case 'PERSON_BOUGHT':
        return `Sale on credit to ${person}${amt}${note}`;
      case 'USER_BOUGHT':
        return `Purchased ${category} from ${person} on credit${amt}${note}`;
      case 'DIRECT_PAYMENT':
        return `Paid for ${category}${d.personName ? ` to ${d.personName}` : ''} via ${fund}${amt}${note}`;
      case 'DIRECT_INCOME':
        return `Received ${names?.category ?? d.categoryName ?? 'income'}${d.personName ? ` from ${d.personName}` : ''} in ${fund}${amt}${note}`;
    }
  }

  /** Exposed for tests and the agent: escape user text for use inside a RegExp */
  public static escapeRegExp(s: string): string {
    return escapeRegExp(s);
  }
}
