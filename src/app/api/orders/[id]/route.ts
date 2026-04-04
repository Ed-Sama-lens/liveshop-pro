import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { updateOrderSchema } from '@/lib/validation/order.schemas';
import { orderRepository } from '@/server/repositories/order.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;
    const order = await orderRepository.findById(user.shopId, id);

    if (!order) {
      return NextResponse.json(error('Order not found'), { status: 404 });
    }

    return NextResponse.json(ok(order));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/orders/[id] — update order notes/shipping fee (OWNER, MANAGER)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, updateOrderSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const order = await orderRepository.update(user.shopId, id, bodyResult.data);

    return NextResponse.json(ok(order));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
