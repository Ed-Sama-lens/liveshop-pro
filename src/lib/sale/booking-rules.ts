/**
 * Pure helpers for /sale booking domain.
 *
 * No Prisma. No DB. No I/O. Fully unit-testable.
 *
 * Used by `src/server/repositories/booking.repository.ts` for transaction-safe
 * booking confirm/cancel logic. Keep this module side-effect-free.
 *
 * Design ref: docs/superpowers/2026-05-09-sale-booking-runtime-design.md
 * Boss decisions ref: docs/superpowers/2026-04-06-sale-mvp-dissent.md
 */

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Booking lifecycle states. Mirror of Prisma enum `BookingStatus`.
 * Kept as string literal union to avoid coupling pure helpers to Prisma client.
 */
export type BookingStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONVERTED_TO_ORDER';

export type BookingTerminalStatus = Extract<
  BookingStatus,
  'CANCELLED' | 'EXPIRED' | 'CONVERTED_TO_ORDER'
>;

export type CancelTargetStatus = Extract<BookingStatus, 'CANCELLED' | 'EXPIRED'>;

export interface VariantStockSnapshot {
  readonly quantity: number;
  readonly reservedQty: number;
}

export interface ActiveReservationSnapshot {
  readonly id: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly bookingId: string | null;
  readonly releasedAt: Date | null;
}

export interface IdempotencyDecision {
  readonly idempotent: boolean;
  readonly integrityError: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Far-future sentinel for `StockReservation.expiresAt` on booking-side
 * reservations. Phase 1 has no auto-expire; admins control release manually.
 *
 * `expireReservations()` cron in stock.repository scans `expiresAt <= now`
 * which never matches this sentinel.
 *
 * TODO: revisit when shop-configurable hold policy or auto-expire lands.
 * Could become nullable expiresAt via separate schema migration.
 */
export const NO_EXPIRY_SENTINEL: Date = new Date('2099-12-31T23:59:59.000Z');

/**
 * Domain error codes raised by booking flow. Format matches existing
 * `AppError.code` conventions in `src/lib/errors`.
 */
export const BOOKING_ERROR_CODES = Object.freeze({
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_INVALID_STATUS: 'BOOKING_INVALID_STATUS',
  BROADCAST_PRODUCT_NOT_FOUND: 'BROADCAST_PRODUCT_NOT_FOUND',
  VARIANT_REQUIRED: 'VARIANT_REQUIRED',
  VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  RESERVATION_INTEGRITY_ERROR: 'RESERVATION_INTEGRITY_ERROR',
  RESERVATION_ALREADY_RELEASED: 'RESERVATION_ALREADY_RELEASED',
} as const);

export type BookingErrorCode =
  (typeof BOOKING_ERROR_CODES)[keyof typeof BOOKING_ERROR_CODES];

// ─── Status state machine ────────────────────────────────────────────────

/**
 * Allowed forward transitions per Boss decision §2 (dissent doc).
 *
 *   PENDING_REVIEW → CONFIRMED | CANCELLED
 *   CONFIRMED      → CANCELLED | EXPIRED | CONVERTED_TO_ORDER
 *   CANCELLED      → terminal
 *   EXPIRED        → terminal
 *   CONVERTED_TO_ORDER → terminal (order flow handles further)
 */
const ALLOWED_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> =
  Object.freeze({
    PENDING_REVIEW: Object.freeze(['CONFIRMED', 'CANCELLED']) as readonly BookingStatus[],
    CONFIRMED: Object.freeze([
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ]) as readonly BookingStatus[],
    CANCELLED: Object.freeze([]) as readonly BookingStatus[],
    EXPIRED: Object.freeze([]) as readonly BookingStatus[],
    CONVERTED_TO_ORDER: Object.freeze([]) as readonly BookingStatus[],
  });

const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'CANCELLED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
]);

/**
 * Pure check: is `to` reachable from `from` per booking lifecycle?
 *
 * Same-status transitions return `false` (use idempotency helper for that case).
 */
