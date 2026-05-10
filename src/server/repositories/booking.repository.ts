import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  BOOKING_ERROR_CODES,
  NO_EXPIRY_SENTINEL,
  buildConversionIdempotencyKey,
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
  readonly liveSessionId: string;
  readonly customerId: string;
  /** Admin User.id who triggered conversion. */
  readonly changedById: string;
  /**
   * Optional whitelist for partial conversion (Phase 2 hook). Phase 1
   * route layer omits this — conversion picks up all CONFIRMED bookings
   * for the (shop, liveSession, customer) tuple.
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
  readonly liveSessionId: string;
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
    const { shopId, liveSessionId, customerId, changedById, bookingIds } = input;

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
      liveSessionId,
      customerId,
      broadcastProductId,
      quantity,
      status,
      idempotencyKey,
      changedById,
    } = input;

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
        const payloadMatches =
          existing.liveSessionId === liveSessionId &&
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

    // ─── 4. BroadcastProduct + LiveSession + Variant.product cross-shop check ─
    const bp = await prisma.broadcastProduct.findFirst({
      where: { id: broadcastProductId, liveSessionId },
      select: {
        id: true,
        liveSessionId: true,
        variantId: true,
        priceOverride: true,
        liveSession: { select: { shopId: true } },
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
      throw new NotFoundError('BroadcastProduct not found for this live session');
    }
    if (bp.liveSession.shopId !== shopId) {
      throw new ConflictError('BroadcastProduct belongs to a different shop');
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

    // ─── 6. Transactional write ──────────────────────────────────────
    return prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          shopId,
          liveSessionId,
          customerId,
          broadcastProductId,
          quantity,
          unitPrice,
          status: 'PENDING_REVIEW',
          source: 'MANUAL',
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
