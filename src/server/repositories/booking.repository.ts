import { Prisma, BookingSource } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  BOOKING_ERROR_CODES,
  NO_EXPIRY_SENTINEL,
  buildConversionIdempotencyKey,
  buildConversionIdempotencyKeyV2,
  computeOrderTotals,
  groupBookingsForOrderItems,
  isAlreadyConfirmedIdempotent,
  preflightCancel,
  preflightConfirm,
  resolveActiveReservation,
  selectConfirmedBookings,
  validateBookingsConvertible,
  type ActiveReservationSnapshot,
  type BookingStatus,
  type CancelTargetStatus,
  type ConfirmedBookingSnapshot,
} from '@/lib/sale/booking-rules';
import {
  allowBookingIdsOnlyConversion,
  allowEvergreenBroadcastProduct,
  allowNonLiveBooking,
} from '@/lib/sale/feature-flags';

/**
 * Booking repository — /sale Phase 1 manual MVP.
 *
 * Owns the transaction-safe booking confirm/cancel logic. Reuses the existing
 * `StockReservation` table (Commit 1 added the `bookingId` column) so that the
 * later Commit 3 convert-to-order path can hand off cleanly without a second
 * decrement of `ProductVariant.reservedQty`.
 *
 * Design ref: docs/superpowers/2026-05-09-sale-booking-runtime-design.md
 * Decisions ref: docs/superpowers/2026-04-06-sale-mvp-dissent.md
 *
 * Notes:
 * - All transitions go through `prisma.$transaction`. No partial updates leak.
 * - Atomic stock reserve uses `$executeRaw` with a `quantity - reservedQty >= ?`
 *   guard inside the same statement (concurrency-safe). Existing
 *   `stock.repository.reserve()` is read-then-update; this path does not use it.
 * - Phase 1 has no auto-expire; all booking-side reservations carry
 *   `expiresAt = NO_EXPIRY_SENTINEL`. The existing `expireReservations()` cron
 *   scans `expiresAt <= now` so booking reservations are never auto-released.
 * - Idempotency relies on booking status + matching active StockReservation,
 *   not on `Booking.idempotencyKey` (reserved for Phase 2 parser ingestion).
 */

// ─── Public types ────────────────────────────────────────────────────────

export interface ConfirmBookingInput {
  /** Booking row id. */
  readonly bookingId: string;
  /** Shop id used for tenant scoping (must match Booking.shopId). */
  readonly shopId: string;
  /** Admin User.id who triggered the confirm. Stored on BookingHistory. */
  readonly changedById: string;
}

export interface ConfirmBookingResult {
  readonly bookingId: string;
  readonly status: 'CONFIRMED';
  readonly reservationId: string;
  readonly variantId: string;
  readonly quantity: number;
  /** True when the call was a no-op against an already-confirmed booking. */
  readonly idempotent: boolean;
}

export interface CancelBookingInput {
  readonly bookingId: string;
  readonly shopId: string;
  readonly changedById: string;
  readonly targetStatus: CancelTargetStatus;
  readonly reason?: string;
}

export interface CancelBookingResult {
  readonly bookingId: string;
  readonly status: CancelTargetStatus;
  /** True when stock was released as part of this call. */
  readonly stockReleased: boolean;
  /** Quantity decremented from `ProductVariant.reservedQty`. 0 when nothing to release. */
  readonly releasedQuantity: number;
  /** True when the booking was already in the target terminal state. */
  readonly idempotent: boolean;
}

export interface ConvertBookingsToOrderInput {
  readonly shopId: string;
  /**
   * V1 legacy field: required when caller uses the (shopId,
   * liveSessionId, customerId) grouping path. After PR 2 AR-3, this
   * is optional — omit it together with customerId to use the new
   * bookingIds-only V2 path (requires ALLOW_BOOKINGIDS_ONLY_CONVERSION).
   */
  readonly liveSessionId?: string | null;
  /**
   * V1 legacy field: required for live-bound conversion. V2 path
   * infers customerId from the bookingIds (all must share customer).
   */
  readonly customerId?: string;
  /** Admin User.id who triggered conversion. */
  readonly changedById: string;
  /**
   * V1: optional whitelist for partial conversion within a live
   * session's customer's CONFIRMED bookings.
   * V2: REQUIRED for bookingIds-only path. All ids must belong to
   * same shop + same customer; multi-customer hard-rejected with 409.
   */
  readonly bookingIds?: readonly string[];
}

export interface ConvertBookingsToOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: 'RESERVED';
  /** True when the call was a no-op against an already-converted booking set. */
  readonly idempotent: boolean;
  readonly bookingCount: number;
  readonly bookingIds: readonly string[];
  /** Order total as decimal-string (e.g. "120.00"). */
  readonly totalAmount: string;
}

// ─── createManual (Commit 2M-b) ──────────────────────────────────────────

/**
 * Input for `bookingRepository.createManual()`.
 *
 * Used by /sale admin UI (Commit 2L) and POST /api/sale/bookings (Commit 2N)
 * to create a single booking without going through any inbound message
 * parser. All fields are admin-supplied; no platform integration.
 */
export interface CreateManualBookingInput {
  readonly shopId: string;
  /**
   * Optional after PR 2 (AR-2). When provided, booking is live-bound and
   * BroadcastProduct must belong to the same LiveSession. When null /
   * omitted, booking is non-live (omnichannel) — requires feature flag
   * ALLOW_NON_LIVE_BOOKING and the BroadcastProduct must be evergreen
   * (BP.liveSessionId IS NULL).
   */
  readonly liveSessionId?: string | null;
  readonly customerId: string;
  readonly broadcastProductId: string;
  readonly quantity: number;
  /**
   * Initial status:
   * - `PENDING_REVIEW` → booking only, no stock reservation
   * - `CONFIRMED`      → booking + stock reservation in one transaction
   *                      (rolls back entire booking if reserve fails)
   */
  readonly status: 'PENDING_REVIEW' | 'CONFIRMED';
  /**
   * Booking source. Defaults to MANUAL when omitted. For non-live
   * bookings, source must be explicitly set (typically by trusted
   * inbound runtime — future Phase O-1+). The /api/sale/bookings POST
   * route defaults to MANUAL for admin-initiated calls.
   */
  readonly source?: BookingSource;
  /**
   * Optional source context references. Populated for inbound-derived
   * bookings (LIVE_COMMENT / MESSENGER_INBOX / etc). Manual admin
   * bookings leave these null.
   */
  readonly conversationId?: string | null;
  readonly channelIdentityId?: string | null;
  readonly sourceMessageId?: string | null;
  /**
   * Optional admin-supplied idempotency key. When present, repeated calls
   * with the same `(shopId, idempotencyKey)` return the existing booking
   * idempotently. Format: `^[A-Za-z0-9_-]{8,128}$`.
   */
  readonly idempotencyKey?: string;
  /** Admin User.id who triggered the create. Stored on Booking.createdById and BookingHistory.changedById. */
  readonly changedById: string;
}

