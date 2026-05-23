import { describe, it, expect } from 'vitest';
import { buildInventoryCreatePayload } from '@/components/inventory/QuickInventoryProductDialog';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

/**
 * Track T3 (Tier 3.9-D2-prep, 2026-05-23) — extended edge-case tests for
 * `buildInventoryCreatePayload`.
 *
 * Existing `quick-inventory-payload.test.ts` covers happy-path defaults.
 * This file pins additional behaviors Boss should expect after PR #60
 * landed, anticipating the morning UI smoke:
 *   - whitespace-only required fields treated as missing
 *   - extreme/unusual inputs handled gracefully
 *   - invariants between Quick mode and existing /api/products schema
 *   - non-Latin (Thai) characters preserved
 *   - cost/price independence
 *   - lowStockAt parsing
 *   - bulk range (startNo/endNo) ignored in inventory mode (D1 scope)
 */

function form(overrides: Partial<QuickProductFormState> = {}): QuickProductFormState {
  return { ...EMPTY_QUICK_PRODUCT_FORM, ...overrides };
}

function variantOf(payload: Record<string, unknown>): Record<string, unknown> {
  const variants = payload.variants as readonly Record<string, unknown>[];
  return variants[0];
}

describe('buildInventoryCreatePayload — whitespace handling', () => {
  it('whitespace-only stockCode trims to empty string (caller validates required)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: '   ', saleCodeBase: 'CM1' })
    );
    expect(payload.stockCode).toBe('');
  });

  it('whitespace-only saleCode is omitted from payload', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', saleCodeBase: '   ' })
    );
    expect(payload.saleCode).toBeUndefined();
  });

  it('whitespace-only productName trims to empty string (server fills placeholder)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', productName: '   ' })
    );
    expect(payload.name).toBe('');
  });

  it('whitespace-only description is omitted', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', productDetails: '   ' })
    );
    expect(payload.description).toBeUndefined();
  });
});

describe('buildInventoryCreatePayload — Thai input preservation', () => {
  it('preserves Thai product name verbatim (after trim)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', productName: 'น้ำพริกแม่บ้าน' })
    );
    expect(payload.name).toBe('น้ำพริกแม่บ้าน');
  });

  it('preserves Thai description verbatim (after trim)', () => {
    const payload = buildInventoryCreatePayload(
      form({
        stockCodeBase: 'SK-1',
        productDetails: 'รสเข้มข้น เผ็ดน้อย เก็บได้ 6 เดือน',
      })
    );
    expect(payload.description).toBe('รสเข้มข้น เผ็ดน้อย เก็บได้ 6 เดือน');
  });

  it('preserves mixed Thai/English/digit stockCode', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-ผัด-001', saleCodeBase: 'CM1' })
    );
    expect(payload.stockCode).toBe('SK-ผัด-001');
    const variant = variantOf(payload);
    expect(variant.sku).toBe('SK-ผัด-001');
  });
});

describe('buildInventoryCreatePayload — numeric edge cases', () => {
  it('quantity "0" stays 0 (out-of-stock placeholder valid)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', quantity: '0' })
    );
    expect(variantOf(payload).quantity).toBe(0);
  });

  it('quantity "1" stays 1', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', quantity: '1' })
    );
    expect(variantOf(payload).quantity).toBe(1);
  });

  it('quantity with leading zeros parses as integer', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', quantity: '007' })
    );
    expect(variantOf(payload).quantity).toBe(7);
  });

  it('lowStockAt "5" parses as 5', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', lowStockAt: '5' })
    );
    expect(variantOf(payload).lowStockAt).toBe(5);
  });

  it('lowStockAt "0" preserved (means "warn at 0", i.e. always quiet)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', lowStockAt: '0' })
    );
    expect(variantOf(payload).lowStockAt).toBe(0);
  });

  it('price "0.00" passes through after trim', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', price: '0.00' })
    );
    expect(variantOf(payload).price).toBe('0.00');
  });

  it('price "0" passes through', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', price: '0' })
    );
    expect(variantOf(payload).price).toBe('0');
  });

  it('large quantity accepted (no UI-side cap; schema cap on server)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', quantity: '999999' })
    );
    expect(variantOf(payload).quantity).toBe(999999);
  });
});

