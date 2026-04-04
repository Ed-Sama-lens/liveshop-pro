'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CustomerFilters } from '@/components/customers/CustomerFilters';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { Pagination } from '@/components/inventory/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerRow } from '@/server/repositories/customer.repository';
import type { PaginationMeta } from '@/lib/api/response';

export default function CustomersPage() {
  const t = useTranslations('customers');
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [isBanned, setIsBanned] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [customers, setCustomers] = useState<readonly CustomerRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (channel) params.set('channel', channel);
      if (isBanned) params.set('isBanned', isBanned);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const body = await res.json();

      if (body.success) {
        setCustomers(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, channel, isBanned]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, channel, isBanned]);

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/customers/${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size} customers deleted`);
      setSelectedIds(new Set());
      fetchCustomers();
    } catch {
      toast.error('Bulk delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Button size="sm" onClick={() => router.push('/customers/new')}>
          <Plus className="size-3.5" />
          {t('newCustomer')}
        </Button>
      </div>

      <CustomerFilters
        search={search}
        onSearchChange={setSearch}
        channel={channel}
        onChannelChange={setChannel}
        isBanned={isBanned}
        onIsBannedChange={setIsBanned}
      />

      <CustomerTable
        customers={customers}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isLoading={isLoading}
      />

      {meta && (
        <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}

      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-popover px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="size-3.5" />
            {t('delete')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setSelectedIds(new Set())}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
