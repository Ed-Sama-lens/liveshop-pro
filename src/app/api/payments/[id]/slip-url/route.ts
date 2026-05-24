import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { paymentRepository } from '@/server/repositories/payment.repository';
import {
  getSignedReadUrl,
  SIGNED_URL_DEFAULT_EXPIRY_SECONDS,
} from '@/lib/upload/storage';

/**
 * GET /api/payments/[id]/slip-url
 *
 * Returns a short-lived signed URL for reading the payment slip
 * attached to the given payment. Closes the R2 G3 PII leak risk
 * (slip uploaded to public CDN URL would otherwise be permanently
 * fetchable by anyone with the URL).
 *
 * Auth: OWNER | MANAGER for the owning shop only.
 * Side effects: NONE. Read-only. Does not mutate Payment, Order, or
 * StockReservation. Does not touch outbound. Does not touch R2.
 *
 * Response: `{ url, expiresAt }` where:
 *   - url       — presigned R2 GET URL
 *   - expiresAt — ISO timestamp matching presign expiry
 *
 * Errors:
 *   - 401 — unauthenticated
 *   - 403 — wrong shop OR insufficient role
 *   - 404 — payment not found OR no slip uploaded yet
 *   - 500 — R2 signer threw (likely missing R2 config)
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const { id } = await context.params;
    const payment = await paymentRepository.findByIdAdmin(user.shopId, id);
    if (!payment) {
      return NextResponse.json(error('Payment not found'), { status: 404 });
    }
    if (!payment.slipUrl) {
      return NextResponse.json(error('No slip uploaded'), { status: 404 });
    }

    const signed = await getSignedReadUrl({
      publicUrlOrKey: payment.slipUrl,
      expirySeconds: SIGNED_URL_DEFAULT_EXPIRY_SECONDS,
    });

    return NextResponse.json(
      ok({
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
