import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { banCustomerSchema } from '@/lib/validation/customer.schemas';
import { customerRepository } from '@/server/repositories/customer.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/customers/[id]/ban — ban a customer (OWNER, MANAGER only)
export async function POST(
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

    const bodyResult = await validateBody(request, banCustomerSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const customer = await customerRepository.ban(user.shopId, id, bodyResult.data.reason);

    return NextResponse.json(ok(customer));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
