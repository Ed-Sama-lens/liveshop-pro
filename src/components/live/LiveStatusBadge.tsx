'use client';

import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

interface LiveStatusBadgeProps {
  readonly status: string;
}

const STATUS_I18N_KEY: Record<string, string> = {
  SCHEDULED: 'statusScheduled',
  LIVE: 'statusLive',
  ENDED: 'statusEnded',
};

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600',
  LIVE: 'bg-red-500 text-white border-red-500 animate-pulse',
  ENDED: 'text-gray-600 border-gray-300 dark:text-gray-400 dark:border-gray-600',
};

export function LiveStatusBadge({ status }: LiveStatusBadgeProps) {
  const t = useTranslations('live');

  return (
    <Badge variant="outline" className={STATUS_COLOR[status] ?? ''}>
      {t(STATUS_I18N_KEY[status] ?? status)}
    </Badge>
  );
}
