import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { buildCsv } from '@/lib/export/csv';

// GET /api/export/orders — export orders as CSV
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const status = params.get('status') ?? undefined;
    const from = params.get('from');
    const to = params.get('to');

    const where: Record<string, unknown> = { shopId: user.shopId };
    if (status) where.status = status;
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
        payment: { select: { status: true, method: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const rows = orders.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      customerName: order.customer?.name ?? '',
      customerPhone: order.customer?.phone ?? '',
      customerEmail: order.customer?.email ?? '',
      items: order.items.map((i) => `${i.product.name} (${i.variant.sku}) x${i.quantity}`).join('; '),
      totalAmount: Number(order.totalAmount).toFixed(2),
      shippingFee: Number(order.shippingFee).toFixed(2),
      paymentStatus: order.payment?.status ?? 'N/A',
      paymentMethod: order.payment?.method ?? 'N/A',
      notes: order.notes ?? '',
      createdAt: order.createdAt.toISOString(),
    }));

    const csv = buildCsv(rows, [
      { key: 'orderNumber', header: 'Order #' },
      { key: 'status', header: 'Status' },
      { key: 'channel', header: 'Channel' },
      { key: 'customerName', header: 'Customer' },
      { key: 'customerPhone', header: 'Phone' },
      { key: 'customerEmail', header: 'Email' },
      { key: 'items', header: 'Items' },
      { key: 'totalAmount', header: 'Total (RM)' },
      { key: 'shippingFee', header: 'Shipping Fee (RM)' },
      { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'paymentMethod', header: 'Payment Method' },
      { key: 'notes', header: 'Notes' },
      { key: 'createdAt', header: 'Created At' },
    ]);

    const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
