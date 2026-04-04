import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { transitionOrderSchema } from '@/lib/validation/order.schemas';
import { orderRepository } from '@/server/repositories/order.repository';
import { dispatchWebhook } from '@/server/services/webhook.service';
import { logOrderStatusChange } from '@/server/services/activity.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/status — transition order status
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'WAREHOUSE'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, transitionOrderSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const order = await orderRepository.transition(
      user.shopId,
      id,
      bodyResult.data.status,
      user.id
    );

    // Activity log (non-blocking)
    logOrderStatusChange(
      user.shopId,
      user.id,
      user.name,
      order.orderNumber,
      order.id,
      bodyResult.data.status === 'CONFIRMED' ? 'RESERVED' : 'PREVIOUS',
      bodyResult.data.status
    ).catch(() => {});

    // Dispatch webhook (non-blocking)
    const statusEventMap: Record<string, string> = {
      CONFIRMED: 'order.confirmed',
      PACKED: 'order.packed',
      SHIPPED: 'order.shipped',
      DELIVERED: 'order.delivered',
      CANCELLED: 'order.cancelled',
    };
    const webhookEvent = statusEventMap[bodyResult.data.status];
    if (webhookEvent) {
      dispatchWebhook(user.shopId, webhookEvent, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      }).catch(() => {});
    }

    return NextResponse.json(ok(order));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
