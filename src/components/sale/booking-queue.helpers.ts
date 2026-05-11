/**
 * Pure helpers for SaleBookingQueuePlaceholder — Commit 2O-a.1.
 *
 * Extracted from SaleBookingQueuePlaceholder.tsx so the eligibility
 * logic can be exercised by vitest without pulling the 'use client'
 * component module (which transitively imports React + shadcn UI +
 * lucide-react). Behavior is bit-identical to the inline version
 * shipped in Commit 2O-a — see TestPlan in
 * tests/unit/components/sale/booking-queue.helpers.test.ts.
 *
 * No DOM. No fetch. No React. Safe to import from anywhere.
 */

export type SaleReservationIntegrityLabel =
  | 'OK'
  | 'MISSING'
  | 'MULTIPLE'
  | 'NOT_APPLICABLE';

export type SaleBookingLifecycleStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONVERTED_TO_ORDER';

/**
 * Minimal shape required by isBookingConfirmable. The full
 * SaleBookingRow type in SaleBookingQueuePlaceholder.tsx is a
 * superset — callers can pass full rows directly.
 */
export interface BookingConfirmEligibilityInput {
  readonly status: SaleBookingLifecycleStatus;
  readonly reservationIntegrity?: SaleReservationIntegrityLabel;
}

/**
 * Pure: is a booking eligible for the Confirm action (Commit 2O-a)?
 *
 * Eligibility rules (per Boss 2O-a allowed-scope checklist):
 * - status must be PENDING_REVIEW (no re-confirm of CONFIRMED;
 *   /api/sale/bookings/[id]/confirm is idempotent but UI does not
 *   expose the no-op path).
 * - reservationIntegrity must be OK or NOT_APPLICABLE when present.
 *   MISSING / MULTIPLE rows block — admin must inspect data corruption
 *   via internal tooling before any mutation.
 * - When the field is undefined (pre-2T API response), allow Confirm
 *   on PENDING_REVIEW to preserve degraded-but-functional behavior.
 */
export function isBookingConfirmable(
  b: BookingConfirmEligibilityInput
): boolean {
  if (b.status !== 'PENDING_REVIEW') return false;
  const integrity = b.reservationIntegrity;
  if (integrity === 'MISSING' || integrity === 'MULTIPLE') return false;
  return true;
}

/**
 * Pure: is a booking eligible for the Cancel action (Commit 2O-b)?
 *
 * Eligibility rules (per Boss 2O-b allowed-scope verdict):
 * - status must be CONFIRMED. PENDING_REVIEW cancel/reject is
 *   intentionally NOT exposed in 2O-b. CANCELLED/EXPIRED/
 *   CONVERTED_TO_ORDER are terminal.
 * - reservationIntegrity must be OK or NOT_APPLICABLE when present.
 *   MISSING/MULTIPLE rows block — admin must inspect data corruption
 *   via internal tooling before releasing stock to avoid amplifying
 *   the integrity error (cancel decrements reservedQty; doing this
 *   on a row with 0 or ≥2 active reservations risks negative
 *   reservedQty or only-partially-released stock).
 * - When the field is undefined (pre-2T API response), allow Cancel
 *   on CONFIRMED to preserve degraded-but-functional behavior.
 */
export function isBookingCancellable(
  b: BookingConfirmEligibilityInput
): boolean {
  if (b.status !== 'CONFIRMED') return false;
  const integrity = b.reservationIntegrity;
  if (integrity === 'MISSING' || integrity === 'MULTIPLE') return false;
  return true;
}
