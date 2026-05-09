import { describe, it, expect } from 'vitest';
import {
  NO_EXPIRY_SENTINEL,
  BOOKING_ERROR_CODES,
  canTransitionBookingStatus,
  isTerminalBookingStatus,
  computeAvailable,
  hasSufficientStock,
  isAlreadyConfirmedIdempotent,
  preflightConfirm,
  preflightCancel,
  resolveActiveReservation,
  type ActiveReservationLookup,
  type ActiveReservationSnapshot,
  type BookingStatus,
} from '@/lib/sale/booking-rules';

describe('NO_EXPIRY_SENTINEL', () => {
  it('is a valid Date instance', () => {
    expect(NO_EXPIRY_SENTINEL).toBeInstanceOf(Date);
    expect(Number.isNaN(NO_EXPIRY_SENTINEL.getTime())).toBe(false);
  });

  it('is far in the future (year 2099)', () => {
    expect(NO_EXPIRY_SENTINEL.getUTCFullYear()).toBe(2099);
    expect(NO_EXPIRY_SENTINEL.getTime()).toBeGreaterThan(Date.now());
    // At least 50 years from now
    const fiftyYears = 50 * 365 * 24 * 60 * 60 * 1000;
    expect(NO_EXPIRY_SENTINEL.getTime() - Date.now()).toBeGreaterThan(fiftyYears);
  });

  it('matches the documented ISO string', () => {
    expect(NO_EXPIRY_SENTINEL.toISOString()).toBe('2099-12-31T23:59:59.000Z');
  });
});

describe('BOOKING_ERROR_CODES', () => {
  it('exposes all eight Boss-approved codes', () => {
    expect(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND).toBe('BOOKING_NOT_FOUND');
    expect(BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS).toBe('BOOKING_INVALID_STATUS');
    expect(BOOKING_ERROR_CODES.BROADCAST_PRODUCT_NOT_FOUND).toBe(
      'BROADCAST_PRODUCT_NOT_FOUND'
    );
    expect(BOOKING_ERROR_CODES.VARIANT_REQUIRED).toBe('VARIANT_REQUIRED');
    expect(BOOKING_ERROR_CODES.VARIANT_NOT_FOUND).toBe('VARIANT_NOT_FOUND');
    expect(BOOKING_ERROR_CODES.INSUFFICIENT_STOCK).toBe('INSUFFICIENT_STOCK');
    expect(BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR).toBe(
      'RESERVATION_INTEGRITY_ERROR'
    );
    expect(BOOKING_ERROR_CODES.RESERVATION_ALREADY_RELEASED).toBe(
      'RESERVATION_ALREADY_RELEASED'
    );
  });

  it('is frozen (constant)', () => {
    expect(Object.isFrozen(BOOKING_ERROR_CODES)).toBe(true);
  });
});

