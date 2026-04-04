import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { verifyPaymentSchema } from '@/lib/validation/order.schemas';
import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/payment/verify — verify or reject payment (legacy)
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, verifyPaymentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;

    const payment = await prisma.payment.findUnique({ where: { orderId: id } });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new ConflictError(`Cannot verify payment in ${payment.status} status`);
    }

    const updated = await prisma.payment.update({
      where: { orderId: id },
      data: {
        status: bodyResult.data.verified ? 'VERIFIED' : 'FAILED',
        verifiedAt: bodyResult.data.verified ? new Date() : null,
      },
    });

    return NextResponse.json(ok({
      id: updated.id,
      orderId: updated.orderId,
      status: updated.status,
      verifiedAt: updated.verifiedAt,
    }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
