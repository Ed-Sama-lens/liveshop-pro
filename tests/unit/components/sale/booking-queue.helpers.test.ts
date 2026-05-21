/**
 * Unit tests for isBookingConfirmable() — Commit 2O-a.1 test coverage.
 *
 * Pure-function coverage of the eligibility gate that controls whether
 * the Confirm button appears on a /sale booking queue row. Exercises
 * the full 5 × 4 lifecycle × integrity matrix per Boss test plan:
 *
 *   PENDING_REVIEW × {OK, NOT_APPLICABLE, undefined}  → true
 *   PENDING_REVIEW × {MISSING, MULTIPLE}              → false
 *   {CONFIRMED, CANCELLED, EXPIRED, CONVERTED_TO_ORDER} × any → false
 *
 * No DOM. No fetch. No React. Helper lives in
 * src/components/sale/booking-queue.helpers.ts so this test file
 * does not pull the 'use client' component module.
 */
import { describe, it, expect } from 'vitest';
import {
  isBookingConfirmable,
  isBookingCancellable,
  isBookingSelectable,
  isBookingSelectableInContext,
  deriveSelectionLock,
  type BookingConfirmEligibilityInput,
  type BookingSelectionRowInput,
  type SaleBookingLifecycleStatus,
  type SaleReservationIntegrityLabel,
  type SelectionLockContext,
} from '@/components/sale/booking-queue.helpers';

function row(
  status: SaleBookingLifecycleStatus,
  reservationIntegrity?: SaleReservationIntegrityLabel
): BookingConfirmEligibilityInput {
  return reservationIntegrity === undefined
    ? { status }
    : { status, reservationIntegrity };
}

describe('isBookingConfirmable()', () => {
  describe('PENDING_REVIEW eligibility', () => {
    it('OK integrity → confirmable', () => {
      expect(isBookingConfirmable(row('PENDING_REVIEW', 'OK'))).toBe(true);
    });

    it('NOT_APPLICABLE integrity → confirmable', () => {
      expect(isBookingConfirmable(row('PENDING_REVIEW', 'NOT_APPLICABLE'))).toBe(true);
    });

    it('undefined integrity (pre-2T API) → confirmable (graceful degradation)', () => {
      expect(isBookingConfirmable(row('PENDING_REVIEW'))).toBe(true);
    });

    it('MISSING integrity → NOT confirmable', () => {
      expect(isBookingConfirmable(row('PENDING_REVIEW', 'MISSING'))).toBe(false);
    });

    it('MULTIPLE integrity → NOT confirmable', () => {
      expect(isBookingConfirmable(row('PENDING_REVIEW', 'MULTIPLE'))).toBe(false);
    });
  });

  describe('non-PENDING_REVIEW statuses are never confirmable', () => {
    const nonEligibleStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const integrityLabels: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];

    for (const status of nonEligibleStatuses) {
      for (const integrity of integrityLabels) {
        const label = integrity ?? 'undefined';
        it(`${status} + integrity=${label} → NOT confirmable`, () => {
          expect(isBookingConfirmable(row(status, integrity))).toBe(false);
        });
      }
    }
  });

  describe('full lifecycle × integrity matrix (Boss test plan)', () => {
    const allStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const allIntegrity: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];

    it('only PENDING_REVIEW × {OK, NOT_APPLICABLE, undefined} returns true', () => {
      const results: Array<{ status: string; integrity: string; allowed: boolean }> = [];
      for (const status of allStatuses) {
        for (const integrity of allIntegrity) {
          results.push({
            status,
            integrity: integrity ?? 'undefined',
            allowed: isBookingConfirmable(row(status, integrity)),
          });
        }
      }

      const trueCases = results.filter((r) => r.allowed);
      // PENDING_REVIEW × 3 allowed integrity labels = 3 true cases
      expect(trueCases).toHaveLength(3);
      for (const r of trueCases) {
        expect(r.status).toBe('PENDING_REVIEW');
        expect(['OK', 'NOT_APPLICABLE', 'undefined']).toContain(r.integrity);
      }

      const falseCases = results.filter((r) => !r.allowed);
      // 5 statuses × 5 integrity = 25 total; minus 3 true = 22 false
      expect(falseCases).toHaveLength(22);
    });
  });
});

