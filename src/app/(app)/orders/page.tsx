'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { OrderFilters } from '@/components/orders/OrderFilters';
import { OrderTable } from '@/components/orders/OrderTable';
import { Pagination } from '@/components/inventory/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderRow } from '@/server/repositories/order.repository';
import type { PaginationMeta } from '@/lib/api/response';

export default function OrdersPage() {
  const t = useTranslations('orders');
  const router = useRouter();

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Data
  const [orders, setOrders] = useState<readonly OrderRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);
      if (channel) params.set('channel', channel);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const body = await res.json();

      if (body.success) {
        setOrders(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, status, channel, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, channel, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Button size="sm" onClick={() => router.push('/orders/new')}>
          <Plus className="size-3.5" />
          {t('newOrder')}
        </Button>
      </div>

      {/* Filters */}
      <OrderFilters
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        channel={channel}
        onChannelChange={setChannel}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      {/* Table */}
      <OrderTable orders={orders} isLoading={isLoading} />

      {/* Pagination */}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
