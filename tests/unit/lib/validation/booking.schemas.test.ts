/**
 * Unit tests for /api/sale/bookings/* validation schemas.
 *
 * Covers:
 *   - confirmBookingBodySchema (passthrough, empty body acceptable)
 *   - cancelBookingBodySchema (targetStatus enum + reason length)
 *   - createBookingBodySchema (manual create, evergreen optional liveSessionId)
 *
 * Until this PR, booking.schemas.ts had no per-schema test file.
 */
import { describe, it, expect } from 'vitest';
import {
  confirmBookingBodySchema,
  cancelBookingBodySchema,
  createBookingBodySchema,
} from '@/lib/validation/booking.schemas';

// ─── confirmBookingBodySchema ────────────────────────────────────────────

describe('confirmBookingBodySchema', () => {
  it('accepts empty object', () => {
    const result = confirmBookingBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts undefined', () => {
    const result = confirmBookingBodySchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('passthrough accepts extra fields without rejecting', () => {
    const result = confirmBookingBodySchema.safeParse({ extra: 'ignored' });
    expect(result.success).toBe(true);
  });
});

// ─── cancelBookingBodySchema ─────────────────────────────────────────────

describe('cancelBookingBodySchema', () => {
  it('accepts CANCELLED target status', () => {
    const result = cancelBookingBodySchema.safeParse({ targetStatus: 'CANCELLED' });
    expect(result.success).toBe(true);
  });

  it('accepts EXPIRED target status', () => {
    const result = cancelBookingBodySchema.safeParse({ targetStatus: 'EXPIRED' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown target status', () => {
    const result = cancelBookingBodySchema.safeParse({ targetStatus: 'PACKED' });
    expect(result.success).toBe(false);
  });

  it('rejects missing target status', () => {
    const result = cancelBookingBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts optional reason within 500 chars', () => {
    const result = cancelBookingBodySchema.safeParse({
      targetStatus: 'CANCELLED',
      reason: 'Customer changed mind',
    });
    expect(result.success).toBe(true);
  });

  it('trims reason', () => {
    const result = cancelBookingBodySchema.safeParse({
      targetStatus: 'CANCELLED',
      reason: '   reason text   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('reason text');
    }
  });

  it('rejects reason > 500 chars', () => {
    const result = cancelBookingBodySchema.safeParse({
      targetStatus: 'CANCELLED',
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason of exactly 500 chars', () => {
    const result = cancelBookingBodySchema.safeParse({
      targetStatus: 'CANCELLED',
      reason: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

// ─── createBookingBodySchema ─────────────────────────────────────────────

describe('createBookingBodySchema', () => {
  function baseBody() {
    return {
      customerId: 'cust-1',
      broadcastProductId: 'bp-1',
      quantity: 1,
      status: 'PENDING_REVIEW' as const,
    };
  }

  it('accepts evergreen booking (liveSessionId omitted)', () => {
    const result = createBookingBodySchema.safeParse(baseBody());
    expect(result.success).toBe(true);
  });

  it('accepts live-bound booking with liveSessionId', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      liveSessionId: 'live-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty liveSessionId when provided', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      liveSessionId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects liveSessionId > 128 chars', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      liveSessionId: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing customerId', () => {
    const body = baseBody();
    delete (body as Partial<typeof body>).customerId;
    const result = createBookingBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects empty customerId', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      customerId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects customerId > 128 chars', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      customerId: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing broadcastProductId', () => {
    const body = baseBody();
    delete (body as Partial<typeof body>).broadcastProductId;
    const result = createBookingBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects quantity 0', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity > 999', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      quantity: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      quantity: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts quantity at upper bound 999', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      quantity: 999,
    });
    expect(result.success).toBe(true);
  });

  it('accepts status PENDING_REVIEW', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      status: 'PENDING_REVIEW',
    });
    expect(result.success).toBe(true);
  });

  it('accepts status CONFIRMED', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      status: 'CONFIRMED',
    });
    expect(result.success).toBe(true);
  });

  it('rejects status CONVERTED_TO_ORDER (not client-supplied)', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      status: 'CONVERTED_TO_ORDER',
    });
    expect(result.success).toBe(false);
  });

  it('rejects status CANCELLED (not client-supplied)', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      status: 'CANCELLED',
    });
    expect(result.success).toBe(false);
  });

  it('accepts source MANUAL', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      source: 'MANUAL',
    });
    expect(result.success).toBe(true);
  });

  it('rejects source LIVE_COMMENT from client input (Q-17 invariant)', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      source: 'LIVE_COMMENT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source PAGE_INBOX from client input', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      source: 'PAGE_INBOX',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source SYSTEM from client input', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      source: 'SYSTEM',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid idempotencyKey (8-128 alnum/_/-)', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      idempotencyKey: 'abc12345',
    });
    expect(result.success).toBe(true);
  });

  it('accepts idempotencyKey with dash and underscore', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      idempotencyKey: 'cust_1-2026-05-19',
    });
    expect(result.success).toBe(true);
  });

  it('rejects idempotencyKey < 8 chars', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      idempotencyKey: 'abc1234',
    });
    expect(result.success).toBe(false);
  });

  it('rejects idempotencyKey > 128 chars', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      idempotencyKey: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('rejects idempotencyKey with disallowed chars', () => {
    const result = createBookingBodySchema.safeParse({
      ...baseBody(),
      idempotencyKey: 'abc 1234',
    });
    expect(result.success).toBe(false);
  });
});
