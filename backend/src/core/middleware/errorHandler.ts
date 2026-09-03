import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/index.js';
import type { ApiResponse } from '../types/index.js';

/**
 * Global error handler middleware.
 * Maps AppError subclasses to appropriate HTTP responses.
 * Must be registered LAST in the middleware chain.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  const requestId = req.headers['x-request-id'] || 'unknown';
  console.error(`[${requestId}] Error:`, {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Operational errors — safe to expose to the client
  if (err instanceof AppError && err.isOperational) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Include validation details if present
    if (err instanceof ValidationError) {
      response.error!.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Unexpected errors — don't leak internals
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'An unexpected error occurred',
    },
  };

  res.status(500).json(response);
}
