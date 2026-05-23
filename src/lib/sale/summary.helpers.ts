/**
 * Sale Operations Summary — pure folding helpers.
 *
 * Tier 3.9-G3 (2026-05-23). Extracted from
 * `src/server/repositories/sale-summary.repository.ts` so the
 * aggregation rules can be unit-tested without a Prisma instance.
 *
 * The repo queries raw rows for a (shopId, saleDate); these helpers
 * fold those raw rows into the per-BroadcastProduct + totals shape
 * returned by `GET /api/sale/summary`.
 *
 * Design ref: docs/superpowers/2026-05-23-sale-operations-summary-design.md
 */

export type BookingStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONVERTED_TO_ORDER';

export interface BookingGroupRow {
  readonly broadcastProductId: string;
  readonly status: BookingStatus;
  readonly _count: { readonly _all: number };
}

export interface ReservationGroupRow {
  readonly variantId: string;
  readonly _sum: { readonly quantity: number | null };
}

export interface OrderItemAggRow {
  readonly variantId: string;
  readonly broadcastProductId: string;
  readonly orderId: string;
  readonly quantity: number;
  readonly totalPrice: string; // Decimal serialized
}

export interface BookingsBlock {
  readonly pendingReview: number;
  readonly confirmed: number;
  readonly cancelled: number;
  readonly expired: number;
  readonly convertedToOrder: number;
  readonly total: number;
}

export const EMPTY_BOOKINGS_BLOCK: BookingsBlock = Object.freeze({
  pendingReview: 0,
  confirmed: 0,
  cancelled: 0,
  expired: 0,
  convertedToOrder: 0,
  total: 0,
});

export interface OrdersBlock {
  readonly orderCount: number;
  readonly orderedQuantity: number;
  readonly grossTotal: string; // RM decimal as string
}

export const EMPTY_ORDERS_BLOCK: OrdersBlock = Object.freeze({
  orderCount: 0,
  orderedQuantity: 0,
  grossTotal: '0.00',
});

/**
 * Fold per-status booking counts for a specific BroadcastProduct.
 * Returns zeros when no rows match.
 */
export function foldBookingsByStatus(
  rows: readonly BookingGroupRow[],
  broadcastProductId: string
): BookingsBlock {
  let pendingReview = 0;
  let confirmed = 0;
  let cancelled = 0;
  let expired = 0;
  let convertedToOrder = 0;
  for (const r of rows) {
    if (r.broadcastProductId !== broadcastProductId) continue;
    const n = r._count._all;
    switch (r.status) {
      case 'PENDING_REVIEW':
        pendingReview += n;
        break;
      case 'CONFIRMED':
        confirmed += n;
        break;
      case 'CANCELLED':
        cancelled += n;
        break;
      case 'EXPIRED':
        expired += n;
        break;
      case 'CONVERTED_TO_ORDER':
        convertedToOrder += n;
        break;
    }
  }
  return Object.freeze({
    pendingReview,
    confirmed,
    cancelled,
    expired,
    convertedToOrder,
    total: pendingReview + confirmed + cancelled + expired + convertedToOrder,
  });
}

/**
 * Fold ACTIVE (releasedAt IS NULL) reservations by variantId.
 * Returns 0 when no rows match.
 */
export function foldReservedQty(
  rows: readonly ReservationGroupRow[],
  variantId: string
): number {
  for (const r of rows) {
    if (r.variantId === variantId) {
      return r._sum.quantity ?? 0;
    }
  }
  return 0;
}

/**
 * Decimal-safe sum of money strings (avoids float drift).
 *
 * Inputs are non-negative decimal strings; output is always
 * fixed-2 decimal string in MYR.
 */
export function sumMoney2(values: readonly string[]): string {
  // Use integer cents arithmetic to avoid float drift.
  const ZERO = BigInt(0);
  const HUNDRED = BigInt(100);
  let cents = ZERO;
  for (const v of values) {
    const s = v.trim();
    if (s === '') continue;
    // Accept "12", "12.5", "12.50". Reject anything else as 0.
    const m = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) continue;
    const whole = BigInt(m[1]);
    const fracStr = (m[2] ?? '').padEnd(2, '0');
    const frac = BigInt(fracStr);
    cents = cents + whole * HUNDRED + (whole < ZERO ? -frac : frac);
  }
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  const whole = abs / HUNDRED;
  const frac = abs % HUNDRED;
  const fracStr = frac.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

/**
 * Fold orders block for a specific BroadcastProduct.
 * orderCount = distinct order count whose items match this BP.
 * orderedQuantity = sum item quantity.
 * grossTotal = sum item totalPrice (RM).
 * orderIds = distinct order ID set, surfaced so `aggregateTotals` can
 *            compute a global distinct count across BPs (open question
 *            3 verdict: Option A — `totals.totalOrders` MUST be the
 *            true distinct order count, not a per-BP sum).
 */
