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
