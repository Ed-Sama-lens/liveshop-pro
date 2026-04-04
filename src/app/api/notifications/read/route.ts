import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { markNotificationsReadSchema } from '@/lib/validation/notification.schemas';
import { notificationRepository } from '@/server/repositories/notification.repository';

// POST /api/notifications/read — mark specific notifications as read
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const body = await request.json();
    const result = markNotificationsReadSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const count = await notificationRepository.markRead(user.shopId, result.data.ids);
    return NextResponse.json(ok({ marked: count }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/notifications/read — mark ALL notifications as read
export async function DELETE(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const count = await notificationRepository.markAllRead(user.shopId);
    return NextResponse.json(ok({ marked: count }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
