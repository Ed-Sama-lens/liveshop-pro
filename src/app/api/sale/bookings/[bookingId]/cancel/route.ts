import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { cancelBookingBodySchema } from '@/lib/validation/booking.schemas';
import { bookingRepository } from '@/server/repositories/booking.repository';
import { logActivity } from '@/server/services/activity.service';

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

/**
 * POST /api/sale/bookings/[bookingId]/cancel
 *
 * Cancels or expires a booking. PENDING_REVIEW bookings transition to
 * CANCELLED|EXPIRED with no stock change. CONFIRMED bookings additionally
 * release the reserved stock atomically.
 *
 * CONVERTED_TO_ORDER bookings cannot be cancelled here (use the order
 * cancel/refund flow). Cross-terminal flips (CANCELLED ↔ EXPIRED) are
 * rejected.
 *
 * Body: { targetStatus: 'CANCELLED' | 'EXPIRED', reason?: string (max 500) }
 *
 * Auth: OWNER or MANAGER only. CHAT_SUPPORT and WAREHOUSE forbidden per
 * RBAC §9 in dissent doc 2026-04-06-sale-mvp-dissent.md.
 *
 * Repository contract: src/server/repositories/booking.repository.ts
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

    const bodyResult = await validateBody(request, cancelBookingBodySchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { bookingId } = await context.params;
    const { targetStatus, reason } = bodyResult.data;

    const result = await bookingRepository.cancel({
      bookingId,
      shopId: user.shopId,
      changedById: user.id,
      targetStatus,
      reason,
    });

    // Activity log (non-blocking — don't fail the response if logging fails).
    if (!result.idempotent) {
      const action = targetStatus === 'CANCELLED' ? 'BOOKING_CANCEL' : 'BOOKING_EXPIRE';
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action,
        entity: 'booking',
        entityId: result.bookingId,
        description: `Booking ${result.bookingId} ${targetStatus.toLowerCase()}${
          result.stockReleased ? ` (released ${result.releasedQuantity})` : ''
        }`,
        metadata: {
          targetStatus,
          stockReleased: result.stockReleased,
          releasedQuantity: result.releasedQuantity,
          reason: reason ?? null,
        },
      }).catch(() => {});
    }

    return NextResponse.json(
      ok({
        bookingId: result.bookingId,
        status: result.status,
        idempotent: result.idempotent,
        stockReleased: result.stockReleased,
        releasedQuantity: result.releasedQuantity,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
