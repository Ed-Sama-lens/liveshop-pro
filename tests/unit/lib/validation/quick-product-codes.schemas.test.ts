/**
 * Unit tests for quickBulkProductCodesBodySchema (Tier 3.8).
 *
 * Validates body shape, range logic, defaults, and field transforms.
 */
import { describe, it, expect } from 'vitest';
import {
  quickBulkProductCodesBodySchema,
  QUICK_BULK_MAX_RANGE,
} from '@/lib/validation/sale.schemas';

describe('quickBulkProductCodesBodySchema (Tier 3.8)', () => {
  function baseSingle() {
    return {
      stockCodeBase: '20.5.2026-CM1',
      saleCodeBase: 'CM1',
    };
  }

  function baseBulk() {
    return {
      stockCodeBase: '20.5.2026-CM',
      saleCodeBase: 'CM',
      startNo: 1,
      endNo: 5,
    };
  }

  describe('single mode (no startNo/endNo)', () => {
    it('accepts minimal body', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.quantity).toBe(1);
        expect(r.data.price).toBe('0');
        expect(r.data.productName).toBe('');
      }
    });

    it("accepts Boss's exact failed input shape", () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        stockCodeBase: '20.5.2026-CM1',
        saleCodeBase: 'CM1',
        productName: 'Khunpan',
        price: '0.00',
        quantity: 0,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.price).toBe('0.00');
        expect(r.data.quantity).toBe(0);
      }
    });

    it('rejects empty stockCodeBase', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), stockCodeBase: '' });
      expect(r.success).toBe(false);
    });

    it('rejects empty saleCodeBase', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), saleCodeBase: '' });
      expect(r.success).toBe(false);
    });

    it('rejects stockCodeBase > 128 chars', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseSingle(),
        stockCodeBase: 'x'.repeat(129),
      });
      expect(r.success).toBe(false);
    });
  });

  describe('bulk mode (startNo + endNo)', () => {
    it('accepts valid range 1..5', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseBulk());
      expect(r.success).toBe(true);
    });

    it('accepts max-size range 1..100', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: 1,
        endNo: QUICK_BULK_MAX_RANGE,
      });
      expect(r.success).toBe(true);
    });

    it('rejects range 1..101 (exceeds max)', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: 1,
        endNo: QUICK_BULK_MAX_RANGE + 1,
      });
      expect(r.success).toBe(false);
    });

    it('rejects endNo < startNo', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: 10,
        endNo: 5,
      });
      expect(r.success).toBe(false);
    });

    it('rejects startNo only (no endNo)', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        stockCodeBase: 'X',
        saleCodeBase: 'X',
        startNo: 1,
      });
      expect(r.success).toBe(false);
    });

    it('rejects endNo only (no startNo)', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        stockCodeBase: 'X',
        saleCodeBase: 'X',
        endNo: 5,
      });
      expect(r.success).toBe(false);
    });

    it('accepts startNo = endNo (degenerate 1-item bulk)', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: 7,
        endNo: 7,
      });
      expect(r.success).toBe(true);
    });

    it('accepts startNo = 0', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: 0,
        endNo: 3,
      });
      expect(r.success).toBe(true);
    });

    it('rejects negative startNo', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseBulk(),
        startNo: -1,
        endNo: 3,
      });
      expect(r.success).toBe(false);
    });
  });

  describe('price + cost transforms', () => {
    it('empty price transforms to "0"', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), price: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.price).toBe('0');
    });

    it('omitted price defaults to "0"', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.price).toBe('0');
    });

    it('accepts price = "9.99"', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), price: '9.99' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.price).toBe('9.99');
    });

    it('rejects negative price', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), price: '-1' });
      expect(r.success).toBe(false);
    });

    it('rejects non-numeric price', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), price: 'abc' });
      expect(r.success).toBe(false);
    });

    it('empty cost transforms to undefined', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), cost: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cost).toBeUndefined();
    });

    it('omitted cost stays undefined', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cost).toBeUndefined();
    });

    it('accepts cost = "5.00"', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), cost: '5.00' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cost).toBe('5.00');
    });

    it('rejects negative cost', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), cost: '-1' });
      expect(r.success).toBe(false);
    });
  });

  describe('quantity', () => {
    it('accepts 0', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), quantity: 0 });
      expect(r.success).toBe(true);
    });

    it('rejects negative', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), quantity: -1 });
      expect(r.success).toBe(false);
    });

    it('rejects > 999999', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({ ...baseSingle(), quantity: 1_000_000 });
      expect(r.success).toBe(false);
    });

    it('defaults to 1 when omitted', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.quantity).toBe(1);
    });
  });

  describe('imageUrl', () => {
    it('accepts valid URL', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseSingle(),
        imageUrl: 'https://example.com/img.png',
      });
      expect(r.success).toBe(true);
    });

    it('rejects malformed URL', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseSingle(),
        imageUrl: 'not-a-url',
      });
      expect(r.success).toBe(false);
    });

    it('accepts omitted URL', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.imageUrl).toBeUndefined();
    });
  });

  describe('productName + productDetails', () => {
    it('defaults productName to empty string', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.productName).toBe('');
    });

    it('defaults productDetails to empty string', () => {
      const r = quickBulkProductCodesBodySchema.safeParse(baseSingle());
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.productDetails).toBe('');
    });

    it('rejects productName > 256 chars', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseSingle(),
        productName: 'x'.repeat(257),
      });
      expect(r.success).toBe(false);
    });

    it('rejects productDetails > 2000 chars', () => {
      const r = quickBulkProductCodesBodySchema.safeParse({
        ...baseSingle(),
        productDetails: 'x'.repeat(2001),
      });
      expect(r.success).toBe(false);
    });
  });
});
