import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { createPaymentSchema } from '@/lib/validation/order.schemas';
import { paymentRepository } from '@/server/repositories/payment.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]/payment — get payment for order
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    await requireAuth();

    const { id } = await context.params;
    const payment = await paymentRepository.findByOrderId(id);

    if (!payment) {
      return NextResponse.json(error('Payment not found'), { status: 404 });
    }

    return NextResponse.json(ok(payment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/orders/[id]/payment — create payment
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createPaymentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const payment = await paymentRepository.create(id, bodyResult.data);

    return NextResponse.json(ok(payment), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
