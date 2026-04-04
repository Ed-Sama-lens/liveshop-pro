'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface OrderFiltersProps {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly status: string;
  readonly onStatusChange: (value: string) => void;
  readonly channel: string;
  readonly onChannelChange: (value: string) => void;
  readonly dateFrom: string;
  readonly onDateFromChange: (value: string) => void;
  readonly dateTo: string;
  readonly onDateToChange: (value: string) => void;
}

const ORDER_STATUSES = ['RESERVED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
const SALE_CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;

export function OrderFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  channel,
  onChannelChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: OrderFiltersProps) {
  const t = useTranslations('orders');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => onStatusChange(v ?? '')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status${s.charAt(0)}${s.slice(1).toLowerCase()}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={(v) => onChannelChange(v ?? '')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('allChannels')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allChannels')}</SelectItem>
              {SALE_CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          placeholder={t('dateFrom')}
          className="w-[160px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          placeholder={t('dateTo')}
          className="w-[160px]"
        />
      </div>
    </div>
  );
}
