/**
 * V Rich-style sale board — display layer pure helpers.
 *
 * Tier 3.10-B-prep (2026-05-23). Extends `board-helpers.ts` (PR #72)
 * with visual layout primitives the UI components (3.10-B pill row,
 * 3.10-C drawer) will consume. Kept separate so the original helpers
 * stay focused on data structure (slots / sort) and this file owns
 * display metrics (sizing / colors / progress).
 *
 * No I/O. No React. No CSS. Pure functions only.
 */

import type { PillBookingStatus, PillColorState } from './board-helpers';

// ─── Pill width ──────────────────────────────────────────────────────────

/**
 * Pill width characters needed to render a displayCode without
 * truncation. UI uses this to pick a `min-width` so `CM1` and `CM10`
 * line up. Returns an integer character count, NOT a px value.
 *
 * Caller multiplies by their chosen `ch` unit or font metric.
 *
 * Examples:
 *  - 'CM1' → 3
 *  - 'CM10' → 4
 *  - 'BD3' → 3
 *  - 'A1' → 2
 */
export function pillWidthChars(displayCode: string): number {
  return Math.max(displayCode.length, 2);
}

/**
 * Pick a consistent pill width across a set of displayCodes so the
 * row visually aligns. UI clamps to this max instead of letting each
 * pill resize independently.
 */
export function pillRowMaxWidthChars(displayCodes: readonly string[]): number {
  if (displayCodes.length === 0) return 2;
  let max = 2;
  for (const code of displayCodes) {
    const w = pillWidthChars(code);
    if (w > max) max = w;
  }
  return max;
}

// ─── Slot progress ───────────────────────────────────────────────────────

/**
 * Slot progress percentage for the drawer header.
 *
 * 0 when totalQuantity is 0 (defensive). Otherwise filled/total × 100,
 * rounded to integer. Used by the UI to render a progress bar.
 */
export function slotProgressPercent(args: {
  filled: number;
  totalQuantity: number;
}): number {
  if (args.totalQuantity <= 0) return 0;
  const ratio = Math.max(0, Math.min(args.filled, args.totalQuantity)) / args.totalQuantity;
  return Math.round(ratio * 100);
}

/**
 * Pure helper: derive filled count from slot list. Counts only
 * 'filled' slots; ignores 'empty'. Matches `buildSlots()` semantics.
 */
export function countFilledSlots<T extends { kind: 'empty' | 'filled' }>(
  slots: readonly T[]
): number {
  let n = 0;
  for (const s of slots) {
    if (s.kind === 'filled') n++;
  }
  return n;
}

// ─── Slot row display state ──────────────────────────────────────────────

/**
 * Per-slot row visual state. Maps booking status + reservation
 * integrity into a deterministic class admin sees.
 *
 * - empty       — placeholder, dotted-line drop target (no booking)
 * - pending     — booking PENDING_REVIEW
 * - confirmed   — booking CONFIRMED (stock reserved)
 * - integrity_warn — CONFIRMED but reservation MISSING/MULTIPLE
 *                    (data corruption signal; admin should fix)
 */
export type SlotRowDisplayState =
  | 'empty'
  | 'pending'
  | 'confirmed'
  | 'integrity_warn';

export interface SlotRowDisplayInput {
  readonly status: PillBookingStatus | null;
  readonly reservationIntegrity?:
    | 'OK'
    | 'NOT_APPLICABLE'
    | 'MISSING'
    | 'MULTIPLE';
}

export function slotRowDisplayState(
  input: SlotRowDisplayInput
): SlotRowDisplayState {
  if (input.status === null) return 'empty';
  if (input.status === 'PENDING_REVIEW') return 'pending';
  if (input.status === 'CONFIRMED') {
    if (
      input.reservationIntegrity === 'MISSING' ||
      input.reservationIntegrity === 'MULTIPLE'
    ) {
      return 'integrity_warn';
    }
    return 'confirmed';
  }
  // Terminal statuses (CANCELLED/EXPIRED/CONVERTED_TO_ORDER) never
  // appear in the active slot list per `buildSlots()` contract.
  // Defensive: treat as empty.
  return 'empty';
}

// ─── Color tokens (semantic, not CSS) ────────────────────────────────────

/**
 * Semantic color token names for pill states. UI maps these to its
 * Tailwind palette; tests / docs reference the names without coupling
 * to the actual hex/class strings.
 *
 * Locked here so 3.10-B reviewers can verify intent without scanning
 * Tailwind classes.
 */
export const PILL_COLOR_TOKEN: Readonly<Record<PillColorState, string>> = Object.freeze({
  'in-stock': 'pill.in-stock',
  'low-stock': 'pill.low-stock',
  'out-of-stock': 'pill.out-of-stock',
  selected: 'pill.selected',
});

export const SLOT_ROW_COLOR_TOKEN: Readonly<Record<SlotRowDisplayState, string>> = Object.freeze({
  empty: 'slot.empty',
  pending: 'slot.pending',
  confirmed: 'slot.confirmed',
  integrity_warn: 'slot.integrity-warn',
});

// ─── Compact pill label (very narrow rendering) ──────────────────────────

/**
 * Format the visible pill label. V Rich design (per audit PR #63 §3.1)
 * shows ONLY the displayCode on the pill itself — name + price live in
 * the expanded drawer. This helper exists for symmetry with
 * `formatBoardHeader` and to centralize any future tweaks (icon prefix,
 * suffix badge, etc).
 */
export function formatPillLabel(displayCode: string): string {
  return displayCode;
}

/**
 * Format a stock badge like `(13)` or `(0/13)` to overlay on the pill
 * when the available count needs to be visible without clicking.
 *
 * Mode 'compact' returns `(13)` — total or available count only.
 * Mode 'fraction' returns `(7/13)` — available/total.
 */
export function formatStockBadge(args: {
  availableQty: number;
  totalQuantity: number;
  mode?: 'compact' | 'fraction';
}): string {
  const mode = args.mode ?? 'compact';
  if (mode === 'fraction') {
    return `(${args.availableQty}/${args.totalQuantity})`;
  }
  return `(${args.availableQty})`;
}
