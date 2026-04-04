import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { analyticsRepository } from '@/server/repositories/analytics.repository';

// GET /api/analytics — get dashboard analytics
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const days = parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10);

    const [stats, revenueByDay, ordersByStatus, topProducts, channelBreakdown, conversionStats, revenueTrend] =
      await Promise.all([
        analyticsRepository.getDashboardStats(user.shopId),
        analyticsRepository.getRevenueByDay(user.shopId, days),
        analyticsRepository.getOrdersByStatus(user.shopId),
        analyticsRepository.getTopProducts(user.shopId),
        analyticsRepository.getChannelBreakdown(user.shopId),
        analyticsRepository.getConversionStats(user.shopId),
        analyticsRepository.getRevenueTrend(user.shopId, days),
      ]);

    return NextResponse.json(
      ok({
        stats,
        revenueByDay,
        ordersByStatus,
        topProducts,
        channelBreakdown,
        conversionStats,
        revenueTrend,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
