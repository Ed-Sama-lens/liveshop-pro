import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { webhookLogQuerySchema } from '@/lib/validation/webhook.schemas';
import { webhookRepository } from '@/server/repositories/webhook.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/webhooks/[id]/logs — delivery logs
export async function GET(
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

    const { id } = await context.params;

    // Verify webhook belongs to this shop
    const webhook = await webhookRepository.findById(user.shopId, id);
    if (!webhook) {
      return NextResponse.json(error('Webhook not found'), { status: 404 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = webhookLogQuerySchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(error('Invalid query'), { status: 400 });
    }

    const { page, limit } = result.data;
    const { items, total } = await webhookRepository.getLogs(id, { page, limit });

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
