import { Router } from 'express';
import { LedgerController } from './controllers/LedgerController.js';
import { AccountController } from './controllers/AccountController.js';
import { PersonController } from './controllers/PersonController.js';
import { ReportsController } from './controllers/ReportsController.js';
import { authMiddleware } from '../../core/middleware/auth.js';

const router = Router();

// All ledger routes require authentication
router.use(authMiddleware);

// ─── Accounts ─────────────────────────────────────────────────────────────
router.post('/accounts', AccountController.createAccount);
router.get('/accounts', AccountController.listAccounts);
router.get('/accounts/chart', AccountController.getChartOfAccounts);
router.get('/accounts/:accountId', AccountController.getAccount);

// ─── Vouchers / Journal Entries ───────────────────────────────────────────
router.post('/vouchers', LedgerController.postVoucher);
router.get('/entries', LedgerController.listJournalEntries);
router.get('/entries/:entryId', LedgerController.getJournalEntry);

// ─── Account Ledger (per-account running balance view) ────────────────────
router.get('/accounts/:accountId/ledger', LedgerController.getAccountLedger);

// ─── People ───────────────────────────────────────────────────────────────
router.post('/people', PersonController.createPerson);
router.get('/people', PersonController.listPeople);
router.get('/people/search', PersonController.searchPeople);
router.get('/people/:personId', PersonController.getPerson);

// ─── Financial Reports ───────────────────────────────────────────────────
router.get('/reports/trial-balance', ReportsController.getTrialBalance);
router.get('/reports/profit-loss', ReportsController.getProfitAndLoss);
router.get('/reports/balance-sheet', ReportsController.getBalanceSheet);
router.get('/reports/cash-flow', ReportsController.getCashFlowStatement);

export { router as ledgerRoutes };