describe('buildInventoryCreatePayload — cost / price independence', () => {
  it('cost present + price blank → price defaults to "0", cost preserved', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', price: '', cost: '8.50' })
    );
    const variant = variantOf(payload);
    expect(variant.price).toBe('0');
    expect(variant.costPrice).toBe('8.50');
  });

  it('cost blank + price present → cost omitted, price preserved', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', price: '15.00', cost: '' })
    );
    const variant = variantOf(payload);
    expect(variant.price).toBe('15.00');
    expect(variant.costPrice).toBeUndefined();
  });
});

describe('buildInventoryCreatePayload — bulk range exclusion (D1 scope guard)', () => {
  it('startNo populated but ignored (no inventory bulk in D1)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', startNo: '1', endNo: '' })
    );
    expect((payload as Record<string, unknown>).startNo).toBeUndefined();
    expect((payload as Record<string, unknown>).endNo).toBeUndefined();
  });

  it('endNo populated but ignored', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', endNo: '10' })
    );
    expect((payload as Record<string, unknown>).startNo).toBeUndefined();
    expect((payload as Record<string, unknown>).endNo).toBeUndefined();
  });

  it('both startNo + endNo populated but neither propagates (D2 will revisit)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', startNo: '1', endNo: '50' })
    );
    expect((payload as Record<string, unknown>).startNo).toBeUndefined();
    expect((payload as Record<string, unknown>).endNo).toBeUndefined();
  });

  it('imageUrl populated but ignored (inventory uses /api/products/[id]/images post-create)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', imageUrl: 'https://example.com/image.png' })
    );
    expect((payload as Record<string, unknown>).imageUrl).toBeUndefined();
  });
});

describe('buildInventoryCreatePayload — invariants', () => {
  it('always emits exactly 1 variant', () => {
    const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SK-1' }));
    expect(Array.isArray(payload.variants)).toBe(true);
    expect((payload.variants as readonly unknown[]).length).toBe(1);
  });

  it('variant.attributes is always an empty object', () => {
    const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SK-1' }));
    expect(variantOf(payload).attributes).toEqual({});
  });

  it('variant.sku always mirrors stockCode (no separate UI control)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'STOCK-99', saleCodeBase: 'CF-1' })
    );
    expect(variantOf(payload).sku).toBe('STOCK-99');
  });

  it('payload never carries saleDate (inventory not date-bound)', () => {
    const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SK-1' }));
    expect((payload as Record<string, unknown>).saleDate).toBeUndefined();
  });

  it('top-level payload has only known keys (no accidental leak)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'SK-1', saleCodeBase: 'CF-1', productName: 'X' })
    );
    const allowedTopKeys = new Set([
      'name',
      'stockCode',
      'saleCode',
      'description',
      'categoryId',
      'variants',
    ]);
    for (const key of Object.keys(payload)) {
      expect(allowedTopKeys.has(key)).toBe(true);
    }
  });

  it('variant has only known keys (no accidental leak)', () => {
    const payload = buildInventoryCreatePayload(
      form({
        stockCodeBase: 'SK-1',
        quantity: '5',
        price: '10.00',
        cost: '7.00',
        lowStockAt: '2',
      })
    );
    const variant = variantOf(payload);
    const allowedVariantKeys = new Set([
      'sku',
      'attributes',
      'price',
      'quantity',
      'costPrice',
      'lowStockAt',
    ]);
    for (const key of Object.keys(variant)) {
      expect(allowedVariantKeys.has(key)).toBe(true);
    }
  });
});
