import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import { createBookingBodySchema } from '@/lib/validation/booking.schemas';
import { saleBookingsQuerySchema } from '@/lib/validation/sale.schemas';
import { bookingRepository } from '@/server/repositories/booking.repository';
import { logActivity } from '@/server/services/activity.service';
import { prisma } from '@/lib/db/prisma';
import { formatMoney2 } from '@/lib/api/money';

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
  return withRateLimit(request, async () => {
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
  });
}

// formatMoney2 helper was inlined in Commit 2N; in Commit 2R it was
// extracted to src/lib/api/money.ts so the new GET handler below and the
// existing POST handler share one implementation. Behavior is identical
// (Number.toFixed(2) with NaN-safe fallback). See 2P for the shared util.

/**
 * GET /api/sale/bookings
 *
 * Read-only booking queue endpoint for the /sale workspace (Commit 2R).
 * Third of three read-only GET endpoints (2P/2Q/2R) unblocking the
 * /sale UI wiring commit 2S.
 *
 * Coexists with the POST handler above (Commit 2N — manual create) in
 * the same route file. GET is intentionally NOT wrapped with
 * `withRateLimit` to match the project's read-route pattern; the POST
 * rate limit (added in 2N-HARDENING) stays in place untouched.
 *
 * Auth/RBAC (mirrors 2P + 2Q)
 * - requireAuth() → 401
 * - user.shopId required → 403
 * - Roles: OWNER, MANAGER, CHAT_SUPPORT (CHAT_SUPPORT read per RBAC §9)
 * - WAREHOUSE denied to match /sale page rule
 *
 * Query params (zod via saleBookingsQuerySchema in src/lib/validation/sale.schemas.ts)
 * - liveSessionId (REQUIRED, 1..128 chars) — per Boss spec, prevents
 *   accidental broad shop-wide booking dump.
 * - status?       (one of PENDING_REVIEW | CONFIRMED | CANCELLED |
 *                  EXPIRED | CONVERTED_TO_ORDER)
 * - customerId?   (1..128 chars)
 * - limit         (int 1..100, default 50)
 *
 * Response (200)
 *   {
 *     success: true,
 *     data: {
 *       liveSessionId,
 *       currency: 'MYR',
 *       bookings: [{
 *         bookingId, status, source, quantity,
 *         unitPrice (fixed-2-decimal string),
 *         customerId, customerName, customerPhone | null,
 *         broadcastProductId, displayCode, productName,
 *         variantId, variantName, sku,
 *         createdAt, confirmedAt | null, cancelledAt | null,
 *         convertedOrderId | null,
 *         activeReservationId | null,
 *         idempotencyKey | null
 *       }]
 *     }
 *   }
 *
 * Sorting
 * - createdAt desc (most recent first) to match what admin expects when
 *   reviewing a live session in progress.
 *
 * Filtering / scoping
 * - Where clause is `{shopId: user.shopId, liveSessionId, ...optional}` —
 *   shop scoping is applied at the query level so cross-shop probing
 *   returns an empty list rather than NotFoundError.
 * - Validation failure on missing liveSessionId returns 400 (Boss spec).
 *
 * activeReservationId
 * - Returns the id of the single active StockReservation
 *   (`releasedAt: null`) on the booking, if exactly one exists. If
 *   zero or multiple, returns null. The /sale UI does NOT need to
 *   throw RESERVATION_INTEGRITY_ERROR here (read-only); admin can
 *   discover corruption via subsequent confirm/cancel attempts.
 *
 * No mutation. No rate limit on GET. No customer-facing messages.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), {
        status: 403,
      });
    }

    if (!['OWNER', 'MANAGER', 'CHAT_SUPPORT'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = saleBookingsQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return NextResponse.json(
        { success: false, error: 'Validation failed', fields: fieldErrors },
        { status: 400 }
      );
    }

    const { liveSessionId, status, customerId, limit } = parsed.data;

    const rows = await prisma.booking.findMany({
      where: {
        shopId: user.shopId,
        liveSessionId,
        ...(status !== undefined ? { status } : {}),
        ...(customerId !== undefined ? { customerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        source: true,
        quantity: true,
        unitPrice: true,
        customerId: true,
        broadcastProductId: true,
        createdAt: true,
        confirmedAt: true,
        cancelledAt: true,
        convertedOrderId: true,
        idempotencyKey: true,
        customer: {
          select: { name: true, phone: true },
        },
        broadcastProduct: {
          select: {
            displayCode: true,
            product: { select: { name: true } },
            variant: {
              select: {
                id: true,
                sku: true,
                attributes: true,
              },
            },
          },
        },
        stockReservations: {
          where: { releasedAt: null },
          select: { id: true },
        },
      },
    });

    const bookings = rows.map((b) => {
      const variant = b.broadcastProduct?.variant ?? null;
      const variantName = describeVariantAttrs(variant?.attributes ?? null);
      const activeReservationCount = b.stockReservations.length;
      const integrity = classifyReservationIntegrity(
        b.status,
        b.stockReservations
      );
      return Object.freeze({
        bookingId: b.id,
        status: b.status,
        source: b.source,
        quantity: b.quantity,
        unitPrice: formatMoney2(b.unitPrice.toString()),
        customerId: b.customerId,
        customerName: b.customer.name,
        customerPhone: b.customer.phone ?? null,
        broadcastProductId: b.broadcastProductId,
        displayCode: b.broadcastProduct?.displayCode ?? null,
        productName: b.broadcastProduct?.product.name ?? null,
        variantId: variant?.id ?? null,
        variantName,
        sku: variant?.sku ?? null,
        createdAt: b.createdAt,
        confirmedAt: b.confirmedAt,
        cancelledAt: b.cancelledAt,
        convertedOrderId: b.convertedOrderId,
        activeReservationId: integrity.activeReservationId,
        activeReservationCount,
        reservationIntegrity: integrity.label,
        idempotencyKey: b.idempotencyKey,
      });
    });

    return NextResponse.json(
      Object.freeze({
        success: true,
        data: Object.freeze({
          liveSessionId,
          currency: 'MYR' as const,
          bookings,
        }),
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

/**
 * Pure: short human-readable label for variant attributes JSON.
 * Mirrors the helper in /api/sale/live-sessions/[id]/broadcast-products.
 * Kept local to avoid cross-route coupling on a tiny formatter; future
 * cleanup could lift both to a shared util if a third call site appears.
 */
