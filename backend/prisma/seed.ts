import { PrismaClient, AccountType, AccountSubtype, CashFlowCategory, VoucherType, EntrySource } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting VoiceTally demo database seeding...');

  const demoEmail = 'demo@voicetally.app';
  const demoPassword = 'demopass123';
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  // 1. Delete existing demo user (and cascaded accounts, journal entries, people, sessions) if exists
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (existingUser) {
    console.log('🔄 Cleaning up existing demo user data...');
    // Delete journal lines and entries
    await prisma.journalLine.deleteMany({
      where: { account: { userId: existingUser.id } },
    });
    await prisma.journalEntry.deleteMany({
      where: { userId: existingUser.id },
    });
    // Delete accounts
    await prisma.account.deleteMany({
      where: { userId: existingUser.id },
    });
    // Delete people
    await prisma.person.deleteMany({
      where: { userId: existingUser.id },
    });
    // Delete sessions
    await prisma.session.deleteMany({
      where: { userId: existingUser.id },
    });
    // Delete user
    await prisma.user.delete({
      where: { id: existingUser.id },
    });
  }

  // 2. Create Demo User
  console.log('👤 Creating demo user: Alex Morgan (demo@voicetally.app)...');
  const user = await prisma.user.create({
    data: {
      email: demoEmail,
      name: 'Alex Morgan',
      passwordHash,
      phone: '+919876543210',
      telegramChatId: '@alex_morgan_vt',
      botPairingCode: 'VT-8824',
    },
  });

  // 3. Create People (Counterparties)
  console.log('👥 Creating people & counterparties...');
  const rahul = await prisma.person.create({
    data: {
      userId: user.id,
      name: 'Rahul Sharma',
      phone: '+919811122233',
      label: 'Friend',
      address: 'Indiranagar, Bengaluru',
    },
  });

  const priya = await prisma.person.create({
    data: {
      userId: user.id,
      name: 'Priya Patel',
      phone: '+919822233344',
      label: 'Colleague',
      address: 'Bandra West, Mumbai',
    },
  });

  const apex = await prisma.person.create({
    data: {
      userId: user.id,
      name: 'Apex Technologies',
      phone: '+919833344455',
      label: 'Client',
      address: 'Cyber City, Gurugram',
    },
  });

  const vikram = await prisma.person.create({
    data: {
      userId: user.id,
      name: 'Vikram Malhotra',
      phone: '+919844455566',
      label: 'Landlord',
      address: 'Koramangala, Bengaluru',
    },
  });

  // 4. Create Full Chart of Accounts
  console.log('📊 Setting up Chart of Accounts...');
  const accountsToCreate = [
    // Cash & Bank (Asset)
    { key: 'hdfc', name: 'HDFC Bank Account', type: AccountType.ASSET, subtype: AccountSubtype.CASH_BANK, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'icici', name: 'ICICI Savings Account', type: AccountType.ASSET, subtype: AccountSubtype.CASH_BANK, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'cash', name: 'Cash on Hand', type: AccountType.ASSET, subtype: AccountSubtype.CASH_BANK, cashFlowCategory: CashFlowCategory.OPERATING },
    
    // Equity
    { key: 'capital', name: 'Opening Capital', type: AccountType.EQUITY, subtype: AccountSubtype.EQUITY_CAPITAL, cashFlowCategory: CashFlowCategory.NONE },

    // Income
    { key: 'salary', name: 'Salary & Compensation', type: AccountType.INCOME, subtype: AccountSubtype.INCOME_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'freelance', name: 'Freelance & Consulting', type: AccountType.INCOME, subtype: AccountSubtype.INCOME_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'dividends', name: 'Dividends & Interest', type: AccountType.INCOME, subtype: AccountSubtype.INCOME_CATEGORY, cashFlowCategory: CashFlowCategory.INVESTING },

    // Expenses
    { key: 'rent', name: 'Apartment Rent', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'groceries', name: 'Groceries & Food Supplies', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'dining', name: 'Dining & Restaurants', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'utilities', name: 'Electricity & Utilities', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'cloud', name: 'Cloud Infrastructure & SaaS', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'fitness', name: 'Health & Gym Membership', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },
    { key: 'travel', name: 'Travel & Commute', type: AccountType.EXPENSE, subtype: AccountSubtype.EXPENSE_CATEGORY, cashFlowCategory: CashFlowCategory.OPERATING },

    // People-linked accounts
    { key: 'rahul_acc', name: 'Rahul Sharma (Receivable)', type: AccountType.ASSET, subtype: AccountSubtype.PERSON, personId: rahul.id, cashFlowCategory: CashFlowCategory.NONE },
    { key: 'priya_acc', name: 'Priya Patel (Payable)', type: AccountType.LIABILITY, subtype: AccountSubtype.PERSON, personId: priya.id, cashFlowCategory: CashFlowCategory.NONE },
    { key: 'apex_acc', name: 'Apex Technologies (Receivable)', type: AccountType.ASSET, subtype: AccountSubtype.PERSON, personId: apex.id, cashFlowCategory: CashFlowCategory.NONE },
    { key: 'vikram_acc', name: 'Vikram Malhotra (Deposit)', type: AccountType.ASSET, subtype: AccountSubtype.PERSON, personId: vikram.id, cashFlowCategory: CashFlowCategory.NONE },
  ];

  const accountsMap: Record<string, any> = {};

  for (const acc of accountsToCreate) {
    const created = await prisma.account.create({
      data: {
        userId: user.id,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        cashFlowCategory: acc.cashFlowCategory,
        personId: acc.personId || null,
        cachedBalance: new Decimal(0),
      },
    });
    accountsMap[acc.key] = created;
  }

  // 5. Generate Realistic Transactions (Double-Entry Invariant Strictly Enforced)
  console.log('🧾 Creating historical journal entries and voucher records...');

  const today = new Date();
  const daysAgo = (d: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    return date;
  };

  interface SeedEntry {
    date: Date;
    narration: string;
    voucherType: VoucherType;
    source: EntrySource;
    lines: { accountKey: string; debit: number; credit: number }[];
  }

  const seedEntries: SeedEntry[] = [
    // Opening balance confirmation
    {
      date: daysAgo(30),
      narration: 'Opening balance confirmation and initial capital allocation',
      voucherType: VoucherType.JOURNAL,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'hdfc', debit: 220000, credit: 0 },
        { accountKey: 'icici', debit: 150000, credit: 0 },
        { accountKey: 'cash', debit: 18000, credit: 0 },
        { accountKey: 'capital', debit: 0, credit: 388000 },
      ],
    },
    // Security deposit for apartment
    {
      date: daysAgo(28),
      narration: 'Refundable security deposit for 2BHK apartment paid to Vikram Malhotra',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'vikram_acc', debit: 60000, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 60000 },
      ],
    },
    // Monthly salary credit
    {
      date: daysAgo(25),
      narration: 'Monthly salary credited by Acme Software Corp for September',
      voucherType: VoucherType.RECEIPT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'hdfc', debit: 135000, credit: 0 },
        { accountKey: 'salary', debit: 0, credit: 135000 },
      ],
    },
    // Emergency loan to Rahul
    {
      date: daysAgo(22),
      narration: 'Lent ₹12,000 to Rahul for emergency laptop repair',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'rahul_acc', debit: 12000, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 12000 },
      ],
    },
    // Rent payment
    {
      date: daysAgo(20),
      narration: 'Paid September apartment rent via NEFT transfer',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'rent', debit: 32000, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 32000 },
      ],
    },
    // Groceries via Voice
    {
      date: daysAgo(18),
      narration: 'Paid ₹4,850 in cash for organic groceries and pantry items',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'groceries', debit: 4850, credit: 0 },
        { accountKey: 'cash', debit: 0, credit: 4850 },
      ],
    },
    // Milestone billed to client Apex Technologies
    {
      date: daysAgo(15),
      narration: 'Billed Apex Technologies for Phase 1 System Architecture deliverables',
      voucherType: VoucherType.JOURNAL,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'apex_acc', debit: 45000, credit: 0 },
        { accountKey: 'freelance', debit: 0, credit: 45000 },
      ],
    },
    // Partial payment received from Apex Technologies
    {
      date: daysAgo(14),
      narration: 'Received ₹30,000 partial payment from Apex Technologies via IMPS',
      voucherType: VoucherType.RECEIPT,
      source: EntrySource.WHATSAPP,
      lines: [
        { accountKey: 'hdfc', debit: 30000, credit: 0 },
        { accountKey: 'apex_acc', debit: 0, credit: 30000 },
      ],
    },
    // Dinner with team covered by Priya
    {
      date: daysAgo(12),
      narration: 'Priya covered my share of the team celebration dinner at Olive Bistro',
      voucherType: VoucherType.JOURNAL,
      source: EntrySource.TELEGRAM,
      lines: [
        { accountKey: 'dining', debit: 2400, credit: 0 },
        { accountKey: 'priya_acc', debit: 0, credit: 2400 },
      ],
    },
    // ATM Cash withdrawal (Contra)
    {
      date: daysAgo(10),
      narration: 'Withdrew ₹10,000 cash from HDFC ATM for travel expenses',
      voucherType: VoucherType.CONTRA,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'cash', debit: 10000, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 10000 },
      ],
    },
    // Utility and Internet bill
    {
      date: daysAgo(8),
      narration: 'Electricity and 1Gbps fiber internet monthly utility bill paid online',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'utilities', debit: 3650, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 3650 },
      ],
    },
    // Cloud and SaaS tools
    {
      date: daysAgo(7),
      narration: 'AWS cloud hosting and GitHub Copilot team subscription',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'cloud', debit: 2800, credit: 0 },
        { accountKey: 'icici', debit: 0, credit: 2800 },
      ],
    },
    // Rahul partial settlement
    {
      date: daysAgo(5),
      narration: 'Rahul returned ₹5,000 via UPI towards laptop loan',
      voucherType: VoucherType.RECEIPT,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'hdfc', debit: 5000, credit: 0 },
        { accountKey: 'rahul_acc', debit: 0, credit: 5000 },
      ],
    },
    // Mutual fund dividend credited
    {
      date: daysAgo(4),
      narration: 'Quarterly dividend reinvestment payout credited to ICICI savings',
      voucherType: VoucherType.RECEIPT,
      source: EntrySource.MANUAL,
      lines: [
        { accountKey: 'icici', debit: 4200, credit: 0 },
        { accountKey: 'dividends', debit: 0, credit: 4200 },
      ],
    },
    // Fitness membership
    {
      date: daysAgo(3),
      narration: 'Paid ₹7,500 quarterly membership at Cult.Fit Center',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'fitness', debit: 7500, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 7500 },
      ],
    },
    // Travel & Commute
    {
      date: daysAgo(2),
      narration: 'Paid cab fare and airport toll charges in cash',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.VOICE,
      lines: [
        { accountKey: 'travel', debit: 1420, credit: 0 },
        { accountKey: 'cash', debit: 0, credit: 1420 },
      ],
    },
    // Sunday Cafe Brunch via WhatsApp Companion
    {
      date: daysAgo(1),
      narration: 'Sunday brunch and coffee with friends at Third Wave Roasters',
      voucherType: VoucherType.PAYMENT,
      source: EntrySource.WHATSAPP,
      lines: [
        { accountKey: 'dining', debit: 1850, credit: 0 },
        { accountKey: 'hdfc', debit: 0, credit: 1850 },
      ],
    },
  ];

  // Track balance delta per account: SUM(debit) - SUM(credit)
  const balanceDeltas: Record<string, Decimal> = {};
  for (const acc of Object.values(accountsMap)) {
    balanceDeltas[acc.id] = new Decimal(0);
  }

  for (const item of seedEntries) {
    const totalDebit = item.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = item.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(`Unbalanced entry: "${item.narration}" Debits=${totalDebit} Credits=${totalCredit}`);
    }

    const entry = await prisma.journalEntry.create({
      data: {
        userId: user.id,
        date: item.date,
        narration: item.narration,
        voucherType: item.voucherType,
        source: item.source,
        postedAt: item.date,
        lines: {
          create: item.lines.map((l) => {
            const acc = accountsMap[l.accountKey];
            const deb = new Decimal(l.debit);
            const cre = new Decimal(l.credit);
            balanceDeltas[acc.id] = balanceDeltas[acc.id].add(deb).sub(cre);
            return {
              accountId: acc.id,
              debitAmount: deb,
              creditAmount: cre,
            };
          }),
        },
      },
    });
  }

  // 6. Update Account cachedBalance to match exactly
  console.log('⚖️ Updating account cached balances...');
  for (const [accId, delta] of Object.entries(balanceDeltas)) {
    await prisma.account.update({
      where: { id: accId },
      data: {
        cachedBalance: delta,
        postedThrough: today,
      },
    });
  }

  console.log('\n======================================================');
  console.log('✅ Demo data seeding completed successfully!');
  console.log('======================================================');
  console.log(`👤 User Email:    ${demoEmail}`);
  console.log(`🔑 Password:      ${demoPassword}`);
  console.log(`💼 Name:          Alex Morgan`);
  console.log(`💰 Accounts:      ${Object.keys(accountsMap).length} configured`);
  console.log(`📝 Journal Items: ${seedEntries.length} double-entry balanced transactions`);
  console.log(`👥 Contacts:      4 counterparties (Rahul, Priya, Apex, Vikram)`);
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
