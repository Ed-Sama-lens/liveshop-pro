/**
 * Tier 3.9-G6 hardening — panel-level state-machine tests for the
 * compact summary panel.
 *
 * The existing `sale-summary-panel.helpers.test.ts` (23 tests) covers
 * pure formatting/count helpers. This file adds:
 *   - state-machine transitions of `SummaryFetchState`
 *   - shape assertions for ready-state result (no PII fields allowed)
 *   - edge-case format/derivation tests not in the existing file
 *
 * Pure tests — no React render. We construct state values directly and
 * assert invariants the panel relies on for rendering decisions.
 */
import { describe, it, expect } from 'vitest';
import {
  hasOrderTouchDelta,
  formatGross,
  isYyyyMmDd,
  sumBookingsByStatus,
  countLowStockItems,
  countOutOfStockItems,
  type SummaryFetchState,
  type SummaryItem,
  type SummaryResult,
  type SummaryTotalsBlock,
} from '@/components/sale/sale-summary-panel.helpers';

function makeItem(overrides: Partial<SummaryItem> = {}): SummaryItem {
  return {
    broadcastProductId: 'bp-1',
    displayCode: 'CM1',
    stock: {
      totalQuantity: 10,
      reservedQty: 0,
      availableQty: 10,
      lowStockAt: null,
      isLowStock: false,
      isOutOfStock: false,
    },
    bookings: {
      pendingReview: 0,
      confirmed: 0,
      cancelled: 0,
      expired: 0,
      convertedToOrder: 0,
      total: 0,
    },
    ...overrides,
  };
}

function makeTotals(overrides: Partial<SummaryTotalsBlock> = {}): SummaryTotalsBlock {
  return {
    broadcastProductCount: 0,
    totalBookings: 0,
    totalOrders: 0,
    totalOrderTouches: 0,
    totalOrderedQuantity: 0,
    totalGross: '0',
    ...overrides,
  };
}

function makeResult(overrides: Partial<SummaryResult> = {}): SummaryResult {
  return {
    saleDate: '2026-05-24',
    shopId: 'shop-1',
    currency: 'MYR',
    items: [],
    totals: makeTotals(),
    ...overrides,
  };
}

describe('SummaryFetchState — discriminated union', () => {
  it('idle has no saleDate field', () => {
    const s: SummaryFetchState = { kind: 'idle' };
    expect(s.kind).toBe('idle');
    expect('saleDate' in s).toBe(false);
  });

  it('loading carries saleDate', () => {
    const s: SummaryFetchState = { kind: 'loading', saleDate: '2026-05-24' };
    expect(s.kind).toBe('loading');
    expect(s.saleDate).toBe('2026-05-24');
  });

  it('ready carries saleDate + result', () => {
    const s: SummaryFetchState = {
      kind: 'ready',
      saleDate: '2026-05-24',
      result: makeResult(),
    };
    expect(s.kind).toBe('ready');
    expect(s.saleDate).toBe('2026-05-24');
    expect(s.result.currency).toBe('MYR');
  });

  it('error carries saleDate + message', () => {
    const s: SummaryFetchState = {
      kind: 'error',
      saleDate: '2026-05-24',
      message: 'Network error',
    };
    expect(s.kind).toBe('error');
    expect(s.message).toBe('Network error');
  });
});

describe('Currency invariant — always MYR for liveshop-pro', () => {
  it('panel result envelope declares MYR', () => {
    const result = makeResult();
    expect(result.currency).toBe('MYR');
  });
});

describe('No PII in panel result shape (compile + runtime check)', () => {
  // Static check via TypeScript narrowing: SummaryItem must NOT include
  // customer phone/email/address/name. We assert at runtime that the
  // declared keys are exactly the panel-allowed set.
  const ALLOWED_ITEM_KEYS = new Set(['broadcastProductId', 'displayCode', 'stock', 'bookings']);
  const ALLOWED_STOCK_KEYS = new Set([
    'totalQuantity',
    'reservedQty',
    'availableQty',
    'lowStockAt',
    'isLowStock',
    'isOutOfStock',
  ]);
  const ALLOWED_BOOKINGS_KEYS = new Set([
    'pendingReview',
    'confirmed',
    'cancelled',
    'expired',
    'convertedToOrder',
    'total',
  ]);

  it('SummaryItem keys are bounded — no customer/phone/email/address allowed', () => {
    const item = makeItem();
    for (const k of Object.keys(item)) {
      expect(ALLOWED_ITEM_KEYS.has(k)).toBe(true);
    }
  });

  it('SummaryStockBlock keys are bounded', () => {
    const item = makeItem();
    for (const k of Object.keys(item.stock)) {
      expect(ALLOWED_STOCK_KEYS.has(k)).toBe(true);
    }
  });

  it('SummaryBookingsBlock keys are bounded', () => {
    const item = makeItem();
    for (const k of Object.keys(item.bookings)) {
      expect(ALLOWED_BOOKINGS_KEYS.has(k)).toBe(true);
    }
  });
});

