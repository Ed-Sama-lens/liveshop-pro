import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { transitionShipmentSchema } from '@/lib/validation/shipping.schemas';
import { shipmentRepository } from '@/server/repositories/shipment.repository';
import { sendEmail } from '@/lib/email/client';
import { shippingUpdateEmail } from '@/lib/email/templates';
import { notifyShipmentUpdate } from '@/server/services/notification.service';
import { dispatchWebhook } from '@/server/services/webhook.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/shipments/[id]/status — transition shipment status
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'WAREHOUSE'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, transitionShipmentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const shipment = await shipmentRepository.transition(
      user.shopId,
      id,
      bodyResult.data.status
    );

    // Send shipping update email (non-blocking)
    const { prisma } = await import('@/lib/db/prisma');
    const orderWithCustomer = await prisma.order.findUnique({
      where: { id: shipment.orderId },
      select: {
        orderNumber: true,
        shop: { select: { name: true } },
        customer: { select: { name: true, email: true } },
      },
    });

    if (orderWithCustomer?.customer?.email) {
      const emailData = shippingUpdateEmail({
        customerName: orderWithCustomer.customer.name,
        orderNumber: orderWithCustomer.orderNumber,
        trackingNumber: shipment.trackingNumber,
        provider: shipment.provider,
        status: shipment.status,
        shopName: orderWithCustomer.shop?.name ?? 'LiveShop',
      });

      sendEmail({
        to: orderWithCustomer.customer.email,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      }).catch(() => {
        // Email failure should not block status transition
      });
    }

    // In-app notification (non-blocking)
    if (orderWithCustomer) {
      notifyShipmentUpdate(
        user.shopId,
        orderWithCustomer.orderNumber,
        shipment.status
      ).catch(() => {});
    }

    // Webhook dispatch (non-blocking)
    dispatchWebhook(user.shopId, 'shipment.updated', {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      orderNumber: orderWithCustomer?.orderNumber ?? '',
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
      provider: shipment.provider,
    }).catch(() => {});

    return NextResponse.json(ok(shipment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