export function foldOrdersByBp(
  rows: readonly OrderItemAggRow[],
  broadcastProductId: string
): OrdersBlock & { readonly orderIds: ReadonlySet<string> } {
  const matching = rows.filter((r) => r.broadcastProductId === broadcastProductId);
  if (matching.length === 0) {
    return Object.freeze({
      ...EMPTY_ORDERS_BLOCK,
      orderIds: new Set<string>(),
    });
  }
  const distinctOrders = new Set<string>();
  let orderedQuantity = 0;
  const totals: string[] = [];
  for (const r of matching) {
    distinctOrders.add(r.orderId);
    orderedQuantity += r.quantity;
    totals.push(r.totalPrice);
  }
  return Object.freeze({
    orderCount: distinctOrders.size,
    orderedQuantity,
    grossTotal: sumMoney2(totals),
    orderIds: distinctOrders,
  });
}

export interface SummaryItemTotals {
  readonly broadcastProductCount: number;
  readonly totalBookings: number;
  /**
   * Distinct order count across all BPs. A single order with items
   * from two BPs counts as 1 here (not 2). Open question 3 verdict
   * 2026-05-23: Option A — admin-facing field must mean real distinct
   * orders.
   */
  readonly totalOrders: number;
  /**
   * Sum of per-BP `orders.orderCount` across all items. A single order
   * touching two BPs counts as 2 here. Useful when admin wants to see
   * "how many code-order intersections happened" vs "how many actual
   * orders shipped". Always >= `totalOrders`.
   */
  readonly totalOrderTouches: number;
  readonly totalOrderedQuantity: number;
  readonly totalGross: string;
}

export interface SummaryItem {
  readonly bookings: BookingsBlock;
  readonly orders: OrdersBlock;
  /**
   * Distinct order IDs for this item's BP. Required for the global
   * distinct-count fold in `aggregateTotals`. Optional in the public
   * type so existing callers (tests, snapshots) keep compiling, but
   * production callers always populate it via `foldOrdersByBp`.
   */
  readonly orderIds?: ReadonlySet<string>;
}

/**
 * Aggregate top-level totals across all per-BP summary items.
 *
 * Open question 3 verdict 2026-05-23: `totalOrders` is the distinct
 * order count across BPs (Option A). `totalOrderTouches` carries the
 * old sum-of-per-BP behavior under an unambiguous name so admin can
 * still see "how many code-order intersections" when relevant.
 *
 * Distinct count requires each `SummaryItem` to carry `orderIds`.
 * Items without `orderIds` (legacy callers / snapshot tests) only
 * contribute via `orders.orderCount` to `totalOrderTouches`; their
 * `totalOrders` contribution is zero.
 */
export function aggregateTotals(
  items: readonly SummaryItem[]
): SummaryItemTotals {
  let totalBookings = 0;
  let totalOrderTouches = 0;
  let totalOrderedQuantity = 0;
  const grossSums: string[] = [];
  const distinctOrderIds = new Set<string>();
  for (const item of items) {
    totalBookings += item.bookings.total;
    totalOrderTouches += item.orders.orderCount;
    totalOrderedQuantity += item.orders.orderedQuantity;
    grossSums.push(item.orders.grossTotal);
    if (item.orderIds !== undefined) {
      for (const id of item.orderIds) distinctOrderIds.add(id);
    }
  }
  return Object.freeze({
    broadcastProductCount: items.length,
    totalBookings,
    totalOrders: distinctOrderIds.size,
    totalOrderTouches,
    totalOrderedQuantity,
    totalGross: sumMoney2(grossSums),
  });
}

// ─── Range mode helpers (Tier 3.9-G5) ─────────────────────────────────────

/**
 * Enumerate inclusive YYYY-MM-DD dates between `from` and `to`.
 *
 * Pure. Treats both endpoints as UTC midnight; returns calendar days.
 * Caller is responsible for ensuring `to >= from` (schema enforces).
 */
