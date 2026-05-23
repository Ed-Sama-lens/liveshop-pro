import { describe, it, expect } from 'vitest';
import {
  enumerateDateRange,
  foldByCodeAcrossDays,
  aggregateRangeTotals,
  type PerDaySummaryItemInput,
} from '@/lib/sale/summary.helpers';

/**
 * Tier 3.9-G5 — unit tests for sale summary range pure helpers.
 *
 * Covers:
 *   - enumerateDateRange: inclusive YYYY-MM-DD list
 *   - foldByCodeAcrossDays: per-displayCode rollup across days
 *   - aggregateRangeTotals: distinct order count across the range
 */

describe('enumerateDateRange', () => {
  it('single-day range returns one entry', () => {
    expect(enumerateDateRange('2026-05-23', '2026-05-23')).toEqual(['2026-05-23']);
  });

  it('inclusive range of 7 days', () => {
    expect(enumerateDateRange('2026-05-01', '2026-05-07')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
    ]);
  });

  it('crosses month boundary', () => {
    expect(enumerateDateRange('2026-05-30', '2026-06-02')).toEqual([
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
    ]);
  });

  it('returns empty when to < from (defensive)', () => {
    expect(enumerateDateRange('2026-05-23', '2026-05-22')).toEqual([]);
  });
});

describe('foldByCodeAcrossDays', () => {
  function pair(
    saleDate: string,
    item: PerDaySummaryItemInput
  ): { saleDate: string; item: PerDaySummaryItemInput } {
    return { saleDate, item };
  }

  function mkItem(
    displayCode: string,
    overrides: Partial<PerDaySummaryItemInput> = {}
  ): PerDaySummaryItemInput {
    return {
      displayCode,
      productName: `Product ${displayCode}`,
      stockCode: `STK-${displayCode}`,
      saleCode: displayCode,
      bookings: {
        pendingReview: 0,
        confirmed: 0,
        cancelled: 0,
        expired: 0,
        convertedToOrder: 0,
        total: 0,
      },
      orders: {
        orderCount: 0,
        orderedQuantity: 0,
        grossTotal: '0.00',
      },
      orderIds: new Set<string>(),
      ...overrides,
    };
  }

  it('returns empty when no pairs', () => {
    expect(foldByCodeAcrossDays([])).toEqual([]);
  });

  it('rolls up same code across two days', () => {
    const result = foldByCodeAcrossDays([
      pair(
        '2026-05-22',
        mkItem('CM1', {
          bookings: {
            pendingReview: 0,
            confirmed: 2,
            cancelled: 0,
            expired: 0,
            convertedToOrder: 1,
            total: 3,
          },
          orders: { orderCount: 1, orderedQuantity: 1, grossTotal: '10.00' },
          orderIds: new Set(['ord-A']),
        })
      ),
      pair(
        '2026-05-23',
        mkItem('CM1', {
          bookings: {
            pendingReview: 1,
            confirmed: 0,
            cancelled: 1,
            expired: 0,
            convertedToOrder: 2,
            total: 4,
          },
          orders: { orderCount: 2, orderedQuantity: 2, grossTotal: '20.00' },
          orderIds: new Set(['ord-B', 'ord-C']),
        })
      ),
    ]);
    expect(result).toHaveLength(1);
    const cm1 = result[0];
    expect(cm1.displayCode).toBe('CM1');
    expect(cm1.bookings.confirmed).toBe(2);
    expect(cm1.bookings.convertedToOrder).toBe(3);
    expect(cm1.bookings.total).toBe(7);
    expect(cm1.orders.orderCount).toBe(3); // distinct: ord-A + ord-B + ord-C
    expect(cm1.orders.orderedQuantity).toBe(3);
    expect(cm1.orders.grossTotal).toBe('30.00');
    expect(cm1.appearedOn).toEqual(['2026-05-22', '2026-05-23']);
  });

  it('different codes stay separate', () => {
    const result = foldByCodeAcrossDays([
      pair('2026-05-23', mkItem('CM1')),
      pair('2026-05-23', mkItem('CM2')),
    ]);
    expect(result).toHaveLength(2);
    const codes = result.map((r) => r.displayCode);
    expect(codes).toContain('CM1');
    expect(codes).toContain('CM2');
  });

  it('deduplicates orderIds across days (same order touching same code twice)', () => {
    const result = foldByCodeAcrossDays([
      pair(
        '2026-05-22',
        mkItem('CM1', {
          orders: { orderCount: 1, orderedQuantity: 1, grossTotal: '10.00' },
          orderIds: new Set(['ord-X']),
        })
      ),
      pair(
        '2026-05-23',
        mkItem('CM1', {
          orders: { orderCount: 1, orderedQuantity: 1, grossTotal: '10.00' },
          orderIds: new Set(['ord-X']),
        })
      ),
    ]);
    expect(result[0].orders.orderCount).toBe(1); // distinct: only ord-X
    expect(result[0].orders.orderedQuantity).toBe(2);
    expect(result[0].orders.grossTotal).toBe('20.00');
  });

  it('appearedOn is sorted chronologically', () => {
    const result = foldByCodeAcrossDays([
      pair('2026-05-25', mkItem('CM1')),
      pair('2026-05-23', mkItem('CM1')),
      pair('2026-05-24', mkItem('CM1')),
    ]);
    expect(result[0].appearedOn).toEqual([
      '2026-05-23',
      '2026-05-24',
      '2026-05-25',
    ]);
  });

  it('output sorted by displayCode', () => {
    const result = foldByCodeAcrossDays([
      pair('2026-05-23', mkItem('CM2')),
      pair('2026-05-23', mkItem('CM1')),
      pair('2026-05-23', mkItem('BD3')),
    ]);
    expect(result.map((r) => r.displayCode)).toEqual(['BD3', 'CM1', 'CM2']);
  });
});

