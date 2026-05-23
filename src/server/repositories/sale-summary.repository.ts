import { prisma } from '@/lib/db/prisma';
import { parseSaleDate } from '@/lib/sale/sale-date';
import {
  foldBookingsByStatus,
  foldReservedQty,
  foldOrdersByBp,
  deriveStockFlags,
  aggregateTotals,
  type BookingGroupRow,
  type ReservationGroupRow,
  type OrderItemAggRow,
  type BookingsBlock,
  type OrdersBlock,
  type StockFlags,
  type SummaryItemTotals,
} from '@/lib/sale/summary.helpers';

/**
 * Sale Operations Summary — read-only aggregate repository.
 *
 * Tier 3.9-G3 (2026-05-23). Implements the single-date summary
 * described in `docs/superpowers/2026-05-23-sale-operations-summary-design.md`.
 *
 * One method: `summarizeByDate({ shopId, saleDate })`.
 *
 * Fans out 4 queries against an already-validated saleDate (YYYY-MM-DD):
 *
 *   1. BroadcastProduct.findMany — row skeleton + product/variant
 *      identifiers + stock + unit price
 *   2. Booking.groupBy — per-status booking counts scoped to BPs on the
 *      saleDate
 *   3. StockReservation.groupBy — active (releasedAt IS NULL) reserved
 *      qty per variantId in the matched BP set
 *   4. OrderItem.findMany — order/qty/price rows joined to bookings
 *      whose BP matches the saleDate set
 *
 * Returns shape consumed by `GET /api/sale/summary` route. No mutation.
 * No customer PII in the response shape.
 *
 * Cross-shop isolation: every query carries `shopId` (either directly
 * on the model or via the BroadcastProduct relation).
 */

export interface SummaryStockItem {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly productId: string;
  readonly productName: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly variantId: string;
  readonly sku: string;
  readonly unitPrice: string;
  readonly stock: StockFlags;
  readonly bookings: BookingsBlock;
  readonly orders: OrdersBlock;
}

export interface SaleSummaryResult {
  readonly saleDate: string; // echoed YYYY-MM-DD
  readonly shopId: string;
  readonly currency: 'MYR';
  readonly items: readonly SummaryStockItem[];
  readonly totals: SummaryItemTotals;
}

export interface SummarizeByDateInput {
  readonly shopId: string;
  readonly saleDate: string;
}

function formatMoney2(value: { toString(): string }): string {
  // Prisma Decimal toString already emits a non-localized decimal string;
  // we just normalize to exactly 2 decimal places.
  const s = value.toString();
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return '0.00';
  const whole = m[1];
  const frac = (m[2] ?? '').padEnd(2, '0').slice(0, 2);
  return `${whole}.${frac}`;
}

async function fetchBpRows(shopId: string, saleDate: Date) {
  return prisma.broadcastProduct.findMany({
    where: {
      shopId,
      saleDate,
    },
    select: {
      id: true,
      displayCode: true,
      productId: true,
      variantId: true,
      priceOverride: true,
      product: { select: { name: true, stockCode: true, saleCode: true } },
      variant: {
        select: {
          id: true,
          sku: true,
          price: true,
          quantity: true,
          lowStockAt: true,
        },
      },
    },
    orderBy: { displayCode: 'asc' },
  });
}

async function fetchBookingGroups(
  shopId: string,
  bpIds: readonly string[]
): Promise<readonly BookingGroupRow[]> {
  if (bpIds.length === 0) return [];
  const rows = await prisma.booking.groupBy({
    by: ['broadcastProductId', 'status'],
    where: {
      shopId,
      broadcastProductId: { in: [...bpIds] },
    },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    broadcastProductId: r.broadcastProductId,
    status: r.status as BookingGroupRow['status'],
    _count: { _all: r._count._all },
  }));
}

async function fetchReservationGroups(
  variantIds: readonly string[]
): Promise<readonly ReservationGroupRow[]> {
  if (variantIds.length === 0) return [];
  const rows = await prisma.stockReservation.groupBy({
    by: ['variantId'],
    where: {
      releasedAt: null,
      variantId: { in: [...variantIds] },
    },
    _sum: { quantity: true },
  });
  return rows.map((r) => ({
    variantId: r.variantId,
    _sum: { quantity: r._sum.quantity ?? 0 },
  }));
}

