'use client';

import { useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { SalePanelCard } from '../SalePanelCard';
import {
  buildSlots,
  formatBoardHeader,
  type SlotInput,
} from '@/lib/sale/board-helpers';
import { ProductCodePillList, type PillListItem } from './ProductCodePillList';
import { SlotRow } from './SlotRow';

/**
 * V Rich-style board (read-only) — Tier 3.10-C skeleton.
 *
 * Combines:
 *   - Pill row (PR #72 + #79 helpers + this PR's ProductCodePillList)
 *   - Click pill → expand drawer below pill row
 *   - Drawer renders slot list via `buildSlots()` (PR #72)
 *
 * No drag/drop. No outbound. No mutation. Single-open accordion per
 * Tier 3.10-A locked decision.
 *
 * NOT wired into production `/sale` workspace. Lives behind a future
 * `NEXT_PUBLIC_SALE_LAYOUT_V2` flag (per PR #63 §3 design audit). This
 * PR is foundation only — tests + visual verification before the flip.
 */

export interface SaleBoardReadOnlyProps {
  readonly products: readonly SaleBoardProduct[];
  /** Selected display code; null = no drawer expanded. */
  readonly defaultSelected?: string | null;
  /** Optional onCancel handler for slot X button. Defaults to no-op. */
  readonly onSlotCancel?: (bookingId: string) => void;
}

export interface SaleBoardProduct {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly productName: string;
  readonly unitPriceRm: string; // already 'RM10.00' format
  readonly totalQuantity: number;
  readonly availableQty: number;
  readonly lowStockAt: number | null;
  readonly bookings: readonly SlotInput[];
}

export function SaleBoardReadOnly({
  products,
  defaultSelected = null,
  onSlotCancel,
}: SaleBoardReadOnlyProps) {
  const [selected, setSelected] = useState<string | null>(defaultSelected);

  const pillItems: readonly PillListItem[] = useMemo(
    () =>
      products.map((p) => ({
        displayCode: p.displayCode,
        availableQty: p.availableQty,
        totalQuantity: p.totalQuantity,
        lowStockAt: p.lowStockAt,
      })),
    [products]
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.displayCode === selected) ?? null,
    [products, selected]
  );

  return (
    <SalePanelCard
      title="Sale Board (V Rich style) — preview"
      subtitle={
        selectedProduct === null
          ? 'คลิกรหัสเพื่อดู slot'
          : `Selected: ${selectedProduct.displayCode}`
      }
      icon={Grid3x3}
      variant="placeholder"
    >
      <ProductCodePillList
        items={pillItems}
        selectedDisplayCode={selected}
        onSelect={(code) =>
          setSelected((current) => (current === code ? null : code))
        }
      />

      {selectedProduct !== null ? (
        <BoardDrawer
          product={selectedProduct}
          onSlotCancel={onSlotCancel}
        />
      ) : null}
    </SalePanelCard>
  );
}

function BoardDrawer({
  product,
  onSlotCancel,
}: {
  readonly product: SaleBoardProduct;
  readonly onSlotCancel?: (bookingId: string) => void;
}) {
  const { slots, overflow } = useMemo(
    () => buildSlots(product.bookings, product.totalQuantity),
    [product.bookings, product.totalQuantity]
  );

  const header = formatBoardHeader({
    displayCode: product.displayCode,
    productName: product.productName,
    unitPriceRm: product.unitPriceRm,
    availableQty: product.availableQty,
    totalQuantity: product.totalQuantity,
  });

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-card/40 p-2">
      <div className="text-[11px] font-medium text-foreground">{header}</div>

      {slots.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">ไม่มี slot</p>
      ) : (
        <div className="space-y-1">
          {slots.map((s) => (
            <SlotRow
              key={s.index}
              index={s.index + 1}
              status={s.kind === 'filled' ? s.status : null}
              customerName={s.kind === 'filled' ? s.customerName : undefined}
              quantity={s.kind === 'filled' ? s.quantity : undefined}
              onCancel={
                s.kind === 'filled' && onSlotCancel !== undefined
                  ? () => onSlotCancel(s.bookingId)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {overflow.length > 0 ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 text-[10px] text-destructive"
          role="alert"
        >
          ⚠ {overflow.length} booking(s) เกินจำนวน slot ที่มี — admin ควรเช็คสต็อก
        </p>
      ) : null}
    </div>
  );
}
