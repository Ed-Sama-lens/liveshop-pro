'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LowStockAlertProps {
  readonly count: number;
}

export function LowStockAlert({ count }: LowStockAlertProps) {
  const t = useTranslations('inventory');

  if (count <= 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/10">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{t('lowStockAlert', { count })}</span>
    </div>
  );
}
