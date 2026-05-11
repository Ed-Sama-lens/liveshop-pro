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
  type BookingConfirmEligibilityInput,
  type SaleBookingLifecycleStatus,
  type SaleReservationIntegrityLabel,
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
  describe('CONFIRMED eligibility', () => {
    it('OK integrity → cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'OK'))).toBe(true);
    });

    it('NOT_APPLICABLE integrity → cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'NOT_APPLICABLE'))).toBe(true);
    });

    it('undefined integrity (pre-2T API) → cancellable (graceful degradation)', () => {
      expect(isBookingCancellable(row('CONFIRMED'))).toBe(true);
    });

    it('MISSING integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'MISSING'))).toBe(false);
    });

    it('MULTIPLE integrity → NOT cancellable', () => {
      expect(isBookingCancellable(row('CONFIRMED', 'MULTIPLE'))).toBe(false);
    });
  });

  describe('non-CONFIRMED statuses are never cancellable (per 2O-b spec)', () => {
    const nonEligibleStatuses: ReadonlyArray<SaleBookingLifecycleStatus> = [
      'PENDING_REVIEW',
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

  describe('full lifecycle × integrity matrix (Boss 2O-b test plan)', () => {
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

    it('only CONFIRMED × {OK, NOT_APPLICABLE, undefined} returns true', () => {
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
      // CONFIRMED × 3 allowed integrity labels = 3 true cases
      expect(trueCases).toHaveLength(3);
      for (const r of trueCases) {
        expect(r.status).toBe('CONFIRMED');
        expect(['OK', 'NOT_APPLICABLE', 'undefined']).toContain(r.integrity);
      }

      const falseCases = results.filter((r) => !r.allowed);
      // 5 statuses × 5 integrity = 25 total; minus 3 true = 22 false
      expect(falseCases).toHaveLength(22);
    });
  });
});

describe('confirmable/cancellable mutual exclusivity', () => {
  it('a single row is never both confirmable and cancellable', () => {
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
        const both = isBookingConfirmable(r) && isBookingCancellable(r);
        expect(both).toBe(false);
      }
    }
  });
});
