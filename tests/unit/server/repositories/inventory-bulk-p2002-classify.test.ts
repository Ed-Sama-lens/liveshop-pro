import { describe, it, expect } from 'vitest';
import { Prisma } from '@/generated/prisma';
import { ConflictError } from '@/lib/errors';
import { classifyInventoryP2002 } from '@/server/repositories/inventory-bulk.repository';

/**
 * Verifies the inventory P2002 classifier returns Thai-first admin
 * copy with English suffix per UX audit candidate #4
 * (2026-05-24-inventory-bulk-ux-audit-after-d2.md). Sale repository
 * P2002 strings are NOT translated in this PR per Boss Track A scope.
 *
 * The classifier is the ONLY user-facing surface for inventory bulk
 * conflicts. Tests assert:
 *   - Thai phrase present (admin readability)
 *   - English phrase present in parens (log readability + Boss + ChatGPT review)
 *   - Returned instance is ConflictError (HTTP 409 mapping preserved)
 *   - Routes per target field: stockCode / sku / fallback
 */
function makeP2002(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`${Array.isArray(target) ? target.join(',') : target}\`)`,
    { code: 'P2002', clientVersion: 'test', meta: { target } }
  );
}

describe('classifyInventoryP2002 — Thai-first conflict copy', () => {
  it('returns ConflictError for any input', () => {
    const err = makeP2002('stockCode');
    const result = classifyInventoryP2002(err);
    expect(result).toBeInstanceOf(ConflictError);
  });

  it('routes stockCode target to Thai stock-code message with English suffix', () => {
    const err = makeP2002('stockCode');
    const result = classifyInventoryP2002(err);
    expect(result.message).toContain('รหัสสต็อกซ้ำ');
    expect(result.message).toContain('Stock code already exists');
    expect(result.message).toContain('reuse');
  });

  it('routes sku target to Thai variant SKU message with English suffix', () => {
    const err = makeP2002('sku');
    const result = classifyInventoryP2002(err);
    expect(result.message).toContain('SKU ของ variant ซ้ำ');
    expect(result.message).toContain('Variant SKU collision');
  });

  it('routes unknown target to Thai fallback duplicate message with English suffix', () => {
    const err = makeP2002('mystery_column');
    const result = classifyInventoryP2002(err);
    expect(result.message).toContain('รหัสซ้ำ');
    expect(result.message).toContain('Duplicate code');
    expect(result.message).toContain('mystery_column');
  });

  it('handles array target shape (Prisma multi-column unique)', () => {
    const err = makeP2002(['shopId', 'stockCode']);
    const result = classifyInventoryP2002(err);
    // Array contains 'stockCode' substring → routes to stockCode message
    expect(result.message).toContain('รหัสสต็อกซ้ำ');
    expect(result.message).toContain('Stock code already exists');
  });

  it('handles missing target meta (string fallback)', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: {} }
    );
    const result = classifyInventoryP2002(err);
    // No 'stockCode' or 'sku' substring → fallback
    expect(result.message).toContain('รหัสซ้ำ');
    expect(result.message).toContain('Duplicate code');
  });

  it('preserves the Thai-first / English-in-parens convention across all 3 paths', () => {
    const cases = [
      { target: 'stockCode', thai: 'รหัสสต็อกซ้ำ', english: 'Stock code already exists' },
      { target: 'sku', thai: 'SKU ของ variant ซ้ำ', english: 'Variant SKU collision' },
      { target: 'unknown', thai: 'รหัสซ้ำ', english: 'Duplicate code' },
    ] as const;
    for (const c of cases) {
      const result = classifyInventoryP2002(makeP2002(c.target));
      expect(result.message).toContain(c.thai);
      expect(result.message).toContain(c.english);
    }
  });
});
