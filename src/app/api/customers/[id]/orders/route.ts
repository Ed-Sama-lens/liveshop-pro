import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateQuery } from '@/lib/validation/middleware';
import { customerRepository } from '@/server/repositories/customer.repository';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/customers/[id]/orders — list customer's orders with pagination
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const queryResult = validateQuery(request, ordersQuerySchema);
    if ('error' in queryResult) return queryResult.error;

    const { id } = await context.params;
    const { page, limit } = queryResult.data;

    const { items, total } = await customerRepository.findOrders(
      user.shopId,
      id,
      { page, limit }
    );

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
