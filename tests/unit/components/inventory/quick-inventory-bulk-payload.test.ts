import { describe, it, expect } from 'vitest';
import { buildInventoryBulkPayload } from '@/components/inventory/QuickInventoryProductDialog';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

/**
 * Tier 3.9-D2-B unit tests — buildInventoryBulkPayload is the pure
 * transform from QuickInventoryProductDialog form state to the
 * `POST /api/inventory/quick-product-bulk` body shape (Tier 3.9-D2-A
 * endpoint).
 *
 * Schema reference: `src/lib/validation/inventory.schemas.ts`
 *   - stockCodeBase + saleCodeBase required
 *   - startNo + endNo optional (single-mode without)
 *   - quantity defaults to 1 (0 also valid)
 *   - price empty → '0'
 *   - cost / lowStockAt / categoryId / productName / productDetails optional
 *   - NO saleDate field (inventory is stock-only)
 *   - NO imageUrl field (Boss Decision 3 exclusion)
 *   - NO variants[] array (variant fields flat at top level)
 */

function form(overrides: Partial<QuickProductFormState> = {}): QuickProductFormState {
  return { ...EMPTY_QUICK_PRODUCT_FORM, ...overrides };
}

describe('buildInventoryBulkPayload — Tier 3.9-D2-B', () => {
  describe('minimal happy path', () => {
    it('emits stockCodeBase + saleCodeBase + flat fields (no variants[])', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );

      expect(payload.stockCodeBase).toBe('STK');
      expect(payload.saleCodeBase).toBe('CM');
      expect(payload.quantity).toBe(1);
      expect(payload.price).toBe('0');
      expect('variants' in payload).toBe(false);
    });

    it('trims stockCodeBase + saleCodeBase', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: '  STK  ', saleCodeBase: '  CM  ' })
      );
      expect(payload.stockCodeBase).toBe('STK');
      expect(payload.saleCodeBase).toBe('CM');
    });
  });

  describe('bulk range', () => {
    it('includes startNo + endNo as numbers when provided', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', startNo: '1', endNo: '10' })
      );
      expect(payload.startNo).toBe(1);
      expect(payload.endNo).toBe(10);
    });

    it('omits startNo + endNo when both blank', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('startNo' in payload).toBe(false);
      expect('endNo' in payload).toBe(false);
    });

    it('omits startNo when only endNo provided (schema validates pairing)', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', endNo: '10' })
      );
      expect('startNo' in payload).toBe(false);
      expect(payload.endNo).toBe(10);
    });
  });

  describe('price + quantity defaults', () => {
    it('blank price → "0"', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '' })
      );
      expect(payload.price).toBe('0');
    });

    it('whitespace-only price → "0"', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '   ' })
      );
      expect(payload.price).toBe('0');
    });

    it('explicit price 0 preserved', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '0' })
      );
      expect(payload.price).toBe('0');
    });

    it('numeric price trimmed', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', price: '  19.50  ' })
      );
      expect(payload.price).toBe('19.50');
    });

    it('blank quantity → 1', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', quantity: '' })
      );
      expect(payload.quantity).toBe(1);
    });

    it('explicit quantity 0 preserved (out-of-stock placeholder)', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', quantity: '0' })
      );
      expect(payload.quantity).toBe(0);
    });
  });

  describe('optional fields', () => {
    it('omits productName when blank', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('productName' in payload).toBe(false);
    });

    it('forwards trimmed productName when provided', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', productName: '  Hat  ' })
      );
      expect(payload.productName).toBe('Hat');
    });

    it('omits productDetails when blank', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('productDetails' in payload).toBe(false);
    });

    it('omits categoryId when blank or __none__ sentinel', () => {
      const blank = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', categoryId: '' })
      );
      expect('categoryId' in blank).toBe(false);

      const sentinel = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', categoryId: '__none__' })
      );
      expect('categoryId' in sentinel).toBe(false);
    });

    it('forwards categoryId verbatim when valid', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', categoryId: 'cat-1' })
      );
      expect(payload.categoryId).toBe('cat-1');
    });

    it('omits cost when blank', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', cost: '' })
      );
      expect('cost' in payload).toBe(false);
    });

    it('includes trimmed cost when provided', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', cost: '  12.34  ' })
      );
      expect(payload.cost).toBe('12.34');
    });

    it('omits lowStockAt when blank', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', lowStockAt: '' })
      );
      expect('lowStockAt' in payload).toBe(false);
    });

    it('parses lowStockAt as integer', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM', lowStockAt: '5' })
      );
      expect(payload.lowStockAt).toBe(5);
    });
  });

  describe('sale-only fields never leak', () => {
    it('does NOT carry saleDate', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('saleDate' in payload).toBe(false);
    });

    it('does NOT carry imageUrl', () => {
      const payload = buildInventoryBulkPayload(
        form({
          stockCodeBase: 'STK',
          saleCodeBase: 'CM',
          imageUrl: 'https://example.com/x.png',
        })
      );
      expect('imageUrl' in payload).toBe(false);
    });

    it('does NOT carry variants[] (flat field shape)', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('variants' in payload).toBe(false);
    });

    it('does NOT carry sku field (inventory bulk derives stockCode+suffix at server)', () => {
      const payload = buildInventoryBulkPayload(
        form({ stockCodeBase: 'STK', saleCodeBase: 'CM' })
      );
      expect('sku' in payload).toBe(false);
    });
  });
});
