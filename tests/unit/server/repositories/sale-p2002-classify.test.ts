import { describe, it, expect } from 'vitest';
import { Prisma } from '@/generated/prisma';
import { ConflictError } from '@/lib/errors';
import { classifySaleP2002 } from '@/server/repositories/quick-product-codes.repository';

/**
 * Verifies the sale P2002 classifier returns Thai-first admin copy
 * with English suffix per UX audit candidate #4
 * (2026-05-24-inventory-bulk-ux-audit-after-d2.md). Mirrors the
 * inventory-side parity shipped in PR #131 for consistency.
 *
 * Sale flow has TWO MORE rejection paths than inventory because
 * BroadcastProduct adds unique constraints:
 *   - stockCode (shared with inventory)
 *   - sku (shared with inventory)
 *   - liveSessionId + displayCode (sale-only)
 *   - fallback partial index (shopId, saleDate, displayCode)
 *
 * Tests assert: Thai phrase + English phrase + ConflictError shape.
 */
function makeP2002(target: string | string[] | undefined): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed`,
    { code: 'P2002', clientVersion: 'test', meta: target === undefined ? {} : { target } }
  );
}

describe('classifySaleP2002 — Thai-first conflict copy', () => {
  it('returns ConflictError for any input', () => {
    const result = classifySaleP2002(makeP2002('stockCode'));
    expect(result).toBeInstanceOf(ConflictError);
  });

  it('routes stockCode target to Thai stock-code message with English suffix', () => {
    const result = classifySaleP2002(makeP2002('stockCode'));
    expect(result.message).toContain('รหัสสต็อกซ้ำ');
    expect(result.message).toContain('Stock code already exists');
  });

  it('routes sku target to Thai variant SKU message with English suffix', () => {
    const result = classifySaleP2002(makeP2002('sku'));
    expect(result.message).toContain('SKU ของ variant ซ้ำ');
    expect(result.message).toContain('Variant SKU collision');
  });

  it('routes liveSessionId+displayCode target to Thai live-session message with English suffix', () => {
    const result = classifySaleP2002(makeP2002(['liveSessionId', 'displayCode']));
    expect(result.message).toContain('รหัสสินค้านี้มีอยู่แล้วในรอบไลฟ์เดียวกัน');
    expect(result.message).toContain('Product code already exists in the same live session');
  });

  it('routes unknown / fallback target to Thai sale-date message with English suffix (partial unique index)', () => {
    const result = classifySaleP2002(makeP2002(undefined));
    expect(result.message).toContain('รหัสสินค้านี้มีอยู่แล้วสำหรับวันขายที่เลือกในร้านนี้');
    expect(result.message).toContain('Product code already exists for the selected sale date in this shop');
  });

  it('routes unrecognized single-column target to fallback (sale-date) message', () => {
    const result = classifySaleP2002(makeP2002('mystery_column'));
    // Falls through to default partial-index message
    expect(result.message).toContain('รหัสสินค้านี้มีอยู่แล้วสำหรับวันขายที่เลือกในร้านนี้');
  });

  it('handles array target shape (Prisma multi-column unique with stockCode)', () => {
    const result = classifySaleP2002(makeP2002(['shopId', 'stockCode']));
    // Array contains 'stockCode' substring → routes to stockCode message
    expect(result.message).toContain('รหัสสต็อกซ้ำ');
    expect(result.message).toContain('Stock code already exists');
  });

  it('preserves the Thai-first / English-in-parens convention across all 4 paths', () => {
    const cases = [
      { target: 'stockCode' as const, thai: 'รหัสสต็อกซ้ำ', english: 'Stock code already exists' },
      { target: 'sku' as const, thai: 'SKU ของ variant ซ้ำ', english: 'Variant SKU collision' },
      {
        target: ['liveSessionId', 'displayCode'] as const,
        thai: 'รหัสสินค้านี้มีอยู่แล้วในรอบไลฟ์เดียวกัน',
        english: 'Product code already exists in the same live session',
      },
      {
        target: undefined,
        thai: 'รหัสสินค้านี้มีอยู่แล้วสำหรับวันขายที่เลือกในร้านนี้',
        english: 'Product code already exists for the selected sale date in this shop',
      },
    ];
    for (const c of cases) {
      const result = classifySaleP2002(makeP2002(c.target as string | string[] | undefined));
      expect(result.message).toContain(c.thai);
      expect(result.message).toContain(c.english);
    }
  });
});
