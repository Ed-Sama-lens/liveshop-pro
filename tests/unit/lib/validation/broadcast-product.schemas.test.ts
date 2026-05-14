import { describe, it, expect } from 'vitest';
import {
  createBroadcastProductBodySchema,
  listBroadcastProductsQuerySchema,
} from '@/lib/validation/broadcast-product.schemas';

describe('createBroadcastProductBodySchema', () => {
  it('accepts minimal live-bound body', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
      displayCode: 'A1',
      liveSessionId: 'sess123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal evergreen body (no liveSessionId)', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
      displayCode: 'EVG1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full body with priceOverride + isPinned', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
      displayCode: 'B2',
      liveSessionId: 'sess123',
      priceOverride: '12.50',
      isPinned: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing variantId', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      displayCode: 'A1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing displayCode', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects displayCode > 32 chars', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
      displayCode: 'A'.repeat(33),
    });
    expect(result.success).toBe(false);
  });

  it('rejects displayCode with invalid chars', () => {
    const tests = ['A B', 'A@B', 'รหัส', 'A.B', 'A!1'];
    for (const code of tests) {
      const result = createBroadcastProductBodySchema.safeParse({
        variantId: 'var123',
        displayCode: code,
      });
      expect(result.success).toBe(false);
    }
  });

  it('accepts displayCode with allowed chars [A-Za-z0-9_-]', () => {
    const tests = ['A1', 'B-2', 'C_3', 'abc123', 'ZZ', '0', '99_99-AA'];
    for (const code of tests) {
      const result = createBroadcastProductBodySchema.safeParse({
        variantId: 'var123',
        displayCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects priceOverride with too many decimals', () => {
    const result = createBroadcastProductBodySchema.safeParse({
      variantId: 'var123',
      displayCode: 'A1',
      priceOverride: '12.555',
    });
    expect(result.success).toBe(false);
  });

  it('accepts priceOverride with 0, 1, 2 decimal places', () => {
    for (const price of ['12', '12.5', '12.50', '0', '0.01']) {
      const result = createBroadcastProductBodySchema.safeParse({
        variantId: 'var123',
        displayCode: 'A1',
        priceOverride: price,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects priceOverride with non-numeric chars', () => {
    for (const price of ['abc', '12.5a', '-12', '+12', '$12.50', '12,50']) {
      const result = createBroadcastProductBodySchema.safeParse({
        variantId: 'var123',
        displayCode: 'A1',
        priceOverride: price,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('listBroadcastProductsQuerySchema', () => {
  it('defaults scope to all + limit to 50', () => {
    const result = listBroadcastProductsQuerySchema.parse({});
    expect(result.scope).toBe('all');
    expect(result.limit).toBe(50);
  });

  it('accepts scope=live with liveSessionId', () => {
    const result = listBroadcastProductsQuerySchema.parse({
      scope: 'live',
      liveSessionId: 'sess123',
    });
    expect(result.scope).toBe('live');
    expect(result.liveSessionId).toBe('sess123');
  });

  it('accepts scope=evergreen', () => {
    const result = listBroadcastProductsQuerySchema.parse({ scope: 'evergreen' });
    expect(result.scope).toBe('evergreen');
  });

  it('coerces limit string to int', () => {
    const result = listBroadcastProductsQuerySchema.parse({ limit: '100' });
    expect(result.limit).toBe(100);
  });

  it('rejects limit > 200', () => {
    const result = listBroadcastProductsQuerySchema.safeParse({ limit: 201 });
    expect(result.success).toBe(false);
  });

  it('rejects limit < 1', () => {
    const result = listBroadcastProductsQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid scope', () => {
    const result = listBroadcastProductsQuerySchema.safeParse({ scope: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts optional q search string', () => {
    const result = listBroadcastProductsQuerySchema.parse({ q: 'shirt' });
    expect(result.q).toBe('shirt');
  });

  it('trims whitespace from q', () => {
    const result = listBroadcastProductsQuerySchema.parse({ q: '  shirt  ' });
    expect(result.q).toBe('shirt');
  });

  it('rejects q > 128 chars', () => {
    const result = listBroadcastProductsQuerySchema.safeParse({
      q: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });
});
