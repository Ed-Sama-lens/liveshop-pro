/**
 * Pure helpers for /sale booking domain.
 *
 * No Prisma. No DB. No I/O. Fully unit-testable.
 *
 * The single non-DOM dependency is Node's `crypto.createHash` (used by
 * `buildConversionIdempotencyKey`). Acceptable: SHA-256 is deterministic,
 * pure, no I/O.
 *
 * Used by `src/server/repositories/booking.repository.ts` for transaction-safe
 * booking confirm/cancel/convert logic. Keep this module side-effect-free.
 *
 * Design refs:
 * - docs/superpowers/2026-05-09-sale-booking-runtime-design.md (confirm/cancel)
 * - docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md (convert)
 * Boss decisions ref: docs/superpowers/2026-04-06-sale-mvp-dissent.md
 */

import { createHash } from 'crypto';

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

/**
 * Discriminated union returned by `resolveActiveReservation`.
 *
 * Repository code MUST switch on `kind`:
 * - `none`     → caller decides if absence is integrity error (CONFIRMED) or normal (PENDING_REVIEW)
 * - `one`      → caller validates quantity/variant match before proceeding
 * - `multiple` → caller MUST throw RESERVATION_INTEGRITY_ERROR; never silently pick first
 */
export type ActiveReservationLookup =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly reservation: ActiveReservationSnapshot }
  | { readonly kind: 'multiple'; readonly count: number };

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
  // Conversion (Commit 2H)
  NO_BOOKINGS_TO_CONVERT: 'NO_BOOKINGS_TO_CONVERT',
  CONVERSION_INTEGRITY_ERROR: 'CONVERSION_INTEGRITY_ERROR',
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
 * Consumes a discriminated `ActiveReservationLookup` so the caller cannot
 * silent-pick on multiple actives. Multi-active is always an integrity error.
 *
 * - `kind: 'one'` with matching quantity → idempotent no-op success
 * - `kind: 'one'` with mismatched quantity → integrity error
 * - `kind: 'none'` while CONFIRMED → integrity error
 * - `kind: 'multiple'` → integrity error
 * - non-CONFIRMED status → `{ idempotent: false, integrityError: false }` (caller proceeds with normal flow)
 */
