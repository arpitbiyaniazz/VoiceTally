import { Request, Response, NextFunction } from 'express';
import { JournalEntryModel } from '../models/JournalEntryModel.js';
import { PostingEngine, type VoucherInput } from '../services/PostingEngine.js';
import { LedgerView } from '../views/LedgerView.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';
import type { VoucherType } from '@prisma/client';

function parseSafePage(val: any): number | undefined {
  if (!val) return undefined;
  const num = parseInt(val, 10);
  return isNaN(num) || num < 1 ? 1 : Math.min(num, 10000);
}

function parseSafePageSize(val: any): number | undefined {
  if (!val) return undefined;
  const num = parseInt(val, 10);
  return isNaN(num) || num < 1 ? 20 : Math.min(num, 100);
}

function parseSafeDate(val: any, fieldName: string = 'date'): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw new ValidationError(`Invalid ${fieldName}`, {
      [fieldName]: ['Must be a valid date string'],
    });
  }
  return d;
}

/**
 * Ledger Controller — thin request handlers for voucher posting and ledger queries.
 */
export const LedgerController = {
  /**
   * Post a voucher (Payment/Receipt/Contra/Journal).
   * Parses input → PostingEngine builds lines → JournalEntryModel creates atomically.
   */
  async postVoucher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const body = req.body;

      if (!body.voucherType) {
        throw new ValidationError('voucherType is required', {
          voucherType: ['Must be PAYMENT, RECEIPT, CONTRA, or JOURNAL'],
        });
      }

      const voucherType: VoucherType = body.voucherType;

      // Build journal lines using the deterministic posting engine
      const voucherInput: VoucherInput = body;
      const lines = PostingEngine.buildJournalLines(voucherInput);

      const parsedDate = body.date ? parseSafeDate(body.date, 'date') : new Date();

      // Create the journal entry (Phase A — atomic write)
      const entry = await JournalEntryModel.create(userId, {
        date: parsedDate || new Date(),
        narration: body.narration,
        voucherType,
        source: body.source || 'MANUAL',
        lines,
      });

      res.status(201).json(LedgerView.journalEntry(entry));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get the ledger for a specific account (running balance view).
   */
  async getAccountLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const accountId = req.params.accountId as string;
      const { startDate, endDate, page, pageSize } = req.query;

      const result = await JournalEntryModel.getAccountLedger(accountId as string, userId, {
        startDate: parseSafeDate(startDate, 'startDate'),
        endDate: parseSafeDate(endDate, 'endDate'),
        page: parseSafePage(page),
        pageSize: parseSafePageSize(pageSize),
      });

      res.status(200).json(LedgerView.accountLedger(result));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a single journal entry with its lines.
   */
  async getJournalEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const entryId = req.params.entryId as string;

      const entry = await JournalEntryModel.getById(entryId, userId);

      res.status(200).json(LedgerView.journalEntry(entry));
    } catch (error) {
      next(error);
    }
  },

  /**
   * List journal entries with optional date-range filter.
   */
  async listJournalEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { startDate, endDate, voucherType, page, pageSize } = req.query;

      const result = await JournalEntryModel.list(userId, {
        startDate: parseSafeDate(startDate, 'startDate'),
        endDate: parseSafeDate(endDate, 'endDate'),
        voucherType: voucherType as VoucherType | undefined,
        page: parseSafePage(page),
        pageSize: parseSafePageSize(pageSize),
      });

      res.status(200).json(LedgerView.journalEntryList(result));
    } catch (error) {
      next(error);
    }
  },
};