describe('canTransitionBookingStatus', () => {
  it('allows PENDING_REVIEW → CONFIRMED', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CONFIRMED')).toBe(true);
  });

  it('allows PENDING_REVIEW → CANCELLED', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CANCELLED')).toBe(true);
  });

  it('rejects PENDING_REVIEW → EXPIRED (only CONFIRMED can expire)', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'EXPIRED')).toBe(false);
  });

  it('rejects PENDING_REVIEW → CONVERTED_TO_ORDER (must confirm first)', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CONVERTED_TO_ORDER')).toBe(
      false
    );
  });

  it('allows CONFIRMED → CANCELLED', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('allows CONFIRMED → EXPIRED', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'EXPIRED')).toBe(true);
  });

  it('allows CONFIRMED → CONVERTED_TO_ORDER', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'CONVERTED_TO_ORDER')).toBe(true);
  });

  it('rejects CANCELLED → CONFIRMED (no resurrection)', () => {
    expect(canTransitionBookingStatus('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('rejects EXPIRED → CONFIRMED (no resurrection)', () => {
    expect(canTransitionBookingStatus('EXPIRED', 'CONFIRMED')).toBe(false);
  });

  it('rejects CONVERTED_TO_ORDER → CANCELLED (use order cancel flow)', () => {
    expect(canTransitionBookingStatus('CONVERTED_TO_ORDER', 'CANCELLED')).toBe(false);
  });

  it('rejects same-status self-loops', () => {
    const all: BookingStatus[] = [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    for (const s of all) {
      expect(canTransitionBookingStatus(s, s)).toBe(false);
    }
  });
});

describe('isTerminalBookingStatus', () => {
  it('marks CANCELLED as terminal', () => {
    expect(isTerminalBookingStatus('CANCELLED')).toBe(true);
  });

  it('marks EXPIRED as terminal', () => {
    expect(isTerminalBookingStatus('EXPIRED')).toBe(true);
  });

  it('marks CONVERTED_TO_ORDER as terminal', () => {
    expect(isTerminalBookingStatus('CONVERTED_TO_ORDER')).toBe(true);
  });

  it('marks PENDING_REVIEW as non-terminal', () => {
    expect(isTerminalBookingStatus('PENDING_REVIEW')).toBe(false);
  });

  it('marks CONFIRMED as non-terminal', () => {
    expect(isTerminalBookingStatus('CONFIRMED')).toBe(false);
  });
});

describe('computeAvailable', () => {
  it('returns quantity minus reservedQty', () => {
    expect(computeAvailable({ quantity: 10, reservedQty: 3 })).toBe(7);
  });

  it('returns 0 when fully reserved', () => {
    expect(computeAvailable({ quantity: 5, reservedQty: 5 })).toBe(0);
  });

  it('clamps to 0 when reservedQty exceeds quantity (data corruption defense)', () => {
    expect(computeAvailable({ quantity: 5, reservedQty: 8 })).toBe(0);
  });

  it('returns quantity when reservedQty is 0', () => {
    expect(computeAvailable({ quantity: 12, reservedQty: 0 })).toBe(12);
  });
});

describe('hasSufficientStock', () => {
  it('returns true when available >= requested', () => {
    expect(hasSufficientStock({ quantity: 10, reservedQty: 3 }, 5)).toBe(true);
    expect(hasSufficientStock({ quantity: 10, reservedQty: 3 }, 7)).toBe(true);
  });

  it('returns false when requested > available', () => {
    expect(hasSufficientStock({ quantity: 10, reservedQty: 3 }, 8)).toBe(false);
  });

  it('returns false when requested equals 0', () => {
    expect(hasSufficientStock({ quantity: 10, reservedQty: 3 }, 0)).toBe(false);
  });

  it('returns false when requested is negative', () => {
    expect(hasSufficientStock({ quantity: 10, reservedQty: 3 }, -1)).toBe(false);
  });

  it('returns false when fully reserved', () => {
    expect(hasSufficientStock({ quantity: 5, reservedQty: 5 }, 1)).toBe(false);
  });
});

describe('isAlreadyConfirmedIdempotent', () => {
  const matchingReservation: ActiveReservationSnapshot = Object.freeze({
    id: 'res_1',
    variantId: 'var_1',
    quantity: 5,
    bookingId: 'book_1',
    releasedAt: null,
  });
  const oneLookup: ActiveReservationLookup = Object.freeze({
    kind: 'one' as const,
    reservation: matchingReservation,
  });
  const noneLookup: ActiveReservationLookup = Object.freeze({ kind: 'none' as const });
  const multipleLookup: ActiveReservationLookup = Object.freeze({
    kind: 'multiple' as const,
    count: 2,
  });

  it('CONFIRMED + kind=one with matching quantity → idempotent success', () => {
    const decision = isAlreadyConfirmedIdempotent('CONFIRMED', oneLookup, 5);
    expect(decision.idempotent).toBe(true);
    expect(decision.integrityError).toBe(false);
  });

  it('CONFIRMED + kind=none → integrity error', () => {
    const decision = isAlreadyConfirmedIdempotent('CONFIRMED', noneLookup, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });

  it('CONFIRMED + kind=multiple → integrity error (never silent-pick first)', () => {
    const decision = isAlreadyConfirmedIdempotent('CONFIRMED', multipleLookup, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });

  it('CONFIRMED + kind=one with mismatched quantity → integrity error', () => {
    const mismatched: ActiveReservationLookup = {
      kind: 'one',
      reservation: { ...matchingReservation, quantity: 3 },
    };
    const decision = isAlreadyConfirmedIdempotent('CONFIRMED', mismatched, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });

  it('PENDING_REVIEW + kind=one → not idempotent (caller proceeds with normal confirm)', () => {
    const decision = isAlreadyConfirmedIdempotent('PENDING_REVIEW', oneLookup, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(false);
  });

  it('PENDING_REVIEW + kind=none → not idempotent, no integrity error', () => {
    const decision = isAlreadyConfirmedIdempotent('PENDING_REVIEW', noneLookup, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(false);
  });

  it('CANCELLED → not idempotent, not integrity error (caller decides)', () => {
    const decision = isAlreadyConfirmedIdempotent('CANCELLED', noneLookup, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(false);
  });
});

describe('preflightConfirm', () => {
  it('PENDING_REVIEW → null (allowed)', () => {
    expect(preflightConfirm('PENDING_REVIEW')).toBe(null);
  });

  it('CONFIRMED → null (caller delegates to idempotency check)', () => {
    expect(preflightConfirm('CONFIRMED')).toBe(null);
  });

  it('CANCELLED → BOOKING_INVALID_STATUS', () => {
    expect(preflightConfirm('CANCELLED')).toBe('BOOKING_INVALID_STATUS');
  });

  it('EXPIRED → BOOKING_INVALID_STATUS', () => {
    expect(preflightConfirm('EXPIRED')).toBe('BOOKING_INVALID_STATUS');
  });

  it('CONVERTED_TO_ORDER → BOOKING_INVALID_STATUS', () => {
    expect(preflightConfirm('CONVERTED_TO_ORDER')).toBe('BOOKING_INVALID_STATUS');
  });
});

describe('preflightCancel', () => {
  it('PENDING_REVIEW → CANCELLED: no stock, no error, no noop', () => {
    const d = preflightCancel('PENDING_REVIEW', 'CANCELLED');
    expect(d.errorCode).toBe(null);
    expect(d.noop).toBe(false);
    expect(d.mustReleaseStock).toBe(false);
  });

  it('PENDING_REVIEW → EXPIRED: no stock, no error, no noop', () => {
    const d = preflightCancel('PENDING_REVIEW', 'EXPIRED');
    expect(d.errorCode).toBe(null);
    expect(d.mustReleaseStock).toBe(false);
  });

  it('CONFIRMED → CANCELLED: must release stock', () => {
    const d = preflightCancel('CONFIRMED', 'CANCELLED');
    expect(d.errorCode).toBe(null);
    expect(d.noop).toBe(false);
    expect(d.mustReleaseStock).toBe(true);
  });

  it('CONFIRMED → EXPIRED: must release stock', () => {
    const d = preflightCancel('CONFIRMED', 'EXPIRED');
    expect(d.errorCode).toBe(null);
    expect(d.mustReleaseStock).toBe(true);
  });

  it('already CANCELLED → CANCELLED: noop', () => {
    const d = preflightCancel('CANCELLED', 'CANCELLED');
    expect(d.errorCode).toBe(null);
    expect(d.noop).toBe(true);
    expect(d.mustReleaseStock).toBe(false);
  });

  it('already EXPIRED → EXPIRED: noop', () => {
    const d = preflightCancel('EXPIRED', 'EXPIRED');
    expect(d.noop).toBe(true);
  });

  it('CANCELLED → EXPIRED: BOOKING_INVALID_STATUS (cross-terminal flip)', () => {
    const d = preflightCancel('CANCELLED', 'EXPIRED');
    expect(d.errorCode).toBe('BOOKING_INVALID_STATUS');
  });

  it('EXPIRED → CANCELLED: BOOKING_INVALID_STATUS (cross-terminal flip)', () => {
    const d = preflightCancel('EXPIRED', 'CANCELLED');
    expect(d.errorCode).toBe('BOOKING_INVALID_STATUS');
  });

  it('CONVERTED_TO_ORDER → CANCELLED: BOOKING_INVALID_STATUS (use order flow)', () => {
    const d = preflightCancel('CONVERTED_TO_ORDER', 'CANCELLED');
    expect(d.errorCode).toBe('BOOKING_INVALID_STATUS');
  });
});

describe('resolveActiveReservation', () => {
  const r1: ActiveReservationSnapshot = Object.freeze({
    id: 'res_1',
    variantId: 'var_1',
    quantity: 5,
    bookingId: 'book_a',
    releasedAt: null,
  });
  const r1b: ActiveReservationSnapshot = Object.freeze({
    id: 'res_1b',
    variantId: 'var_1',
    quantity: 5,
    bookingId: 'book_a',
    releasedAt: null,
  });
  const r2Released: ActiveReservationSnapshot = Object.freeze({
    id: 'res_2',
    variantId: 'var_1',
    quantity: 3,
    bookingId: 'book_a',
    releasedAt: new Date('2026-01-01T00:00:00Z'),
  });
  const r3Other: ActiveReservationSnapshot = Object.freeze({
    id: 'res_3',
    variantId: 'var_1',
    quantity: 2,
    bookingId: 'book_b',
    releasedAt: null,
  });
  const orderSide: ActiveReservationSnapshot = Object.freeze({
    id: 'res_order',
    variantId: 'var_1',
    quantity: 4,
    bookingId: null,
    releasedAt: null,
  });

  it('returns kind=one when exactly one active matches bookingId', () => {
    const lookup = resolveActiveReservation([r1, r2Released, r3Other], 'book_a');
    expect(lookup.kind).toBe('one');
    if (lookup.kind === 'one') {
      expect(lookup.reservation).toEqual(r1);
    }
  });

  it('returns kind=none when no active matches', () => {
    const lookup = resolveActiveReservation([r2Released, r3Other], 'book_a');
    expect(lookup).toEqual({ kind: 'none' });
  });

  it('returns kind=multiple when 2+ active match same bookingId', () => {
    const lookup = resolveActiveReservation([r1, r1b], 'book_a');
    expect(lookup.kind).toBe('multiple');
    if (lookup.kind === 'multiple') {
      expect(lookup.count).toBe(2);
    }
  });

  it('returns kind=multiple with accurate count for 3 active matches', () => {
    const r1c: ActiveReservationSnapshot = { ...r1, id: 'res_1c' };
    const lookup = resolveActiveReservation([r1, r1b, r1c], 'book_a');
    expect(lookup.kind).toBe('multiple');
    if (lookup.kind === 'multiple') {
      expect(lookup.count).toBe(3);
    }
  });

  it('skips released reservations when counting', () => {
    const lookup = resolveActiveReservation([r1, r2Released], 'book_a');
    expect(lookup.kind).toBe('one');
  });

  it('skips reservations with different bookingId', () => {
    const lookup = resolveActiveReservation([r3Other], 'book_a');
    expect(lookup).toEqual({ kind: 'none' });
  });

  it('skips reservations with null bookingId (order-side reservations)', () => {
    const lookup = resolveActiveReservation([orderSide], 'book_a');
    expect(lookup).toEqual({ kind: 'none' });
  });

  it('returns kind=none on empty list', () => {
    const lookup = resolveActiveReservation([], 'book_a');
    expect(lookup).toEqual({ kind: 'none' });
  });

  it('treats order-side + booking-side mix as one when only one booking-side active', () => {
    const lookup = resolveActiveReservation([orderSide, r1], 'book_a');
    expect(lookup.kind).toBe('one');
  });
});
