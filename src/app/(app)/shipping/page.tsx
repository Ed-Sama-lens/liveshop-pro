'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShipmentTable } from '@/components/shipping/ShipmentTable';
import { Pagination } from '@/components/inventory/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import type { ShipmentRow } from '@/server/repositories/shipment.repository';
import type { PaginationMeta } from '@/lib/api/response';

const SHIPMENT_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const;
const PROVIDERS = ['KEX', 'JNT', 'MANUAL'] as const;

export default function ShippingPage() {
  const t = useTranslations('shipping');

  const [shipments, setShipments] = useState<readonly ShipmentRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const fetchShipments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);
      if (provider) params.set('provider', provider);

      const res = await fetch(`/api/shipments?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setShipments(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load shipments');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, status, provider]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, provider]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              {SHIPMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={provider} onValueChange={(v) => setProvider(v ?? '')}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={t('allProviders')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allProviders')}</SelectItem>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ShipmentTable shipments={shipments} isLoading={isLoading} />

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
