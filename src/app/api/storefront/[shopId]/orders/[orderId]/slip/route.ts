import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { saveFile } from '@/lib/upload/storage';
import { notifyPaymentReceived } from '@/server/services/notification.service';
import { dispatchWebhook } from '@/server/services/webhook.service';

interface RouteContext {
  params: Promise<{ shopId: string; orderId: string }>;
}

// POST /api/storefront/[shopId]/orders/[orderId]/slip — upload payment slip
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { shopId, orderId } = await context.params;
    const customerId = request.headers.get('x-customer-id');

    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    // Verify order belongs to this customer and shop
    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId, customerId },
      select: { id: true, orderNumber: true, totalAmount: true },
    });

    if (!order) {
      return NextResponse.json(error('Order not found'), { status: 404 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('slip') as File | null;
    const method = (formData.get('method') as string) ?? 'QR_CODE';

    if (!file) {
      return NextResponse.json(error('No slip file provided'), { status: 400 });
    }

    // Save the slip image
    const uploadResult = await saveFile(file, `${shopId}/slips`);

    // Create or update payment record
    const existingPayment = await prisma.payment.findUnique({
      where: { orderId },
    });

    if (existingPayment) {
      await prisma.payment.update({
        where: { orderId },
        data: {
          slipUrl: uploadResult.url,
          method: method as 'TRANSFER' | 'QR_CODE' | 'COD',
        },
      });
    } else {
      await prisma.payment.create({
        data: {
          orderId,
          amount: order.totalAmount,
          method: method as 'TRANSFER' | 'QR_CODE' | 'COD',
          slipUrl: uploadResult.url,
        },
      });
    }

    // Notify shop owner (non-blocking)
    notifyPaymentReceived(
      shopId,
      order.orderNumber,
      String(order.totalAmount)
    ).catch(() => {});

    // Webhook dispatch (non-blocking)
    dispatchWebhook(shopId, 'payment.received', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: String(order.totalAmount),
      method,
      slipUrl: uploadResult.url,
    }).catch(() => {});

    return NextResponse.json(ok({ slipUrl: uploadResult.url }), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
