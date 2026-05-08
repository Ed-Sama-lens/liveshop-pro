import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { AppError, ConflictError, NotFoundError } from '@/lib/errors';
import {
  BOOKING_ERROR_CODES,
  NO_EXPIRY_SENTINEL,
  isAlreadyConfirmedIdempotent,
  pickActiveReservation,
  preflightCancel,
  preflightConfirm,
  type ActiveReservationSnapshot,
  type BookingStatus,
  type CancelTargetStatus,
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

// ─── Repository ──────────────────────────────────────────────────────────

export const bookingRepository = Object.freeze({
  /**
   * Confirm a PENDING_REVIEW booking and atomically reserve stock.
   *
   * Idempotent: re-calling on an already-CONFIRMED booking with matching
   * active StockReservation returns success without side effects.
   */
  async confirm(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    const { bookingId, shopId, changedById } = input;

    return prisma.$transaction(async (tx) => {
      // 1. Read booking + broadcast product + active reservations for this booking.
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, shopId },
        include: {
          broadcastProduct: { select: { id: true, variantId: true } },
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

      const currentStatus = booking.status as BookingStatus;
      const reservationSnapshots = booking.stockReservations.map(toReservationSnapshot);
      const matching = pickActiveReservation(reservationSnapshots, booking.id);

      // 2. Idempotency path — already CONFIRMED.
      const idempotency = isAlreadyConfirmedIdempotent(
        currentStatus,
        matching,
        booking.quantity
      );
      if (idempotency.integrityError) {
        throw new AppError(
          'CONFIRMED booking missing matching active StockReservation',
          BOOKING_ERROR_CODES.RESERVATION_INTEGRITY_ERROR,
          500
        );
      }
      if (idempotency.idempotent && matching) {
        return Object.freeze({
          bookingId: booking.id,
          status: 'CONFIRMED' as const,
          reservationId: matching.id,
          variantId: matching.variantId,
          quantity: matching.quantity,
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
    });
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
        const reservation = pickActiveReservation(snapshots, booking.id);

        if (!reservation) {
          throw new AppError(
            'CONFIRMED booking has no active StockReservation to release',
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
});
