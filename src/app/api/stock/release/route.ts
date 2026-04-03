import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { releaseReservationSchema } from '@/lib/validation/stock.schemas';
import { release } from '@/server/repositories/stock.repository';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole('OWNER', 'MANAGER', 'WAREHOUSE');

    const body: unknown = await request.json();
    const parsed = releaseReservationSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(error('Invalid request body'), { status: 400 });
    }

    const { reservationId } = parsed.data;
    const result = await release(reservationId);

    return Response.json(ok(result));
  } catch (err: unknown) {
    const appErr = toAppError(err);
    return Response.json(error(appErr.message), { status: appErr.status });
  }
}
