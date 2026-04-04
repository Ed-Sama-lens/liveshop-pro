import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { verifyPaymentSchema } from '@/lib/validation/payment.schemas';
import { paymentRepository } from '@/server/repositories/payment.repository';
import { logPaymentVerified } from '@/server/services/activity.service';
import { logActivity } from '@/server/services/activity.service';
import { dispatchWebhook } from '@/server/services/webhook.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/payments/[id] — get payment detail
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

    return NextResponse.json(ok(payment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/payments/[id] — verify or reject payment
export async function PATCH(
  request: NextRequest,
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

    const bodyResult = await validateBody(request, verifyPaymentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const { action } = bodyResult.data;

    const payment = action === 'VERIFY'
      ? await paymentRepository.verifyAdmin(user.shopId, id, user.id)
      : await paymentRepository.rejectAdmin(user.shopId, id, user.id);

    // Activity log (non-blocking)
    if (action === 'VERIFY') {
      logPaymentVerified(
        user.shopId, user.id, user.name,
        payment.order.orderNumber, payment.orderId, payment.amount
      ).catch(() => {});
    } else {
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'PAYMENT_REJECTED',
        entity: 'payment',
        entityId: payment.orderId,
        description: `Payment rejected for order ${payment.order.orderNumber}`,
        metadata: { orderNumber: payment.order.orderNumber, amount: payment.amount },
      }).catch(() => {});
    }

    // Webhook dispatch (non-blocking)
    dispatchWebhook(user.shopId, action === 'VERIFY' ? 'payment.verified' : 'payment.rejected', {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      amount: payment.amount,
      status: payment.status,
    }).catch(() => {});

    return NextResponse.json(ok(payment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
