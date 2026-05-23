'use client';

import { pillColorState } from '@/lib/sale/board-helpers';
import {
  PILL_COLOR_TOKEN,
  formatPillLabel,
  formatStockBadge,
} from '@/lib/sale/board-display';

/**
 * V Rich-style product code pill — Tier 3.10-B skeleton.
 *
 * NOT wired into the production `/sale` workspace. PR #63 design audit
 * specifies a feature flag (`NEXT_PUBLIC_SALE_LAYOUT_V2`) for the
 * eventual rollout. This component is foundation only — tests + visual
 * verification before the flag flip.
 *
 * Pure presentational. No fetch. No mutation. No drag/drop.
 */

export interface ProductCodePillProps {
  readonly displayCode: string;
  readonly availableQty: number;
  readonly totalQuantity: number;
  readonly lowStockAt: number | null;
  readonly selected: boolean;
  readonly onClick: (displayCode: string) => void;
  /** Optional pill width (chars). Caller sets uniform width via pillRowMaxWidthChars. */
  readonly widthCh?: number;
  /** Compact stock badge mode. 'compact' = `(13)`, 'fraction' = `(7/13)`. */
  readonly stockBadgeMode?: 'compact' | 'fraction';
}

/**
 * Maps the semantic color token to Tailwind classes. Centralized here
 * so PR #79's frozen token contract drives the visual.
 */
const PILL_CLASS_BY_TOKEN: Record<string, string> = Object.freeze({
  [PILL_COLOR_TOKEN['in-stock']]:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20',
  [PILL_COLOR_TOKEN['low-stock']]:
    'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
  [PILL_COLOR_TOKEN['out-of-stock']]:
    'border-destructive/40 bg-destructive/5 text-destructive opacity-70 hover:opacity-100',
  [PILL_COLOR_TOKEN['selected']]:
    'border-foreground bg-foreground text-background ring-2 ring-foreground',
});

export function ProductCodePill({
  displayCode,
  availableQty,
  totalQuantity,
  lowStockAt,
  selected,
  onClick,
  widthCh,
  stockBadgeMode = 'compact',
}: ProductCodePillProps) {
  const state = pillColorState({
    availableQty,
    lowStockAt,
    selected,
  });
  const colorToken = PILL_COLOR_TOKEN[state];
  const colorClass = PILL_CLASS_BY_TOKEN[colorToken] ?? '';
  const label = formatPillLabel(displayCode);
  const badge = formatStockBadge({
    availableQty,
    totalQuantity,
    mode: stockBadgeMode,
  });

  const style = widthCh !== undefined ? { minWidth: `${widthCh + 4}ch` } : undefined;

  return (
    <button
      type="button"
      onClick={() => onClick(displayCode)}
      className={`inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs transition ${colorClass}`}
      style={style}
      data-state={state}
      aria-pressed={selected}
      aria-label={`${label} ${badge}`}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-[10px] opacity-80">{badge}</span>
    </button>
  );
}