describe('aggregateRangeTotals', () => {
  function byCode(displayCode: string, args: {
    orderCount: number;
    orderedQuantity: number;
    grossTotal: string;
    orderIds: Set<string>;
    bookingsTotal?: number;
  }) {
    return Object.freeze({
      displayCode,
      productName: `Product ${displayCode}`,
      stockCode: `STK-${displayCode}`,
      saleCode: displayCode,
      bookings: {
        pendingReview: 0,
        confirmed: 0,
        cancelled: 0,
        expired: 0,
        convertedToOrder: 0,
        total: args.bookingsTotal ?? 0,
      },
      orders: {
        orderCount: args.orderCount,
        orderedQuantity: args.orderedQuantity,
        grossTotal: args.grossTotal,
      },
      orderIds: args.orderIds,
      appearedOn: ['2026-05-23'] as readonly string[],
    });
  }

  it('zero totals for empty byCode', () => {
    const totals = aggregateRangeTotals([], 7);
    expect(totals).toEqual({
      broadcastProductCount: 0,
      totalBookings: 0,
      totalOrders: 0,
      totalOrderTouches: 0,
      totalOrderedQuantity: 0,
      totalGross: '0.00',
      dayCount: 7,
    });
  });

  it('distinct totalOrders across codes (Option A consistent at range level)', () => {
    const items = [
      byCode('CM1', {
        orderCount: 1,
        orderedQuantity: 2,
        grossTotal: '20.00',
        orderIds: new Set(['ord-shared']),
        bookingsTotal: 2,
      }),
      byCode('CM2', {
        orderCount: 1,
        orderedQuantity: 1,
        grossTotal: '10.00',
        orderIds: new Set(['ord-shared']),
        bookingsTotal: 1,
      }),
    ];
    const totals = aggregateRangeTotals(items, 7);
    expect(totals.totalOrders).toBe(1);
    expect(totals.totalOrderTouches).toBe(2);
    expect(totals.totalBookings).toBe(3);
    expect(totals.totalOrderedQuantity).toBe(3);
    expect(totals.totalGross).toBe('30.00');
    expect(totals.dayCount).toBe(7);
  });

  it('dayCount reflects range cap, not item count', () => {
    expect(aggregateRangeTotals([], 31).dayCount).toBe(31);
    expect(aggregateRangeTotals([], 1).dayCount).toBe(1);
  });
});
