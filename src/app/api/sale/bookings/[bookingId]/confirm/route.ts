import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { bookingRepository } from '@/server/repositories/booking.repository';
import { logActivity } from '@/server/services/activity.service';

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

/**
 * POST /api/sale/bookings/[bookingId]/confirm
 *
 * Confirms a PENDING_REVIEW booking and atomically reserves stock.
 * Idempotent on already-CONFIRMED bookings with intact reservation.
 *
 * Auth: OWNER or MANAGER only. CHAT_SUPPORT and WAREHOUSE forbidden per
 * RBAC §9 in dissent doc 2026-04-06-sale-mvp-dissent.md.
 *
 * Repository contract: src/server/repositories/booking.repository.ts
 */
export async function POST(
  _request: NextRequest,
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

    const { bookingId } = await context.params;

    const result = await bookingRepository.confirm({
      bookingId,
      shopId: user.shopId,
      changedById: user.id,
    });

    // Activity log (non-blocking — don't fail the response if logging fails).
    if (!result.idempotent) {
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BOOKING_CONFIRM',
        entity: 'booking',
        entityId: result.bookingId,
        description: `Booking ${result.bookingId} confirmed (qty ${result.quantity})`,
        metadata: {
          reservationId: result.reservationId,
          variantId: result.variantId,
          quantity: result.quantity,
        },
      }).catch(() => {});
    }

    return NextResponse.json(
      ok({
        bookingId: result.bookingId,
        status: result.status,
        idempotent: result.idempotent,
        reservationId: result.reservationId,
        quantity: result.quantity,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