export function canTransitionBookingStatus(
  from: BookingStatus,
  to: BookingStatus
): boolean {
  if (from === to) return false;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Pure check: is the status terminal (no further transitions allowed)?
 */
export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ─── Stock math ──────────────────────────────────────────────────────────

/**
 * Pure math: available quantity = total minus already-reserved.
 *
 * Returns 0 if reservedQty exceeds quantity (data corruption — caller decides
 * how to surface).
 */
export function computeAvailable(snapshot: VariantStockSnapshot): number {
  const available = snapshot.quantity - snapshot.reservedQty;
  return available < 0 ? 0 : available;
}

/**
 * Pure check: would reserving `requested` units exceed available stock?
 *
 * Mirrors the predicate used in the atomic SQL guard:
 *   WHERE quantity - reservedQty >= requested
 */
export function hasSufficientStock(
  snapshot: VariantStockSnapshot,
  requested: number
): boolean {
  if (requested <= 0) return false;
  return computeAvailable(snapshot) >= requested;
}

// ─── Confirm idempotency decision ────────────────────────────────────────

/**
 * Pure decision for the confirm-booking flow when caller already sees
 * `status === 'CONFIRMED'`.
 *
 * - If an active reservation exists with matching quantity for this booking,
 *   the operation is idempotent (return success no-op).
 * - If no matching reservation exists, data is corrupt and caller MUST throw
 *   `RESERVATION_INTEGRITY_ERROR`.
 *
 * For non-CONFIRMED status, returns `{ idempotent: false, integrityError: false }`
 * (caller proceeds with normal flow).
 */
export function isAlreadyConfirmedIdempotent(
  status: BookingStatus,
  matchingActiveReservation: ActiveReservationSnapshot | null,
  expectedQuantity: number
): IdempotencyDecision {
  if (status !== 'CONFIRMED') {
    return Object.freeze({ idempotent: false, integrityError: false });
  }
  if (
    matchingActiveReservation !== null &&
    matchingActiveReservation.releasedAt === null &&
    matchingActiveReservation.quantity === expectedQuantity
  ) {
    return Object.freeze({ idempotent: true, integrityError: false });
  }
  return Object.freeze({ idempotent: false, integrityError: true });
}

// ─── Confirm preflight ───────────────────────────────────────────────────

/**
 * Pure validation: can a booking in this state be confirmed (transition to
 * CONFIRMED)?
 *
 * Returns the appropriate error code or null when transition is allowed.
 */
export function preflightConfirm(status: BookingStatus): BookingErrorCode | null {
  if (status === 'CONFIRMED') return null; // caller invokes idempotency path
  if (canTransitionBookingStatus(status, 'CONFIRMED')) return null;
  return BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS;
}

// ─── Cancel preflight ────────────────────────────────────────────────────

export interface CancelPreflightDecision {
  /**
   * `null` → proceed with cancel transaction.
   * non-null → caller throws this error code.
   */
  readonly errorCode: BookingErrorCode | null;
  /**
   * `true` → no-op (already cancelled/expired with target match); caller
   * returns success without DB writes.
   */
  readonly noop: boolean;
  /**
   * `true` → caller must release an active StockReservation before status
   * update. Only true when current status === CONFIRMED.
   */
  readonly mustReleaseStock: boolean;
}

/**
 * Pure validation: can a booking in this state transition to the target
 * cancel/expire status, and what side-effects are required?
 *
 * Behavior:
 * - PENDING_REVIEW → target: status update only, no stock release.
 * - CONFIRMED → target: must release reservation + update status.
 * - CANCELLED/EXPIRED already, target same: no-op.
 * - CANCELLED/EXPIRED already, target different terminal: BOOKING_INVALID_STATUS.
 * - CONVERTED_TO_ORDER: BOOKING_INVALID_STATUS (use order cancel/refund flow).
 */
export function preflightCancel(
  current: BookingStatus,
  target: CancelTargetStatus
): CancelPreflightDecision {
  if (current === 'CONVERTED_TO_ORDER') {
    return Object.freeze({
      errorCode: BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS,
      noop: false,
      mustReleaseStock: false,
    });
  }
  if (current === target) {
    return Object.freeze({ errorCode: null, noop: true, mustReleaseStock: false });
  }
  if (current === 'CANCELLED' || current === 'EXPIRED') {
    // Cross-terminal: do not flip CANCELLED ↔ EXPIRED.
    return Object.freeze({
      errorCode: BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS,
      noop: false,
      mustReleaseStock: false,
    });
  }
  if (current === 'PENDING_REVIEW') {
    return Object.freeze({ errorCode: null, noop: false, mustReleaseStock: false });
  }
  // CONFIRMED → must release stock
  return Object.freeze({ errorCode: null, noop: false, mustReleaseStock: true });
}

// ─── Active reservation picker ───────────────────────────────────────────

/**
 * Pure helper: given a booking's reservations, pick the single active one
 * (releasedAt === null and bookingId matches).
 *
 * Returns `null` if none active. Returns first match if multiple (caller
 * should treat multiple-active as integrity error in CONFIRMED state, but
 * the picker itself stays pure and lenient).
 */
export function pickActiveReservation(
  reservations: readonly ActiveReservationSnapshot[],
  bookingId: string
): ActiveReservationSnapshot | null {
  for (const r of reservations) {
    if (r.bookingId === bookingId && r.releasedAt === null) return r;
  }
  return null;
}
