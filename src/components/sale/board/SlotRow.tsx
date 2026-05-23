'use client';

import { X } from 'lucide-react';
import {
  slotRowDisplayState,
  SLOT_ROW_COLOR_TOKEN,
  type SlotRowDisplayState,
} from '@/lib/sale/board-display';
import type { PillBookingStatus } from '@/lib/sale/board-helpers';

/**
 * V Rich-style slot row — Tier 3.10-C skeleton.
 *
 * Renders a single slot inside the expanded drawer. Empty slots are
 * placeholders for drag-drop (PR 3.10-E). Filled slots show
 * `customerName + qty + status` and an X cancel handle (handler is
 * supplied by parent; cancel API call happens in 3.10-D).
 *
 * Pure presentational. No fetch. No mutation initiation.
 */

const SLOT_CLASS_BY_TOKEN: Record<string, string> = Object.freeze({
  [SLOT_ROW_COLOR_TOKEN.empty]:
    'border-dashed border-border/60 bg-card/40 text-muted-foreground',
  [SLOT_ROW_COLOR_TOKEN.pending]:
    'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-200',
  [SLOT_ROW_COLOR_TOKEN.confirmed]:
    'border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200',
  [SLOT_ROW_COLOR_TOKEN.integrity_warn]:
    'border-destructive/60 bg-destructive/10 text-destructive',
});

export interface SlotRowProps {
  readonly index: number; // 1-based UI; consumer should pass index+1
  readonly status: PillBookingStatus | null;
  readonly reservationIntegrity?:
    | 'OK'
    | 'NOT_APPLICABLE'
    | 'MISSING'
    | 'MULTIPLE';
  readonly customerName?: string;
  readonly quantity?: number;
  /** Handler invoked when X button clicked. No-op when slot is empty. */
  readonly onCancel?: () => void;
}

export function SlotRow({
  index,
  status,
  reservationIntegrity,
  customerName,
  quantity,
  onCancel,
}: SlotRowProps) {
  const state: SlotRowDisplayState = slotRowDisplayState(
    reservationIntegrity === undefined
      ? { status }
      : { status, reservationIntegrity }
  );
  const colorToken = SLOT_ROW_COLOR_TOKEN[state];
  const colorClass = SLOT_CLASS_BY_TOKEN[colorToken] ?? '';

  if (state === 'empty') {
    return (
      <div
        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${colorClass}`}
        data-state="empty"
      >
        <span className="w-6 text-right font-mono">{index}.</span>
        <span className="flex-1 italic">— ว่าง —</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${colorClass}`}
      data-state={state}
    >
      <span className="w-6 text-right font-mono">{index}.</span>
      <span className="flex-1 truncate font-medium">{customerName ?? '?'}</span>
      <span className="font-mono text-[10px] opacity-80">×{quantity ?? 1}</span>
      {state === 'integrity_warn' ? (
        <span
          className="rounded bg-destructive/20 px-1 text-[10px] uppercase tracking-wide"
          title="Reservation integrity issue — admin should re-confirm"
        >
          ⚠ integrity
        </span>
      ) : null}
      {onCancel !== undefined ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-0.5 hover:bg-foreground/10"
          aria-label={`Cancel slot ${index}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
