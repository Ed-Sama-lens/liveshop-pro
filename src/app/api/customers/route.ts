import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, validateQuery } from '@/lib/validation/middleware';
import { createCustomerSchema, customerQuerySchema } from '@/lib/validation/customer.schemas';
import { customerRepository } from '@/server/repositories/customer.repository';

// GET /api/customers — list customers with pagination and filters
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const queryResult = validateQuery(request, customerQuerySchema);
    if ('error' in queryResult) return queryResult.error;

    const { page, limit, search, channel, label, isBanned } = queryResult.data;

    const { items, total } = await customerRepository.findMany(
      user.shopId,
      { search, channel, label, isBanned },
      { page, limit }
    );

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/customers — create customer (OWNER, MANAGER only)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createCustomerSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const customer = await customerRepository.create(user.shopId, bodyResult.data);

    return NextResponse.json(ok(customer), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
