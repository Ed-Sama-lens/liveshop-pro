import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { prisma } from '@/lib/db/prisma';

interface RouteContext {
  params: Promise<{ shopId: string; orderId: string }>;
}

// GET /api/storefront/[shopId]/orders/[orderId] — customer order detail
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { shopId: identifier, orderId } = await context.params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');
    const customerId = request.headers.get('x-customer-id');

    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId, customerId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        channel: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { name: true } },
            variant: { select: { sku: true, attributes: true } },
          },
        },
        payment: {
          select: {
            id: true,
            status: true,
            method: true,
            amount: true,
            slipUrl: true,
            createdAt: true,
          },
        },
        shipping: {
          select: {
            id: true,
            provider: true,
            trackingNumber: true,
            status: true,
            createdAt: true,
          },
        },
        auditLog: {
          select: {
            id: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!order) {
      return NextResponse.json(error('Order not found'), { status: 404 });
    }

    const serialized = Object.freeze({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount.toString(),
      channel: order.channel,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => {
        const variantLabel = typeof item.variant.attributes === 'object' && item.variant.attributes
          ? Object.values(item.variant.attributes as Record<string, string>).join(' / ')
          : item.variant.sku;
        return Object.freeze({
          id: item.id,
          productName: item.product.name,
          variantName: variantLabel,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
        });
      }),
      payment: order.payment
        ? Object.freeze({
            id: order.payment.id,
            status: order.payment.status,
            method: order.payment.method,
            amount: order.payment.amount.toString(),
            slipUrl: order.payment.slipUrl,
            createdAt: order.payment.createdAt.toISOString(),
          })
        : null,
      shipping: order.shipping
        ? Object.freeze({
            id: order.shipping.id,
            carrier: order.shipping.provider,
            trackingNumber: order.shipping.trackingNumber,
            status: order.shipping.status,
            createdAt: order.shipping.createdAt.toISOString(),
          })
        : null,
      timeline: order.auditLog.map((a) =>
        Object.freeze({
          action: a.action,
          note: a.fromStatus && a.toStatus
            ? `${a.fromStatus} → ${a.toStatus}`
            : null,
          createdAt: a.createdAt.toISOString(),
        })
      ),
    });

    return NextResponse.json(ok(serialized));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
