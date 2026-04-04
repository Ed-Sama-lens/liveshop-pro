import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { notificationQuerySchema } from '@/lib/validation/notification.schemas';
import { notificationRepository } from '@/server/repositories/notification.repository';

// GET /api/notifications — list notifications
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = notificationQuerySchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid query'), { status: 400 });
    }

    const { page, limit, unreadOnly, type } = result.data;
    const { items, total } = await notificationRepository.findMany(
      user.shopId,
      { unreadOnly, type },
      { page, limit }
    );

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
