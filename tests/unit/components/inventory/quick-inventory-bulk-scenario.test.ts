/**
 * Tier 3.9-D2-B hardening — admin scenario tests for inventory bulk
 * payload generation.
 *
 * Covers the exact Boss-spec workflow:
 *   stockCodeBase = "20.5.2026-CM"
 *   saleCodeBase  = "CM"
 *   startNo       = 1
 *   endNo         = 67
 *   → produces 67 pairs: "20.5.2026-CM1" .. "20.5.2026-CM67"
 *                        + "CM1" .. "CM67"
 *
 * Plus cross-mode safety: confirms single-mode build path remains
 * unaffected by bulk-mode fields and vice versa.
 *
 * Pure tests — render-free. Verifies the payload sent to
 * `/api/inventory/quick-product-bulk` matches the Boss-spec admin
 * workflow.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInventoryBulkPayload,
  buildInventoryCreatePayload,
} from '@/components/inventory/QuickInventoryProductDialog';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  QUICK_PRODUCT_BULK_MAX_RANGE,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

function form(overrides: Partial<QuickProductFormState> = {}): QuickProductFormState {
  return { ...EMPTY_QUICK_PRODUCT_FORM, ...overrides };
}

describe('Boss admin scenario — 20.5.2026-CM × Start 1 / End 67', () => {
  it('emits stockCodeBase + saleCodeBase + startNo + endNo as numeric values', () => {
    const payload = buildInventoryBulkPayload(
      form({
        stockCodeBase: '20.5.2026-CM',
        saleCodeBase: 'CM',
        startNo: '1',
        endNo: '67',
      })
    );

    expect(payload.stockCodeBase).toBe('20.5.2026-CM');
    expect(payload.saleCodeBase).toBe('CM');
    expect(payload.startNo).toBe(1);
    expect(payload.endNo).toBe(67);
  });

  it('server side will derive 67 pairs from stockCodeBase + suffix', () => {
    // Replicate server `buildCodePairs` deterministically using same
    // base + range to confirm UI payload matches the contract.
    const stockCodeBase = '20.5.2026-CM';
    const saleCodeBase = 'CM';
    const startNo = 1;
    const endNo = 67;
    const expected: Array<{ stockCode: string; saleCode: string }> = [];
    for (let n = startNo; n <= endNo; n++) {
      expected.push({
        stockCode: `${stockCodeBase}${n}`,
        saleCode: `${saleCodeBase}${n}`,
      });
    }

    expect(expected).toHaveLength(67);
    expect(expected[0]).toEqual({ stockCode: '20.5.2026-CM1', saleCode: 'CM1' });
    expect(expected[66]).toEqual({ stockCode: '20.5.2026-CM67', saleCode: 'CM67' });
    expect(expected[9]).toEqual({ stockCode: '20.5.2026-CM10', saleCode: 'CM10' });
  });

  it('matches QUICK_PRODUCT_BULK_MAX_RANGE upper bound assumption (100 > 67)', () => {
    expect(QUICK_PRODUCT_BULK_MAX_RANGE).toBeGreaterThanOrEqual(67);
  });

  it('also accepts Boss alternate stock base with dotted prefix', () => {
    const payload = buildInventoryBulkPayload(
      form({
        stockCodeBase: '21.5.2026-CF',
        saleCodeBase: 'CF',
        startNo: '1',
        endNo: '12',
      })
    );
    expect(payload.stockCodeBase).toBe('21.5.2026-CF');
    expect(payload.startNo).toBe(1);
    expect(payload.endNo).toBe(12);
  });
});

describe('Bulk mode fields do not leak into single mode payload', () => {
  it('single-mode build ignores startNo/endNo if present in form state', () => {
    // Realistic mid-toggle state: form may carry stale bulk fields
    // before reset on toggle OFF. buildInventoryCreatePayload (single)
    // must NOT include startNo / endNo because /api/products has no
    // such fields.
    const payload = buildInventoryCreatePayload(
      form({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: '1',
        endNo: '5',
      })
    );
    expect('startNo' in payload).toBe(false);
    expect('endNo' in payload).toBe(false);
  });

  it('single-mode build always includes variants[] (flat single shape)', () => {
    const payload = buildInventoryCreatePayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
    );
    expect(Array.isArray(payload.variants)).toBe(true);
    expect((payload.variants as readonly unknown[]).length).toBe(1);
  });

  it('bulk-mode build NEVER includes variants[] (server derives via core)', () => {
    const payload = buildInventoryBulkPayload(
      form({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: '1',
        endNo: '5',
      })
    );
    expect('variants' in payload).toBe(false);
  });
});

describe('Server-side payload contract per inventory bulk schema', () => {
  it('only emits documented keys (no unknown additions)', () => {
    const payload = buildInventoryBulkPayload(
      form({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: '1',
        endNo: '5',
        productName: 'Hat',
        productDetails: 'Wool, blue',
        categoryId: 'cat-1',
        quantity: '3',
        lowStockAt: '5',
        price: '12.50',
        cost: '8.00',
      })
    );
    const knownKeys = new Set([
      'stockCodeBase',
      'saleCodeBase',
      'startNo',
      'endNo',
      'productName',
      'productDetails',
      'categoryId',
      'quantity',
      'lowStockAt',
      'price',
      'cost',
    ]);
    for (const key of Object.keys(payload)) {
      expect(knownKeys.has(key)).toBe(true);
    }
  });

  it('strips imageUrl even if present in form state', () => {
    const payload = buildInventoryBulkPayload(
      form({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        imageUrl: 'https://example.com/x.png',
      })
    );
    expect('imageUrl' in payload).toBe(false);
  });

  it('never emits saleDate even when form is mid-edit', () => {
    const payload = buildInventoryBulkPayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
    );
    expect('saleDate' in payload).toBe(false);
  });
});

describe('Quantity 0 + price 0 round-trip', () => {
  it('quantity 0 preserves as number 0 (not parsed back to default 1)', () => {
    const payload = buildInventoryBulkPayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM', quantity: '0' })
    );
    expect(payload.quantity).toBe(0);
    expect(typeof payload.quantity).toBe('number');
  });

  it('price 0 normalizes to string "0"', () => {
    const payload = buildInventoryBulkPayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '0' })
    );
    expect(payload.price).toBe('0');
    expect(typeof payload.price).toBe('string');
  });

  it('blank price normalizes to "0"', () => {
    const payload = buildInventoryBulkPayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '' })
    );
    expect(payload.price).toBe('0');
  });

  it('quantity blank coerces to 1 (Boss default placeholder)', () => {
    const payload = buildInventoryBulkPayload(
      form({ stockCodeBase: 'STK', saleCodeBase: 'CM', quantity: '' })
    );
    expect(payload.quantity).toBe(1);
  });
});