describe('isBookingCancellable()', () => {
  // Tier 3.9-B-Fix-4 (2026-05-21) — PENDING_REVIEW added to cancellable
  // set. Admin can drop a draft booking before confirm. Previous
  // expectation (CONFIRMED-only) updated below.
  describe('CONFIRMED eligibility', () => {
    it('OK integrity → cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'OK'))).toBe(true);
    });

    it('NOT_APPLICABLE integrity → cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'NOT_APPLICABLE'))).toBe(true);
    });

    it('undefined integrity → cancellable (graceful degradation)', () => {
      expect(isBookingCancellable(row('CONFIRMED'))).toBe(true);
    });

    it('MISSING integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'MISSING'))).toBe(false);
    });

    it('MULTIPLE integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'MULTIPLE'))).toBe(false);
    });
  });

  describe('PENDING_REVIEW eligibility (Tier 3.9-B-Fix-4)', () => {
    it('OK integrity → cancellable', () => {
      expect(isBookingCancellable(row('PENDING_REVIEW', 'OK'))).toBe(true);
    });

    it('NOT_APPLICABLE integrity → cancellable', () => {
      expect(isBookingCancellable(row('PENDING_REVIEW', 'NOT_APPLICABLE'))).toBe(true);
    });

    it('undefined integrity → cancellable', () => {
      expect(isBookingCancellable(row('PENDING_REVIEW'))).toBe(true);
    });

    it('MISSING integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('PENDING_REVIEW', 'MISSING'))).toBe(false);
    });

    it('MULTIPLE integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('PENDING_REVIEW', 'MULTIPLE'))).toBe(false);
    });
  });

  describe('terminal statuses are never cancellable', () => {
    const nonEligibleStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const integrityLabels: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];

    for (const status of nonEligibleStatuses) {
      for (const integrity of integrityLabels) {
        const label = integrity ?? 'undefined';
        it(`${status} + integrity=${label} → NOT cancellable`, () => {
          expect(isBookingCancellable(row(status, integrity))).toBe(false);
        });
      }
    }
  });

  describe('full lifecycle × integrity matrix (Tier 3.9-B-Fix-4 plan)', () => {
    const allStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const allIntegrity: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];

    it('only {PENDING_REVIEW, CONFIRMED} × {OK, NOT_APPLICABLE, undefined} returns true', () => {
      const results: Array<{ status: string; integrity: string; allowed: boolean }> = [];
      for (const status of allStatuses) {
        for (const integrity of allIntegrity) {
          results.push({
            status,
            integrity: integrity ?? 'undefined',
            allowed: isBookingCancellable(row(status, integrity)),
          });
        }
      }

      const trueCases = results.filter((r) => r.allowed);
      // 2 cancellable statuses × 3 allowed integrity labels = 6 true cases
      expect(trueCases).toHaveLength(6);
      for (const r of trueCases) {
        expect(['PENDING_REVIEW', 'CONFIRMED']).toContain(r.status);
        expect(['OK', 'NOT_APPLICABLE', 'undefined']).toContain(r.integrity);
      }

      const falseCases = results.filter((r) => !r.allowed);
      // 5 statuses × 5 integrity = 25 total; minus 6 true = 19 false
      expect(falseCases).toHaveLength(19);
    });
  });
});

describe('confirmable + cancellable interaction', () => {
  // Tier 3.9-B-Fix-4 (2026-05-21) — PENDING_REVIEW is now BOTH
  // confirmable AND cancellable. Admin picks one action; UI shows
  // both buttons. Previous mutual-exclusivity invariant retired.
  it('PENDING_REVIEW with OK integrity is both confirmable and cancellable', () => {
    const r = row('PENDING_REVIEW', 'OK');
    expect(isBookingConfirmable(r)).toBe(true);
    expect(isBookingCancellable(r)).toBe(true);
  });

  it('CONFIRMED is cancellable but not confirmable (already confirmed)', () => {
    const r = row('CONFIRMED', 'OK');
    expect(isBookingConfirmable(r)).toBe(false);
    expect(isBookingCancellable(r)).toBe(true);
  });

  it('terminal statuses are neither confirmable nor cancellable', () => {
    const terminal: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    for (const status of terminal) {
      const r = row(status, 'OK');
      expect(isBookingConfirmable(r)).toBe(false);
      expect(isBookingCancellable(r)).toBe(false);
    }
  });
});

