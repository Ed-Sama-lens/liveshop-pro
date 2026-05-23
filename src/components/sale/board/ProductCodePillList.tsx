'use client';

import { useMemo } from 'react';
import { sortDisplayCodes } from '@/lib/sale/board-helpers';
import { pillRowMaxWidthChars } from '@/lib/sale/board-display';
import { ProductCodePill } from './ProductCodePill';

/**
 * V Rich-style pill row — Tier 3.10-B skeleton.
 *
 * Naturally sorted (CM1 < CM2 < CM10) and uniformly-widened pills.
 * Click pill → calls `onSelect(displayCode)`.
 *
 * Pure presentational. No fetch. No mutation.
 */

export interface PillListItem {
  readonly displayCode: string;
  readonly availableQty: number;
  readonly totalQuantity: number;
  readonly lowStockAt: number | null;
}

export interface ProductCodePillListProps {
  readonly items: readonly PillListItem[];
  readonly selectedDisplayCode: string | null;
  readonly onSelect: (displayCode: string) => void;
  readonly stockBadgeMode?: 'compact' | 'fraction';
}

export function ProductCodePillList({
  items,
  selectedDisplayCode,
  onSelect,
  stockBadgeMode,
}: ProductCodePillListProps) {
  const sorted = useMemo(() => sortDisplayCodes(items), [items]);
  const widthCh = useMemo(
    () => pillRowMaxWidthChars(sorted.map((it) => it.displayCode)),
    [sorted]
  );

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        ยังไม่มีรหัสสินค้าในวันที่ขายนี้
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="listbox"
      aria-label="Product code pills"
    >
      {sorted.map((it) => (
        <ProductCodePill
          key={it.displayCode}
          displayCode={it.displayCode}
          availableQty={it.availableQty}
          totalQuantity={it.totalQuantity}
          lowStockAt={it.lowStockAt}
          selected={selectedDisplayCode === it.displayCode}
          onClick={onSelect}
          widthCh={widthCh}
          stockBadgeMode={stockBadgeMode}
        />
      ))}
    </div>
  );
}
