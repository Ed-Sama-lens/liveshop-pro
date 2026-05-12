/**
 * Unit tests for pure helpers exported by ManualCreateBookingDialog —
 * Phase 5 stabilization 2026-05-13.
 *
 * Coverage: client-side product-code filter + line-total preview.
 * mapErrorByStatus + idempotency-key generation stay internal to the
 * module (UI behavior, exercised via E2E + manual smoke; matches
 * Confirm/Cancel/CreateOrder convention).
 *
 * No DOM. No fetch. No React.
 */
import { describe, it, expect } from 'vitest';
import type { SaleBroadcastProductRow } from '@/components/sale/SaleProductGridPlaceholder';
import {
  filterProductsByCodePrefix,
  previewManualLineTotal,
  formatCustomerSecondaryLine,
} from '@/components/sale/manual-create.helpers';

function product(
  overrides: Partial<SaleBroadcastProductRow> & {
    broadcastProductId: string;
    displayCode: string;
  }
): SaleBroadcastProductRow {
  return Object.freeze({
    broadcastProductId: overrides.broadcastProductId,
    displayCode: overrides.displayCode,
    displayOrder: overrides.displayOrder ?? 0,
    productId: overrides.productId ?? 'prod-1',
    productName: overrides.productName ?? 'Test Product',
    variantId: overrides.variantId ?? 'var-1',
    variantName: overrides.variantName ?? 'Size: M',
    sku: overrides.sku ?? 'SKU-1',
    unitPrice: overrides.unitPrice ?? '12.50',
    priceOverride: overrides.priceOverride ?? null,
    stockQuantity: overrides.stockQuantity ?? 100,
    reservedQty: overrides.reservedQty ?? 0,
    availableQty: overrides.availableQty ?? 100,
    imageUrl: overrides.imageUrl ?? null,
  });
}

describe('filterProductsByCodePrefix()', () => {
  const products: readonly SaleBroadcastProductRow[] = Object.freeze([
    product({ broadcastProductId: 'b-1', displayCode: 'A001' }),
    product({ broadcastProductId: 'b-2', displayCode: 'A002' }),
    product({ broadcastProductId: 'b-3', displayCode: 'B001' }),
    product({ broadcastProductId: 'b-4', displayCode: 'a010' }),
  ]);

  it('returns all rows (capped at 50) when prefix is empty', () => {
    expect(filterProductsByCodePrefix(products, '')).toHaveLength(4);
  });

  it('returns all rows when prefix is only whitespace', () => {
    expect(filterProductsByCodePrefix(products, '   ')).toHaveLength(4);
  });

  it('filters by case-insensitive prefix', () => {
    const result = filterProductsByCodePrefix(products, 'a0');
    expect(result.map((r) => r.displayCode).sort()).toEqual([
      'A001',
      'A002',
      'a010',
    ]);
  });

  it('treats prefix as startsWith, not contains', () => {
    const result = filterProductsByCodePrefix(products, '001');
    expect(result).toHaveLength(0);
  });

  it('returns empty when nothing matches', () => {
    expect(filterProductsByCodePrefix(products, 'ZZZ')).toHaveLength(0);
  });

  it('caps result at 50 rows even with long matching set', () => {
    const many: SaleBroadcastProductRow[] = Array.from({ length: 75 }).map(
      (_, i) =>
        product({
          broadcastProductId: `b-${i}`,
          displayCode: `X${String(i).padStart(3, '0')}`,
        })
    );
    expect(filterProductsByCodePrefix(many, 'X')).toHaveLength(50);
  });

  it('caps even the no-filter path at 50', () => {
    const many: SaleBroadcastProductRow[] = Array.from({ length: 75 }).map(
      (_, i) =>
        product({
          broadcastProductId: `b-${i}`,
          displayCode: `X${String(i).padStart(3, '0')}`,
        })
    );
    expect(filterProductsByCodePrefix(many, '')).toHaveLength(50);
  });

  it('trims whitespace around the prefix before matching', () => {
    const result = filterProductsByCodePrefix(products, '  A001  ');
    expect(result.map((r) => r.displayCode)).toEqual(['A001']);
  });
});

describe('previewManualLineTotal()', () => {
  it('computes line total for valid unit price * quantity', () => {
    expect(previewManualLineTotal('12.50', 4)).toBe('50.00');
  });

  it('handles integer quantity 1', () => {
    expect(previewManualLineTotal('99.99', 1)).toBe('99.99');
  });

  it('handles quantity 999', () => {
    expect(previewManualLineTotal('1.00', 999)).toBe('999.00');
  });

  it('returns 0.00 when unitPrice is NaN', () => {
    expect(previewManualLineTotal('not-a-number', 5)).toBe('0.00');
  });

  it('returns 0.00 when unitPrice is empty string', () => {
    expect(previewManualLineTotal('', 5)).toBe('0.00');
  });

  it('handles fractional pence rounded to 2 decimals', () => {
    expect(previewManualLineTotal('0.333', 3)).toBe('1.00');
  });

  it('handles zero quantity (defensive)', () => {
    expect(previewManualLineTotal('5.00', 0)).toBe('0.00');
  });
});

describe('formatCustomerSecondaryLine()', () => {
  it('joins phone + email with separator', () => {
    expect(
      formatCustomerSecondaryLine({
        phone: '+60123456789',
        email: 'a@example.com',
      })
    ).toBe('+60123456789 · a@example.com');
  });

  it('returns phone only when email is null', () => {
    expect(
      formatCustomerSecondaryLine({ phone: '+60123456789', email: null })
    ).toBe('+60123456789');
  });

  it('returns email only when phone is null', () => {
    expect(
      formatCustomerSecondaryLine({ phone: null, email: 'a@example.com' })
    ).toBe('a@example.com');
  });

  it('returns em-dash placeholder when both are null', () => {
    expect(formatCustomerSecondaryLine({ phone: null, email: null })).toBe(
      '—'
    );
  });
});
