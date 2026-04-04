import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { updateLiveSessionSchema } from '@/lib/validation/live.schemas';
import { liveRepository } from '@/server/repositories/live.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/live/[id] — get live session details
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
    const session = await liveRepository.findById(user.shopId, id);
    if (!session) {
      return NextResponse.json(error('Live session not found'), { status: 404 });
    }

    return NextResponse.json(ok(session));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/live/[id] — update live session (OWNER, MANAGER)
export async function PATCH(
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

    const bodyResult = await validateBody(request, updateLiveSessionSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const session = await liveRepository.update(user.shopId, id, bodyResult.data);

    return NextResponse.json(ok(session));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/live/[id] — delete live session (OWNER, MANAGER)
export async function DELETE(
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
    await liveRepository.remove(user.shopId, id);

    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
