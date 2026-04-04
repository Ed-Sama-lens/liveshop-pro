import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { generateInvoiceHtml } from '@/lib/export/invoice';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]/invoice — generate printable invoice HTML
export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;

    const order = await prisma.order.findFirst({
      where: { id, shopId: user.shopId },
      include: {
        shop: { select: { name: true } },
        customer: {
          select: { name: true, phone: true, email: true, address: true },
        },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
        payment: { select: { status: true, method: true } },
      },
    });

    if (!order) {
      return NextResponse.json(error('Order not found'), { status: 404 });
    }

    const subtotal = order.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    const html = generateInvoiceHtml({
      orderNumber: order.orderNumber,
      orderDate: order.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      shopName: order.shop.name,
      customerName: order.customer?.name ?? 'Unknown',
      customerPhone: order.customer?.phone ?? null,
      customerEmail: order.customer?.email ?? null,
      customerAddress: order.customer?.address ?? null,
      items: order.items.map((item) => ({
        name: item.product.name,
        sku: item.variant.sku,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
      })),
      subtotal: String(subtotal),
      shippingFee: String(order.shippingFee),
      total: String(order.totalAmount),
      status: order.status,
      paymentMethod: order.payment?.method ?? null,
      paymentStatus: order.payment?.status ?? null,
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
