/**
 * Tier 3.9-G6 (2026-05-23) — pure helpers for the compact sale summary
 * panel. Extracted from `SaleSummaryPanel.tsx` so the formatting +
 * count derivations can be unit-tested without rendering React.
 *
 * Shape mirrors the route response from `/api/sale/summary?saleDate=...`
 * — defined in `src/server/repositories/sale-summary.repository.ts`.
 *
 * No I/O. No React. Pure functions only.
 */

export type SummaryFetchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly saleDate: string }
  | {
      readonly kind: 'ready';
      readonly saleDate: string;
      readonly result: SummaryResult;
    }
  | {
      readonly kind: 'error';
      readonly saleDate: string;
      readonly message: string;
    };

export interface SummaryStockBlock {
  readonly totalQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  readonly lowStockAt: number | null;
  readonly isLowStock: boolean;
  readonly isOutOfStock: boolean;
}

export interface SummaryBookingsBlock {
  readonly pendingReview: number;
  readonly confirmed: number;
  readonly cancelled: number;
  readonly expired: number;
  readonly convertedToOrder: number;
  readonly total: number;
}

export interface SummaryItem {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly stock: SummaryStockBlock;
  readonly bookings: SummaryBookingsBlock;
}

/**
 * Sum a specific booking status across all items.
 *
 * Pure helper: derives per-status totals at panel level from
 * per-item `bookings` blocks.
 */
export function sumBookingsByStatus(
  items: readonly SummaryItem[],
  status: keyof SummaryBookingsBlock
): number {
  let n = 0;
  for (const it of items) n += it.bookings[status];
  return n;
}

export interface SummaryTotalsBlock {
  readonly broadcastProductCount: number;
  readonly totalBookings: number;
  readonly totalOrders: number;
  readonly totalOrderTouches: number;
  readonly totalOrderedQuantity: number;
  readonly totalGross: string; // RM string (e.g. '120.50')
}

export interface SummaryResult {
  readonly saleDate: string;
  readonly shopId: string;
  readonly currency: 'MYR';
  readonly items: readonly SummaryItem[];
  readonly totals: SummaryTotalsBlock;
}

/** Server envelope from `ok(...)` */
export interface SummaryApiEnvelope {
  readonly success: boolean;
  readonly data?: SummaryResult;
  readonly error?: string;
}

/**
 * Count low-stock items in the summary response. Low-stock is
 * server-flagged (`isLowStock = true`) — derived from `availableQty <=
 * lowStockAt` when `lowStockAt` is configured.
 */
export function countLowStockItems(items: readonly SummaryItem[]): number {
  let n = 0;
  for (const it of items) if (it.stock.isLowStock) n++;
  return n;
}

/**
 * Count out-of-stock items. Server-flagged (`isOutOfStock = true`)
 * means `availableQty <= 0`.
 */
export function countOutOfStockItems(items: readonly SummaryItem[]): number {
  let n = 0;
  for (const it of items) if (it.stock.isOutOfStock) n++;
  return n;
}

/**
 * Whether `totalOrders` and `totalOrderTouches` differ. UI shows
 * touches as a secondary chip only when this is true — otherwise it
 * is the same number and we hide the extra noise.
 */
export function hasOrderTouchDelta(totals: SummaryTotalsBlock): boolean {
  return totals.totalOrderTouches !== totals.totalOrders;
}

/**
 * Format the gross RM total for display. Input is a decimal string;
 * output adds the `RM` prefix + thousands separator.
 *
 * Example: '1240.00' → 'RM1,240.00'
 */
export function formatGross(grossString: string): string {
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(grossString);
  if (!m) return 'RM0.00';
  const whole = m[1];
  const frac = (m[2] ?? '00').padEnd(2, '0').slice(0, 2);
  // Add thousands separator to the integer part.
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = whole.replace(/^-/, '');
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `RM${sign}${withSep}.${frac}`;
}

/**
 * Helper: validate a YYYY-MM-DD string before passing to the API.
 * The route also validates, but UI guards early to avoid a network
 * round-trip on obviously bad input.
 */
export function isYyyyMmDd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
