import { api } from './client';

export interface VoucherPayload {
  voucherType: 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL';
  amount?: number;
  date: string;
  narration: string;
  cashAccountId?: string;
  counterAccountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  lines?: { accountId: string; debitAmount: number; creditAmount: number }[];
}

export const ledgerApi = {
  // ─── Accounts ──────────────────────────────────────────────
  getChartOfAccounts() {
    return api.get('/ledger/accounts/chart');
  },

  listAccounts(params?: { type?: string; subtype?: string }) {
    return api.get('/ledger/accounts', { params });
  },

  getAccount(accountId: string) {
    return api.get(`/ledger/accounts/${accountId}`);
  },

  createAccount(data: { name: string; type: string; subtype: string; cashFlowCategory?: string }) {
    return api.post('/ledger/accounts', data);
  },

  // ─── Vouchers / Entries ────────────────────────────────────
  postVoucher(data: VoucherPayload) {
    return api.post('/ledger/vouchers', data);
  },

  listEntries(params?: { startDate?: string; endDate?: string; voucherType?: string; page?: number; pageSize?: number }) {
    return api.get('/ledger/entries', { params });
  },

  getEntry(entryId: string) {
    return api.get(`/ledger/entries/${entryId}`);
  },

  // ─── Account Ledger ────────────────────────────────────────
  getAccountLedger(accountId: string, params?: { startDate?: string; endDate?: string; page?: number; pageSize?: number }) {
    return api.get(`/ledger/accounts/${accountId}/ledger`, { params });
  },

  // ─── People ────────────────────────────────────────────────
  listPeople() {
    return api.get('/ledger/people');
  },

  createPerson(data: { name: string; phone?: string; address?: string; label?: string }) {
    return api.post('/ledger/people', data);
  },

  getPerson(personId: string) {
    return api.get(`/ledger/people/${personId}`);
  },

  searchPeople(name: string) {
    return api.get('/ledger/people/search', { params: { name } });
  },

  // ─── Financial Reports ─────────────────────────────────────
  getTrialBalance(asOfDate?: string) {
    return api.get('/ledger/reports/trial-balance', { params: { asOfDate } });
  },

  getProfitAndLoss(startDate?: string, endDate?: string) {
    return api.get('/ledger/reports/profit-loss', { params: { startDate, endDate } });
  },

  getBalanceSheet(asOfDate?: string) {
    return api.get('/ledger/reports/balance-sheet', { params: { asOfDate } });
  },

  getCashFlowStatement(startDate?: string, endDate?: string) {
    return api.get('/ledger/reports/cash-flow', { params: { startDate, endDate } });
  },

  // ─── Visual BI & Analytics ─────────────────────────────────
  getAnalyticsSummary() {
    return api.get('/ledger/analytics/summary');
  },

  getAnalyticsTrends(months: number = 6) {
    return api.get('/ledger/analytics/trends', { params: { months } });
  },

  getCategoryBreakdown(startDate?: string, endDate?: string) {
    return api.get('/ledger/analytics/categories', { params: { startDate, endDate } });
  },

  getSankeyFlow(startDate?: string, endDate?: string) {
    return api.get('/ledger/analytics/sankey', { params: { startDate, endDate } });
  },
};

export const integrationsApi = {
  getStatus() {
    return api.get('/integrations/status');
  },

  linkPhone(phone: string) {
    return api.post('/integrations/link-phone', { phone });
  },

  generatePairingCode() {
    return api.post('/integrations/generate-code');
  },

  unlinkChannel(channel: 'WHATSAPP' | 'TELEGRAM') {
    return api.post('/integrations/unlink', { channel });
  },

  simulateChat(channel: 'WHATSAPP' | 'TELEGRAM', message: string, isVoice?: boolean) {
    return api.post('/integrations/simulator/chat', { channel, message, isVoice });
  },
};

