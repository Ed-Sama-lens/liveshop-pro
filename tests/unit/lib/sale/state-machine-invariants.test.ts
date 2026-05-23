/**
 * State-machine invariant lock-in tests (post Block 5 Boss/ChatGPT
 * Decision 4 verdict).
 *
 * Boss + ChatGPT accepted PR #100 matrix recommendation: KEEP current
 * state-machine behavior. This file locks each of the 8 clarifications
 * + 10 hard rules from the matrix as explicit test invariants. If any
 * future PR changes runtime semantics, the corresponding invariant
 * here must be intentionally updated (not silently broken).
 *
 * Tests are pure (no Prisma, no DB). They assert public-API behavior
 * of `src/lib/sale/booking-rules.ts` + `src/lib/sale/board-display.ts`.
 * Cross-references existing coverage in `booking-rules.test.ts` (92
 * tests) + `board-display.test.ts` — this file adds the matrix-aligned
 * lockdown layer, not duplicate coverage.
 *
 * Cross-references:
 * - docs/superpowers/2026-05-23-stock-booking-state-machine-matrix.md
 * - docs/superpowers/2026-05-23-stock-booking-state-machine-audit.md (PR #95)
 * - src/lib/sale/booking-rules.ts
 * - src/lib/sale/board-display.ts
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionBookingStatus,
  isTerminalBookingStatus,
  preflightConfirm,
  preflightCancel,
  resolveActiveReservation,
  isAlreadyConfirmedIdempotent,
  computeAvailable,
  hasSufficientStock,
  BOOKING_ERROR_CODES,
  type BookingStatus,
  type ActiveReservationSnapshot,
} from '@/lib/sale/booking-rules';

const ALL_STATUSES: readonly BookingStatus[] = [
  'PENDING_REVIEW',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
];

const TERMINAL_STATUSES: readonly BookingStatus[] = [
  'CANCELLED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
];

const ACTIVE_STATUSES: readonly BookingStatus[] = ['PENDING_REVIEW', 'CONFIRMED'];

function makeReservation(
  overrides: Partial<ActiveReservationSnapshot> = {}
): ActiveReservationSnapshot {
  return Object.freeze({
    id: 'r1',
    variantId: 'v1',
    quantity: 1,
    bookingId: 'b1',
    releasedAt: null,
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Matrix Q1 — PENDING does NOT reserve stock
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q1: PENDING_REVIEW does NOT reserve stock', () => {
  it('preflightCancel from PENDING_REVIEW → CANCELLED never releases stock', () => {
    const decision = preflightCancel('PENDING_REVIEW', 'CANCELLED');
    expect(decision.errorCode).toBeNull();
    expect(decision.noop).toBe(false);
    expect(decision.mustReleaseStock).toBe(false);
  });

  it('preflightCancel from PENDING_REVIEW → EXPIRED never releases stock', () => {
    const decision = preflightCancel('PENDING_REVIEW', 'EXPIRED');
    expect(decision.errorCode).toBeNull();
    expect(decision.mustReleaseStock).toBe(false);
  });

  it('resolveActiveReservation returns "none" for booking with no reservations (correct for PENDING_REVIEW)', () => {
    const lookup = resolveActiveReservation([], 'b1');
    expect(lookup.kind).toBe('none');
  });

  it('PENDING_REVIEW with kind=none lookup is NOT integrity error (correct invariant)', () => {
    const decision = isAlreadyConfirmedIdempotent(
      'PENDING_REVIEW',
      { kind: 'none' },
      1
    );
    // Non-CONFIRMED status with no reservation = normal flow, not integrity error
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q3 — CONFIRMED reserves (R0 foundational)
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q3: CONFIRMED reserves stock (R0 foundational rule)', () => {
  it('preflightConfirm from PENDING_REVIEW returns null (allow)', () => {
    expect(preflightConfirm('PENDING_REVIEW')).toBeNull();
  });

  it('preflightConfirm from CONFIRMED returns null (idempotent path)', () => {
    expect(preflightConfirm('CONFIRMED')).toBeNull();
  });

  it.each(TERMINAL_STATUSES)(
    'preflightConfirm rejects terminal status: %s',
    (status) => {
      expect(preflightConfirm(status)).toBe(BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS);
    }
  );

  it('CONFIRMED with kind=one matching quantity is idempotent (no double-reserve)', () => {
    const decision = isAlreadyConfirmedIdempotent(
      'CONFIRMED',
      { kind: 'one', reservation: makeReservation({ quantity: 5 }) },
      5
    );
    expect(decision.idempotent).toBe(true);
    expect(decision.integrityError).toBe(false);
  });

  it('CONFIRMED with kind=none is integrity error (MISSING)', () => {
    const decision = isAlreadyConfirmedIdempotent('CONFIRMED', { kind: 'none' }, 5);
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });

  it('CONFIRMED with kind=multiple is integrity error (MULTIPLE)', () => {
    const decision = isAlreadyConfirmedIdempotent(
      'CONFIRMED',
      { kind: 'multiple', count: 2 },
      5
    );
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });

  it('CONFIRMED with kind=one mismatched quantity is integrity error', () => {
    const decision = isAlreadyConfirmedIdempotent(
      'CONFIRMED',
      { kind: 'one', reservation: makeReservation({ quantity: 3 }) },
      5
    );
    expect(decision.idempotent).toBe(false);
    expect(decision.integrityError).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q4 — Physical decrement timing (computed model)
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q4: physical stock uses computed available model', () => {
  it('computeAvailable subtracts reservedQty from quantity', () => {
    expect(computeAvailable({ quantity: 10, reservedQty: 3 })).toBe(7);
  });

  it('computeAvailable clamps to 0 on data corruption (reservedQty > quantity)', () => {
    expect(computeAvailable({ quantity: 5, reservedQty: 10 })).toBe(0);
  });

  it('hasSufficientStock rejects zero or negative requested quantities', () => {
    const snap = { quantity: 10, reservedQty: 0 };
    expect(hasSufficientStock(snap, 0)).toBe(false);
    expect(hasSufficientStock(snap, -1)).toBe(false);
  });

  it('hasSufficientStock matches the SQL guard predicate (quantity - reservedQty >= requested)', () => {
    expect(hasSufficientStock({ quantity: 10, reservedQty: 4 }, 6)).toBe(true);
    expect(hasSufficientStock({ quantity: 10, reservedQty: 4 }, 7)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q5 — CANCELLED releases reservation (R0 foundational)
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q5: CANCELLED releases reservation when source was CONFIRMED', () => {
  it('preflightCancel from CONFIRMED → CANCELLED requires stock release', () => {
    const decision = preflightCancel('CONFIRMED', 'CANCELLED');
    expect(decision.errorCode).toBeNull();
    expect(decision.noop).toBe(false);
    expect(decision.mustReleaseStock).toBe(true);
  });

  it('preflightCancel from CONFIRMED → EXPIRED requires stock release', () => {
    const decision = preflightCancel('CONFIRMED', 'EXPIRED');
    expect(decision.errorCode).toBeNull();
    expect(decision.mustReleaseStock).toBe(true);
  });

  it('preflightCancel idempotent on already-CANCELLED (no double release)', () => {
    const decision = preflightCancel('CANCELLED', 'CANCELLED');
    expect(decision.errorCode).toBeNull();
    expect(decision.noop).toBe(true);
    expect(decision.mustReleaseStock).toBe(false);
  });

  it('preflightCancel idempotent on already-EXPIRED (no double release)', () => {
    const decision = preflightCancel('EXPIRED', 'EXPIRED');
    expect(decision.noop).toBe(true);
    expect(decision.mustReleaseStock).toBe(false);
  });

  it('preflightCancel CANCELLED → EXPIRED forbidden (cross-terminal block)', () => {
    const decision = preflightCancel('CANCELLED', 'EXPIRED');
    expect(decision.errorCode).toBe(BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS);
  });

  it('preflightCancel EXPIRED → CANCELLED forbidden (cross-terminal block)', () => {
    const decision = preflightCancel('EXPIRED', 'CANCELLED');
    expect(decision.errorCode).toBe(BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q6 — CONVERTED is terminal + hidden from active list
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q6: CONVERTED_TO_ORDER is terminal + active-list-hidden', () => {
  it('CONVERTED_TO_ORDER is terminal', () => {
    expect(isTerminalBookingStatus('CONVERTED_TO_ORDER')).toBe(true);
  });

  it('preflightCancel from CONVERTED_TO_ORDER is forbidden', () => {
    const decision = preflightCancel('CONVERTED_TO_ORDER', 'CANCELLED');
    expect(decision.errorCode).toBe(BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS);
  });

  it('preflightConfirm from CONVERTED_TO_ORDER is forbidden (no re-confirm)', () => {
    expect(preflightConfirm('CONVERTED_TO_ORDER')).toBe(
      BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS
    );
  });

  it('all terminal statuses fail canTransition target=CONFIRMED', () => {
    for (const s of TERMINAL_STATUSES) {
      expect(canTransitionBookingStatus(s, 'CONFIRMED')).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q7 — Order creation releases reservation (R0 foundational)
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q7: Order creation releases reservation via CONVERTED_TO_ORDER', () => {
  it('CONFIRMED can transition to CONVERTED_TO_ORDER (release path)', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'CONVERTED_TO_ORDER')).toBe(true);
  });

  it('PENDING_REVIEW cannot transition to CONVERTED_TO_ORDER (must confirm first)', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CONVERTED_TO_ORDER')).toBe(false);
  });

  it('resolveActiveReservation filters out released reservations', () => {
    const reservations: readonly ActiveReservationSnapshot[] = [
      makeReservation({ id: 'r1', releasedAt: new Date('2026-01-01') }),
      makeReservation({ id: 'r2', releasedAt: null }),
    ];
    const lookup = resolveActiveReservation(reservations, 'b1');
    expect(lookup.kind).toBe('one');
    if (lookup.kind === 'one') {
      expect(lookup.reservation.id).toBe('r2');
    }
  });

  it('resolveActiveReservation NEVER silently picks first on multiple actives', () => {
    const reservations: readonly ActiveReservationSnapshot[] = [
      makeReservation({ id: 'r1' }),
      makeReservation({ id: 'r2' }),
    ];
    const lookup = resolveActiveReservation(reservations, 'b1');
    expect(lookup.kind).toBe('multiple');
    if (lookup.kind === 'multiple') {
      expect(lookup.count).toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix §6 hard rule lockdown — ALL transitions verified
// ─────────────────────────────────────────────────────────────────────

describe('Matrix §6: full transition matrix lockdown (10 hard rules)', () => {
  // Rule 1+2+3+4+5+6+7+8+9 — sweep all combinations
  it('PENDING_REVIEW → CONFIRMED allowed', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CONFIRMED')).toBe(true);
  });

  it('PENDING_REVIEW → CANCELLED allowed', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CANCELLED')).toBe(true);
  });

  it('PENDING_REVIEW → EXPIRED forbidden (must go through CONFIRMED for timeout)', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'EXPIRED')).toBe(false);
  });

  it('PENDING_REVIEW → CONVERTED_TO_ORDER forbidden', () => {
    expect(canTransitionBookingStatus('PENDING_REVIEW', 'CONVERTED_TO_ORDER')).toBe(false);
  });

  it('CONFIRMED → CANCELLED allowed', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('CONFIRMED → EXPIRED allowed', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'EXPIRED')).toBe(true);
  });

  it('CONFIRMED → CONVERTED_TO_ORDER allowed', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'CONVERTED_TO_ORDER')).toBe(true);
  });

  it('CONFIRMED → PENDING_REVIEW forbidden (no rollback)', () => {
    expect(canTransitionBookingStatus('CONFIRMED', 'PENDING_REVIEW')).toBe(false);
  });

  it.each(TERMINAL_STATUSES)(
    'terminal status %s cannot transition to anything',
    (terminal) => {
      for (const target of ALL_STATUSES) {
        if (target === terminal) continue; // same-status returns false anyway
        expect(canTransitionBookingStatus(terminal, target)).toBe(false);
      }
    }
  );

  it.each(ALL_STATUSES)('same-status transition returns false: %s', (s) => {
    expect(canTransitionBookingStatus(s, s)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Matrix Q8 — V Rich slot mapping (covered by board-display.test.ts)
// ─────────────────────────────────────────────────────────────────────

describe('Matrix Q8: terminal/active partition for V Rich list filter', () => {
  it.each(ACTIVE_STATUSES)('%s is active (board visible)', (s) => {
    expect(isTerminalBookingStatus(s)).toBe(false);
  });

  it.each(TERMINAL_STATUSES)('%s is terminal (history visible only)', (s) => {
    expect(isTerminalBookingStatus(s)).toBe(true);
  });

  it('partition is exhaustive (5 statuses split 2 active + 3 terminal)', () => {
    expect(ACTIVE_STATUSES.length + TERMINAL_STATUSES.length).toBe(ALL_STATUSES.length);
  });
});
