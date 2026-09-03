import { Request, Response, NextFunction } from 'express';

/**
 * Extended Express Request with authenticated user info.
 */
export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
}

/**
 * Type guard to check if a request has been authenticated.
 */
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return 'userId' in req && typeof (req as AuthenticatedRequest).userId === 'string';
}

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Pagination query parameters.
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Date range filter.
 */
export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}

/**
 * Controller handler type — async Express handler that can throw.
 */
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;
