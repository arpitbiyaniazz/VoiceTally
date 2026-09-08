import { Request, Response, NextFunction } from 'express';
import { AnalyticsModel } from '../models/AnalyticsModel.js';
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

export const AnalyticsController = {
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const summary = await AnalyticsModel.getSummary(userId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;

      const trends = await AnalyticsModel.getMonthlyTrends(userId, isNaN(months) ? 6 : months);

      res.status(200).json({
        success: true,
        data: trends,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategoryBreakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { startDate, endDate } = req.query;

      const start = parseSafeDate(startDate, 'startDate');
      const end = parseSafeDate(endDate, 'endDate');

      const breakdown = await AnalyticsModel.getCategoryBreakdown(userId, start, end);

      res.status(200).json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      next(error);
    }
  },

  async getSankeyFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { startDate, endDate } = req.query;

      const start = parseSafeDate(startDate, 'startDate');
      const end = parseSafeDate(endDate, 'endDate');

      const sankey = await AnalyticsModel.getSankeyFlow(userId, start, end);

      res.status(200).json({
        success: true,
        data: sankey,
      });
    } catch (error) {
      next(error);
    }
  },
};
