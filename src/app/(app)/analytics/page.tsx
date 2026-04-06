'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingCart, Users, Package, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type {
  DashboardStats,
  RevenueByDay,
  OrdersByStatus,
  TopProduct,
  ChannelBreakdown,
} from '@/server/repositories/analytics.repository';

interface AnalyticsData {
  readonly stats: DashboardStats;
  readonly revenueByDay: readonly RevenueByDay[];
  readonly ordersByStatus: readonly OrdersByStatus[];
  readonly topProducts: readonly TopProduct[];
  readonly channelBreakdown: readonly ChannelBreakdown[];
}

export default function AnalyticsPage() {
  const t = useTranslations('analytics');

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics?days=30');
        const body = await res.json();
        if (body.success) {
          setData(body.data);
        }
      } catch {
        toast.error('Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">{t('noData')}</p>
      </div>
    );
  }

  const { stats, revenueByDay, ordersByStatus, topProducts, channelBreakdown } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalOrders')}</CardTitle>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {t('ordersToday')}: {stats.ordersToday}
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
            <p className="text-xs text-muted-foreground">
              {t('revenueToday')}: RM{Number(stats.revenueToday).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalCustomers')}</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('totalProducts')}</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('pendingOrders')}</CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('lowStockProducts')}</CardTitle>
            <AlertTriangle className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lowStockProducts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart (text-based for now) */}
      {revenueByDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('revenueChart')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revenueByDay.slice(-14).map((day) => {
                const maxRevenue = Math.max(...revenueByDay.map((d) => Number(d.revenue)));
                const width = maxRevenue > 0 ? (Number(day.revenue) / maxRevenue) * 100 : 0;
                return (
                  <div key={day.date} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-muted-foreground">{day.date.slice(5)}</span>
                    <div className="flex-1">
                      <div
                        className="h-5 rounded bg-primary/20"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono">
                      RM{Number(day.revenue).toLocaleString()}
                    </span>
                    <span className="w-8 text-right text-muted-foreground">
                      {day.orders}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Orders by Status */}
        {ordersByStatus.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('ordersByStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ordersByStatus.map((item) => (
                  <div key={item.status} className="flex items-center justify-between text-sm">
                    <Badge variant="outline">{item.status}</Badge>
                    <span className="font-mono">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Channel Breakdown */}
        {channelBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('channelBreakdown')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('channel')}</TableHead>
                    <TableHead className="text-right">{t('orders')}</TableHead>
                    <TableHead className="text-right">{t('revenue')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelBreakdown.map((item) => (
                    <TableRow key={item.channel}>
                      <TableCell>
                        <Badge variant="outline">{item.channel}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-mono">
                        RM{Number(item.revenue).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('topProducts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('product')}</TableHead>
                  <TableHead className="text-right">{t('quantity')}</TableHead>
                  <TableHead className="text-right">{t('revenue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell className="text-right">{product.totalQuantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">
                      RM{Number(product.totalRevenue).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
