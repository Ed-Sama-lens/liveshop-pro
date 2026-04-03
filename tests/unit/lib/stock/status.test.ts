import { describe, it, expect } from 'vitest';
import {
  getStockStatus,
  STOCK_STATUS_COLOR,
  STOCK_STATUS_LABEL,
  type StockStatus,
} from '@/lib/stock/status';

describe('getStockStatus', () => {
  it('returns OUT_OF_STOCK when quantity=0 and reserved=0', () => {
    expect(getStockStatus(0, 0)).toBe('OUT_OF_STOCK');
  });

  it('returns FULL when quantity=10 and reserved=0', () => {
    expect(getStockStatus(10, 0)).toBe('FULL');
  });

  it('returns PARTIAL when quantity=10 and reserved=3', () => {
    expect(getStockStatus(10, 3)).toBe('PARTIAL');
  });

  it('returns OUT_OF_STOCK when quantity=10 and reserved=10 (all reserved)', () => {
    expect(getStockStatus(10, 10)).toBe('OUT_OF_STOCK');
  });

  it('returns OUT_OF_STOCK when over-reserved (quantity=5, reserved=6)', () => {
    expect(getStockStatus(5, 6)).toBe('OUT_OF_STOCK');
  });

  it('returns OUT_OF_STOCK when quantity=1 and reserved=1', () => {
    expect(getStockStatus(1, 1)).toBe('OUT_OF_STOCK');
  });

  it('returns PARTIAL when quantity=1 and reserved=0 is FULL not PARTIAL', () => {
    expect(getStockStatus(1, 0)).toBe('FULL');
  });
});

describe('STOCK_STATUS_COLOR', () => {
  it('has all 3 StockStatus keys', () => {
    const keys = Object.keys(STOCK_STATUS_COLOR) as StockStatus[];
    expect(keys).toContain('OUT_OF_STOCK');
    expect(keys).toContain('PARTIAL');
    expect(keys).toContain('FULL');
    expect(keys).toHaveLength(3);
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(STOCK_STATUS_COLOR)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('STOCK_STATUS_LABEL', () => {
  it('has all 3 StockStatus keys', () => {
    const keys = Object.keys(STOCK_STATUS_LABEL) as StockStatus[];
    expect(keys).toContain('OUT_OF_STOCK');
    expect(keys).toContain('PARTIAL');
    expect(keys).toContain('FULL');
    expect(keys).toHaveLength(3);
  });

  it('OUT_OF_STOCK label is human-readable', () => {
    expect(STOCK_STATUS_LABEL.OUT_OF_STOCK).toBe('Out of Stock');
  });

  it('PARTIAL label is human-readable', () => {
    expect(STOCK_STATUS_LABEL.PARTIAL).toBe('Partially Reserved');
  });

  it('FULL label is human-readable', () => {
    expect(STOCK_STATUS_LABEL.FULL).toBe('In Stock');
  });
});
