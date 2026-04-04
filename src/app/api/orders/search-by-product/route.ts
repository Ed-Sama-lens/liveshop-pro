import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateQuery } from '@/lib/validation/middleware';
import { searchByProductSchema } from '@/lib/validation/order.schemas';
import { prisma } from '@/lib/db/prisma';

// ─── Serialized type ──────────────────────────────────────────────────────

interface SearchByProductRow {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly orderDate: Date;
  readonly totalAmount: string;
  readonly customerName: string;
  readonly customerId: string;
  readonly customerPhone: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly variantSku: string;
  readonly variantAttributes: Record<string, string>;
}

// GET /api/orders/search-by-product?productCode=B1&dateFrom=2026-04-01&dateTo=2026-04-04
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const queryResult = validateQuery(request, searchByProductSchema);
    if ('error' in queryResult) return queryResult.error;

    const { page, limit, productCode, dateFrom, dateTo, status } = queryResult.data;

    // Find the product by stockCode or saleCode in this shop
    const product = await prisma.product.findFirst({
      where: {
        shopId: user.shopId,
        OR: [
          { stockCode: productCode },
          { saleCode: productCode },
        ],
      },
      select: { id: true, name: true, stockCode: true, saleCode: true },
    });

    if (!product) {
      return NextResponse.json(ok({ product: null, orders: [], summary: { totalOrders: 0, totalCustomers: 0, totalQuantity: 0 } }));
    }

    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    // Build where clause for orders containing this product
    const orderWhere = {
      shopId: user.shopId,
      createdAt: { gte: startDate, lte: endDate },
      items: { some: { productId: product.id } },
      ...(status ? { status } : {}),
    };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.findMany({
        where: orderWhere,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            where: { productId: product.id },
            include: {
              variant: { select: { sku: true, attributes: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Also get aggregate summary (total unique customers and total quantity)
    const summary = await prisma.orderItem.aggregate({
      where: {
        productId: product.id,
        order: {
          shopId: user.shopId,
          createdAt: { gte: startDate, lte: endDate },
          ...(status ? { status } : {}),
        },
      },
      _sum: { quantity: true },
    });

    const uniqueCustomers = await prisma.order.findMany({
      where: orderWhere,
      select: { customerId: true },
      distinct: ['customerId'],
    });

    const rows: readonly SearchByProductRow[] = orders.flatMap((order) =>
      order.items.map((item) =>
        Object.freeze({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.status,
          orderDate: order.createdAt,
          totalAmount: order.totalAmount.toString(),
          customerName: order.customer.name,
          customerId: order.customer.id,
          customerPhone: order.customer.phone,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          variantSku: item.variant.sku,
          variantAttributes: (item.variant.attributes ?? {}) as Record<string, string>,
        })
      )
    );

    return NextResponse.json(
      paginated(
        {
          product: Object.freeze({
            id: product.id,
            name: product.name,
            stockCode: product.stockCode,
            saleCode: product.saleCode,
          }),
          orders: rows,
          summary: Object.freeze({
            totalOrders: total,
            totalCustomers: uniqueCustomers.length,
            totalQuantity: summary._sum.quantity ?? 0,
          }),
        },
        { total, page, limit }
      )
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
