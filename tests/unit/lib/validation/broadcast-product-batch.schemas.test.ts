import { describe, it, expect } from 'vitest';
import { createBroadcastProductBatchBodySchema } from '@/lib/validation/broadcast-product.schemas';

describe('createBroadcastProductBatchBodySchema (Tier 3.9-C)', () => {
  it('accepts minimal batch (1 item, no liveSession, no saleDate)', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'CM1' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts batch with saleDate + multiple items', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [
        { variantId: 'v1', displayCode: 'CM1' },
        { variantId: 'v2', displayCode: 'CM2' },
        { variantId: 'v3', displayCode: 'CM3', priceOverride: '99.50' },
      ],
      saleDate: '2026-05-22',
    });
    expect(result.success).toBe(true);
  });

  it('accepts batch with liveSessionId', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'A1' }],
      liveSessionId: 'sess123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      variantId: `v${i}`,
      displayCode: `CODE${i}`,
    }));
    const result = createBroadcastProductBatchBodySchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it('rejects displayCode > 32 chars', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'A'.repeat(33) }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects displayCode with invalid chars', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'CM 1' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects priceOverride with bad format', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'CM1', priceOverride: '1.234' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed saleDate', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ variantId: 'v1', displayCode: 'CM1' }],
      saleDate: '2026/05/22',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing variantId on item', () => {
    const result = createBroadcastProductBatchBodySchema.safeParse({
      items: [{ displayCode: 'CM1' }],
    });
    expect(result.success).toBe(false);
  });
});
