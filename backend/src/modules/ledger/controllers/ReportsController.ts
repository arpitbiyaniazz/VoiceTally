import { Request, Response, NextFunction } from 'express';
import { ReportsModel } from '../models/ReportsModel.js';
import { ReportsView } from '../views/ReportsView.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';

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

export const ReportsController = {
  async getTrialBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { asOfDate } = req.query;

      const date = parseSafeDate(asOfDate, 'asOfDate') || new Date();
      const report = await ReportsModel.getTrialBalance(userId, date);

      res.status(200).json(ReportsView.trialBalance(report));
    } catch (error) {
      next(error);
    }
  },

  async getProfitAndLoss(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { startDate, endDate } = req.query;

      const now = new Date();
      // Default: current month
      const start = parseSafeDate(startDate, 'startDate') || new Date(now.getFullYear(), now.getMonth(), 1);
      const end = parseSafeDate(endDate, 'endDate') || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const report = await ReportsModel.getProfitAndLoss(userId, start, end);

      res.status(200).json(ReportsView.profitAndLoss(report));
    } catch (error) {
      next(error);
    }
  },

  async getBalanceSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { asOfDate } = req.query;

      const date = parseSafeDate(asOfDate, 'asOfDate') || new Date();
      const report = await ReportsModel.getBalanceSheet(userId, date);

      res.status(200).json(ReportsView.balanceSheet(report));
    } catch (error) {
      next(error);
    }
  },

  async getCashFlowStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { startDate, endDate } = req.query;

      const now = new Date();
      const start = parseSafeDate(startDate, 'startDate') || new Date(now.getFullYear(), now.getMonth(), 1);
      const end = parseSafeDate(endDate, 'endDate') || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const report = await ReportsModel.getCashFlowStatement(userId, start, end);

      res.status(200).json(ReportsView.cashFlow(report));
    } catch (error) {
      next(error);
    }
  },
};
