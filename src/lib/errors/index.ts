export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    Object.freeze(this);
  }
}

export class ValidationError extends AppError {
  readonly fields: Readonly<Record<string, readonly string[]>>;

  constructor(message: string, fields: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    // Deep copy to prevent external mutation
    const frozen: Record<string, readonly string[]> = {};
    for (const [key, value] of Object.entries(fields)) {
      frozen[key] = Object.freeze([...value]);
    }
    this.fields = Object.freeze(frozen);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Sanitize any thrown value into an AppError.
 * Prevents stack traces and internal details from leaking to clients.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof Error) {
    return new AppError(
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      'INTERNAL_ERROR',
      500
    );
  }

  return new AppError('Internal server error', 'INTERNAL_ERROR', 500);
}
