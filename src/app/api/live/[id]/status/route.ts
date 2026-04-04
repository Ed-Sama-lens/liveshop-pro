import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { liveRepository } from '@/server/repositories/live.repository';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const transitionSchema = z.object({
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED']),
});

// POST /api/live/[id]/status — transition live session status
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

    const body = await request.json();
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(error('Invalid status'), { status: 400 });
    }

    const { id } = await context.params;
    const session = await liveRepository.transition(user.shopId, id, parsed.data.status);

    return NextResponse.json(ok(session));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
