'use client';

/**
 * Source filter chips for the /sale workspace header.
 *
 * Tier 1 IA consolidation: visual-first filter strip showing all booking
 * sources the schema supports. Click-to-filter for sources that are
 * already actionable today (MANUAL, LIVE_COMMENT — both reachable via
 * existing API paths). Other sources render as "coming soon" muted chips
 * to signal upcoming Tier 4 inbound runtime work without implying it
 * exists yet.
 *
 * Filtering is local (selects which Booking.source values render in the
 * queue). The component does NOT change route params or refetch — it
 * simply emits the selected filter to a parent callback. Parent decides
 * whether to apply.
 *
 * Pure presentational. No fetch. No mutation. Safe for SSR.
 */

import type { ReactElement } from 'react';

type SourceFilterValue =
  | 'ALL'
  | 'MANUAL'
  | 'LIVE_COMMENT'
  | 'PAGE_INBOX'
  | 'POST_COMMENT'
  | 'WHATSAPP_CHAT'
  | 'TELEGRAM_CHAT';

interface ChipSpec {
  readonly value: SourceFilterValue;
  readonly label: string;
  readonly available: boolean;
}

/**
 * Display order matches Boss/ChatGPT Tier 1 plan § 3.1 ordering: catch-all
 * first, then operator-most-touched sources (Live + Manual), then inbox
 * channels grouped by current adoption.
 *
 * `available: false` chips are visible but non-clickable. They surface
 * the schema's omnichannel intent without implying runtime exists. When
 * the inbound runtime for each channel ships (Tier 4 PRs), flip
 * `available` to true.
 */
const FILTER_CHIPS: readonly ChipSpec[] = Object.freeze([
  { value: 'ALL', label: 'ทั้งหมด', available: true },
  { value: 'LIVE_COMMENT', label: 'ไลฟ์สด', available: true },
  { value: 'PAGE_INBOX', label: 'Inbox', available: false },
  { value: 'POST_COMMENT', label: 'Post Comment', available: false },
  { value: 'MANUAL', label: 'Manual', available: true },
  { value: 'TELEGRAM_CHAT', label: 'Telegram', available: false },
  { value: 'WHATSAPP_CHAT', label: 'WhatsApp', available: false },
]);

export interface SaleSourceFilterChipsProps {
  /** Currently selected filter. Parent owns state. */
  readonly value: SourceFilterValue;
  /** Called when user clicks an available chip. */
  readonly onChange: (next: SourceFilterValue) => void;
}

export function SaleSourceFilterChips({
  value,
  onChange,
}: SaleSourceFilterChipsProps): ReactElement {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="ตัวกรองตามแหล่งที่มา"
    >
      {FILTER_CHIPS.map((c) => {
        const selected = c.value === value;
        const baseCls =
          'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors';
        const variantCls = !c.available
          ? 'cursor-not-allowed bg-muted text-muted-foreground/60 line-through decoration-1'
          : selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80';
        return (
          <button
            key={c.value}
            type="button"
            disabled={!c.available}
            onClick={() => c.available && onChange(c.value)}
            className={`${baseCls} ${variantCls}`}
            title={
              c.available
                ? `กรอง: ${c.label}`
                : `${c.label} — เร็ว ๆ นี้ (รอ Tier 4 inbound runtime)`
            }
            aria-pressed={selected}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export type { SourceFilterValue };
