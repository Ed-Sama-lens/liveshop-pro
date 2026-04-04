'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LiveSessionTable } from '@/components/live/LiveSessionTable';
import { Pagination } from '@/components/inventory/Pagination';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { LiveSessionRow } from '@/server/repositories/live.repository';
import type { PaginationMeta } from '@/lib/api/response';

export default function LiveSellingPage() {
  const t = useTranslations('live');
  const router = useRouter();

  const [sessions, setSessions] = useState<readonly LiveSessionRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (status) params.set('status', status);

      const res = await fetch(`/api/live?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setSessions(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              <SelectItem value="SCHEDULED">{t('statusScheduled')}</SelectItem>
              <SelectItem value="LIVE">{t('statusLive')}</SelectItem>
              <SelectItem value="ENDED">{t('statusEnded')}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => router.push('/live-selling/new')}>
            <Plus className="size-3.5" />
            {t('newSession')}
          </Button>
        </div>
      </div>

      <LiveSessionTable sessions={sessions} isLoading={isLoading} />

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
