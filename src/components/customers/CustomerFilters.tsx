'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface CustomerFiltersProps {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly channel: string;
  readonly onChannelChange: (value: string) => void;
  readonly isBanned: string;
  readonly onIsBannedChange: (value: string) => void;
}

const CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;

export function CustomerFilters({
  search,
  onSearchChange,
  channel,
  onChannelChange,
  isBanned,
  onIsBannedChange,
}: CustomerFiltersProps) {
  const t = useTranslations('customers');

  return (
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
        <Select value={channel} onValueChange={(v) => onChannelChange(v ?? '')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('allChannels')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allChannels')}</SelectItem>
            {CHANNELS.map((ch) => (
              <SelectItem key={ch} value={ch}>{ch}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={isBanned} onValueChange={(v) => onIsBannedChange(v ?? '')}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allStatuses')}</SelectItem>
            <SelectItem value="false">{t('activeStatus')}</SelectItem>
            <SelectItem value="true">{t('bannedStatus')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