export function isAlreadyConfirmedIdempotent(
  status: BookingStatus,
  lookup: ActiveReservationLookup,
  expectedQuantity: number
): IdempotencyDecision {
  if (status !== 'CONFIRMED') {
    return Object.freeze({ idempotent: false, integrityError: false });
  }
  if (lookup.kind === 'one' && lookup.reservation.quantity === expectedQuantity) {
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

// ─── Active reservation resolver ─────────────────────────────────────────

/**
 * Pure helper: classify a booking's reservation set into a discriminated
 * union so callers cannot accidentally silent-pick on multi-active.
 *
 * Boss audit rule (2026-05-09): never return first-match when more than
 * one active reservation exists for the same booking. Caller MUST throw
 * RESERVATION_INTEGRITY_ERROR on `kind: 'multiple'`.
 *
 * Filters: `bookingId` matches AND `releasedAt === null`.
 *
 * Returns:
 * - `{ kind: 'none' }` — zero active reservations match
 * - `{ kind: 'one', reservation }` — exactly one active match
 * - `{ kind: 'multiple', count }` — two or more active matches (data corruption)
 */
export function resolveActiveReservation(
  reservations: readonly ActiveReservationSnapshot[],
  bookingId: string
): ActiveReservationLookup {
  const matches: ActiveReservationSnapshot[] = [];
  for (const r of reservations) {
    if (r.bookingId === bookingId && r.releasedAt === null) {
      matches.push(r);
    }
  }
  if (matches.length === 0) return Object.freeze({ kind: 'none' as const });
  if (matches.length === 1) {
    return Object.freeze({ kind: 'one' as const, reservation: matches[0] });
  }
  return Object.freeze({ kind: 'multiple' as const, count: matches.length });
}

// ─── Booking → Order conversion (Commit 2H) ──────────────────────────────
//
// Pure helpers used by `bookingRepository.convertToOrder()`. Module stays
// side-effect-free: zero Prisma, zero DB.
//
// Design ref: docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md

/**
 * Snapshot of a CONFIRMED booking eligible for conversion. Caller maps
 * Prisma rows into this shape so this module never touches Prisma.
 */
export interface ConfirmedBookingSnapshot {
  readonly id: string;
  readonly status: BookingStatus;
  readonly quantity: number;
  /** Decimal as string (Prisma serialization). e.g. '12.34'. */
  readonly unitPrice: string;
  readonly productId: string;
  readonly variantId: string;
}

/**
 * One row that will become a single OrderItem.
 *
 * Boss decision (Q3 in dissent): consolidate by (productId, variantId, unitPrice).
 * Same-key bookings → one OrderItem with summed quantity.
 * Different unitPrice → separate OrderItems.
 */
export interface OrderItemGroup {
  readonly productId: string;
  readonly variantId: string;
  readonly unitPrice: string;
  readonly quantity: number;
  readonly totalPrice: string;
  readonly sourceBookingIds: readonly string[];
}

export interface OrderTotals {
  readonly subtotal: string;
  readonly shippingFee: string;
  readonly total: string;
}

/**
 * Pure decimal multiply preserving 2-place precision without floating-point
 * drift. Inputs are decimal-as-string from Prisma.Decimal serialization.
 *
 * NOTE: Phase 1 prices are simple Decimal(12,2). Multiplying ints * cents
 * stays safe within Number precision for any realistic order. Future
 * hardening could swap to a decimal library (e.g. decimal.js) if order
 * sizes grow. Out of Commit 2H scope.
 */
function multiplyDecimal2(unitPrice: string, quantity: number): string {
  // Treat unitPrice as cents-int after parse to avoid float drift.
  const parts = unitPrice.split('.');
  const whole = parseInt(parts[0] ?? '0', 10);
  const fracStr = (parts[1] ?? '').padEnd(2, '0').slice(0, 2);
  const frac = parseInt(fracStr || '0', 10);
  const cents = whole * 100 + (whole < 0 ? -frac : frac);
  const totalCents = cents * quantity;
  const sign = totalCents < 0 ? '-' : '';
  const abs = Math.abs(totalCents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Pure decimal sum preserving 2-place precision.
 */
function sumDecimal2(values: readonly string[]): string {
  let totalCents = 0;
  for (const v of values) {
    const parts = v.split('.');
    const whole = parseInt(parts[0] ?? '0', 10);
    const fracStr = (parts[1] ?? '').padEnd(2, '0').slice(0, 2);
    const frac = parseInt(fracStr || '0', 10);
    const cents = whole * 100 + (whole < 0 ? -frac : frac);
    totalCents += cents;
  }
  const sign = totalCents < 0 ? '-' : '';
  const abs = Math.abs(totalCents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Pure: filter input bookings to status === 'CONFIRMED' only. Phase 1
 * skips CANCELLED / EXPIRED / PENDING_REVIEW / CONVERTED_TO_ORDER (per
 * Boss decision Q10). If `bookingIds` whitelist is supplied, additionally
 * filters to that set (Phase 2 hook; Phase 1 omits).
 */
export function selectConfirmedBookings(
  allBookings: readonly ConfirmedBookingSnapshot[],
  options: { readonly bookingIds?: readonly string[] }
): readonly ConfirmedBookingSnapshot[] {
  const allowed: Set<string> | null = options.bookingIds
    ? new Set(options.bookingIds)
    : null;
  const result: ConfirmedBookingSnapshot[] = [];
  for (const b of allBookings) {
    if (b.status !== 'CONFIRMED') continue;
    if (allowed && !allowed.has(b.id)) continue;
    result.push(b);
  }
  return Object.freeze(result);
}

/**
 * Pure preflight: confirms there is something to convert.
 */
export function validateBookingsConvertible(
  bookings: readonly ConfirmedBookingSnapshot[]
): { readonly ok: true } | { readonly ok: false; readonly code: BookingErrorCode } {
  if (bookings.length === 0) {
    return Object.freeze({ ok: false as const, code: BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT });
  }
  for (const b of bookings) {
    if (b.status !== 'CONFIRMED') {
      return Object.freeze({
        ok: false as const,
        code: BOOKING_ERROR_CODES.BOOKING_INVALID_STATUS,
      });
    }
  }
  return Object.freeze({ ok: true as const });
}

/**
 * Pure: group bookings by (productId, variantId, unitPrice) and produce
 * OrderItem-ready rows.
 *
 * Same key → ONE group with summed quantity and recomputed totalPrice.
 * Different unitPrice → SEPARATE groups (e.g. priceOverride changed
 * mid-broadcast).
 *
 * Output order is stable: groups appear in first-seen order from input.
 */
export function groupBookingsForOrderItems(
  bookings: readonly ConfirmedBookingSnapshot[]
): readonly OrderItemGroup[] {
  const map = new Map<
    string,
    {
      productId: string;
      variantId: string;
      unitPrice: string;
      quantity: number;
      sourceBookingIds: string[];
    }
  >();
  for (const b of bookings) {
    const key = `${b.productId}|${b.variantId}|${b.unitPrice}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += b.quantity;
      existing.sourceBookingIds.push(b.id);
    } else {
      map.set(key, {
        productId: b.productId,
        variantId: b.variantId,
        unitPrice: b.unitPrice,
        quantity: b.quantity,
        sourceBookingIds: [b.id],
      });
    }
  }
  const groups: OrderItemGroup[] = [];
  for (const g of map.values()) {
    groups.push(
      Object.freeze({
        productId: g.productId,
        variantId: g.variantId,
        unitPrice: g.unitPrice,
        quantity: g.quantity,
        totalPrice: multiplyDecimal2(g.unitPrice, g.quantity),
        sourceBookingIds: Object.freeze([...g.sourceBookingIds]),
      })
    );
  }
  return Object.freeze(groups);
}

/**
 * Pure: compute order totals from grouped items. Phase 1 has zero
 * shipping fee (admin fills at SHIPPED transition per Boss decision C4).
 */
export function computeOrderTotals(
  groups: readonly OrderItemGroup[]
): OrderTotals {
  const subtotal = sumDecimal2(groups.map((g) => g.totalPrice));
  const shippingFee = '0.00';
  const total = sumDecimal2([subtotal, shippingFee]);
  return Object.freeze({ subtotal, shippingFee, total });
}

/**
 * Pure: deterministic idempotency key for booking → order conversion.
 *
 * Format (Boss decision Q6 / dissent §10):
 *   sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}
 *
 * sortedBookingIdsHash16 = first 16 hex chars of SHA-256 over
 * sorted booking IDs joined by ','.
 *
 * Sorting normalizes input order so two clicks with the same booking set
 * produce the same key (and thus collide on the unique constraint, which
 * the repository catches and returns idempotently).
 */
export function buildConversionIdempotencyKey(input: {
  readonly shopId: string;
  readonly liveSessionId: string;
  readonly customerId: string;
  readonly bookingIds: readonly string[];
}): string {
  const sorted = [...input.bookingIds].sort();
  const hash = createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 16);
  return `sale-conv:${input.shopId}:${input.liveSessionId}:${input.customerId}:${hash}`;
}

/**
 * Pure: deterministic idempotency key for omnichannel booking → order
 * conversion (Boss decision Q-5 / migration plan AR-3).
 *
 * V2 namespace — does NOT include liveSessionId. Designed for the
 * bookingIds-only conversion path that supports non-live sources
 * (Messenger inbox / post comment / manual / Telegram / WhatsApp).
 *
 * Format:
 *   sale-conv:v2:{shopId}:{customerId}:{sortedBookingIdsHash16}
 *
 * Coexistence with v1:
 * - v1 keys (`sale-conv:{shopId}:{liveSessionId}:{customerId}:{hash}`)
 *   remain valid on existing Orders. Legacy live-only callers keep
 *   using v1.
 * - v2 keys cannot collide with v1 because the v2 prefix differs
 *   (`sale-conv:v2:` vs `sale-conv:`).
 * - If a customer + same bookingIds are converted via both paths
 *   (extremely rare admin race), each path creates its own Order
 *   keyed by its own namespace; Order.idempotencyKey @unique prevents
 *   duplicate within either namespace, and the repository
 *   first-write-wins logic returns whichever Order exists first on
 *   replay.
 *
 * Sorting normalizes input order so two clicks with the same booking
 * set produce the same key — same idempotent collision protection
 * as v1.
 */
export function buildConversionIdempotencyKeyV2(input: {
  readonly shopId: string;
  readonly customerId: string;
  readonly bookingIds: readonly string[];
}): string {
  const sorted = [...input.bookingIds].sort();
  const hash = createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 16);
  return `sale-conv:v2:${input.shopId}:${input.customerId}:${hash}`;
}
