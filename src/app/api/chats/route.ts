import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { chatQuerySchema } from '@/lib/validation/chat.schemas';
import { chatRepository } from '@/server/repositories/chat.repository';

// GET /api/chats — list conversations
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = chatQuerySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(error('Invalid query parameters'), { status: 400 });
    }

    const { page, limit, ...filters } = parsed.data;
    const result = await chatRepository.findMany(user.shopId, filters, { page, limit });

    return NextResponse.json(
      paginated(result.items, { total: result.total, page, limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