describe('isBookingSelectable()', () => {
  describe('CONFIRMED eligibility (mirrors Cancel matrix per design Q2)', () => {
    it('OK integrity → selectable', () => {
      expect(isBookingSelectable(row('CONFIRMED', 'OK'))).toBe(true);
    });

    it('NOT_APPLICABLE integrity → selectable', () => {
      expect(isBookingSelectable(row('CONFIRMED', 'NOT_APPLICABLE'))).toBe(true);
    });

    it('undefined integrity → selectable (graceful degradation)', () => {
      expect(isBookingSelectable(row('CONFIRMED'))).toBe(true);
    });

    it('MISSING integrity → NOT selectable', () => {
      expect(isBookingSelectable(row('CONFIRMED', 'MISSING'))).toBe(false);
    });

    it('MULTIPLE integrity → NOT selectable', () => {
      expect(isBookingSelectable(row('CONFIRMED', 'MULTIPLE'))).toBe(false);
    });
  });

  describe('non-CONFIRMED statuses are never selectable', () => {
    const nonEligible: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const labels: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];
    for (const status of nonEligible) {
      for (const integrity of labels) {
        const lbl = integrity ?? 'undefined';
        it(`${status} + integrity=${lbl} → NOT selectable`, () => {
          expect(isBookingSelectable(row(status, integrity))).toBe(false);
        });
      }
    }
  });

  // Tier 3.9-B-Fix-4 — PENDING_REVIEW now cancellable but NOT
  // selectable. CONFIRMED is both. Assert selectable ⊆ cancellable.
  it('isBookingSelectable is a subset of isBookingCancellable (CONFIRMED rows only)', () => {
    const allStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const allIntegrity: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];
    for (const status of allStatuses) {
      for (const integrity of allIntegrity) {
        const r = row(status, integrity);
        if (isBookingSelectable(r)) {
          expect(isBookingCancellable(r)).toBe(true);
        }
      }
    }
  });
});

describe('isBookingSelectableInContext()', () => {
  function selectionRow(
    bookingId: string,
    status: SaleBookingLifecycleStatus,
    customerId: string,
    liveSessionId: string,
    integrity?: SaleReservationIntegrityLabel
  ): BookingSelectionRowInput {
    return integrity === undefined
      ? { status, customerId, liveSessionId }
      : { status, customerId, liveSessionId, reservationIntegrity: integrity };
  }

  it('null lock + eligible row → selectable', () => {
    const r = selectionRow('b1', 'CONFIRMED', 'cust-1', 'live-1', 'OK');
    expect(isBookingSelectableInContext(r, null)).toBe(true);
  });

  it('null lock + non-eligible row → NOT selectable', () => {
    const r = selectionRow('b1', 'CONFIRMED', 'cust-1', 'live-1', 'MISSING');
    expect(isBookingSelectableInContext(r, null)).toBe(false);
  });

  it('lock matching customer + session + eligible row → selectable', () => {
    const lock: SelectionLockContext = { customerId: 'cust-1', liveSessionId: 'live-1' };
    const r = selectionRow('b2', 'CONFIRMED', 'cust-1', 'live-1', 'OK');
    expect(isBookingSelectableInContext(r, lock)).toBe(true);
  });

  it('lock + different customer → NOT selectable', () => {
    const lock: SelectionLockContext = { customerId: 'cust-1', liveSessionId: 'live-1' };
    const r = selectionRow('b3', 'CONFIRMED', 'cust-OTHER', 'live-1', 'OK');
    expect(isBookingSelectableInContext(r, lock)).toBe(false);
  });

  it('lock + different session → NOT selectable', () => {
    const lock: SelectionLockContext = { customerId: 'cust-1', liveSessionId: 'live-1' };
    const r = selectionRow('b4', 'CONFIRMED', 'cust-1', 'live-OTHER', 'OK');
    expect(isBookingSelectableInContext(r, lock)).toBe(false);
  });

  it('lock + matching context + non-eligible status → still NOT selectable', () => {
    const lock: SelectionLockContext = { customerId: 'cust-1', liveSessionId: 'live-1' };
    const r = selectionRow('b5', 'PENDING_REVIEW', 'cust-1', 'live-1', 'OK');
    expect(isBookingSelectableInContext(r, lock)).toBe(false);
  });

  it('lock + matching context + integrity MULTIPLE → still NOT selectable', () => {
    const lock: SelectionLockContext = { customerId: 'cust-1', liveSessionId: 'live-1' };
    const r = selectionRow('b6', 'CONFIRMED', 'cust-1', 'live-1', 'MULTIPLE');
    expect(isBookingSelectableInContext(r, lock)).toBe(false);
  });
});