export function enumerateDateRange(from: string, to: string): readonly string[] {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (toDate.getTime() < fromDate.getTime()) return [];
  const days: string[] = [];
  for (
    let cursor = fromDate.getTime();
    cursor <= toDate.getTime();
    cursor += 86_400_000
  ) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

/**
 * Per-product-code rollup across a date range. Sums booking + order
 * metrics by `displayCode`. Stock fields intentionally omitted because
 * stock is point-in-time (current snapshot), not historical.
 */
export interface ByCodeItem {
  readonly displayCode: string;
  readonly productName: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly bookings: BookingsBlock;
  readonly orders: OrdersBlock;
  readonly orderIds: ReadonlySet<string>;
  readonly appearedOn: readonly string[];
}

export interface PerDaySummaryItemInput {
  readonly displayCode: string;
  readonly productName: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly bookings: BookingsBlock;
  readonly orders: OrdersBlock;
  readonly orderIds?: ReadonlySet<string>;
}

/**
 * Fold per-day items into per-displayCode totals across the range.
 *
 * Input: a flat list of (saleDate, item) pairs across all days in the
 * range. Output: one entry per distinct displayCode with summed
 * bookings + orders + distinct orderIds + the list of saleDates it
 * appeared on.
 */
export function foldByCodeAcrossDays(
  pairs: readonly { readonly saleDate: string; readonly item: PerDaySummaryItemInput }[]
): readonly ByCodeItem[] {
  const byCode = new Map<
    string,
    {
      productName: string;
      stockCode: string;
      saleCode: string | null;
      bookings: { p: number; c: number; x: number; e: number; ct: number };
      orderTouches: number;
      orderedQuantity: number;
      grossSums: string[];
      orderIds: Set<string>;
      appearedOn: Set<string>;
    }
  >();

  for (const { saleDate, item } of pairs) {
    let entry = byCode.get(item.displayCode);
    if (entry === undefined) {
      entry = {
        productName: item.productName,
        stockCode: item.stockCode,
        saleCode: item.saleCode,
        bookings: { p: 0, c: 0, x: 0, e: 0, ct: 0 },
        orderTouches: 0,
        orderedQuantity: 0,
        grossSums: [],
        orderIds: new Set<string>(),
        appearedOn: new Set<string>(),
      };
      byCode.set(item.displayCode, entry);
    }
    entry.bookings.p += item.bookings.pendingReview;
    entry.bookings.c += item.bookings.confirmed;
    entry.bookings.x += item.bookings.cancelled;
    entry.bookings.e += item.bookings.expired;
    entry.bookings.ct += item.bookings.convertedToOrder;
    entry.orderTouches += item.orders.orderCount;
    entry.orderedQuantity += item.orders.orderedQuantity;
    entry.grossSums.push(item.orders.grossTotal);
    if (item.orderIds !== undefined) {
      for (const id of item.orderIds) entry.orderIds.add(id);
    }
    entry.appearedOn.add(saleDate);
  }

  const out: ByCodeItem[] = [];
  for (const [displayCode, e] of byCode) {
    const total =
      e.bookings.p + e.bookings.c + e.bookings.x + e.bookings.e + e.bookings.ct;
    out.push(
      Object.freeze({
        displayCode,
        productName: e.productName,
        stockCode: e.stockCode,
        saleCode: e.saleCode,
        bookings: Object.freeze({
          pendingReview: e.bookings.p,
          confirmed: e.bookings.c,
          cancelled: e.bookings.x,
          expired: e.bookings.e,
          convertedToOrder: e.bookings.ct,
          total,
        }),
        orders: Object.freeze({
          orderCount: e.orderIds.size,
          orderedQuantity: e.orderedQuantity,
          grossTotal: sumMoney2(e.grossSums),
        }),
        orderIds: e.orderIds,
        appearedOn: Object.freeze([...e.appearedOn].sort()),
      })
    );
  }
  // Stable sort by displayCode for deterministic response.
  return Object.freeze(
    out.sort((a, b) => a.displayCode.localeCompare(b.displayCode))
  );
}

export interface RangeTotals extends SummaryItemTotals {
  readonly dayCount: number;
}

/**
 * Aggregate range-wide totals. Uses the `byCode` rollup to compute
 * global distinct order count (Union of orderIds across all codes) +
 * sum of touches + booking totals + grand gross.
 */
export function aggregateRangeTotals(
  byCode: readonly ByCodeItem[],
  dayCount: number
): RangeTotals {
  let totalBookings = 0;
  let totalOrderTouches = 0;
  let totalOrderedQuantity = 0;
  const grossSums: string[] = [];
  const distinctOrderIds = new Set<string>();
  for (const c of byCode) {
    totalBookings += c.bookings.total;
    totalOrderTouches += c.orders.orderCount;
    totalOrderedQuantity += c.orders.orderedQuantity;
    grossSums.push(c.orders.grossTotal);
    for (const id of c.orderIds) distinctOrderIds.add(id);
  }
  return Object.freeze({
    broadcastProductCount: byCode.length,
    totalBookings,
    totalOrders: distinctOrderIds.size,
    totalOrderTouches,
    totalOrderedQuantity,
    totalGross: sumMoney2(grossSums),
    dayCount,
  });
}

/**
 * Pure helper: derive stock flags from variant qty + reserved qty +
 * optional lowStockAt threshold.
 */
export interface StockFlags {
  readonly totalQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  readonly lowStockAt: number | null;
  readonly isLowStock: boolean;
  readonly isOutOfStock: boolean;
}

export function deriveStockFlags(
  totalQuantity: number,
  reservedQty: number,
  lowStockAt: number | null
): StockFlags {
  const availableQty = Math.max(0, totalQuantity - reservedQty);
  const isOutOfStock = availableQty <= 0;
  const isLowStock =
    !isOutOfStock && typeof lowStockAt === 'number' && availableQty <= lowStockAt;
  return Object.freeze({
    totalQuantity,
    reservedQty,
    availableQty,
    lowStockAt,
    isLowStock,
    isOutOfStock,
  });
}
