import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { updateWebhookSchema } from '@/lib/validation/webhook.schemas';
import { webhookRepository } from '@/server/repositories/webhook.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/webhooks/[id] — get webhook
export async function GET(
  _request: NextRequest,
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
    const webhook = await webhookRepository.findById(user.shopId, id);

    if (!webhook) {
      return NextResponse.json(error('Webhook not found'), { status: 404 });
    }

    return NextResponse.json(ok(webhook));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/webhooks/[id] — update webhook
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only owners can update webhooks'), { status: 403 });
    }

    const body = await request.json();
    const result = updateWebhookSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const { id } = await context.params;
    const webhook = await webhookRepository.update(user.shopId, id, result.data);
    return NextResponse.json(ok(webhook));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/webhooks/[id] — delete webhook
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only owners can delete webhooks'), { status: 403 });
    }

    const { id } = await context.params;
    await webhookRepository.remove(user.shopId, id);
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
