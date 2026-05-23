/**
 * Unit tests for inventoryBulkBodySchema (Tier 3.9-D2-A).
 *
 * Mirrors quick-product-codes.schemas test pattern but verifies that
 * saleDate + imageUrl are stripped/rejected from inventory body shape.
 */
import { describe, it, expect } from 'vitest';
import { inventoryBulkBodySchema } from '@/lib/validation/inventory.schemas';

describe('inventoryBulkBodySchema (Tier 3.9-D2-A)', () => {
  describe('required fields', () => {
    it('accepts minimal single-mode body', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK-CM1',
        saleCodeBase: 'CM1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing stockCodeBase', () => {
      const result = inventoryBulkBodySchema.safeParse({
        saleCodeBase: 'CM1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing saleCodeBase', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulk range', () => {
    it('accepts valid bulk range', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 10,
      });
      expect(result.success).toBe(true);
    });

    it('rejects range > 100', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 200,
      });
      expect(result.success).toBe(false);
    });

    it('rejects endNo < startNo', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 10,
        endNo: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects startNo only', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects endNo only', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        endNo: 10,
      });
      expect(result.success).toBe(false);
    });

    it('accepts exact cap (100 items)', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 100,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('price + cost relaxation', () => {
    it('defaults price to "0" when empty string', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        price: '',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.price).toBe('0');
    });

    it('rejects negative price', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        price: '-5',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative cost', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        cost: '-1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sale-only fields stripped (Boss exclusion)', () => {
    it('strips saleDate (unknown key)', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        saleDate: '2026-05-23',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('saleDate' in result.data).toBe(false);
      }
    });

    it('strips imageUrl (unknown key)', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        imageUrl: 'https://example.com/x.png',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('imageUrl' in result.data).toBe(false);
      }
    });
  });

  describe('optional fields', () => {
    it('accepts categoryId', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        categoryId: 'cat-1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts productName + productDetails + quantity + lowStockAt', () => {
      const result = inventoryBulkBodySchema.safeParse({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        productName: 'Hat',
        productDetails: 'Wool, blue',
        quantity: 50,
        lowStockAt: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(50);
        expect(result.data.lowStockAt).toBe(5);
      }
    });
  });
});
