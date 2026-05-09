import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  toAppError,
} from '@/lib/errors/index';

// AppError subclass construction was previously broken: the base class
// called `Object.freeze(this)` before subclasses could set `this.name`,
// causing TypeError. Production routes throwing NotFoundError / ConflictError
// / ValidationError surfaced as generic 500 INTERNAL_ERROR via `toAppError`.
// Fix landed 2026-05-09: name set via `new.target.name`, no freeze.

describe('AppError base class', () => {
  it('AppError can be constructed with status and code', () => {
    const err = new AppError('bad input', 'VALIDATION_ERROR', 400);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
    expect(err.name).toBe('AppError');
  });

  it('AppError preserves status across the standard HTTP codes', () => {
    expect(new AppError('m', 'AUTH_ERROR', 401).status).toBe(401);
    expect(new AppError('m', 'FORBIDDEN', 403).status).toBe(403);
    expect(new AppError('m', 'NOT_FOUND', 404).status).toBe(404);
    expect(new AppError('m', 'RATE_LIMIT', 429).status).toBe(429);
    expect(new AppError('m', 'INTERNAL_ERROR', 500).status).toBe(500);
  });

  it('AppError is an instance of Error', () => {
    const err = new AppError('test', 'CODE', 500);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it('AppError is NOT frozen so subclasses can extend safely', () => {
    const err = new AppError('test', 'CODE', 500);
    // Old behavior froze instances; new behavior does not. Subclass
    // initialization depends on this not being frozen.
    expect(Object.isFrozen(err)).toBe(false);
  });

  it('AppError has a stack trace', () => {
    const err = new AppError('test', 'CODE', 500);
    expect(typeof err.stack).toBe('string');
    expect(err.stack!.length).toBeGreaterThan(0);
  });
});

describe('AppError subclasses construct without throwing', () => {
  it('ValidationError constructs with default empty fields', () => {
    const err = new ValidationError('invalid');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.name).toBe('ValidationError');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(400);
    expect(err.message).toBe('invalid');
    expect(err.fields).toEqual({});
  });

  it('ValidationError preserves and freezes field arrays', () => {
    const err = new ValidationError('bad', {
      email: ['required', 'must be unique'],
      password: ['too short'],
    });
    expect(err.fields).toEqual({
      email: ['required', 'must be unique'],
      password: ['too short'],
    });
    expect(Object.isFrozen(err.fields)).toBe(true);
    expect(Object.isFrozen(err.fields.email)).toBe(true);
  });

  it('AuthError constructs with default message and 401 status', () => {
    const err = new AuthError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.name).toBe('AuthError');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Authentication required');
  });

  it('AuthError accepts custom message', () => {
    const err = new AuthError('token expired');
    expect(err.message).toBe('token expired');
    expect(err.status).toBe(401);
  });

  it('ForbiddenError constructs with default message and 403 status', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.name).toBe('ForbiddenError');
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Access denied');
  });

  it('NotFoundError constructs with default message and 404 status', () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.name).toBe('NotFoundError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Resource not found');
  });

  it('NotFoundError accepts custom message', () => {
    const err = new NotFoundError('Booking not found');
    expect(err.message).toBe('Booking not found');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('ConflictError constructs with default message and 409 status', () => {
    const err = new ConflictError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.name).toBe('ConflictError');
    expect(err.code).toBe('CONFLICT');
    expect(err.status).toBe(409);
    expect(err.message).toBe('Resource conflict');
  });

  it('ConflictError accepts custom message', () => {
    const err = new ConflictError('Cannot transition booking from CANCELLED');
    expect(err.message).toBe('Cannot transition booking from CANCELLED');
    expect(err.code).toBe('CONFLICT');
    expect(err.status).toBe(409);
  });

  it('RateLimitError constructs with default message and 429 status', () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.name).toBe('RateLimitError');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.status).toBe(429);
    expect(err.message).toBe('Too many requests');
  });
});

describe('AppError subclass identity preserved across throw/catch', () => {
  it('thrown ConflictError is catchable as ConflictError + AppError + Error', () => {
    let caught: unknown;
    try {
      throw new ConflictError('Cannot cancel a converted booking');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as ConflictError).code).toBe('CONFLICT');
    expect((caught as ConflictError).status).toBe(409);
  });

  it('thrown NotFoundError is catchable as NotFoundError', () => {
    let caught: unknown;
    try {
      throw new NotFoundError('Booking not found');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NotFoundError);
    expect((caught as NotFoundError).status).toBe(404);
  });
});

describe('toAppError()', () => {
  it('returns AppError instance unchanged', () => {
    const original = new AppError('denied', 'FORBIDDEN', 403);
    expect(toAppError(original)).toBe(original);
  });

  it('preserves AppError subclass identity (NotFoundError stays 404)', () => {
    const original = new NotFoundError('Booking not found');
    const result = toAppError(original);
    expect(result).toBe(original);
    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.status).toBe(404);
  });

  it('preserves AppError subclass identity (ConflictError stays 409)', () => {
    const original = new ConflictError('Cannot transition');
    const result = toAppError(original);
    expect(result).toBe(original);
    expect(result).toBeInstanceOf(ConflictError);
    expect(result.status).toBe(409);
  });

  it('preserves ValidationError fields', () => {
    const original = new ValidationError('invalid', { email: ['required'] });
    const result = toAppError(original);
    expect(result).toBe(original);
    expect((result as ValidationError).fields.email).toEqual(['required']);
  });

  it('converts plain Error to generic AppError with status 500', () => {
    const err = toAppError(new Error('internal details'));
    expect(err instanceof AppError).toBe(true);
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('converts unknown string value to generic AppError', () => {
    const err = toAppError('some string error');
    expect(err instanceof AppError).toBe(true);
    expect(err.status).toBe(500);
    expect(err.message).toBe('Internal server error');
  });

  it('converts null to generic AppError', () => {
    const err = toAppError(null);
    expect(err instanceof AppError).toBe(true);
    expect(err.status).toBe(500);
  });

  it('converts undefined to generic AppError', () => {
    const err = toAppError(undefined);
    expect(err instanceof AppError).toBe(true);
    expect(err.status).toBe(500);
  });

  it('converts object (non-Error) to generic AppError', () => {
    const err = toAppError({ code: 42 });
    expect(err instanceof AppError).toBe(true);
    expect(err.status).toBe(500);
  });

  it('in test env, preserves Error message (not production mode)', () => {
    // NODE_ENV=test — so the message should NOT be replaced with generic message
    const original = new Error('database connection failed');
    const err = toAppError(original);
    expect(err instanceof AppError).toBe(true);
    expect(err.message).toBe('database connection failed');
  });
});
