'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Package,
  CreditCard,
  Truck,
  Settings,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

interface ActivityLogEntry {
  readonly id: string;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string | null;
  readonly description: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  order: <ShoppingCart className="h-4 w-4" />,
  product: <Package className="h-4 w-4" />,
  payment: <CreditCard className="h-4 w-4" />,
  shipment: <Truck className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
};

const ENTITY_COLORS: Record<string, string> = {
  order: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  product: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  shipment: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  settings: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const ENTITIES = ['all', 'order', 'product', 'payment', 'shipment', 'settings'];

export default function ActivityLogPage() {
  const t = useTranslations('activity');
  const [logs, setLogs] = useState<readonly ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (entityFilter !== 'all') params.set('entity', entityFilter);
      if (fromDate) params.set('from', new Date(fromDate).toISOString());
      if (toDate) params.set('to', new Date(toDate).toISOString());

      const res = await fetch(`/api/activity?${params}`);
      const body = await res.json();
      if (body.success) {
        setLogs(body.data ?? []);
        setTotal(body.meta?.total ?? 0);
      }
    } catch {
      toast.error('Failed to load activity log');
    } finally {
      setIsLoading(false);
    }
  }, [page, entityFilter, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Badge variant="outline">{t('totalEntries', { count: total })}</Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                <Filter className="inline h-3 w-3 mr-1" />
                {t('entity')}
              </label>
              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v ?? 'all'); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e === 'all' ? t('allEntities') : e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('from')}</label>
              <Input
                type="date"
                className="w-[160px]"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('to')}</label>
              <Input
                type="date"
                className="w-[160px]"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              />
            </div>

            {(entityFilter !== 'all' || fromDate || toDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEntityFilter('all');
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
              >
                {t('clearFilters')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            {t('recentActivity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">{t('noActivity')}</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  {/* Icon */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      ENTITY_COLORS[log.entity] ?? 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {ENTITY_ICONS[log.entity] ?? <Activity className="h-4 w-4" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{formatTime(log.createdAt)}</span>
                      {log.userName && (
                        <>
                          <span>&middot;</span>
                          <span>{log.userName}</span>
                        </>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {log.entity}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {t('page')} {page} / {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
