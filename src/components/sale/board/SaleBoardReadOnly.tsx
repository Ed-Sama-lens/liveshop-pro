'use client';

import { useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { SalePanelCard } from '../SalePanelCard';
import type {
  BoardViewModel,
  BoardPillViewModel,
  BoardSlotDrawerViewModel,
} from '@/lib/sale/build-board-view-model';
import { ProductCodePillList, type PillListItem } from './ProductCodePillList';
import { SlotRow } from './SlotRow';

/**
 * V Rich-style board (read-only) — Tier 3.10-C WIRE-2.
 *
 * Combines:
 *   - Pill row (PR #72 + #79 helpers + ProductCodePillList)
 *   - Click pill → expand drawer below pill row
 *   - Drawer renders slot list from `BoardViewModel` produced by
 *     `buildBoardViewModel` (Stage 3.10-B mapper, PR #149)
 *
 * No drag/drop. No outbound. No mutation. Single-open accordion per
 * Tier 3.10-A locked decision.
 *
 * WIRE-2 contract change: component now consumes the mapper's
 * `BoardViewModel` directly instead of re-deriving from a legacy
 * `SaleBoardProduct[]` shape. Caller (future WIRE-3 shell wiring)
 * is responsible for calling `buildBoardViewModel(input)` and passing
 * the frozen result here. Mapper output is sorted + sliced +
 * formatted; this component is pure render.
 *
 * NOT wired into production `/sale` workspace. Lives behind the
 * `NEXT_PUBLIC_SALE_LAYOUT_V2` flag (PR #152). This PR is contract
 * refactor only — no UI is rendered in production until WIRE-3
 * wires the shell.
 *
 * @see {@link buildBoardViewModel} for mapper input/output
 * @see {@link isSaleLayoutV2Enabled} for the flag gate (WIRE-1)
 */

export interface SaleBoardReadOnlyProps {
  /** Mapper output from `buildBoardViewModel`. Sorted, formatted, frozen. */
  readonly viewModel: BoardViewModel;
  /** Selected displayCode override; null/undefined uses mapper's `selectedBroadcastProductId`. */
  readonly defaultSelectedDisplayCode?: string | null;
  /** Optional onCancel handler for slot X button. Defaults to no-op. */
  readonly onSlotCancel?: (bookingId: string) => void;
}

export function SaleBoardReadOnly({
  viewModel,
  defaultSelectedDisplayCode = null,
  onSlotCancel,
}: SaleBoardReadOnlyProps) {
  const [selected, setSelected] = useState<string | null>(defaultSelectedDisplayCode);

  // Pill list expects compact PillListItem shape; map from view model.
  const pillItems: readonly PillListItem[] = viewModel.pills.map((p) => ({
    displayCode: p.displayCode,
    availableQty: p.availableSlots,
    totalQuantity: p.totalSlots,
    lowStockAt: null,
  }));

  // Resolve selected pill from displayCode.
  const selectedPill: BoardPillViewModel | null =
    selected !== null
      ? viewModel.pills.find((p) => p.displayCode === selected) ?? null
      : null;
  const selectedDrawer: BoardSlotDrawerViewModel | null =
    selectedPill !== null
      ? viewModel.drawers[selectedPill.broadcastProductId] ?? null
      : null;

  return (
    <SalePanelCard
      title="Sale Board (V Rich style) — preview"
      subtitle={
        selectedPill === null
          ? 'คลิกรหัสเพื่อดู slot'
          : `Selected: ${selectedPill.displayCode}`
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

      {selectedPill !== null && selectedDrawer !== null ? (
        <BoardDrawer
          pill={selectedPill}
          drawer={selectedDrawer}
          onSlotCancel={onSlotCancel}
        />
      ) : null}
    </SalePanelCard>
  );
}

function BoardDrawer({
  pill,
  drawer,
  onSlotCancel,
}: {
  readonly pill: BoardPillViewModel;
  readonly drawer: BoardSlotDrawerViewModel;
  readonly onSlotCancel?: (bookingId: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-card/40 p-2">
      <div className="text-[11px] font-medium text-foreground">
        {pill.headerLabel}
      </div>

      {drawer.slots.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">ไม่มี slot</p>
      ) : (
        <div className="space-y-1">
          {drawer.slots.map((s) => (
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

      {drawer.hasOverflow ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 text-[10px] text-destructive"
          role="alert"
        >
          ⚠ {drawer.overflow.length} booking(s) เกินจำนวน slot ที่มี — admin ควรเช็คสต็อก
        </p>
      ) : null}
    </div>
  );
}
