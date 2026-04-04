import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { sendMessageSchema, messageQuerySchema } from '@/lib/validation/chat.schemas';
import { chatRepository } from '@/server/repositories/chat.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/chats/[id]/messages — list messages
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

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = messageQuerySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(error('Invalid query parameters'), { status: 400 });
    }

    const { page, limit, ...rest } = parsed.data;
    const result = await chatRepository.getMessages(user.shopId, id, { page, limit, ...rest });

    return NextResponse.json(
      paginated(result.items, { total: result.total, page, limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/chats/[id]/messages — send a message
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'CHAT_SUPPORT'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, sendMessageSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const message = await chatRepository.sendMessage(
      user.shopId,
      id,
      bodyResult.data.content,
      bodyResult.data.mediaUrl
    );

    return NextResponse.json(ok(message), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
