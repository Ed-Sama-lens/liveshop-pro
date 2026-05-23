import { describe, it, expect } from 'vitest';
import { buildInventoryCreatePayload } from '@/components/inventory/QuickInventoryProductDialog';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

/**
 * Tier 3.9-D unit tests — buildInventoryCreatePayload is the pure
 * transform from QuickInventoryProductDialog form state to the
 * `POST /api/products` body shape. Locking it down here avoids
 * regressing the inventory quick-create contract when the dialog UI
 * later evolves (multi-variant prep, image upload, bulk range, etc.).
 *
 * Schema reference: `src/lib/validation/product.schemas.ts`
 *   - name optional (empty allowed)
 *   - stockCode required
 *   - saleCode optional
 *   - description optional
 *   - categoryId optional
 *   - variants[] each with sku/attributes/price/(costPrice?)/quantity/(lowStockAt?)
 */

function form(overrides: Partial<QuickProductFormState> = {}): QuickProductFormState {
  return { ...EMPTY_QUICK_PRODUCT_FORM, ...overrides };
}

describe('buildInventoryCreatePayload — Tier 3.9-D', () => {
  describe('minimal happy path', () => {
    it('emits stockCode + one default variant when only stock + sale code provided', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', saleCodeBase: 'CF-1' })
      );

      expect(payload).toMatchObject({
        stockCode: 'SK-1',
        saleCode: 'CF-1',
        name: '',
        variants: [
          {
            sku: 'SK-1',
            attributes: {},
            price: '0',
            quantity: 1,
          },
        ],
      });
    });

    it('omits saleCode key when blank (not empty string)', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', saleCodeBase: '' })
      );
      expect(payload.saleCode).toBeUndefined();
    });

    it('omits description when blank', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', productDetails: '' })
      );
      expect(payload.description).toBeUndefined();
    });

    it('omits categoryId when blank or __none__ sentinel', () => {
      const blank = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', categoryId: '' })
      );
      expect(blank.categoryId).toBeUndefined();

      const sentinel = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', categoryId: '__none__' })
      );
      expect(sentinel.categoryId).toBeUndefined();
    });
  });

  describe('price + quantity defaults', () => {
    it('blank price → "0" string', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', price: '' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.price).toBe('0');
    });

    it('whitespace-only price → "0"', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', price: '   ' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.price).toBe('0');
    });

    it('numeric price string passes through trimmed', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', price: '  19.50  ' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.price).toBe('19.50');
    });

    it('blank quantity → 1 (Boss default placeholder)', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', quantity: '' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.quantity).toBe(1);
    });

    it('explicit quantity 0 is preserved (out-of-stock placeholder)', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', quantity: '0' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.quantity).toBe(0);
    });
  });

  describe('optional variant fields', () => {
    it('omits costPrice when blank', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', cost: '' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.costPrice).toBeUndefined();
    });

    it('includes trimmed costPrice when provided', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', cost: '  12.34  ' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.costPrice).toBe('12.34');
    });

    it('omits lowStockAt when blank', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', lowStockAt: '' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.lowStockAt).toBeUndefined();
    });

    it('parses lowStockAt as integer when provided', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', lowStockAt: '5' })
      );
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.lowStockAt).toBe(5);
    });
  });

  describe('name, description, category passthrough', () => {
    it('trims and forwards product name', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', productName: '  ผัดไทย  ' })
      );
      expect(payload.name).toBe('ผัดไทย');
    });

    it('trims and forwards description', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', productDetails: '  hand-made  ' })
      );
      expect(payload.description).toBe('hand-made');
    });

    it('forwards categoryId verbatim when not blank/sentinel', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', categoryId: 'cat-123' })
      );
      expect(payload.categoryId).toBe('cat-123');
    });
  });

  describe('always-one-variant invariant', () => {
    it('payload.variants is always a single-element array', () => {
      const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SK-1' }));
      expect(Array.isArray(payload.variants)).toBe(true);
      expect((payload.variants as readonly unknown[]).length).toBe(1);
    });

    it('default variant sku mirrors stockCode (single-variant dialog convention)', () => {
      const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SKU-42' }));
      const variant = (payload.variants as readonly Record<string, unknown>[])[0];
      expect(variant.sku).toBe('SKU-42');
    });

    it('does NOT carry saleDate (inventory is not date-bound)', () => {
      const payload = buildInventoryCreatePayload(form({ stockCodeBase: 'SK-1' }));
      // saleDate must never leak from inventory into product create body
      expect((payload as Record<string, unknown>).saleDate).toBeUndefined();
    });

    it('does NOT carry startNo / endNo (bulk range deferred to PR 3.9-D2)', () => {
      const payload = buildInventoryCreatePayload(
        form({ stockCodeBase: 'SK-1', startNo: '1', endNo: '10' })
      );
      expect((payload as Record<string, unknown>).startNo).toBeUndefined();
      expect((payload as Record<string, unknown>).endNo).toBeUndefined();
    });
  });
});
