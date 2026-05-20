/**
 * Unit tests for product validation schemas (Tier 3.8 relaxation).
 *
 * Verifies Boss's live-selling workflow values now pass:
 *   - quantity 0
 *   - price 0 / 0.00 / '' (empty defaults to '0')
 *   - empty name (defaults to '' for repo to fill placeholder)
 *   - missing category
 *   - missing cost / lowStockAt
 *
 * Also verifies existing non-zero workflow still passes.
 */
import { describe, it, expect } from 'vitest';
import {
  createProductSchema,
  createVariantSchema,
} from '@/lib/validation/product.schemas';

// ─── createVariantSchema ──────────────────────────────────────────────────

describe('createVariantSchema (Tier 3.8 relaxation)', () => {
  function baseVariant() {
    return {
      sku: 'SKU-001',
      attributes: {},
      price: '9.99',
      quantity: 1,
    };
  }

  it('accepts price = "0"', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: '0' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe('0');
  });

  it('accepts price = "0.00"', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: '0.00' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe('0.00');
  });

  it('accepts price empty string (transforms to "0")', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe('0');
  });

  it('accepts price with whitespace', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: '  9.99  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe('9.99');
  });

  it('rejects negative price', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: '-1' });
    expect(r.success).toBe(false);
  });

  it('rejects non-numeric price', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), price: 'abc' });
    expect(r.success).toBe(false);
  });

  it('accepts quantity 0 (Boss bulk-create out-of-stock placeholder)', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), quantity: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), quantity: -1 });
    expect(r.success).toBe(false);
  });

  it('accepts missing costPrice', () => {
    const r = createVariantSchema.safeParse(baseVariant());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costPrice).toBeUndefined();
  });

  it('accepts empty costPrice (normalizes to undefined)', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), costPrice: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costPrice).toBeUndefined();
  });

  it('accepts costPrice = "0"', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), costPrice: '0' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costPrice).toBe('0');
  });

  it('rejects negative costPrice', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), costPrice: '-1' });
    expect(r.success).toBe(false);
  });

  it('accepts missing lowStockAt', () => {
    const r = createVariantSchema.safeParse(baseVariant());
    expect(r.success).toBe(true);
  });

  it('accepts lowStockAt = 0', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), lowStockAt: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects empty SKU', () => {
    const r = createVariantSchema.safeParse({ ...baseVariant(), sku: '' });
    expect(r.success).toBe(false);
  });
});

// ─── createProductSchema ──────────────────────────────────────────────────

describe('createProductSchema (Tier 3.8 relaxation)', () => {
  function baseProduct() {
    return {
      name: 'Test Product',
      stockCode: 'STK-001',
    };
  }

  it('accepts minimal product (stockCode only, name defaults to empty)', () => {
    const r = createProductSchema.safeParse({ stockCode: 'STK-001' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('');
      expect(r.data.variants).toEqual([]);
    }
  });

  it('accepts empty name (Boss live-selling code without name yet)', () => {
    const r = createProductSchema.safeParse({ ...baseProduct(), name: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('');
  });

  it('accepts product with name', () => {
    const r = createProductSchema.safeParse(baseProduct());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Test Product');
  });

  it('rejects missing stockCode', () => {
    const r = createProductSchema.safeParse({ name: 'no stock code' });
    expect(r.success).toBe(false);
  });

  it('rejects empty stockCode', () => {
    const r = createProductSchema.safeParse({ ...baseProduct(), stockCode: '' });
    expect(r.success).toBe(false);
  });

  it('accepts missing categoryId', () => {
    const r = createProductSchema.safeParse(baseProduct());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBeUndefined();
  });

  it('accepts missing description', () => {
    const r = createProductSchema.safeParse(baseProduct());
    expect(r.success).toBe(true);
  });

  it('accepts product with one variant (all defaults)', () => {
    const r = createProductSchema.safeParse({
      ...baseProduct(),
      variants: [
        {
          sku: 'SKU-1',
          attributes: {},
          price: '0',
          quantity: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.variants).toHaveLength(1);
  });

  it("accepts Boss's exact failed input: empty category + quantity 0 + price 0.00", () => {
    const r = createProductSchema.safeParse({
      name: 'Khunpan',
      stockCode: '20.5.2026-CM1',
      saleCode: 'CM1',
      variants: [
        {
          sku: 'SKU-001',
          attributes: {},
          price: '0.00',
          quantity: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts Boss's bulk placeholder input: no name, code only", () => {
    const r = createProductSchema.safeParse({
      name: '',
      stockCode: '20.5.2026-CM1',
      saleCode: 'CM1',
      variants: [
        {
          sku: 'CM1',
          attributes: {},
          price: '',
          quantity: 1,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('');
      expect(r.data.variants[0].price).toBe('0'); // transform applied
    }
  });
});