function describeVariantAttrs(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object') return null;
  const entries = Object.entries(attributes as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}

/**
 * Reservation integrity classifier (Commit 2T).
 *
 * Disambiguates the previously-overloaded `activeReservationId: null`
 * return shape so /sale UI can surface integrity issues to admin
 * without firing a mutation. Mirrors the discriminated union returned
 * by `resolveActiveReservation` in src/lib/sale/booking-rules.ts but
 * adds a `NOT_APPLICABLE` label for non-CONFIRMED booking states where
 * a missing reservation is expected (PENDING_REVIEW / CANCELLED /
 * EXPIRED / CONVERTED_TO_ORDER).
 *
 * Labels:
 * - OK             — booking is CONFIRMED and has exactly 1 active reservation
 * - MISSING        — booking is CONFIRMED but has 0 active reservations
 *                    (data corruption — confirm/cancel/convert flows raise
 *                     RESERVATION_INTEGRITY_ERROR on this)
 * - MULTIPLE       — booking has ≥2 active reservations (also corruption)
 * - NOT_APPLICABLE — booking is in a non-CONFIRMED state where no active
 *                    reservation is expected. Returned for both 0 and
 *                    rare leak cases (≥1 active reservation on
 *                    CANCELLED/EXPIRED would still surface as MULTIPLE
 *                    if count ≥ 2; count === 1 returns NOT_APPLICABLE
 *                    with the id so /sale UI can show "stale reservation
 *                    on terminal booking" hint).
 */
type ReservationIntegrityLabel = 'OK' | 'MISSING' | 'MULTIPLE' | 'NOT_APPLICABLE';

function classifyReservationIntegrity(
  status: string,
  activeReservations: ReadonlyArray<{ id: string }>
): { label: ReservationIntegrityLabel; activeReservationId: string | null } {
  const count = activeReservations.length;
  if (count >= 2) {
    return { label: 'MULTIPLE', activeReservationId: null };
  }
  if (status === 'CONFIRMED') {
    if (count === 1) {
      return { label: 'OK', activeReservationId: activeReservations[0].id };
    }
    return { label: 'MISSING', activeReservationId: null };
  }
  // Non-CONFIRMED status — reservation absence is expected.
  if (count === 1) {
    return {
      label: 'NOT_APPLICABLE',
      activeReservationId: activeReservations[0].id,
    };
  }
  return { label: 'NOT_APPLICABLE', activeReservationId: null };
}
