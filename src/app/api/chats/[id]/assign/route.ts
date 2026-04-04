import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { assignChatSchema } from '@/lib/validation/chat.schemas';
import { chatRepository } from '@/server/repositories/chat.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/chats/[id]/assign — assign or unassign chat
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

    const bodyResult = await validateBody(request, assignChatSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const chat = await chatRepository.assignUser(
      user.shopId,
      id,
      bodyResult.data.userId ?? null
    );

    return NextResponse.json(ok(chat));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
