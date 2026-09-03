// ─── Custom Error Classes ──────────────────────────────────────────────────
// All errors extend AppError. The global error handler maps these to
// HTTP status codes. Controllers should never catch-and-swallow these.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly details: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    details: Record<string, string[]> = {}
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * The most critical error in the system.
 * Thrown when SUM(debit) ≠ SUM(credit) on a journal entry.
 * This should NEVER occur in production — any occurrence is a bug.
 */
export class UnbalancedEntryError extends AppError {
  constructor(
    journalEntryId: string | undefined,
    debitTotal: string,
    creditTotal: string
  ) {
    super(
      `Unbalanced journal entry${journalEntryId ? ` (${journalEntryId})` : ''}: ` +
        `debits=${debitTotal}, credits=${creditTotal}`,
      422,
      'UNBALANCED_ENTRY'
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` (${id})` : ''} not found`,
      404,
      'NOT_FOUND'
    );
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
