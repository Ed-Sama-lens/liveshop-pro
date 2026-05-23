import { describe, it, expect } from 'vitest';
import {
  foldBookingsByStatus,
  foldReservedQty,
  foldOrdersByBp,
  sumMoney2,
  aggregateTotals,
  deriveStockFlags,
  EMPTY_BOOKINGS_BLOCK,
  EMPTY_ORDERS_BLOCK,
  type BookingGroupRow,
  type ReservationGroupRow,
  type OrderItemAggRow,
  type SummaryItem,
} from '@/lib/sale/summary.helpers';

/**
 * Tier 3.9-G3 — unit tests for sale summary pure folding helpers.
 *
 * These cover the deterministic fold-and-aggregate rules used by
 * `saleSummaryRepository.summarizeByDate()`. The repo wires Prisma
 * around these; here we test in isolation.
 */

describe('foldBookingsByStatus', () => {
  it('returns zeros when no rows match the broadcastProductId', () => {
    const block = foldBookingsByStatus([], 'bp-1');
    expect(block).toEqual(EMPTY_BOOKINGS_BLOCK);
  });

  it('sums each status correctly', () => {
    const rows: BookingGroupRow[] = [
      { broadcastProductId: 'bp-1', status: 'PENDING_REVIEW', _count: { _all: 3 } },
      { broadcastProductId: 'bp-1', status: 'CONFIRMED', _count: { _all: 5 } },
      { broadcastProductId: 'bp-1', status: 'CANCELLED', _count: { _all: 2 } },
      { broadcastProductId: 'bp-1', status: 'EXPIRED', _count: { _all: 1 } },
      { broadcastProductId: 'bp-1', status: 'CONVERTED_TO_ORDER', _count: { _all: 4 } },
    ];
    const block = foldBookingsByStatus(rows, 'bp-1');
    expect(block).toEqual({
      pendingReview: 3,
      confirmed: 5,
      cancelled: 2,
      expired: 1,
      convertedToOrder: 4,
      total: 15,
    });
  });

  it('ignores rows for other BPs', () => {
    const rows: BookingGroupRow[] = [
      { broadcastProductId: 'bp-1', status: 'CONFIRMED', _count: { _all: 3 } },
      { broadcastProductId: 'bp-2', status: 'CONFIRMED', _count: { _all: 99 } },
    ];
    const block = foldBookingsByStatus(rows, 'bp-1');
    expect(block.confirmed).toBe(3);
    expect(block.total).toBe(3);
  });

  it('handles multiple group rows of same status (over-defensive)', () => {
    const rows: BookingGroupRow[] = [
      { broadcastProductId: 'bp-1', status: 'PENDING_REVIEW', _count: { _all: 2 } },
      { broadcastProductId: 'bp-1', status: 'PENDING_REVIEW', _count: { _all: 3 } },
    ];
    const block = foldBookingsByStatus(rows, 'bp-1');
    expect(block.pendingReview).toBe(5);
  });
});

describe('foldReservedQty', () => {
  it('returns 0 when no rows match the variantId', () => {
    expect(foldReservedQty([], 'v-1')).toBe(0);
  });

  it('returns the matching variant total', () => {
    const rows: ReservationGroupRow[] = [
      { variantId: 'v-1', _sum: { quantity: 7 } },
    ];
    expect(foldReservedQty(rows, 'v-1')).toBe(7);
  });

  it('returns 0 when _sum.quantity is null (no active reservations)', () => {
    const rows: ReservationGroupRow[] = [
      { variantId: 'v-1', _sum: { quantity: null } },
    ];
    expect(foldReservedQty(rows, 'v-1')).toBe(0);
  });

  it('ignores other variants', () => {
    const rows: ReservationGroupRow[] = [
      { variantId: 'v-other', _sum: { quantity: 99 } },
      { variantId: 'v-1', _sum: { quantity: 5 } },
    ];
    expect(foldReservedQty(rows, 'v-1')).toBe(5);
  });
});

describe('sumMoney2', () => {
  it('returns "0.00" for empty input', () => {
    expect(sumMoney2([])).toBe('0.00');
  });

  it('sums two whole-numbered decimals', () => {
    expect(sumMoney2(['12.50', '7.50'])).toBe('20.00');
  });

  it('handles single-digit fraction (e.g. "12.5")', () => {
    expect(sumMoney2(['12.5', '0.50'])).toBe('13.00');
  });

  it('handles integer-only strings', () => {
    expect(sumMoney2(['100', '50'])).toBe('150.00');
  });

  it('avoids float drift across many small sums', () => {
    // 100 × 0.10 = 10.00 exactly via integer cents math; classic float
    // drift would yield 9.99999...
    const vals = Array.from({ length: 100 }, () => '0.10');
    expect(sumMoney2(vals)).toBe('10.00');
  });

  it('skips empty strings', () => {
    expect(sumMoney2(['', '5.00', '', '3.50'])).toBe('8.50');
  });

  it('skips malformed values (defensive)', () => {
    expect(sumMoney2(['abc', '5.00', '5..00', '3.50'])).toBe('8.50');
  });
});

