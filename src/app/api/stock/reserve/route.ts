import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { reserveStockSchema } from '@/lib/validation/stock.schemas';
import { reserve } from '@/server/repositories/stock.repository';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole('OWNER', 'MANAGER', 'WAREHOUSE');

    const body: unknown = await request.json();
    const parsed = reserveStockSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(error('Invalid request body'), { status: 400 });
    }

    const { variantId, quantity, orderId } = parsed.data;
    const result = await reserve(variantId, quantity, orderId);

    return Response.json(ok(result), { status: 201 });
  } catch (err: unknown) {
    const appErr = toAppError(err);
    return Response.json(error(appErr.message), { status: appErr.status });
  }
}
