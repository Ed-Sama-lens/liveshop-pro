import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { paymentQuerySchema } from '@/lib/validation/payment.schemas';
import { paymentRepository } from '@/server/repositories/payment.repository';

// GET /api/payments — list payments for the shop (admin)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = paymentQuerySchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid query'), { status: 400 });
    }

    const query = result.data;
    const { data, total } = await paymentRepository.findManyAdmin(user.shopId, query);

    return NextResponse.json(
      paginated(data, { total, page: query.page, limit: query.limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
