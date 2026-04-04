'use client';

import { Badge } from '@/components/ui/badge';
import { getStockStatus, STOCK_STATUS_COLOR, type StockStatus } from '@/lib/stock/status';
import { useTranslations } from 'next-intl';

interface StockBadgeProps {
  readonly quantity: number;
  readonly reservedQty: number;
}

const STATUS_I18N_KEY: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'outOfStock',
  PARTIAL: 'partialStock',
  FULL: 'fullStock',
};

export function StockBadge({ quantity, reservedQty }: StockBadgeProps) {
  const t = useTranslations('inventory');
  const status = getStockStatus(quantity, reservedQty);

  return (
    <Badge variant="outline" className={STOCK_STATUS_COLOR[status]}>
      {t(STATUS_I18N_KEY[status])}
    </Badge>
  );
}
