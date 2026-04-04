'use client';

import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

interface ShipmentStatusBadgeProps {
  readonly status: string;
}

const STATUS_I18N_KEY: Record<string, string> = {
  PENDING: 'statusPending',
  ASSIGNED: 'statusAssigned',
  PICKED_UP: 'statusPickedUp',
  IN_TRANSIT: 'statusInTransit',
  DELIVERED: 'statusDelivered',
  RETURNED: 'statusReturned',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-gray-600 border-gray-300 dark:text-gray-400',
  ASSIGNED: 'text-blue-600 border-blue-300 dark:text-blue-400',
  PICKED_UP: 'text-yellow-600 border-yellow-300 dark:text-yellow-400',
  IN_TRANSIT: 'text-cyan-600 border-cyan-300 dark:text-cyan-400',
  DELIVERED: 'text-green-600 border-green-300 dark:text-green-400',
  RETURNED: 'text-red-600 border-red-300 dark:text-red-400',
};

export function ShipmentStatusBadge({ status }: ShipmentStatusBadgeProps) {
  const t = useTranslations('shipping');

  return (
    <Badge variant="outline" className={STATUS_COLOR[status] ?? ''}>
      {t(STATUS_I18N_KEY[status] ?? status)}
    </Badge>
  );
}
