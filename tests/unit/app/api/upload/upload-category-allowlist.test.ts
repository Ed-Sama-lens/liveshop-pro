import { describe, it, expect } from 'vitest';
import {
  UPLOAD_VALID_CATEGORIES,
  assertSafeUploadPath,
  isValidUploadCategory,
  type UploadCategory,
} from '@/lib/upload/path-guard';

/**
 * Pure-function tests for the upload route's category allowlist +
 * defense-in-depth path validator. Pins behavior:
 *   - allowlist contents
 *   - allowlist immutability
 *   - reject path-traversal / control chars / leading slash / etc
 *
 * Tests are pure (no HTTP / no Prisma / no R2) so they run fast and
 * can pin the contract without spinning Next.js.
 */

describe('UPLOAD_VALID_CATEGORIES allowlist', () => {
  it('contains exactly 4 entries (products / slips / branding / general)', () => {
    expect(UPLOAD_VALID_CATEGORIES).toHaveLength(4);
  });

  it('is a frozen tuple — caller cannot mutate', () => {
    expect(Object.isFrozen(UPLOAD_VALID_CATEGORIES)).toBe(true);
  });

  it('exposes UploadCategory string-literal union', () => {
    const allowed: UploadCategory[] = ['products', 'slips', 'branding', 'general'];
    for (const c of allowed) {
      expect(UPLOAD_VALID_CATEGORIES).toContain(c);
    }
  });

  it('does NOT include path-traversal-looking values', () => {
    const dangerous = ['..', '../etc', '/abs', '.', ''];
    for (const d of dangerous) {
      expect(UPLOAD_VALID_CATEGORIES).not.toContain(d);
    }
  });

  it('does NOT include arbitrary admin-controlled values', () => {
    expect(UPLOAD_VALID_CATEGORIES).not.toContain('any');
    expect(UPLOAD_VALID_CATEGORIES).not.toContain('custom');
    expect(UPLOAD_VALID_CATEGORIES).not.toContain('*');
  });
});

describe('isValidUploadCategory — type guard', () => {
  it('returns true for allowed string', () => {
    expect(isValidUploadCategory('products')).toBe(true);
    expect(isValidUploadCategory('slips')).toBe(true);
    expect(isValidUploadCategory('branding')).toBe(true);
    expect(isValidUploadCategory('general')).toBe(true);
  });

  it('returns false for unknown string', () => {
    expect(isValidUploadCategory('PRODUCTS')).toBe(false); // case-sensitive
    expect(isValidUploadCategory('anything')).toBe(false);
    expect(isValidUploadCategory('')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isValidUploadCategory(null)).toBe(false);
    expect(isValidUploadCategory(undefined)).toBe(false);
    expect(isValidUploadCategory(42)).toBe(false);
    expect(isValidUploadCategory({})).toBe(false);
    expect(isValidUploadCategory([])).toBe(false);
  });

  it('returns false for traversal-shaped strings', () => {
    expect(isValidUploadCategory('..')).toBe(false);
    expect(isValidUploadCategory('../etc')).toBe(false);
    expect(isValidUploadCategory('/abs')).toBe(false);
  });
});

describe('assertSafeUploadPath — accept path', () => {
  it('accepts standard shopId/category shape', () => {
    expect(() => assertSafeUploadPath('cuid123/products')).not.toThrow();
  });

  it('accepts deep nested path', () => {
    expect(() => assertSafeUploadPath('shop/slips/folder/sub')).not.toThrow();
  });

  it('accepts path with dashes + underscores + dots', () => {
    expect(() => assertSafeUploadPath('shop-id/folder_name/file.jpg')).not.toThrow();
  });
});

describe('assertSafeUploadPath — rejection paths', () => {
  it('rejects empty path', () => {
    expect(() => assertSafeUploadPath('')).toThrow(/empty/);
  });

  it('rejects leading slash (absolute path)', () => {
    expect(() => assertSafeUploadPath('/abs/path')).toThrow(/must not start with/);
  });

  it('rejects leading whitespace', () => {
    expect(() => assertSafeUploadPath(' shop/cat')).toThrow(/whitespace/);
  });

  it('rejects trailing whitespace', () => {
    expect(() => assertSafeUploadPath('shop/cat ')).toThrow(/whitespace/);
  });

  it('rejects parent-directory segment ..', () => {
    expect(() => assertSafeUploadPath('shop/../etc')).toThrow(/traversal/);
  });

  it('rejects current-directory segment .', () => {
    expect(() => assertSafeUploadPath('shop/./sub')).toThrow(/traversal/);
  });

  it('rejects bare ..', () => {
    expect(() => assertSafeUploadPath('..')).toThrow(/traversal/);
  });

  it('rejects null byte', () => {
    expect(() => assertSafeUploadPath('shop/\x00evil')).toThrow(/control character/);
  });

  it('rejects newline', () => {
    expect(() => assertSafeUploadPath('shop/abc\ninjection')).toThrow(/control character/);
  });

  it('rejects tab', () => {
    expect(() => assertSafeUploadPath('shop/abc\tinjection')).toThrow(/control character/);
  });

  it('rejects DEL (\\x7F)', () => {
    expect(() => assertSafeUploadPath('shop/abc\x7Finjection')).toThrow(/control character/);
  });
});
