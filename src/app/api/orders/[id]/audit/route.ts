import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { orderRepository } from '@/server/repositories/order.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]/audit — get order audit log
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
    const logs = await orderRepository.getAuditLog(user.shopId, id);

    return NextResponse.json(ok(logs));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