describe('deriveSelectionLock()', () => {
  function selectionRow(
    customerId: string,
    liveSessionId: string,
    status: SaleBookingLifecycleStatus = 'CONFIRMED'
  ): BookingSelectionRowInput {
    return { status, customerId, liveSessionId };
  }

  it('empty list → null', () => {
    expect(deriveSelectionLock([])).toBeNull();
  });

  it('single row → { customerId, liveSessionId }', () => {
    const lock = deriveSelectionLock([selectionRow('cust-1', 'live-1')]);
    expect(lock).toEqual({ customerId: 'cust-1', liveSessionId: 'live-1' });
  });

  it('multiple matching rows → same lock', () => {
    const lock = deriveSelectionLock([
      selectionRow('cust-1', 'live-1'),
      selectionRow('cust-1', 'live-1'),
      selectionRow('cust-1', 'live-1'),
    ]);
    expect(lock).toEqual({ customerId: 'cust-1', liveSessionId: 'live-1' });
  });

  it('mismatched customerId → throws (defensive backstop)', () => {
    expect(() =>
      deriveSelectionLock([
        selectionRow('cust-1', 'live-1'),
        selectionRow('cust-OTHER', 'live-1'),
      ])
    ).toThrow(/mismatched customerId/);
  });

  it('mismatched liveSessionId → throws (defensive backstop)', () => {
    expect(() =>
      deriveSelectionLock([
        selectionRow('cust-1', 'live-1'),
        selectionRow('cust-1', 'live-OTHER'),
      ])
    ).toThrow(/mismatched liveSessionId/);
  });
});

describe('confirmable + cancellable + selectable triple-exclusivity', () => {
  it('no row is BOTH confirmable AND selectable across full matrix', () => {
    const allStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ];
    const allIntegrity: ReadonlyArray<SaleReservationIntegrityLabel | undefined> = [
      'OK',
      'MISSING',
      'MULTIPLE',
      'NOT_APPLICABLE',
      undefined,
    ];
    for (const status of allStatuses) {
      for (const integrity of allIntegrity) {
        const r = row(status, integrity);
        // Confirm requires PENDING_REVIEW; Select requires CONFIRMED.
        // They are mutually exclusive by status alone.
        const both = isBookingConfirmable(r) && isBookingSelectable(r);
        expect(both).toBe(false);
      }
    }
  });

  // Tier 3.9-B-Fix-4 — Removed bidirectional cancellable===selectable
  // invariant. PENDING_REVIEW is cancellable (so admin can drop drafts)
  // but NOT selectable for Create Order (which requires CONFIRMED).
  it('PENDING_REVIEW with OK integrity is cancellable but not selectable', () => {
    const r = row('PENDING_REVIEW', 'OK');
    expect(isBookingCancellable(r)).toBe(true);
    expect(isBookingSelectable(r)).toBe(false);
  });

  it('CONFIRMED with OK integrity is both cancellable and selectable', () => {
    const r = row('CONFIRMED', 'OK');
    expect(isBookingCancellable(r)).toBe(true);
    expect(isBookingSelectable(r)).toBe(true);
  });
});
