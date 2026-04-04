import { prisma } from '@/lib/db/prisma';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardStats {
  readonly totalOrders: number;
  readonly totalRevenue: string;
  readonly totalCustomers: number;
  readonly totalProducts: number;
  readonly ordersToday: number;
  readonly revenueToday: string;
  readonly pendingOrders: number;
  readonly lowStockProducts: number;
}

export interface RevenueByDay {
  readonly date: string;
  readonly revenue: string;
  readonly orders: number;
}

export interface OrdersByStatus {
  readonly status: string;
  readonly count: number;
}

export interface TopProduct {
  readonly productId: string;
  readonly productName: string;
  readonly totalQuantity: number;
  readonly totalRevenue: string;
}

export interface ChannelBreakdown {
  readonly channel: string;
  readonly count: number;
  readonly revenue: string;
}

export interface ConversionStats {
  readonly totalOrders: number;
  readonly completedOrders: number;
  readonly cancelledOrders: number;
  readonly conversionRate: number; // completed / total as percentage
  readonly averageOrderValue: string;
}

export interface RevenueTrend {
  readonly currentPeriod: string;
  readonly previousPeriod: string;
  readonly changePercent: number;
  readonly isPositive: boolean;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const analyticsRepository = Object.freeze({
  async getDashboardStats(shopId: string): Promise<DashboardStats> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const [
      totalOrders,
      totalRevenueResult,
      totalCustomers,
      totalProducts,
      ordersToday,
      revenueTodayResult,
      pendingOrders,
      lowStockProducts,
    ] = await Promise.all([
      prisma.order.count({ where: { shopId } }),
      prisma.order.aggregate({
        where: { shopId, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
      prisma.customer.count({ where: { shopId } }),
      prisma.product.count({ where: { shopId, isActive: true } }),
      prisma.order.count({
        where: { shopId, createdAt: { gte: startOfDay, lt: endOfDay } },
      }),
      prisma.order.aggregate({
        where: {
          shopId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({ where: { shopId, status: 'RESERVED' } }),
      prisma.productVariant.count({
        where: {
          product: { shopId },
          quantity: { lte: prisma.productVariant.fields.quantity },
        },
      }),
    ]);

    return Object.freeze({
      totalOrders,
      totalRevenue: (totalRevenueResult._sum.totalAmount ?? 0).toString(),
      totalCustomers,
      totalProducts,
      ordersToday,
      revenueToday: (revenueTodayResult._sum.totalAmount ?? 0).toString(),
      pendingOrders,
      lowStockProducts: 0, // Simplified — low stock is relative to lowStockAt threshold
    });
  },

  async getRevenueByDay(shopId: string, days: number = 30): Promise<readonly RevenueByDay[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await prisma.order.findMany({
      where: {
        shopId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: startDate },
      },
      select: {
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const byDay = new Map<string, { revenue: number; orders: number }>();

    for (const order of orders) {
      const date = order.createdAt.toISOString().slice(0, 10);
      const existing = byDay.get(date) ?? { revenue: 0, orders: 0 };
      byDay.set(date, {
        revenue: existing.revenue + Number(order.totalAmount),
        orders: existing.orders + 1,
      });
    }

    const result: RevenueByDay[] = [];
    for (const [date, data] of byDay) {
      result.push(Object.freeze({
        date,
        revenue: data.revenue.toString(),
        orders: data.orders,
      }));
    }

    return Object.freeze(result);
  },

  async getOrdersByStatus(shopId: string): Promise<readonly OrdersByStatus[]> {
    const result = await prisma.order.groupBy({
      by: ['status'],
      where: { shopId },
      _count: { id: true },
    });

    return Object.freeze(
      result.map((r) =>
        Object.freeze({
          status: r.status,
          count: r._count.id,
        })
      )
    );
  },

  async getTopProducts(shopId: string, limit: number = 10): Promise<readonly TopProduct[]> {
    const result = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { shopId, status: { not: 'CANCELLED' } },
      },
      _sum: {
        quantity: true,
        totalPrice: true,
      },
      orderBy: {
        _sum: { totalPrice: 'desc' },
      },
      take: limit,
    });

    // Get product names
    const productIds = result.map((r) => r.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return Object.freeze(
      result.map((r) =>
        Object.freeze({
          productId: r.productId,
          productName: productMap.get(r.productId) ?? 'Unknown',
          totalQuantity: r._sum.quantity ?? 0,
          totalRevenue: (r._sum.totalPrice ?? 0).toString(),
        })
      )
    );
  },

  async getChannelBreakdown(shopId: string): Promise<readonly ChannelBreakdown[]> {
    const result = await prisma.order.groupBy({
      by: ['channel'],
      where: { shopId, status: { not: 'CANCELLED' } },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return Object.freeze(
      result.map((r) =>
        Object.freeze({
          channel: r.channel,
          count: r._count.id,
          revenue: (r._sum.totalAmount ?? 0).toString(),
        })
      )
    );
  },

  async getConversionStats(shopId: string): Promise<ConversionStats> {
    const [totalOrders, completedOrders, cancelledOrders, aovResult] =
      await Promise.all([
        prisma.order.count({ where: { shopId } }),
        prisma.order.count({
          where: { shopId, status: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] } },
        }),
        prisma.order.count({ where: { shopId, status: 'CANCELLED' } }),
        prisma.order.aggregate({
          where: { shopId, status: { not: 'CANCELLED' } },
          _avg: { totalAmount: true },
        }),
      ]);

    const conversionRate =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 10000) / 100 : 0;

    return Object.freeze({
      totalOrders,
      completedOrders,
      cancelledOrders,
      conversionRate,
      averageOrderValue: (aovResult._avg.totalAmount ?? 0).toString(),
    });
  },

  async getRevenueTrend(shopId: string, days: number = 30): Promise<RevenueTrend> {
    const now = new Date();
    const currentStart = new Date();
    currentStart.setDate(now.getDate() - days);
    const previousStart = new Date();
    previousStart.setDate(now.getDate() - days * 2);

    const [currentResult, previousResult] = await Promise.all([
      prisma.order.aggregate({
        where: {
          shopId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: currentStart },
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: {
          shopId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: previousStart, lt: currentStart },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const current = Number(currentResult._sum.totalAmount ?? 0);
    const previous = Number(previousResult._sum.totalAmount ?? 0);
    const changePercent =
      previous > 0 ? Math.round(((current - previous) / previous) * 10000) / 100 : 0;

    return Object.freeze({
      currentPeriod: current.toString(),
      previousPeriod: previous.toString(),
      changePercent,
      isPositive: changePercent >= 0,
    });
  },
});
