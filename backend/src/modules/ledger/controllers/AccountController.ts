import { Request, Response, NextFunction } from 'express';
import { AccountModel } from '../models/AccountModel.js';
import { AccountView } from '../views/AccountView.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';
import type { AccountType, AccountSubtype } from '@prisma/client';

const VALID_ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const VALID_ACCOUNT_SUBTYPES: AccountSubtype[] = [
  'CASH_BANK',
  'PERSON',
  'EXPENSE_CATEGORY',
  'INCOME_CATEGORY',
  'EQUITY_CAPITAL',
];

/**
 * Account Controller — thin handlers for chart of accounts management.
 */
export const AccountController = {
  async createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { name, type, subtype, personId, cashFlowCategory } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0 || !type || !subtype) {
        throw new ValidationError('Missing required fields', {
          ...(name ? {} : { name: ['Name is required and cannot be empty'] }),
          ...(type ? {} : { type: ['Type is required'] }),
          ...(subtype ? {} : { subtype: ['Subtype is required'] }),
        });
      }

      if (name.trim().length > 100) {
        throw new ValidationError('Account name too long', {
          name: ['Account name cannot exceed 100 characters'],
        });
      }

      if (!VALID_ACCOUNT_TYPES.includes(type)) {
        throw new ValidationError('Invalid account type', {
          type: [`Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`],
        });
      }

      if (!VALID_ACCOUNT_SUBTYPES.includes(subtype)) {
        throw new ValidationError('Invalid account subtype', {
          subtype: [`Must be one of: ${VALID_ACCOUNT_SUBTYPES.join(', ')}`],
        });
      }

      const account = await AccountModel.create(userId, {
        name: name.trim(),
        type,
        subtype,
        personId: personId ? String(personId).trim() : undefined,
        cashFlowCategory,
      });

      res.status(201).json(AccountView.account(account));
    } catch (error) {
      next(error);
    }
  },

  async listAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { type, subtype } = req.query;

      const accounts = await AccountModel.list(userId, {
        type: type as AccountType | undefined,
        subtype: subtype as AccountSubtype | undefined,
      });

      res.status(200).json(AccountView.accountList(accounts));
    } catch (error) {
      next(error);
    }
  },

  async getChartOfAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const chart = await AccountModel.getChartOfAccounts(userId);

      res.status(200).json(AccountView.chartOfAccounts(chart));
    } catch (error) {
      next(error);
    }
  },

  async getAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const accountId = req.params.accountId as string;

      const account = await AccountModel.getWithBalance(accountId, userId);

      res.status(200).json(AccountView.accountWithBalance(account));
    } catch (error) {
      next(error);
    }
  },
};
