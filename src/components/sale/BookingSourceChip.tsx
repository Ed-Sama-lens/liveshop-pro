/**
 * BookingSourceChip — small chip rendering a Booking.source label.
 *
 * Tier 1 IA consolidation: bookings can originate from multiple channels
 * after PR 2 schema migration. This chip surfaces the origin on each
 * booking row so admins can scan an omnichannel queue at a glance.
 *
 * Pure presentational; no fetch, no mutation, no business logic. Each
 * known source maps to a Thai label + a Tailwind color hint. Unknown
 * sources fall back to a neutral slate chip with the raw enum value so
 * future Prisma `BookingSource` additions degrade gracefully.
 *
 * Mirrors the `BookingSource` enum in prisma/schema.prisma and the
 * `Booking.source` field documented in
 * docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md § 3.1.
 */

import type { ReactElement } from 'react';

export type BookingSourceValue =
  | 'MANUAL'
  | 'LIVE_COMMENT'
  | 'PAGE_INBOX'
  | 'POST_COMMENT'
  | 'WHATSAPP_CHAT'
  | 'TELEGRAM_CHAT'
  | 'IMPORT'
  | 'SYSTEM';

interface SourceSpec {
  readonly label: string;
  readonly className: string;
  readonly tooltip: string;
}

/**
 * Static map. Component-local (no i18n provider). Update both Thai label
 * and tooltip together when adding a new source. Color hints match the
 * Tier 1 plan table § 3.1.
 */
const SOURCE_MAP: Readonly<Record<BookingSourceValue, SourceSpec>> = Object.freeze({
  MANUAL: {
    label: 'สร้างเอง',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    tooltip: 'แอดมินสร้างการจองด้วยตนเอง',
  },
  LIVE_COMMENT: {
    label: 'คอมเมนต์ไลฟ์',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
    tooltip: 'มาจากคอมเมนต์ในไลฟ์ Facebook',
  },
  PAGE_INBOX: {
    label: 'กล่องข้อความเพจ',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
    tooltip: 'มาจาก Messenger ของเพจ',
  },
  POST_COMMENT: {
    label: 'คอมเมนต์โพสต์',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
    tooltip: 'มาจากคอมเมนต์ในโพสต์ Facebook',
  },
  WHATSAPP_CHAT: {
    label: 'WhatsApp',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
    tooltip: 'มาจาก WhatsApp',
  },
  TELEGRAM_CHAT: {
    label: 'Telegram',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
    tooltip: 'มาจาก Telegram',
  },
  IMPORT: {
    label: 'นำเข้า',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    tooltip: 'นำเข้าจากระบบภายนอก',
  },
  SYSTEM: {
    label: 'ระบบ',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    tooltip: 'สร้างโดยระบบ',
  },
});

const FALLBACK_SPEC: SourceSpec = Object.freeze({
  label: 'อื่น ๆ',
  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  tooltip: 'แหล่งที่มาไม่ทราบ',
});

export interface BookingSourceChipProps {
  /**
   * Raw `Booking.source` string. Accepts any string for graceful
   * degradation; unknown values render as a neutral chip with the raw
   * value as tooltip.
   */
  readonly source: string;
}

/**
 * Render a tiny pill displaying booking origin.
 *
 * Pure. No state. No effects. Safe for SSR and client.
 */
export function BookingSourceChip({ source }: BookingSourceChipProps): ReactElement {
  const knownSpec = SOURCE_MAP[source as BookingSourceValue];
  const spec = knownSpec ?? FALLBACK_SPEC;
  const tooltip = knownSpec ? spec.tooltip : `${spec.tooltip}: ${source}`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${spec.className}`}
      title={tooltip}
      aria-label={`แหล่งที่มา: ${spec.label}`}
    >
      {spec.label}
    </span>
  );
}

/**
 * Static label lookup for non-rendering contexts (test assertions,
 * analytics labels, etc).
 */
export function getBookingSourceLabel(source: string): string {
  const known = SOURCE_MAP[source as BookingSourceValue];
  return known ? known.label : FALLBACK_SPEC.label;
}