describe('foldOrdersByBp', () => {
  it('returns EMPTY_ORDERS_BLOCK when no rows match', () => {
    expect(foldOrdersByBp([], 'bp-1')).toEqual(EMPTY_ORDERS_BLOCK);
  });

  it('dedupes orderCount across rows of the same orderId', () => {
    const rows: OrderItemAggRow[] = [
      {
        orderId: 'ord-1',
        variantId: 'v-1',
        broadcastProductId: 'bp-1',
        quantity: 2,
        totalPrice: '20.00',
      },
      {
        orderId: 'ord-1',
        variantId: 'v-2',
        broadcastProductId: 'bp-1',
        quantity: 3,
        totalPrice: '30.00',
      },
    ];
    const block = foldOrdersByBp(rows, 'bp-1');
    expect(block.orderCount).toBe(1);
    expect(block.orderedQuantity).toBe(5);
    expect(block.grossTotal).toBe('50.00');
  });

  it('counts two separate orders independently', () => {
    const rows: OrderItemAggRow[] = [
      {
        orderId: 'ord-1',
        variantId: 'v-1',
        broadcastProductId: 'bp-1',
        quantity: 1,
        totalPrice: '10.00',
      },
      {
        orderId: 'ord-2',
        variantId: 'v-1',
        broadcastProductId: 'bp-1',
        quantity: 1,
        totalPrice: '10.00',
      },
    ];
    const block = foldOrdersByBp(rows, 'bp-1');
    expect(block.orderCount).toBe(2);
    expect(block.orderedQuantity).toBe(2);
    expect(block.grossTotal).toBe('20.00');
  });

  it('ignores rows for other BPs', () => {
    const rows: OrderItemAggRow[] = [
      {
        orderId: 'ord-1',
        variantId: 'v-1',
        broadcastProductId: 'bp-other',
        quantity: 999,
        totalPrice: '9999.00',
      },
    ];
    expect(foldOrdersByBp(rows, 'bp-1')).toEqual(EMPTY_ORDERS_BLOCK);
  });
});

describe('aggregateTotals', () => {
  it('returns zero totals for empty items', () => {
    const totals = aggregateTotals([]);
    expect(totals).toEqual({
      broadcastProductCount: 0,
      totalBookings: 0,
      totalOrders: 0,
      totalOrderedQuantity: 0,
      totalGross: '0.00',
    });
  });

  it('sums booking totals and order rollups across BPs', () => {
    const items: SummaryItem[] = [
      {
        bookings: {
          pendingReview: 2,
          confirmed: 3,
          cancelled: 0,
          expired: 0,
          convertedToOrder: 1,
          total: 6,
        },
        orders: { orderCount: 1, orderedQuantity: 1, grossTotal: '10.00' },
      },
      {
        bookings: {
          pendingReview: 0,
          confirmed: 1,
          cancelled: 1,
          expired: 0,
          convertedToOrder: 2,
          total: 4,
        },
        orders: { orderCount: 2, orderedQuantity: 2, grossTotal: '25.50' },
      },
    ];
    const totals = aggregateTotals(items);
    expect(totals.broadcastProductCount).toBe(2);
    expect(totals.totalBookings).toBe(10);
    expect(totals.totalOrders).toBe(3);
    expect(totals.totalOrderedQuantity).toBe(3);
    expect(totals.totalGross).toBe('35.50');
  });
});

describe('deriveStockFlags', () => {
  it('availableQty never goes negative', () => {
    const f = deriveStockFlags(2, 5, null);
    expect(f.availableQty).toBe(0);
    expect(f.isOutOfStock).toBe(true);
  });

  it('flags out-of-stock when availableQty <= 0', () => {
    const f = deriveStockFlags(0, 0, null);
    expect(f.isOutOfStock).toBe(true);
    expect(f.isLowStock).toBe(false);
  });

  it('flags low-stock only when availableQty <= lowStockAt and not OOS', () => {
    const f = deriveStockFlags(10, 8, 3);
    expect(f.availableQty).toBe(2);
    expect(f.isLowStock).toBe(true);
    expect(f.isOutOfStock).toBe(false);
  });

  it('does not flag low-stock when lowStockAt is null', () => {
    const f = deriveStockFlags(1, 0, null);
    expect(f.isLowStock).toBe(false);
    expect(f.isOutOfStock).toBe(false);
  });

  it('does not flag low-stock when availableQty > lowStockAt', () => {
    const f = deriveStockFlags(10, 0, 3);
    expect(f.isLowStock).toBe(false);
  });

  it('out-of-stock overrides low-stock', () => {
    const f = deriveStockFlags(0, 0, 3);
    expect(f.isOutOfStock).toBe(true);
    expect(f.isLowStock).toBe(false);
  });
});
