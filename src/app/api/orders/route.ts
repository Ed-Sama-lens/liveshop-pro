import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, validateQuery } from '@/lib/validation/middleware';
import { createOrderSchema, orderQuerySchema } from '@/lib/validation/order.schemas';
import { orderRepository } from '@/server/repositories/order.repository';

// GET /api/orders — list orders with pagination and filters
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const queryResult = validateQuery(request, orderQuerySchema);
    if ('error' in queryResult) return queryResult.error;

    const { page, limit, ...filters } = queryResult.data;

    const { items, total } = await orderRepository.findMany(
      user.shopId,
      filters,
      { page, limit }
    );

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/orders — create order (OWNER, MANAGER, CHAT_SUPPORT)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'CHAT_SUPPORT'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createOrderSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const order = await orderRepository.create(user.shopId, bodyResult.data);

    return NextResponse.json(ok(order), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
