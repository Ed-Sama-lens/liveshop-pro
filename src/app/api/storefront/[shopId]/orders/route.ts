import { NextRequest, NextResponse } from 'next/server';
import { ok, error, paginated } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { prisma } from '@/lib/db/prisma';

interface RouteContext {
  params: Promise<{ shopId: string }>;
}

// GET /api/storefront/[shopId]/orders — customer order history
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { shopId: identifier } = await context.params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');
    const customerId = request.headers.get('x-customer-id');

    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10)));
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { shopId, customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          channel: true,
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
            },
          },
        },
      }),
      prisma.order.count({ where: { shopId, customerId } }),
    ]);

    const serialized = orders.map((o) =>
      Object.freeze({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount.toString(),
        channel: o.channel,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        itemCount: o.items.length,
        items: o.items.map((item) => {
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
        latestPayment: o.payment
          ? Object.freeze({
              status: o.payment.status,
              method: o.payment.method,
              amount: o.payment.amount.toString(),
            })
          : null,
      })
    );

    return NextResponse.json(
      paginated(serialized, { total, page, limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