async function fetchOrderItemRows(
  bpIds: readonly string[],
  bpVariantMap: ReadonlyMap<string, string>
): Promise<readonly OrderItemAggRow[]> {
  if (bpIds.length === 0) return [];
  // Booking has no `variantId` column — variant lives on the linked
  // BroadcastProduct. We:
  //   1. Pull bookings for our BP set with status CONVERTED_TO_ORDER
  //      and a non-null `convertedOrderId`.
  //   2. For each such booking, group items in the linked Order whose
  //      variantId matches the BP's variantId.
  // This avoids relying on a `variantId` column on Booking (which the
  // schema does not have) and keeps the cross-shop predicate via the
  // booking row.
  const bpSet = new Set(bpIds);
  const variantToBp = new Map<string, string>();
  for (const [bp, variant] of bpVariantMap) variantToBp.set(variant, bp);

  const convertedBookings = await prisma.booking.findMany({
    where: {
      broadcastProductId: { in: [...bpIds] },
      status: 'CONVERTED_TO_ORDER',
      convertedOrderId: { not: null },
    },
    select: {
      broadcastProductId: true,
      convertedOrderId: true,
    },
  });

  const orderIdToBpSet = new Map<string, Set<string>>();
  for (const b of convertedBookings) {
    if (!b.convertedOrderId) continue;
    const set = orderIdToBpSet.get(b.convertedOrderId) ?? new Set<string>();
    set.add(b.broadcastProductId);
    orderIdToBpSet.set(b.convertedOrderId, set);
  }

  const orderIds = [...orderIdToBpSet.keys()];
  if (orderIds.length === 0) return [];

  const items = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      orderId: true,
      variantId: true,
      quantity: true,
      totalPrice: true,
    },
  });

  const out: OrderItemAggRow[] = [];
  for (const it of items) {
    const bpForVariant = variantToBp.get(it.variantId);
    if (!bpForVariant || !bpSet.has(bpForVariant)) continue;
    const orderBps = orderIdToBpSet.get(it.orderId);
    if (!orderBps || !orderBps.has(bpForVariant)) continue;
    out.push({
      orderId: it.orderId,
      variantId: it.variantId,
      broadcastProductId: bpForVariant,
      quantity: it.quantity,
      totalPrice: it.totalPrice.toString(),
    });
  }
  return out;
}

export const saleSummaryRepository = Object.freeze({
  /**
   * Aggregate a single saleDate summary for one shop.
   *
   * @throws Error when saleDate fails YYYY-MM-DD parsing.
   */
  async summarizeByDate(input: SummarizeByDateInput): Promise<SaleSummaryResult> {
    const { shopId, saleDate } = input;
    const parsedDate = parseSaleDate(saleDate);

    const bpRows = await fetchBpRows(shopId, parsedDate);
    const bpIds = bpRows.map((r) => r.id);
    const variantIds = bpRows
      .map((r) => r.variantId)
      .filter((v): v is string => typeof v === 'string');

    // BP → variant map for OrderItem reverse lookup.
    const bpVariantMap = new Map<string, string>();
    for (const bp of bpRows) {
      if (bp.variantId !== null) bpVariantMap.set(bp.id, bp.variantId);
    }

    // Fan out the three aggregation queries in parallel since they
    // touch disjoint tables.
    const [bookingGroups, reservationGroups, orderItemRows] = await Promise.all([
      fetchBookingGroups(shopId, bpIds),
      fetchReservationGroups(variantIds),
      fetchOrderItemRows(bpIds, bpVariantMap),
    ]);

    // Build internal items that carry `orderIds` so `aggregateTotals`
    // can compute the global distinct order count (open question 3
    // verdict 2026-05-23 Option A). The public response strips
    // `orderIds` from `orders` since `Set<string>` does not survive
    // JSON serialization cleanly and is an internal concern.
    type InternalItem = SummaryStockItem & {
      readonly _orderIds: ReadonlySet<string>;
    };

    const internalItems: InternalItem[] = bpRows
      .filter((bp): bp is typeof bp & { variant: NonNullable<typeof bp.variant> } =>
        bp.variant !== null
      )
      .map((bp) => {
        const reservedQty = foldReservedQty(reservationGroups, bp.variant.id);
        const stock = deriveStockFlags(
          bp.variant.quantity,
          reservedQty,
          bp.variant.lowStockAt
        );
        const bookings = foldBookingsByStatus(bookingGroups, bp.id);
        const ordersWithIds = foldOrdersByBp(orderItemRows, bp.id);
        const { orderIds, ...orders } = ordersWithIds;
        const unitPrice = formatMoney2(bp.priceOverride ?? bp.variant.price);

        return Object.freeze({
          broadcastProductId: bp.id,
          displayCode: bp.displayCode,
          productId: bp.productId,
          productName: bp.product.name,
          stockCode: bp.product.stockCode,
          saleCode: bp.product.saleCode,
          variantId: bp.variant.id,
          sku: bp.variant.sku,
          unitPrice,
          stock,
          bookings,
          orders,
          _orderIds: orderIds,
        });
      });

    // aggregateTotals reads `orderIds` (optional on the public
    // SummaryItem type) to compute the distinct global count.
    const totals = aggregateTotals(
      internalItems.map((it) => ({
        bookings: it.bookings,
        orders: it.orders,
        orderIds: it._orderIds,
      }))
    );

    // Strip _orderIds from the public response.
    const items: SummaryStockItem[] = internalItems.map((it) => {
      const { _orderIds, ...publicItem } = it;
      void _orderIds;
      return publicItem;
    });

    return Object.freeze({
      saleDate,
      shopId,
      currency: 'MYR' as const,
      items: Object.freeze(items),
      totals,
    });
  },
});