export interface CreateManualBookingResult {
  readonly bookingId: string;
  readonly status: 'PENDING_REVIEW' | 'CONFIRMED';
  /** Captured at creation time from BroadcastProduct.priceOverride ?? ProductVariant.price. */
  readonly unitPrice: string;
  readonly quantity: number;
  /** Set when status === 'CONFIRMED'. Null when PENDING_REVIEW. */
  readonly reservationId: string | null;
  /** True when an existing booking was returned via idempotencyKey replay. */
  readonly idempotent: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function toReservationSnapshot(r: {
  id: string;
  variantId: string;
  quantity: number;
  bookingId: string | null;
  releasedAt: Date | null;
}): ActiveReservationSnapshot {
  return Object.freeze({
    id: r.id,
    variantId: r.variantId,
    quantity: r.quantity,
    bookingId: r.bookingId,
    releasedAt: r.releasedAt,
  });
}

/**
 * Confirm-booking transaction body — runs inside an existing Prisma
 * transaction client `tx`. MUST NOT call `prisma.$transaction()` itself.
 *
 * Used by:
 * - `bookingRepository.confirm()` — opens its own `prisma.$transaction(tx => ...)` and delegates here
 * - `bookingRepository.createManual()` (Commit 2M-b) — when admin requests
 *   `status: 'CONFIRMED'` on create, opens a single transaction that first
 *   inserts the Booking row at PENDING_REVIEW and then calls this helper
 *   inside the same `tx`. If reservation fails, the entire transaction
 *   (including the Booking insert) rolls back — no orphan PENDING booking.
 *
 * Behavior is identical to the previous inline body of `confirm()`. Extract
 * is mechanical refactor only — no logic change. All 17 existing E2E tests
 * (verify-booking-flow.ts 9/9 + verify-booking-conversion.ts 8/8) must
 * continue passing identically.
 */
async function _runConfirmInTx(
  tx: Prisma.TransactionClient,
  input: ConfirmBookingInput
): Promise<ConfirmBookingResult> {
  const { bookingId, shopId, changedById } = input;

  // 1. Read booking + broadcast product (with variant→product.shopId for
  //    cross-shop defense) + active reservations for this booking.
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, shopId },
    include: {
      broadcastProduct: {
        select: {
          id: true,
          variantId: true,
          variant: {
            select: {
              id: true,
              product: { select: { shopId: true } },
            },
          },
        },
      },
      stockReservations: {
        where: { releasedAt: null },
        select: {
          id: true,
          variantId: true,
          quantity: true,
          bookingId: true,
          releasedAt: true,
        },
      },
    },
  });

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }
  if (!booking.broadcastProduct) {
    // Should be impossible given FK, but defensive.
    throw new AppError(
      'BroadcastProduct not found for booking',
      BOOKING_ERROR_CODES.BROADCAST_PRODUCT_NOT_FOUND,
      404
    );
  }

  const variantId = booking.broadcastProduct.variantId;
  if (!variantId) {
    throw new AppError(
      'BroadcastProduct has no variantId; whole-product bookings not supported in Phase 1',
      BOOKING_ERROR_CODES.VARIANT_REQUIRED,
      422
    );
  }

  // Defense-in-depth: BroadcastProduct.variantId could in principle point
  // to a Variant whose Product belongs to a different shop (no schema-level
  // CHECK constraint). Reject to prevent cross-shop stock reservation.
  const variantProductShopId =
    booking.broadcastProduct.variant?.product.shopId;
  if (!variantProductShopId || variantProductShopId !== shopId) {
    throw new AppError(
      'BroadcastProduct variant belongs to a different shop',
      BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
      500
    );
  }

  const currentStatus = booking.status as BookingStatus;
  const reservationSnapshots = booking.stockReservations.map(toReservationSnapshot);
  const lookup = resolveActiveReservation(reservationSnapshots, booking.id);

  // 2. Idempotency path — already CONFIRMED. Multi-active is always
  //    integrity error (caught by isAlreadyConfirmedIdempotent on
  //    `kind: 'multiple'`).
  const idempotency = isAlreadyConfirmedIdempotent(
    currentStatus,
    lookup,
    booking.quantity
  );
  if (idempotency.integrityError) {
    const detail =
      lookup.kind === 'multiple'
        ? `multiple active reservations (count=${lookup.count})`
        : lookup.kind === 'none'
          ? 'no active reservation'
          : 'reservation quantity mismatch';
    throw new AppError(
      `CONFIRMED booking integrity error: ${detail}`,
      BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
      500
    );
  }
  if (idempotency.idempotent && lookup.kind === 'one') {
    return Object.freeze({
      bookingId: booking.id,
      status: 'CONFIRMED' as const,
      reservationId: lookup.reservation.id,
      variantId: lookup.reservation.variantId,
      quantity: lookup.reservation.quantity,
      idempotent: true,
    });
  }

  // 3. Status transition guard.
  const preflightError = preflightConfirm(currentStatus);
  if (preflightError !== null) {
    throw new ConflictError(
      `Cannot confirm booking from status=${currentStatus}`
    );
  }

  // 4. Atomic conditional reserve. Concurrency-safe.
  //    Postgres locks the variant row during UPDATE; the predicate is
  //    evaluated at lock time so two concurrent transactions cannot both
  //    pass.
  const updatedRows = await tx.$executeRaw`
    UPDATE "ProductVariant"
    SET "reservedQty" = "reservedQty" + ${booking.quantity}
    WHERE "id" = ${variantId}
      AND "quantity" - "reservedQty" >= ${booking.quantity}
  `;

  if (updatedRows !== 1) {
    // Verify variant exists at all so we can distinguish 404 from stock denial.
    const variantExists = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!variantExists) {
      throw new AppError(
        `Variant ${variantId} not found`,
        BOOKING_ERROR_CODES.VARIANT_NOT_FOUND,
        404
      );
    }
    throw new AppError(
      `Insufficient stock to reserve ${booking.quantity} for variant ${variantId}`,
      BOOKING_ERROR_CODES.INSUFFICIENT_STOCK,
      409
    );
  }

  // 5. Create StockReservation row tied to this booking.
  const reservation = await tx.stockReservation.create({
    data: {
      variantId,
      bookingId: booking.id,
      quantity: booking.quantity,
      expiresAt: NO_EXPIRY_SENTINEL,
    },
    select: { id: true },
  });

  // 6. Update booking status + confirmedAt.
  const now = new Date();
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: now,
    },
  });

  // 7. Audit history.
  await tx.bookingHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: 'CONFIRMED',
      changedById,
    },
  });

  return Object.freeze({
    bookingId: booking.id,
    status: 'CONFIRMED' as const,
    reservationId: reservation.id,
    variantId,
    quantity: booking.quantity,
    idempotent: false,
  });
}

