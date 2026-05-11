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

/**
 * Pure: is a booking eligible for selection toward Create Order
 * (Commit 2O-c1)?
 *
 * Eligibility rules (per design doc 2026-05-11-sale-create-order-from-
 * bookings-design.md §2 + Boss 2O-c1 verdict):
 * - status must be CONFIRMED. PENDING_REVIEW / CANCELLED / EXPIRED /
 *   CONVERTED_TO_ORDER all blocked.
 * - reservationIntegrity must be OK / NOT_APPLICABLE / undefined.
 *   MISSING / MULTIPLE rows block — same reasoning as Cancel: a
 *   conversion transfers the active reservation to orderId. If
 *   integrity is broken at this booking, the conversion would propagate
 *   the error or leave dangling reservations.
 *
 * Note: this helper deliberately does NOT enforce the
 * customer/session lock. The locking is a UI-level concern handled by
 * `isBookingSelectableInContext` below.
 */
export function isBookingSelectable(
  b: BookingConfirmEligibilityInput
): boolean {
  if (b.status !== 'CONFIRMED') return false;
  const integrity = b.reservationIntegrity;
  if (integrity === 'MISSING' || integrity === 'MULTIPLE') return false;
  return true;
}

/**
 * Selection lock context — once admin selects the first booking, the
 * UI locks subsequent eligibility to bookings that share the same
 * customer + live session. This matches the server contract:
 * convertToOrder accepts (shopId, liveSessionId, customerId, bookingIds)
 * and processes only one customer × session × shop at a time.
 *
 * `null` value means no selection yet — all eligible bookings are
 * selectable. A non-null value narrows eligibility to matching rows.
 */
export interface SelectionLockContext {
  readonly customerId: string;
  readonly liveSessionId: string;
}

/**
 * Input row shape for the in-context selectability check. Wider than
 * BookingConfirmEligibilityInput because the lock requires customer +
 * session ids. Callers should pass real `SaleBookingRow` values.
 */
export interface BookingSelectionRowInput
  extends BookingConfirmEligibilityInput {
  readonly customerId: string;
  readonly liveSessionId: string;
}

/**
 * Pure: is a booking eligible to be selected/unselected given the
 * current lock context?
 *
 * - When `lock` is null: same as `isBookingSelectable(row)`.
 * - When `lock` is set: row must also match `lock.customerId` and
 *   `lock.liveSessionId`. Out-of-context rows return false even when
 *   their status + integrity would otherwise allow selection.
 *
 * The lock is established when admin selects the first row; the UI is
 * expected to clear the lock when the selection size returns to zero.
 */
export function isBookingSelectableInContext(
  row: BookingSelectionRowInput,
  lock: SelectionLockContext | null
): boolean {
  if (!isBookingSelectable(row)) return false;
  if (lock === null) return true;
  if (row.customerId !== lock.customerId) return false;
  if (row.liveSessionId !== lock.liveSessionId) return false;
  return true;
}

/**
 * Pure: derive the lock context from a non-empty selected-row list.
 * Returns null when the list is empty.
 *
 * Throws if rows disagree on customerId or liveSessionId — this should
 * never happen if the UI correctly gates via `isBookingSelectableInContext`.
 * The throw is a defensive backstop for future refactors that might
 * accidentally bypass the lock check.
 */
export function deriveSelectionLock(
  rows: readonly BookingSelectionRowInput[]
): SelectionLockContext | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  for (const r of rows) {
    if (r.customerId !== first.customerId) {
      throw new Error(
        'deriveSelectionLock: selected rows have mismatched customerId — UI lock bypassed'
      );
    }
    if (r.liveSessionId !== first.liveSessionId) {
      throw new Error(
        'deriveSelectionLock: selected rows have mismatched liveSessionId — UI lock bypassed'
      );
    }
  }
  return { customerId: first.customerId, liveSessionId: first.liveSessionId };
}