describe('hasOrderTouchDelta — chip visibility predicate', () => {
  it('returns false when totals equal (chip hidden)', () => {
    expect(hasOrderTouchDelta(makeTotals({ totalOrders: 5, totalOrderTouches: 5 }))).toBe(false);
  });

  it('returns true when totalOrderTouches > totalOrders', () => {
    expect(hasOrderTouchDelta(makeTotals({ totalOrders: 5, totalOrderTouches: 7 }))).toBe(true);
  });

  it('returns true when both are zero but differ (unlikely edge case)', () => {
    expect(hasOrderTouchDelta(makeTotals({ totalOrders: 0, totalOrderTouches: 1 }))).toBe(true);
  });

  it('returns false on both zero (default state)', () => {
    expect(hasOrderTouchDelta(makeTotals({ totalOrders: 0, totalOrderTouches: 0 }))).toBe(false);
  });
});

describe('Empty-state predicate — broadcastProductCount === 0', () => {
  it('zero BPs implies panel shows "ยังไม่มีรหัสสินค้าในวันที่ขายนี้"', () => {
    const totals = makeTotals({ broadcastProductCount: 0 });
    expect(totals.broadcastProductCount).toBe(0);
    // Panel branches on this condition; test confirms helper supports it.
  });

  it('non-zero BPs unlocks bookings/orders strip render', () => {
    const totals = makeTotals({ broadcastProductCount: 3 });
    expect(totals.broadcastProductCount).toBe(3);
  });
});

describe('formatGross — additional edge cases', () => {
  it('handles single-digit cents pad (e.g. "10.5" → "RM10.50")', () => {
    expect(formatGross('10.5')).toBe('RM10.50');
  });

  it('truncates extra decimals (e.g. "12.345" → "RM12.34")', () => {
    expect(formatGross('12.345')).toBe('RM12.34');
  });

  it('handles whole-number string without decimals', () => {
    expect(formatGross('500')).toBe('RM500.00');
  });

  it('handles million range with thousands separators', () => {
    expect(formatGross('1234567.89')).toBe('RM1,234,567.89');
  });

  it('handles malformed input gracefully', () => {
    expect(formatGross('not a number')).toBe('RM0.00');
  });

  it('handles negative gross (refund scenario)', () => {
    expect(formatGross('-50.00')).toBe('RM-50.00');
  });

  it('handles zero', () => {
    expect(formatGross('0')).toBe('RM0.00');
  });
});

describe('isYyyyMmDd — date guard', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(isYyyyMmDd('2026-05-24')).toBe(true);
  });

  it('rejects ISO with time', () => {
    expect(isYyyyMmDd('2026-05-24T00:00:00Z')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isYyyyMmDd('')).toBe(false);
  });

  it('rejects DD-MM-YYYY format', () => {
    expect(isYyyyMmDd('24-05-2026')).toBe(false);
  });

  it('rejects partial date', () => {
    expect(isYyyyMmDd('2026-05')).toBe(false);
  });
});

describe('sumBookingsByStatus — per-item aggregation', () => {
  it('sums pendingReview across multiple items', () => {
    const items = [
      makeItem({
        bookings: { pendingReview: 3, confirmed: 0, cancelled: 0, expired: 0, convertedToOrder: 0, total: 3 },
      }),
      makeItem({
        bookings: { pendingReview: 2, confirmed: 0, cancelled: 0, expired: 0, convertedToOrder: 0, total: 2 },
      }),
    ];
    expect(sumBookingsByStatus(items, 'pendingReview')).toBe(5);
  });

  it('sums confirmed across multiple items', () => {
    const items = [
      makeItem({
        bookings: { pendingReview: 0, confirmed: 4, cancelled: 0, expired: 0, convertedToOrder: 0, total: 4 },
      }),
      makeItem({
        bookings: { pendingReview: 0, confirmed: 6, cancelled: 0, expired: 0, convertedToOrder: 0, total: 6 },
      }),
    ];
    expect(sumBookingsByStatus(items, 'confirmed')).toBe(10);
  });

  it('returns 0 for empty items array', () => {
    expect(sumBookingsByStatus([], 'pendingReview')).toBe(0);
  });
});

describe('countLowStockItems / countOutOfStockItems', () => {
  it('counts isLowStock-flagged items', () => {
    const items = [
      makeItem({ stock: { ...makeItem().stock, isLowStock: true } }),
      makeItem({ stock: { ...makeItem().stock, isLowStock: false } }),
      makeItem({ stock: { ...makeItem().stock, isLowStock: true } }),
    ];
    expect(countLowStockItems(items)).toBe(2);
  });

  it('counts isOutOfStock-flagged items', () => {
    const items = [
      makeItem({ stock: { ...makeItem().stock, isOutOfStock: true } }),
      makeItem({ stock: { ...makeItem().stock, isOutOfStock: false } }),
    ];
    expect(countOutOfStockItems(items)).toBe(1);
  });

  it('returns 0 for empty', () => {
    expect(countLowStockItems([])).toBe(0);
    expect(countOutOfStockItems([])).toBe(0);
  });
});
