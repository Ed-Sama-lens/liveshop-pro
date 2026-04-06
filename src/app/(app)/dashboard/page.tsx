'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BarChart3,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type {
  DashboardStats,
  OrdersByStatus,
  TopProduct,
  ConversionStats,
  RevenueTrend,
  RevenueByDay,
} from '@/server/repositories/analytics.repository';

interface DashboardData {
  readonly stats: DashboardStats;
  readonly ordersByStatus: readonly OrdersByStatus[];
  readonly topProducts: readonly TopProduct[];
  readonly conversionStats: ConversionStats;
  readonly revenueTrend: RevenueTrend;
  readonly revenueByDay: readonly RevenueByDay[];
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${period}`);
      const body = await res.json();
      if (body.success) {
        setData({
          stats: body.data.stats,
          ordersByStatus: body.data.ordersByStatus,
          topProducts: body.data.topProducts,
          conversionStats: body.data.conversionStats,
          revenueTrend: body.data.revenueTrend,
          revenueByDay: body.data.revenueByDay,
        });
      }
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{t('noData')}</p>
      </div>
    );
  }

  const { stats, ordersByStatus, topProducts, conversionStats, revenueTrend, revenueByDay } = data;

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('last7Days')}</SelectItem>
            <SelectItem value="30">{t('last30Days')}</SelectItem>
            <SelectItem value="90">{t('last90Days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalOrders')}</CardTitle>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {t('ordersToday')}: <span className="font-medium text-foreground">{stats.ordersToday}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalRevenue')}</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              RM{Number(stats.totalRevenue).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {revenueTrend.isPositive ? (
                <TrendingUp className="size-3 text-green-600" />
              ) : (
                <TrendingDown className="size-3 text-red-600" />
              )}
              <span className={`text-xs font-medium ${revenueTrend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {revenueTrend.isPositive ? '+' : ''}{revenueTrend.changePercent}%
              </span>
              <span className="text-xs text-muted-foreground">{t('vsPrevious')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('conversionRate')}</CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionStats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {conversionStats.completedOrders} / {conversionStats.totalOrders} {t('ordersCompleted')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('avgOrderValue')}</CardTitle>
            <BarChart3 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              RM{Number(conversionStats.averageOrderValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('totalCustomers')}: {stats.totalCustomers.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Sparkline + Alert Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Mini Revenue Chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4" />
              {t('revenueTrend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByDay.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noData')}</p>
            ) : (
              <div className="space-y-1">
                {revenueByDay.slice(-7).map((day) => {
                  const maxRevenue = Math.max(...revenueByDay.slice(-7).map((d) => Number(d.revenue)));
                  const width = maxRevenue > 0 ? (Number(day.revenue) / maxRevenue) * 100 : 0;
                  return (
                    <div key={day.date} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">{day.date.slice(5)}</span>
                      <div className="flex-1">
                        <div
                          className="h-4 rounded bg-primary/20"
                          style={{ width: `${Math.max(width, 2)}%` }}
                        />
                      </div>
                      <span className="w-16 text-right font-mono">
                        RM{Number(day.revenue).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alert Cards */}
        <Link href="/orders?status=RESERVED">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('pendingOrders')}</CardTitle>
              <Clock className="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingOrders}</div>
              {stats.pendingOrders > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <ArrowRight className="size-3" />
                  Requires attention
                </p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventory">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('lowStock')}</CardTitle>
              <AlertTriangle className="size-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.lowStockProducts}</div>
              {stats.lowStockProducts > 0 && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <ArrowRight className="size-3" />
                  Needs restocking
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Bottom Section */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Orders by Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t('recentOrders')}</CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm">
                {t('viewAll')}
                <ArrowRight className="ml-1 size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {ordersByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noData')}</p>
            ) : (
              <div className="space-y-3">
                {ordersByStatus.map((item) => {
                  const total = ordersByStatus.reduce((sum, i) => sum + i.count, 0);
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline">{item.status}</Badge>
                        <span className="font-mono font-medium">
                          {item.count.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4" />
              {t('topProducts')}
            </CardTitle>
            <Link href="/analytics">
              <Button variant="ghost" size="sm">
                {t('viewAll')}
                <ArrowRight className="ml-1 size-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noData')}</p>
            ) : (
              <div className="space-y-3">
                {topProducts.slice(0, 5).map((product, i) => (
                  <div key={product.productId} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="truncate">{product.productName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <Badge variant="secondary" className="text-xs">
                        {product.totalQuantity} {t('sold')}
                      </Badge>
                      <span className="font-mono text-muted-foreground">
                        RM{Number(product.totalRevenue).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
