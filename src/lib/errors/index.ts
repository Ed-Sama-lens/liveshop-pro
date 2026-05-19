/**
 * Domain error classes for liveshop-pro.
 *
 * Design notes:
 * - `AppError` is the base. Subclasses bind a fixed `code` + `status`.
 * - `name` is set from `new.target.name` in the base constructor so
 *   subclasses do NOT need to re-assign it (and cannot, if frozen).
 * - Prototype is restored via `Object.setPrototypeOf` so `instanceof`
 *   checks work after transpilation through ES2017 target.
 * - Stack frames captured via `Error.captureStackTrace` when available
 *   (Node) so the constructor itself does not appear in the trace.
 * - Instances are NOT frozen. Earlier the base called `Object.freeze(this)`
 *   which made every subclass throw `TypeError: Cannot assign to read
 *   only property 'name'` when the subclass constructor tried to set
 *   `this.name`. Production routes hit this on every NotFoundError /
 *   ConflictError / ValidationError throw and silently surfaced as
 *   generic 500 INTERNAL_ERROR via `toAppError`. Discovered 2026-05-09
 *   by `scripts/verify-booking-flow.ts` Test 9.
 */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);

    // `new.target.name` resolves to the actual subclass name (e.g.
    // 'ConflictError') even when called via `super(...)` from a subclass
    // constructor. Falls back to 'AppError' for direct construction.
    this.name = new.target?.name ?? 'AppError';
    this.code = code;
    this.status = status;

    // Restore prototype for `instanceof` after ES2017 down-leveling.
    Object.setPrototypeOf(this, new.target.prototype);

    // Trim the constructor frame from the stack on V8.
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as {
        captureStackTrace: (target: object, ctor: new (...args: never[]) => unknown) => void;
      }).captureStackTrace(this, new.target);
    }
  }
}

export class ValidationError extends AppError {
  readonly fields: Readonly<Record<string, readonly string[]>>;

  constructor(message: string, fields: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    // Deep copy to prevent external mutation; assign via Object.defineProperty
    // so the field stays readonly for callers without freezing the whole error.
    const frozenFields: Record<string, readonly string[]> = {};
    for (const [key, value] of Object.entries(fields)) {
      frozenFields[key] = Object.freeze([...value]);
    }
    this.fields = Object.freeze(frozenFields);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT', 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429);
  }
}

/**
 * Sanitize any thrown value into an AppError.
 * Prevents stack traces and internal details from leaking to clients.
 *
 * Preserves AppError subclasses unchanged so callers can distinguish
 * 404 / 409 / 400 etc on the response status.
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
