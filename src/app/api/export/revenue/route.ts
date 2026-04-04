import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { buildCsv } from '@/lib/export/csv';

// GET /api/export/revenue — revenue report (JSON or CSV)
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
    const from = params.get('from');
    const to = params.get('to');
    const groupBy = params.get('groupBy') ?? 'day'; // day | month
    const format = params.get('format') ?? 'json'; // json | csv

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const orders = await prisma.order.findMany({
      where: {
        shopId: user.shopId,
        status: { not: 'CANCELLED' },
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        totalAmount: true,
        shippingFee: true,
        channel: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by period
    const grouped = new Map<
      string,
      { revenue: number; shipping: number; orders: number; channels: Record<string, number> }
    >();

    for (const order of orders) {
      const key =
        groupBy === 'month'
          ? order.createdAt.toISOString().slice(0, 7)
          : order.createdAt.toISOString().slice(0, 10);

      const existing = grouped.get(key) ?? { revenue: 0, shipping: 0, orders: 0, channels: {} };
      existing.revenue += Number(order.totalAmount);
      existing.shipping += Number(order.shippingFee);
      existing.orders += 1;
      existing.channels[order.channel] = (existing.channels[order.channel] ?? 0) + 1;
      grouped.set(key, existing);
    }

    const rows = Array.from(grouped.entries()).map(([period, data]) => ({
      period,
      orders: data.orders,
      revenue: data.revenue.toFixed(2),
      shipping: data.shipping.toFixed(2),
      netRevenue: (data.revenue - data.shipping).toFixed(2),
      topChannel: Object.entries(data.channels).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'N/A',
    }));

    // Summary
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);
    const totalShipping = rows.reduce((sum, r) => sum + Number(r.shipping), 0);
    const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);

    if (format === 'csv') {
      const csv = buildCsv(rows, [
        { key: 'period', header: 'Period' },
        { key: 'orders', header: 'Orders' },
        { key: 'revenue', header: 'Revenue (฿)' },
        { key: 'shipping', header: 'Shipping (฿)' },
        { key: 'netRevenue', header: 'Net Revenue (฿)' },
        { key: 'topChannel', header: 'Top Channel' },
      ]);

      const filename = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(
      ok({
        rows,
        summary: {
          totalRevenue: totalRevenue.toFixed(2),
          totalShipping: totalShipping.toFixed(2),
          netRevenue: (totalRevenue - totalShipping).toFixed(2),
          totalOrders,
          periods: rows.length,
        },
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
