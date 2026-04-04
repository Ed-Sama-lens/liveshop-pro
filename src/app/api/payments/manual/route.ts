import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { logPaymentVerified } from '@/server/services/activity.service';
import { dispatchWebhook } from '@/server/services/webhook.service';

const manualPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(['TRANSFER', 'QR_CODE', 'COD']).default('COD'),
  note: z.string().max(500).optional(),
});

// POST /api/payments/manual — record manual payment (cash, outside system)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const result = manualPaymentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const { orderId, method, note } = result.data;

    // Verify order belongs to this shop
    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId: user.shopId },
      select: { id: true, orderNumber: true, totalAmount: true, status: true },
    });

    if (!order) {
      return NextResponse.json(error('Order not found'), { status: 404 });
    }

    // Create or update payment as VERIFIED immediately
    const payment = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { orderId } });

      const paymentRecord = existing
        ? await tx.payment.update({
            where: { orderId },
            data: {
              status: 'VERIFIED',
              method: method as 'TRANSFER' | 'QR_CODE' | 'COD',
              verifiedAt: new Date(),
            },
          })
        : await tx.payment.create({
            data: {
              orderId,
              amount: order.totalAmount,
              method: method as 'TRANSFER' | 'QR_CODE' | 'COD',
              status: 'VERIFIED',
              verifiedAt: new Date(),
            },
          });

      // Auto-confirm order if RESERVED
      if (order.status === 'RESERVED') {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
        await tx.orderAudit.create({
          data: {
            orderId,
            action: 'STATUS_CHANGE',
            fromStatus: 'RESERVED',
            toStatus: 'CONFIRMED',
            metadata: {
              reason: `Manual payment by admin${note ? `: ${note}` : ''}`,
              performedBy: user.id,
            },
          },
        });
      }

      // Audit the manual payment
      await tx.orderAudit.create({
        data: {
          orderId,
          action: 'MANUAL_PAYMENT',
          metadata: {
            method,
            amount: order.totalAmount.toString(),
            note: note ?? null,
            performedBy: user.id,
          },
        },
      });

      return paymentRecord;
    });

    // Activity log (non-blocking)
    logPaymentVerified(
      user.shopId, user.id, user.name,
      order.orderNumber, orderId, order.totalAmount.toString()
    ).catch(() => {});

    // Webhook (non-blocking)
    dispatchWebhook(user.shopId, 'payment.verified', {
      paymentId: payment.id,
      orderId,
      orderNumber: order.orderNumber,
      amount: order.totalAmount.toString(),
      method,
      manual: true,
    }).catch(() => {});

    return NextResponse.json(ok({
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      method: payment.method,
    }), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
