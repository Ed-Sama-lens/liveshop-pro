import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { chatRepository } from '@/server/repositories/chat.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/chats/[id] — get chat details
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;
    const chat = await chatRepository.findById(user.shopId, id);
    if (!chat) {
      return NextResponse.json(error('Chat not found'), { status: 404 });
    }

    return NextResponse.json(ok(chat));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
