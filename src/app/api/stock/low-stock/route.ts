import { requireRole } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError, ForbiddenError } from '@/lib/errors';
import { getLowStockVariants } from '@/server/repositories/stock.repository';

export async function GET(): Promise<Response> {
  try {
    const user = await requireRole('OWNER', 'MANAGER', 'WAREHOUSE');

    if (!user.shopId) {
      throw new ForbiddenError('User is not associated with a shop');
    }

    const variants = await getLowStockVariants(user.shopId);

    return Response.json(ok(variants));
  } catch (err: unknown) {
    const appErr = toAppError(err);
    return Response.json(error(appErr.message), { status: appErr.status });
  }
}
