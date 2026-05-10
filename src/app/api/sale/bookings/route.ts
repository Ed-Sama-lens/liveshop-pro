import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { createBookingBodySchema } from '@/lib/validation/booking.schemas';
import { bookingRepository } from '@/server/repositories/booking.repository';
import { logActivity } from '@/server/services/activity.service';

/**
 * POST /api/sale/bookings
 *
 * Manually creates a booking from admin UI (Commit 2N — exposes
 * `bookingRepository.createManual()` runtime added in Commits 2M-b/2M-c).
 *
 * Body:
 *   {
 *     liveSessionId, customerId, broadcastProductId,
 *     quantity (int 1..999),
 *     status: 'PENDING_REVIEW' | 'CONFIRMED',
 *     idempotencyKey?: /^[A-Za-z0-9_-]{8,128}$/
 *   }
 *
 * Auth: OWNER or MANAGER only. CHAT_SUPPORT and WAREHOUSE forbidden per
 * RBAC §9 in dissent doc 2026-04-06-sale-mvp-dissent.md. CHAT_SUPPORT
 * may READ /sale pages but mutation routes deny.
 *
 * Response 200 (success):
 *   {
 *     success: true,
 *     data: {
 *       bookingId, status, quantity, unitPrice,
 *       broadcastProductId, customerId, liveSessionId,
 *       idempotent, reservation: { id } | null
 *     }
 *   }
 *
 * Money: `unitPrice` is normalized to fixed 2 decimals at this route
 * boundary (e.g. '5.50' instead of '5.5'). Repository layer returns the
 * raw `Decimal.toString()` form for parity with other repo methods;
 * route-level formatting keeps the API contract predictable for UI
 * consumers without forcing a broad money-formatter refactor.
 *
 * Errors mapped via `toAppError` → status code:
 *   401 unauthenticated, 403 forbidden / no shop / wrong role,
 *   400 validation (via validateBody), 404 customer/BP not found,
 *   409 banned customer / cross-shop / insufficient stock /
 *       idempotency payload mismatch,
 *   422 VARIANT_REQUIRED, 500 reservation integrity / unknown.
 *
 * Repository contract: src/server/repositories/booking.repository.ts
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), {
        status: 403,
      });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createBookingBodySchema);
    if ('error' in bodyResult) return bodyResult.error;

    const {
      liveSessionId,
      customerId,
      broadcastProductId,
      quantity,
      status,
      idempotencyKey,
    } = bodyResult.data;

    const result = await bookingRepository.createManual({
      shopId: user.shopId,
      liveSessionId,
      customerId,
      broadcastProductId,
      quantity,
      status,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      changedById: user.id,
    });

    // Activity log (non-blocking — never fail the response on logging error).
    // Skip on idempotent replay so re-clicks don't multiply audit rows.
    if (!result.idempotent) {
      const action =
        result.status === 'CONFIRMED'
          ? 'BOOKING_CREATED_AND_CONFIRMED'
          : 'BOOKING_CREATED_MANUAL';
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action,
        entity: 'booking',
        entityId: result.bookingId,
        description: `Booking ${result.bookingId} ${action.toLowerCase()} (qty ${result.quantity})`,
        metadata: {
          liveSessionId,
          customerId,
          broadcastProductId,
          quantity: result.quantity,
          status: result.status,
          unitPrice: result.unitPrice,
          reservationId: result.reservationId,
        },
      }).catch(() => {});
    }

    return NextResponse.json(
      ok({
        bookingId: result.bookingId,
        status: result.status,
        quantity: result.quantity,
        unitPrice: formatMoney2(result.unitPrice),
        broadcastProductId,
        customerId,
        liveSessionId,
        idempotent: result.idempotent,
        reservation:
          result.reservationId !== null ? { id: result.reservationId } : null,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

/**
 * Normalize a Decimal-as-string money value (Prisma `Decimal.toString()`)
 * to fixed-2-decimal form for predictable customer/admin UI rendering.
 *
 * - '5'      → '5.00'
 * - '5.5'    → '5.50'
 * - '5.50'   → '5.50'
 * - '5.555'  → '5.56' (banker-style rounding from `Number.toFixed`)
 * - non-numeric / undefined → returns input unchanged (defensive; should
 *   never be called with a non-numeric string given the repository
 *   contract returns Decimal-serialized strings).
 *
 * Scope: route-boundary only. Do NOT promote to repository layer without
 * explicit approval — convertToOrder + confirm/cancel responses use raw
 * Decimal strings today and the 2N spec restricts cross-cutting changes.
 */
function formatMoney2(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toFixed(2);
}
