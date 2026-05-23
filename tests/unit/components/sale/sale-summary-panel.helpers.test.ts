import { describe, it, expect } from 'vitest';
import {
  countLowStockItems,
  countOutOfStockItems,
  hasOrderTouchDelta,
  formatGross,
  isYyyyMmDd,
  sumBookingsByStatus,
  type SummaryItem,
  type SummaryTotalsBlock,
} from '@/components/sale/sale-summary-panel.helpers';

/**
 * Tier 3.9-G6 — pure-helper tests for the compact summary panel.
 * Component itself is presentational; behavior locked here.
 */

function stockItem(overrides: {
  displayCode: string;
  totalQuantity?: number;
  reservedQty?: number;
  lowStockAt?: number | null;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
  bookings?: SummaryItem['bookings'];
}): SummaryItem {
  return {
    broadcastProductId: `bp-${overrides.displayCode}`,
    displayCode: overrides.displayCode,
    stock: {
      totalQuantity: overrides.totalQuantity ?? 10,
      reservedQty: overrides.reservedQty ?? 0,
      availableQty: (overrides.totalQuantity ?? 10) - (overrides.reservedQty ?? 0),
      lowStockAt: overrides.lowStockAt ?? null,
      isLowStock: overrides.isLowStock ?? false,
      isOutOfStock: overrides.isOutOfStock ?? false,
    },
    bookings: overrides.bookings ?? {
      pendingReview: 0,
      confirmed: 0,
      cancelled: 0,
      expired: 0,
      convertedToOrder: 0,
      total: 0,
    },
  };
}

describe('countLowStockItems', () => {
  it('0 for empty', () => {
    expect(countLowStockItems([])).toBe(0);
  });

  it('counts items flagged low-stock', () => {
    expect(
      countLowStockItems([
        stockItem({ displayCode: 'CM1', isLowStock: true }),
        stockItem({ displayCode: 'CM2', isLowStock: false }),
        stockItem({ displayCode: 'CM3', isLowStock: true }),
      ])
    ).toBe(2);
  });

  it('does not double-count items both low + OOS (OOS overrides upstream)', () => {
    expect(
      countLowStockItems([
        stockItem({ displayCode: 'CM1', isLowStock: false, isOutOfStock: true }),
      ])
    ).toBe(0);
  });
});

describe('countOutOfStockItems', () => {
  it('0 for empty', () => {
    expect(countOutOfStockItems([])).toBe(0);
  });

  it('counts items flagged OOS', () => {
    expect(
      countOutOfStockItems([
        stockItem({ displayCode: 'CM1', isOutOfStock: true }),
        stockItem({ displayCode: 'CM2', isOutOfStock: false }),
      ])
    ).toBe(1);
  });
});

describe('hasOrderTouchDelta', () => {
  function totals(distinct: number, touches: number): SummaryTotalsBlock {
    return {
      broadcastProductCount: 0,
      totalBookings: 0,
      totalOrders: distinct,
      totalOrderTouches: touches,
      totalOrderedQuantity: 0,
      totalGross: '0.00',
    };
  }

  it('false when equal (single-BP orders only)', () => {
    expect(hasOrderTouchDelta(totals(3, 3))).toBe(false);
  });

  it('true when touches > orders (multi-BP order present)', () => {
    expect(hasOrderTouchDelta(totals(2, 5))).toBe(true);
  });

  it('true when touches < orders (defensive — should not happen)', () => {
    expect(hasOrderTouchDelta(totals(5, 2))).toBe(true);
  });
});

describe('formatGross', () => {
  it('formats integer-only as RM with .00', () => {
    expect(formatGross('100')).toBe('RM100.00');
  });

  it('formats decimal as RM with thousands sep', () => {
    expect(formatGross('1240.50')).toBe('RM1,240.50');
  });

  it('handles large numbers with multiple thousands separators', () => {
    expect(formatGross('1234567.89')).toBe('RM1,234,567.89');
  });

  it('pads single-digit fraction', () => {
    expect(formatGross('5.5')).toBe('RM5.50');
  });

  it('falls back to RM0.00 on malformed input', () => {
    expect(formatGross('abc')).toBe('RM0.00');
    expect(formatGross('')).toBe('RM0.00');
  });

  it('handles negative defensively', () => {
    expect(formatGross('-100.50')).toBe('RM-100.50');
  });
});

describe('isYyyyMmDd', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(isYyyyMmDd('2026-05-23')).toBe(true);
  });

  it('rejects DD-MM-YYYY', () => {
    expect(isYyyyMmDd('23-05-2026')).toBe(false);
  });

  it('rejects partial date', () => {
    expect(isYyyyMmDd('2026-05')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isYyyyMmDd('')).toBe(false);
  });

  it('rejects extra characters', () => {
    expect(isYyyyMmDd('2026-05-23T00:00:00')).toBe(false);
  });
});

describe('sumBookingsByStatus', () => {
  it('0 for empty', () => {
    expect(sumBookingsByStatus([], 'confirmed')).toBe(0);
  });

  it('sums pendingReview across items', () => {
    expect(
      sumBookingsByStatus(
        [
          stockItem({
            displayCode: 'CM1',
            bookings: {
              pendingReview: 2,
              confirmed: 0,
              cancelled: 0,
              expired: 0,
              convertedToOrder: 0,
              total: 2,
            },
          }),
          stockItem({
            displayCode: 'CM2',
            bookings: {
              pendingReview: 3,
              confirmed: 0,
              cancelled: 0,
              expired: 0,
              convertedToOrder: 0,
              total: 3,
            },
          }),
        ],
        'pendingReview'
      )
    ).toBe(5);
  });

  it('sums convertedToOrder across items', () => {
    expect(
      sumBookingsByStatus(
        [
          stockItem({
            displayCode: 'CM1',
            bookings: {
              pendingReview: 0,
              confirmed: 0,
              cancelled: 0,
              expired: 0,
              convertedToOrder: 4,
              total: 4,
            },
          }),
        ],
        'convertedToOrder'
      )
    ).toBe(4);
  });

  it('totals field reads cleanly across items', () => {
    expect(
      sumBookingsByStatus(
        [
          stockItem({
            displayCode: 'CM1',
            bookings: {
              pendingReview: 1,
              confirmed: 2,
              cancelled: 0,
              expired: 0,
              convertedToOrder: 1,
              total: 4,
            },
          }),
          stockItem({
            displayCode: 'CM2',
            bookings: {
              pendingReview: 0,
              confirmed: 3,
              cancelled: 1,
              expired: 0,
              convertedToOrder: 0,
              total: 4,
            },
          }),
        ],
        'total'
      )
    ).toBe(8);
  });
});
