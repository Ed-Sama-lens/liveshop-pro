import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { paymentRepository } from '@/server/repositories/payment.repository';

// GET /api/payments/pending-count — count of pending payments
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }

    const count = await paymentRepository.countPending(user.shopId);
    return NextResponse.json(ok({ count }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
