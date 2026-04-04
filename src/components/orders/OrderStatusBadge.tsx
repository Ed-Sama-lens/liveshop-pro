'use client';

import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

interface OrderStatusBadgeProps {
  readonly status: string;
}

const STATUS_I18N_KEY: Record<string, string> = {
  RESERVED: 'statusReserved',
  CONFIRMED: 'statusConfirmed',
  PACKED: 'statusPacked',
  SHIPPED: 'statusShipped',
  DELIVERED: 'statusDelivered',
  CANCELLED: 'statusCancelled',
};

const STATUS_COLOR: Record<string, string> = {
  RESERVED: 'text-yellow-600 border-yellow-300 dark:text-yellow-400 dark:border-yellow-600',
  CONFIRMED: 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600',
  PACKED: 'text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-600',
  SHIPPED: 'text-cyan-600 border-cyan-300 dark:text-cyan-400 dark:border-cyan-600',
  DELIVERED: 'text-green-600 border-green-300 dark:text-green-400 dark:border-green-600',
  CANCELLED: 'text-red-600 border-red-300 dark:text-red-400 dark:border-red-600',
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('orders');

  return (
    <Badge variant="outline" className={STATUS_COLOR[status] ?? ''}>
      {t(STATUS_I18N_KEY[status] ?? status)}
    </Badge>
  );
}
