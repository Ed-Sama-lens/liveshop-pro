import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { chatRepository } from '@/server/repositories/chat.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/chats/[id]/read — mark all messages as read
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;
    await chatRepository.markAsRead(user.shopId, id);

    return NextResponse.json(ok({ marked: true }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
