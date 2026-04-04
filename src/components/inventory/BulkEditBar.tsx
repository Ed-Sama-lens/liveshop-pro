'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Trash2, X } from 'lucide-react';

interface BulkEditBarProps {
  readonly selectedCount: number;
  readonly onBulkDelete: () => void;
  readonly onClear: () => void;
}

export function BulkEditBar({ selectedCount, onBulkDelete, onClear }: BulkEditBarProps) {
  const t = useTranslations('inventory');

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-popover px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-border" />
      <Button variant="destructive" size="sm" onClick={onBulkDelete}>
        <Trash2 className="size-3.5" />
        {t('bulkDelete')}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onClear}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