// ─── Repository ──────────────────────────────────────────────────────────

export const bookingRepository = Object.freeze({
  /**
   * Confirm a PENDING_REVIEW booking and atomically reserve stock.
   *
   * Idempotent: re-calling on an already-CONFIRMED booking with matching
   * active StockReservation returns success without side effects.
   */
  async confirm(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    return prisma.$transaction((tx) => _runConfirmInTx(tx, input));
  },

  /**
   * Cancel or expire a booking, releasing reserved stock if the booking was
   * previously CONFIRMED.
   *
   * Idempotent: re-calling on a booking already in the target terminal state
   * returns success without side effects.
   *
   * CONVERTED_TO_ORDER bookings cannot be cancelled here — caller must use
   * the order cancel/refund flow (out of scope for Commit 2).
   */
  async cancel(input: CancelBookingInput): Promise<CancelBookingResult> {
    const { bookingId, shopId, changedById, targetStatus, reason } = input;

    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, shopId },
        include: {
          stockReservations: {
            where: { releasedAt: null },
            select: {
              id: true,
              variantId: true,
              quantity: true,
              bookingId: true,
              releasedAt: true,
            },
          },
        },
      });

      if (!booking) {
        throw new NotFoundError('Booking not found');
      }

      const currentStatus = booking.status as BookingStatus;
      const decision = preflightCancel(currentStatus, targetStatus);

      if (decision.errorCode !== null) {
        throw new ConflictError(
          `Cannot transition booking from ${currentStatus} to ${targetStatus}`
        );
      }

      if (decision.noop) {
        return Object.freeze({
          bookingId: booking.id,
          status: targetStatus,
          stockReleased: false,
          releasedQuantity: 0,
          idempotent: true,
        });
      }

      let stockReleased = false;
      let releasedQuantity = 0;

      if (decision.mustReleaseStock) {
        const snapshots = booking.stockReservations.map(toReservationSnapshot);
        const lookup = resolveActiveReservation(snapshots, booking.id);

        if (lookup.kind !== 'one') {
          const detail =
            lookup.kind === 'none'
              ? 'no active reservation to release'
              : `multiple active reservations (count=${lookup.count})`;
          throw new AppError(
            `CONFIRMED booking integrity error: ${detail}`,
            BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
            500
          );
        }

        const reservation = lookup.reservation;

        // Defense-in-depth: confirm the reservation's variant belongs to
        // this shop. Prevents releasing stock on a cross-shop variant if a
        // bug somewhere created a malformed reservation row.
        const variantShopId = await tx.productVariant.findUnique({
          where: { id: reservation.variantId },
          select: { product: { select: { shopId: true } } },
        });
        if (!variantShopId || variantShopId.product.shopId !== shopId) {
          throw new AppError(
            'Reservation variant belongs to a different shop',
            BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
            500
          );
        }

        // Atomic decrement guarded against negative reservedQty.
        const updatedRows = await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET "reservedQty" = "reservedQty" - ${reservation.quantity}
          WHERE "id" = ${reservation.variantId}
            AND "reservedQty" >= ${reservation.quantity}
        `;
        if (updatedRows !== 1) {
          throw new AppError(
            'Releasing reservation would drive reservedQty below zero',
            BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
            500
          );
        }

        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { releasedAt: new Date() },
        });

        stockReleased = true;
        releasedQuantity = reservation.quantity;
      }

      const now = new Date();
      const bookingUpdate: Prisma.BookingUpdateInput = {
        status: targetStatus,
        ...(targetStatus === 'CANCELLED'
          ? { cancelledAt: now, cancellationReason: reason ?? null }
          : {}),
        ...(targetStatus === 'EXPIRED'
          ? { releasedAt: now, releaseReason: reason ?? null }
          : {}),
      };

      await tx.booking.update({
        where: { id: booking.id },
        data: bookingUpdate,
      });

      await tx.bookingHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          changedById,
          reason: reason ?? null,
        },
      });

      return Object.freeze({
        bookingId: booking.id,
        status: targetStatus,
        stockReleased,
        releasedQuantity,
        idempotent: false,
      });
    });
  },

  /**
   * Convert all CONFIRMED bookings for one customer in one live session
   * into a single Order with consolidated OrderItems.
   *
   * Stock invariant: bookings already incremented `ProductVariant.reservedQty`
   * at confirm time. Conversion does NOT touch `reservedQty` — it transfers
   * the existing StockReservation rows to also point at the new Order via
   * `orderId`. The eventual `Order.RESERVED → CONFIRMED` transition then
   * decrements both `quantity` and `reservedQty` exactly once via existing
   * `orderRepository.transition()` logic.
   *
   * Idempotent: deterministic key
   *   sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}
   * If a previous conversion produced an Order with the same key, returns
   * that Order instead of creating a duplicate.
   *
   * Phase 1 boundaries (per Boss + ChatGPT):
   * - No customer-facing email / messenger / WhatsApp / Telegram send.
   * - No checkout/order/payment behavior change.
   * - No webhook fan-out (deferred per Boss Q8).
   * - `Order.channel = 'MANUAL'` (no enum migration).
   * - OrderAudit.action = 'CREATED_FROM_SALE_BOOKINGS' for traceability.
   */
  async convertToOrder(
    input: ConvertBookingsToOrderInput
  ): Promise<ConvertBookingsToOrderResult> {
    const { shopId, liveSessionId: liveSessionIdInput, customerId: customerIdInput, changedById, bookingIds } = input;

    // ─── V2 dispatcher (PR 2 AR-3): bookingIds-only conversion ───────
    //
    // When caller omits both liveSessionId AND customerId but supplies
    // bookingIds, route through the V2 path. Requires the
    // ALLOW_BOOKINGIDS_ONLY_CONVERSION flag (defense-in-depth — route
    // layer also gates).
    //
    // V2 path:
    // 1. Fetch all bookings by id within shopId
    // 2. Validate same customer (hard reject multi-customer with 409
    //    per Q-18)
    // 3. Derive customerId from the fetched rows
    // 4. Validate all CONFIRMED + not already converted
    // 5. Build idempotency key v2 (no liveSessionId in namespace)
    // 6. Reuse v1's transactional creation logic
    //
    // V1 path is preserved unchanged for legacy callers.
    const isV2Dispatch =
      (liveSessionIdInput === undefined || liveSessionIdInput === null) &&
      customerIdInput === undefined &&
      bookingIds !== undefined &&
      bookingIds.length > 0;

    if (isV2Dispatch) {
      if (!allowBookingIdsOnlyConversion()) {
        throw new ValidationError(
          'bookingIds-only conversion is not enabled. Set ALLOW_BOOKINGIDS_ONLY_CONVERSION=true to enable.',
          { bookingIds: ['requires ALLOW_BOOKINGIDS_ONLY_CONVERSION=true'] }
        );
      }
      return this._convertToOrderV2({ shopId, bookingIds: bookingIds!, changedById });
    }

    // V1 path: legacy live-bound conversion. Both liveSessionId +
    // customerId required.
    if (
      typeof liveSessionIdInput !== 'string' ||
      liveSessionIdInput.length === 0 ||
      typeof customerIdInput !== 'string' ||
      customerIdInput.length === 0
    ) {
      throw new ValidationError(
        'convertToOrder requires either (liveSessionId + customerId) for V1 legacy path or bookingIds-only for V2 path',
        {
          liveSessionId: ['required when not using bookingIds-only path'],
          customerId: ['required when not using bookingIds-only path'],
        }
      );
    }
    const liveSessionId = liveSessionIdInput;
    const customerId = customerIdInput;

    return prisma.$transaction(async (tx) => {
      // 1. Fetch all bookings for (shop, session, customer). Filter to CONFIRMED
      //    + optional bookingIds whitelist via pure helper.
      const allBookings = await tx.booking.findMany({
        where: { shopId, liveSessionId, customerId },
        include: {
          broadcastProduct: {
            select: { id: true, productId: true, variantId: true },
          },
          stockReservations: {
            where: { releasedAt: null },
            select: {
              id: true,
              variantId: true,
              quantity: true,
              bookingId: true,
              orderId: true,
              releasedAt: true,
            },
          },
        },
      });

      // Map Prisma rows → pure-helper snapshots.
      // ASSUMPTION: BroadcastProduct.variantId is non-null at confirm-time,
      // verified at booking confirm. If any booking row is missing variantId
      // here, treat as integrity error.
      const snapshots: ConfirmedBookingSnapshot[] = [];
      for (const b of allBookings) {
        if (!b.broadcastProduct) {
          throw new AppError(
            'BroadcastProduct missing for booking ' + b.id,
            BOOKING_ERROR_CODES.BROADCAST_PRODUCT_NOT_FOUND,
            500
          );
        }
        const variantId = b.broadcastProduct.variantId;
        if (!variantId) {
          throw new AppError(
            'BroadcastProduct.variantId missing for booking ' + b.id,
            BOOKING_ERROR_CODES.VARIANT_REQUIRED,
            500
          );
        }
        snapshots.push(
          Object.freeze({
            id: b.id,
            status: b.status as BookingStatus,
            quantity: b.quantity,
            unitPrice: b.unitPrice.toString(),
            productId: b.broadcastProduct.productId,
            variantId,
          })
        );
      }

      // 2. Idempotency-first lookup when caller passed explicit `bookingIds`.
      //    This lets a route handler retry-safe even after the original
      //    bookings flipped to CONVERTED_TO_ORDER (caller's own Cancel / lost
      //    response / double-click 5 min later). Without this, the second
      //    call would hit `selectConfirmedBookings → []` and throw
      //    NO_BOOKINGS_TO_CONVERT — leaving the caller unsure whether their
      //    first request succeeded.
      //
      //    When `bookingIds` is omitted (legacy direct-from-repo callers),
      //    we keep the old preflight-first ordering: filter CONFIRMED →
      //    build key from confirmed set → check existing Order. This
      //    preserves prior `verify-booking-flow.ts` Test 2 semantics.
      if (bookingIds && bookingIds.length > 0) {
        const idempotencyKeyEarly = buildConversionIdempotencyKey({
          shopId,
          liveSessionId,
          customerId,
          bookingIds,
        });
        const existingEarly = await tx.order.findUnique({
          where: { idempotencyKey: idempotencyKeyEarly },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            convertedFromBookings: { select: { id: true } },
          },
        });
        if (existingEarly) {
          const existingIds = new Set(
            existingEarly.convertedFromBookings.map((b) => b.id)
          );
          const requestedIds = new Set(bookingIds);
          const sameSet =
            existingIds.size === requestedIds.size &&
            [...existingIds].every((id) => requestedIds.has(id));
          if (!sameSet) {
            throw new AppError(
              'Idempotency key matches an existing Order with a different booking set',
              BOOKING_ERROR_CODES.CONVERSION_INTEGRITY_ERROR,
              500
            );
          }
          return Object.freeze({
            orderId: existingEarly.id,
            orderNumber: existingEarly.orderNumber,
            status: 'RESERVED' as const,
            idempotent: true,
            bookingCount: existingEarly.convertedFromBookings.length,
            bookingIds: Object.freeze([...existingIds]),
            totalAmount: existingEarly.totalAmount.toString(),
          });
        }
      }

      const eligible = selectConfirmedBookings(snapshots, { bookingIds });
      const preflight = validateBookingsConvertible(eligible);
      if (!preflight.ok) {
        if (preflight.code === BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT) {
          throw new AppError(
            'No CONFIRMED bookings to convert for this customer × session',
            BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT,
            422
          );
        }
        // Should not occur given selectConfirmedBookings filter, but defensive.
        throw new ConflictError(
          'Conversion preflight failed: ' + preflight.code
        );
      }

      // 3. Build deterministic idempotency key from the confirmed set
      //    (used when no explicit bookingIds were provided OR the early
      //    lookup above did not find an existing Order).
      const idempotencyKey = buildConversionIdempotencyKey({
        shopId,
        liveSessionId,
        customerId,
        bookingIds: eligible.map((b) => b.id),
      });

      // 4. Idempotency check (post-filter): existing Order with same key?
      const existing = await tx.order.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          convertedFromBookings: { select: { id: true } },
        },
      });
      if (existing) {
        // Verify the existing Order's converted bookings match exactly the
        // current eligible set. If mismatch → integrity error.
        const existingIds = new Set(existing.convertedFromBookings.map((b) => b.id));
        const eligibleIds = new Set(eligible.map((b) => b.id));
        const sameSet =
          existingIds.size === eligibleIds.size &&
          [...existingIds].every((id) => eligibleIds.has(id));
        if (!sameSet) {
          throw new AppError(
            'Idempotency key matches an existing Order with a different booking set',
            BOOKING_ERROR_CODES.CONVERSION_INTEGRITY_ERROR,
            500
          );
        }
        return Object.freeze({
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          status: 'RESERVED' as const,
          idempotent: true,
          bookingCount: existing.convertedFromBookings.length,
          bookingIds: Object.freeze([...existingIds]),
          totalAmount: existing.totalAmount.toString(),
        });
      }

      // 4. Compute order items + totals via pure helpers.
      const groups = groupBookingsForOrderItems(eligible);
      const totals = computeOrderTotals(groups);

      // 5. Generate orderNumber. NOTE: ASSUMPTION same pattern as storefront
      //    checkout (`ORD-NNNNNN`). Race-prone under concurrency but
      //    matches existing behavior. Out of scope to fix.
      const orderCount = await tx.order.count({ where: { shopId } });
      const orderNumber = `ORD-${String(orderCount + 1).padStart(6, '0')}`;

      // 6. Create Order + nested OrderItems.
      const newOrder = await tx.order.create({
        data: {
          shopId,
          customerId,
          orderNumber,
          status: 'RESERVED',
          channel: 'MANUAL',
          totalAmount: totals.total,
          shippingFee: totals.shippingFee,
          notes: null,
          idempotencyKey,
          items: {
            create: groups.map((g) => ({
              productId: g.productId,
              variantId: g.variantId,
              quantity: g.quantity,
              unitPrice: g.unitPrice,
              totalPrice: g.totalPrice,
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      // 7. Transfer StockReservation rows: gain orderId, keep bookingId,
      //    KEEP expiresAt sentinel (Boss decision Q1: admin already
      //    committed; no auto-release).
      //
      //    Each booking should have exactly one active StockReservation
      //    row (booking confirm guarantees this). Multi-active is
      //    integrity error per Commit 2B-AUDIT-001.
      for (const b of eligible) {
        const bookingPrismaRow = allBookings.find((x) => x.id === b.id)!;
        const activeReservations = bookingPrismaRow.stockReservations.filter(
          (r) => r.bookingId === b.id && r.releasedAt === null
        );
        if (activeReservations.length === 0) {
          throw new AppError(
            'CONFIRMED booking has no active StockReservation: ' + b.id,
            BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
            500
          );
        }
        if (activeReservations.length > 1) {
          throw new AppError(
            `CONFIRMED booking has ${activeReservations.length} active StockReservations: ` +
              b.id,
            BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
            500
          );
        }
        const reservation = activeReservations[0];
        if (reservation.orderId !== null) {
          throw new AppError(
            'StockReservation already bound to an order: ' + reservation.id,
            BOOKING_ERROR_CODES.CONVERSION_INTEGRITY_ERROR,
            500
          );
        }
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { orderId: newOrder.id },
        });
      }

      // 8. Flip Booking status + set convertedOrderId.
      const now = new Date();
      const bookingIdList = eligible.map((b) => b.id);
      await tx.booking.updateMany({
        where: { id: { in: bookingIdList } },
        data: {
          status: 'CONVERTED_TO_ORDER',
          convertedOrderId: newOrder.id,
          updatedAt: now,
        },
      });

      // 9. BookingHistory rows for each booking (one per booking; preserves
      //    per-booking audit per Boss decision §16 in initial dissent).
      await tx.bookingHistory.createMany({
        data: eligible.map((b) => ({
          bookingId: b.id,
          fromStatus: 'CONFIRMED' as const,
          toStatus: 'CONVERTED_TO_ORDER' as const,
          changedById,
          reason: null,
          metadata: { orderId: newOrder.id, orderNumber: newOrder.orderNumber } as Prisma.InputJsonValue,
        })),
      });

      // 10. OrderAudit row (matches storefront checkout pattern at line 140
      //     of checkout.repository.ts).
      await tx.orderAudit.create({
        data: {
          orderId: newOrder.id,
          action: 'CREATED_FROM_SALE_BOOKINGS',
          toStatus: 'RESERVED',
          metadata: {
            source: 'sale_booking_conversion',
            bookingIds: bookingIdList,
            bookingCount: bookingIdList.length,
            liveSessionId,
            changedById,
          } as Prisma.InputJsonValue,
          performedBy: changedById,
        },
      });

      return Object.freeze({
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        status: 'RESERVED' as const,
        idempotent: false,
        bookingCount: bookingIdList.length,
        bookingIds: Object.freeze([...bookingIdList]),
        totalAmount: totals.total,
      });
    });
  },

  /**
   * V2 conversion path (PR 2 AR-3 — bookingIds-only).
   *
   * Differences from V1:
   * - No liveSessionId / customerId in input. Customer is derived from
   *   the bookings themselves; multi-customer hard-rejected.
   * - Idempotency key uses v2 namespace
   *   `sale-conv:v2:{shopId}:{customerId}:{hash}`. v1 keys remain valid
   *   on existing Orders.
   * - Supports bookings with mixed liveSessionId values (live + null)
   *   provided they share shop + customer.
   *
   * Same invariants preserved from V1:
   * - All bookings must be CONFIRMED + not already converted.
   * - StockReservation rows transfer to new Order via bookingId →
   *   orderId; reservedQty unchanged.
   * - Order created with status RESERVED + channel MANUAL.
   * - OrderAudit action CREATED_FROM_SALE_BOOKINGS.
   */
  async _convertToOrderV2(input: {
    readonly shopId: string;
    readonly bookingIds: readonly string[];
    readonly changedById: string;
  }): Promise<ConvertBookingsToOrderResult> {
    const { shopId, bookingIds, changedById } = input;

    if (bookingIds.length === 0) {
      throw new ValidationError('bookingIds must contain at least one id', {
        bookingIds: ['empty array not allowed'],
      });
    }

    return prisma.$transaction(async (tx) => {
      // 1. Fetch bookings by id within shop. Lookup is shop-scoped to
      //    prevent cross-shop leakage even if caller passes a foreign id.
      const allBookings = await tx.booking.findMany({
        where: { id: { in: [...bookingIds] }, shopId },
        include: {
          broadcastProduct: {
            select: { id: true, productId: true, variantId: true },
          },
          stockReservations: {
            where: { releasedAt: null },
            select: {
              id: true,
              variantId: true,
              quantity: true,
              bookingId: true,
              orderId: true,
              releasedAt: true,
            },
          },
        },
      });

      if (allBookings.length === 0) {
        throw new AppError(
          'No bookings found for the requested ids in this shop',
          BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT,
          422
        );
      }

      // 2. Validate same customer (hard reject multi-customer per Q-18).
      const distinctCustomers = new Set(allBookings.map((b) => b.customerId));
      if (distinctCustomers.size !== 1) {
        throw new ConflictError(
          'All bookings must belong to the same customer (multi-customer conversion not supported)'
        );
      }
      const customerId = [...distinctCustomers][0];

      // 3. Validate every requested id was found.
      const foundIds = new Set(allBookings.map((b) => b.id));
      const missing = bookingIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new NotFoundError(
          `Booking(s) not found in shop: ${missing.join(', ')}`
        );
      }

      // 4. Idempotency-first lookup (pre-filter): builds v2 key from
      //    the requested bookingIds list (not from the CONFIRMED-filtered
      //    eligible list) so replays after the bookings flipped to
      //    CONVERTED_TO_ORDER still resolve to the existing Order
      //    instead of throwing NO_BOOKINGS_TO_CONVERT.
      const idempotencyKeyEarly = buildConversionIdempotencyKeyV2({
        shopId,
        customerId,
        bookingIds,
      });
      const existingEarly = await tx.order.findUnique({
        where: { idempotencyKey: idempotencyKeyEarly },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          convertedFromBookings: { select: { id: true } },
        },
      });
      if (existingEarly) {
        const existingIds = new Set(
          existingEarly.convertedFromBookings.map((b) => b.id)
        );
        const requestedIds = new Set(bookingIds);
        const sameSet =
          existingIds.size === requestedIds.size &&
          [...existingIds].every((id) => requestedIds.has(id));
        if (!sameSet) {
          throw new AppError(
            'V2 idempotency key matches an existing Order with a different booking set',
            BOOKING_ERROR_CODES.CONVERSION_INTEGRITY_ERROR,
            500
          );
        }
        return Object.freeze({
          orderId: existingEarly.id,
          orderNumber: existingEarly.orderNumber,
          status: 'RESERVED' as const,
          idempotent: true,
          bookingCount: existingEarly.convertedFromBookings.length,
          bookingIds: Object.freeze([...existingIds]),
          totalAmount: existingEarly.totalAmount.toString(),
        });
      }

      // 5. Map → pure-helper snapshots + validate convertibility.
      const snapshots: ConfirmedBookingSnapshot[] = [];
      for (const b of allBookings) {
        if (!b.broadcastProduct) {
          throw new AppError(
            'BroadcastProduct missing for booking ' + b.id,
            BOOKING_ERROR_CODES.BROADCAST_PRODUCT_NOT_FOUND,
            500
          );
        }
        const variantId = b.broadcastProduct.variantId;
        if (!variantId) {
          throw new AppError(
            'BroadcastProduct.variantId missing for booking ' + b.id,
            BOOKING_ERROR_CODES.VARIANT_REQUIRED,
            500
          );
        }
        snapshots.push(
          Object.freeze({
            id: b.id,
            status: b.status as BookingStatus,
            quantity: b.quantity,
            unitPrice: b.unitPrice.toString(),
            productId: b.broadcastProduct.productId,
            variantId,
          })
        );
      }

      const eligible = selectConfirmedBookings(snapshots, { bookingIds });
      const preflight = validateBookingsConvertible(eligible);
      if (!preflight.ok) {
        if (preflight.code === BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT) {
          throw new AppError(
            'No CONFIRMED bookings to convert',
            BOOKING_ERROR_CODES.NO_BOOKINGS_TO_CONVERT,
            422
          );
        }
        throw new ConflictError(
          'Conversion preflight failed: ' + preflight.code
        );
      }

      // 6. Build v2 idempotency key (post-filter — same input as
      //    Step 4 when eligible.length === bookingIds.length, so the
      //    Step 4 short-circuit covers most replay paths; this step
      //    handles the partial-conversion edge case where eligible
      //    differs from bookingIds).
      const idempotencyKey = buildConversionIdempotencyKeyV2({
        shopId,
        customerId,
        bookingIds: eligible.map((b) => b.id),
      });

      // 7. Idempotency check (post-filter): existing Order with same key?
      const existing = await tx.order.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          convertedFromBookings: { select: { id: true } },
        },
      });
      if (existing) {
        const existingIds = new Set(
          existing.convertedFromBookings.map((b) => b.id)
        );
        const requestedIds = new Set(eligible.map((b) => b.id));
        const sameSet =
          existingIds.size === requestedIds.size &&
          [...existingIds].every((id) => requestedIds.has(id));
        if (!sameSet) {
          throw new AppError(
            'V2 idempotency key matches an existing Order with a different booking set',
            BOOKING_ERROR_CODES.CONVERSION_INTEGRITY_ERROR,
            500
          );
        }
        return Object.freeze({
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          status: 'RESERVED' as const,
          idempotent: true,
          bookingCount: existing.convertedFromBookings.length,
          bookingIds: Object.freeze([...existingIds]),
          totalAmount: existing.totalAmount.toString(),
        });
      }

      // 7. Build OrderItem groups + totals.
      const groups = groupBookingsForOrderItems(eligible);
      const totals = computeOrderTotals(groups);

      // 8. Generate orderNumber. Reuses shop-scoped serial pattern from
      //    existing Order creation logic (delegated to orderRepository).
      const orderNumber = await this._generateOrderNumber(shopId, tx);

      // 9. Create Order in RESERVED status.
      const order = await tx.order.create({
        data: {
          shopId,
          customerId,
          orderNumber,
          status: 'RESERVED',
          channel: 'MANUAL',
          totalAmount: totals.total,
          shippingFee: totals.shippingFee,
          idempotencyKey,
        },
        select: { id: true, orderNumber: true },
      });

      // 10. Create OrderItem rows.
      for (const group of groups) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: group.productId,
            variantId: group.variantId,
            quantity: group.quantity,
            unitPrice: group.unitPrice,
            totalPrice: group.totalPrice,
          },
        });
      }

      // 11. Transfer StockReservation rows to the new Order (bookingId
      //     preserved + orderId set). reservedQty unchanged.
      const reservationIds: string[] = [];
      for (const b of allBookings) {
        for (const r of b.stockReservations) {
          if (r.releasedAt !== null) continue;
          reservationIds.push(r.id);
        }
      }
      if (reservationIds.length > 0) {
        await tx.stockReservation.updateMany({
          where: { id: { in: reservationIds } },
          data: { orderId: order.id },
        });
      }

      // 12. Flip bookings to CONVERTED_TO_ORDER + record history.
      for (const b of eligible) {
        await tx.booking.update({
          where: { id: b.id },
          data: {
            status: 'CONVERTED_TO_ORDER',
            convertedOrderId: order.id,
          },
        });
        await tx.bookingHistory.create({
          data: {
            bookingId: b.id,
            fromStatus: 'CONFIRMED',
            toStatus: 'CONVERTED_TO_ORDER',
            changedById,
          },
        });
      }

      // 13. OrderAudit for traceability.
      await tx.orderAudit.create({
        data: {
          orderId: order.id,
          action: 'CREATED_FROM_SALE_BOOKINGS',
          performedBy: changedById,
          // Optional metadata; v2 audit captures source path.
          metadata: {
            conversionPath: 'v2',
            bookingIds: eligible.map((b) => b.id),
          },
        },
      });

      return Object.freeze({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'RESERVED' as const,
        idempotent: false,
        bookingCount: eligible.length,
        bookingIds: Object.freeze(eligible.map((b) => b.id)),
        totalAmount: totals.total,
      });
    });
  },

  /**
   * Internal: generate shop-scoped order number. Extracted from inline
   * V1 logic for reuse by V2 path. Format matches existing pattern
   * (ORD-NNNNNN with N = shop-scoped sequence).
   */
  async _generateOrderNumber(
    shopId: string,
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const latest = await tx.order.findFirst({
      where: { shopId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    let nextSeq = 1;
    if (latest) {
      const match = latest.orderNumber.match(/^ORD-(\d+)$/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }
    return `ORD-${nextSeq.toString().padStart(6, '0')}`;
  },

  /**
   * Create a single Booking via admin manual entry (Commit 2M-b).
   *
   * Source is always `MANUAL`. The route handler (Commit 2N) and /sale UI
   * (Commit 2L+) are the only callers. No platform integration, no parser,
   * no inbound message linkage.
   *
   * Status branches:
   * - `PENDING_REVIEW` → insert Booking + write null→PENDING_REVIEW history.
   *                     No StockReservation. Stock unchanged.
   * - `CONFIRMED`      → open ONE prisma.$transaction:
   *                      1. insert Booking as PENDING_REVIEW
   *                      2. write null→PENDING_REVIEW history
   *                      3. call _runConfirmInTx(tx, ...) inline (writes
   *                         PENDING_REVIEW→CONFIRMED history + reserves
   *                         stock + creates StockReservation)
   *                      If step 3 throws (insufficient stock / cross-shop
   *                      / etc.) the entire transaction rolls back and no
   *                      orphan PENDING_REVIEW booking is left.
   *
   * Validation (all-or-nothing before any write):
   * - quantity is integer in [1, 999]
   * - idempotencyKey, when supplied, matches /^[A-Za-z0-9_-]{8,128}$/
   * - Customer exists, belongs to shopId, and `isBanned === false`
   * - BroadcastProduct exists, belongs to liveSessionId, has variantId set
   * - LiveSession.shopId === shopId (BroadcastProduct has no direct shopId
   *   so we verify scope through its parent LiveSession)
   * - ProductVariant.product.shopId === shopId (cross-shop defense)
   *
   * unitPrice is captured at creation time from
   * `BroadcastProduct.priceOverride ?? ProductVariant.price`. Decimal is
   * serialized via `.toString()` so the snapshot survives later
   * priceOverride mutations.
   *
   * Idempotency:
   * - When `idempotencyKey` is omitted, a new Booking is always created;
   *   duplicate (customer, broadcastProduct, session) calls produce
   *   separate Booking rows. Order conversion consolidates later.
   * - When supplied, we look up an existing Booking by the unique
   *   `(shopId, idempotencyKey)` constraint. If found, we return it
   *   idempotently provided the material payload matches
   *   (liveSessionId, customerId, broadcastProductId, quantity). Mismatch
   *   throws `ConflictError` so callers cannot reuse a key with different
   *   payload. The status field is allowed to differ (a CONFIRMED replay
   *   of a previously CONFIRMED booking is the expected idempotent
   *   shape; we do NOT downgrade or re-confirm on replay).
   *
   * BookingHistory:
   * - PENDING_REVIEW path → 1 row: fromStatus=null, toStatus=PENDING_REVIEW
   * - CONFIRMED path      → 2 rows in order:
   *                         (a) null→PENDING_REVIEW (created here)
   *                         (b) PENDING_REVIEW→CONFIRMED (created by _runConfirmInTx)
   *
   * No customer-facing message generation. No platform send. No order
   * write. No checkout/payment touch. Exits without side-effects on any
   * validation failure.
   */
  async createManual(
    input: CreateManualBookingInput
  ): Promise<CreateManualBookingResult> {
    const {
      shopId,
      liveSessionId: liveSessionIdInput,
      customerId,
      broadcastProductId,
      quantity,
      status,
      source: sourceInput,
      conversationId: conversationIdInput,
      channelIdentityId: channelIdentityIdInput,
      sourceMessageId: sourceMessageIdInput,
      idempotencyKey,
      changedById,
    } = input;

    // Normalize: empty string → null. Treats omitted/null/empty the same.
    const liveSessionId: string | null =
      typeof liveSessionIdInput === 'string' && liveSessionIdInput.length > 0
        ? liveSessionIdInput
        : null;
    const isNonLive = liveSessionId === null;

    // PR 2 AR-2 feature flag gate. When flag is off, the route MUST
    // require liveSessionId (defense-in-depth — repository refuses
    // even if route validation slips). When flag is on, allow non-live
    // path through.
    if (isNonLive && !allowNonLiveBooking()) {
      throw new ValidationError(
        'Non-live bookings are not enabled. Set ALLOW_NON_LIVE_BOOKING=true to enable.',
        { liveSessionId: ['required when ALLOW_NON_LIVE_BOOKING=false'] }
      );
    }

    // Default source to MANUAL when caller omitted. Inbound runtimes
    // (future) explicitly pass LIVE_COMMENT / MESSENGER_INBOX / etc.
    const source: BookingSource = sourceInput ?? BookingSource.MANUAL;

    // ─── 1. Pure-input validation (no DB) ────────────────────────────
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new ValidationError('quantity must be an integer between 1 and 999', {
        quantity: ['must be integer in [1, 999]'],
      });
    }
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      throw new ValidationError(
        'idempotencyKey must match /^[A-Za-z0-9_-]{8,128}$/',
        { idempotencyKey: ['invalid format'] }
      );
    }

    // ─── 2. Idempotency replay path (pre-transaction lookup) ─────────
    // Only query when key is supplied — Booking.idempotencyKey is nullable
    // and `findUnique` with null on a compound unique would either match
    // unrelated rows or throw. The repository contract guarantees we never
    // dispatch a findUnique with `idempotencyKey: null`.
    if (idempotencyKey !== undefined) {
      const existing = await prisma.booking.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: {
          stockReservations: {
            where: { releasedAt: null },
            select: {
              id: true,
              variantId: true,
              quantity: true,
              bookingId: true,
              releasedAt: true,
            },
          },
        },
      });
      if (existing) {
        // Normalize null vs undefined comparison for liveSessionId
        const existingLiveSession = existing.liveSessionId ?? null;
        const payloadMatches =
          existingLiveSession === liveSessionId &&
          existing.customerId === customerId &&
          existing.broadcastProductId === broadcastProductId &&
          existing.quantity === quantity;
        if (!payloadMatches) {
          throw new ConflictError(
            'idempotencyKey reused with materially different payload'
          );
        }
        // 2M-c integrity patch: never silent-pick on multi-active.
        // resolveActiveReservation returns a discriminated union:
        //   'none'     → reservationId null (PENDING_REVIEW expected shape)
        //   'one'      → return that reservation id (CONFIRMED expected shape)
        //   'multiple' → throw RESERVATION_INTEGRITY_ERROR — same contract
        //                as confirm()/cancel() use. Replay must not mask
        //                data corruption; surface it the same place
        //                confirm/cancel would so admin can investigate
        //                before further mutation.
        const snapshots = existing.stockReservations.map(toReservationSnapshot);
        const lookup = resolveActiveReservation(snapshots, existing.id);
        let reservationId: string | null;
        switch (lookup.kind) {
          case 'none':
            reservationId = null;
            break;
          case 'one':
            reservationId = lookup.reservation.id;
            break;
          case 'multiple':
            throw new AppError(
              `Booking has ${lookup.count} active reservations on idempotency replay`,
              BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
              500
            );
        }
        return Object.freeze({
          bookingId: existing.id,
          status: existing.status as 'PENDING_REVIEW' | 'CONFIRMED',
          unitPrice: existing.unitPrice.toString(),
          quantity: existing.quantity,
          reservationId,
          idempotent: true,
        });
      }
    }

    // ─── 3. Customer scope + ban gate (read-only outside tx) ─────────
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
      select: { id: true, isBanned: true },
    });
    if (!customer) {
      throw new NotFoundError('Customer not found for this shop');
    }
    if (customer.isBanned) {
      throw new ConflictError('Customer is banned and cannot place bookings');
    }

    // ─── 4. BroadcastProduct cross-shop + session-match check ────────
    //
    // Post-AR-1 schema: BroadcastProduct has its own shopId column so
    // tenant scoping no longer depends on LiveSession traversal. This
    // also enables evergreen (non-live) product codes which have
    // liveSessionId = NULL but still belong to a shop.
    //
    // Lookup BP by id within shop. Then verify session-binding:
    // - live booking (liveSessionId set):   BP.liveSessionId must equal
    //                                        the input liveSessionId
    // - non-live booking (liveSessionId null): BP must be evergreen
    //                                          (BP.liveSessionId IS NULL)
    //                                          AND the evergreen flag
    //                                          must be enabled (defense
    //                                          — route guards too).
    const bp = await prisma.broadcastProduct.findFirst({
      where: { id: broadcastProductId, shopId },
      select: {
        id: true,
        shopId: true,
        liveSessionId: true,
        variantId: true,
        priceOverride: true,
        variant: {
          select: {
            id: true,
            price: true,
            product: { select: { shopId: true } },
          },
        },
      },
    });
    if (!bp) {
      throw new NotFoundError('BroadcastProduct not found for this shop');
    }
    if (isNonLive) {
      // Non-live path: BP must be evergreen
      if (bp.liveSessionId !== null) {
        throw new ConflictError(
          'BroadcastProduct is bound to a live session; non-live booking cannot use a live-bound product code'
        );
      }
      if (!allowEvergreenBroadcastProduct()) {
        throw new ValidationError(
          'Evergreen broadcast products are not enabled. Set ALLOW_EVERGREEN_BROADCAST_PRODUCT=true to use evergreen product codes.',
          { broadcastProductId: ['requires ALLOW_EVERGREEN_BROADCAST_PRODUCT=true'] }
        );
      }
    } else {
      // Live path: BP must match the requested session
      if (bp.liveSessionId !== liveSessionId) {
        throw new ConflictError(
          'BroadcastProduct does not belong to the requested live session'
        );
      }
    }
    if (!bp.variantId || !bp.variant) {
      throw new AppError(
        'BroadcastProduct has no variantId; whole-product bookings not supported',
        BOOKING_ERROR_CODES.VARIANT_REQUIRED,
        422
      );
    }
    if (bp.variant.product.shopId !== shopId) {
      throw new ConflictError('BroadcastProduct variant belongs to a different shop');
    }

    // ─── 5. Capture unitPrice snapshot ───────────────────────────────
    const unitPriceDecimal = bp.priceOverride ?? bp.variant.price;
    const unitPrice = unitPriceDecimal.toString();

    // ─── 5.5 Tier 3.9-B-Fix-3 — Out-of-stock guard (Phase 1D) ───────
    // Read variant stock snapshot. Reject booking when not enough
    // available (quantity - reservedQty >= booking.quantity).
    // NOTE: This is SOFT-guard only — does NOT reserve stock at PENDING
    // create. Reservation timing (Boss Option X full) is a deferred
    // Boss decision (T5 stock decrement model). Until that lands, the
    // guard prevents trivial out-of-stock booking + Confirm continues
    // to atomically reserve as today. Race: between guard and Confirm,
    // another booking may grab the unit. Confirm's atomic UPDATE still
    // protects the final state.
    const variantStock = await prisma.productVariant.findUnique({
      where: { id: bp.variantId },
      select: { quantity: true, reservedQty: true },
    });
    if (variantStock) {
      const available = variantStock.quantity - variantStock.reservedQty;
      if (available < quantity) {
        throw new AppError(
          `Out of stock: requested ${quantity}, available ${available} (variant ${bp.variantId})`,
          BOOKING_ERROR_CODES.INSUFFICIENT_STOCK,
          409
        );
      }
    }

    // ─── 6. Transactional write ──────────────────────────────────────
    return prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          shopId,
          // liveSessionId is now nullable per AR-2. Prisma handles null
          // directly when the FK is optional.
          liveSessionId,
          customerId,
          broadcastProductId,
          quantity,
          unitPrice,
          status: 'PENDING_REVIEW',
          source,
          ...(conversationIdInput !== undefined && conversationIdInput !== null
            ? { conversationId: conversationIdInput }
            : {}),
          ...(channelIdentityIdInput !== undefined && channelIdentityIdInput !== null
            ? { channelIdentityId: channelIdentityIdInput }
            : {}),
          ...(sourceMessageIdInput !== undefined && sourceMessageIdInput !== null
            ? { sourceMessageId: sourceMessageIdInput }
            : {}),
          ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
          createdById: changedById,
        },
        select: { id: true },
      });

      await tx.bookingHistory.create({
        data: {
          bookingId: created.id,
          fromStatus: null,
          toStatus: 'PENDING_REVIEW',
          changedById,
        },
      });

      if (status === 'PENDING_REVIEW') {
        return Object.freeze({
          bookingId: created.id,
          status: 'PENDING_REVIEW' as const,
          unitPrice,
          quantity,
          reservationId: null,
          idempotent: false,
        });
      }

      // status === 'CONFIRMED' — call helper inline. _runConfirmInTx
      // writes the second BookingHistory row (PENDING_REVIEW→CONFIRMED),
      // reserves stock atomically, and creates the StockReservation. Any
      // throw here (insufficient stock, cross-shop variant, etc.) rolls
      // back the entire transaction including the booking insert above.
      const confirmResult = await _runConfirmInTx(tx, {
        bookingId: created.id,
        shopId,
        changedById,
      });

      return Object.freeze({
        bookingId: created.id,
        status: 'CONFIRMED' as const,
        unitPrice,
        quantity,
        reservationId: confirmResult.reservationId,
        idempotent: false,
      });
    });
  },
});
