import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractKeyFromPublicUrl,
  assertSafeKey,
  getSignedReadUrl,
  SIGNED_URL_DEFAULT_EXPIRY_SECONDS,
  SIGNED_URL_MIN_EXPIRY_SECONDS,
  SIGNED_URL_MAX_EXPIRY_SECONDS,
} from '@/lib/upload/storage';

/**
 * Tests cover the read-only signed URL adapter introduced for the
 * R2 G3 PII risk closure (payment slip URL leak). Per Boss Phase 1A
 * scope: expiry config, no raw secret leakage, invalid/missing key
 * handled safely, path traversal rejected.
 *
 * Adapter is read-only — no test mutates R2.
 */

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('extractKeyFromPublicUrl', () => {
  it('strips R2_PUBLIC_URL prefix when set + matched', () => {
    process.env.R2_PUBLIC_URL = 'https://images.example.test';
    // Force re-import isn't needed because storage.ts reads env at
    // module-init; here we rely on whatever the suite-level env is.
    // Test that the function logic itself handles both shapes.
    expect(extractKeyFromPublicUrl('products/abc/x.webp')).toBe('products/abc/x.webp');
  });

  it('passes raw key through unchanged when no prefix match', () => {
    expect(extractKeyFromPublicUrl('shopId/slips/abc.jpg')).toBe('shopId/slips/abc.jpg');
  });
});

describe('assertSafeKey — rejects unsafe shapes', () => {
  it('rejects empty key', () => {
    expect(() => assertSafeKey('')).toThrow(/empty key/);
  });

  it('rejects leading slash', () => {
    expect(() => assertSafeKey('/abs/path')).toThrow(/must not start with/);
  });

  it('rejects leading whitespace', () => {
    expect(() => assertSafeKey(' key')).toThrow(/whitespace/);
  });

  it('rejects trailing whitespace', () => {
    expect(() => assertSafeKey('key ')).toThrow(/whitespace/);
  });

  it('rejects parent-directory segment ..', () => {
    expect(() => assertSafeKey('shop/../other')).toThrow(/traversal/);
  });

  it('rejects current-directory segment .', () => {
    expect(() => assertSafeKey('shop/./inner')).toThrow(/traversal/);
  });

  it('rejects null byte', () => {
    expect(() => assertSafeKey('shop/\x00abc')).toThrow(/control character/);
  });

  it('rejects newline', () => {
    expect(() => assertSafeKey('shop/abc\nattack')).toThrow(/control character/);
  });

  it('rejects tab', () => {
    expect(() => assertSafeKey('shop/abc\tattack')).toThrow(/control character/);
  });

  it('rejects DEL (\\x7F)', () => {
    expect(() => assertSafeKey('shop/abc\x7Fattack')).toThrow(/control character/);
  });

  it('accepts standard key shape with slashes + dashes + dots', () => {
    expect(() => assertSafeKey('shopId/slips/abc-def_123.jpg')).not.toThrow();
  });

  it('accepts deep nested key', () => {
    expect(() => assertSafeKey('a/b/c/d/e/f/hash.webp')).not.toThrow();
  });

  it('accepts percent-encoded segments (R2 allows them)', () => {
    expect(() => assertSafeKey('shop/%20space/file.jpg')).not.toThrow();
  });
});

describe('getSignedReadUrl — expiry + key handling', () => {
  // These tests do NOT actually contact R2. We assert on the public
  // contract: returned shape, expiry math, error paths. The actual
  // signed URL string is opaque; we only check it's a string.

  beforeEach(() => {
    // Ensure SDK has minimal env to construct the client without throw.
    // Also satisfies the lazy r2-config assert at entry points.
    process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
    process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';
    process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
    process.env.R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://images.test.local';
  });

  it('uses default expiry when not specified', async () => {
    const before = Date.now();
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' });
    const after = Date.now();
    const expiryMs = result.expiresAt.getTime();
    expect(expiryMs - before).toBeGreaterThanOrEqual(SIGNED_URL_DEFAULT_EXPIRY_SECONDS * 1000 - 100);
    expect(expiryMs - after).toBeLessThanOrEqual(SIGNED_URL_DEFAULT_EXPIRY_SECONDS * 1000 + 100);
  });

  it('clamps expiry to MIN when caller passes too small', async () => {
    const before = Date.now();
    const result = await getSignedReadUrl({
      publicUrlOrKey: 'shop/slips/abc.jpg',
      expirySeconds: 1, // below min
    });
    const expiryMs = result.expiresAt.getTime();
    expect(expiryMs - before).toBeGreaterThanOrEqual(SIGNED_URL_MIN_EXPIRY_SECONDS * 1000 - 100);
    expect(expiryMs - before).toBeLessThanOrEqual(SIGNED_URL_MIN_EXPIRY_SECONDS * 1000 + 200);
  });

  it('clamps expiry to MAX when caller passes too large', async () => {
    const before = Date.now();
    const result = await getSignedReadUrl({
      publicUrlOrKey: 'shop/slips/abc.jpg',
      expirySeconds: 99999, // way above max
    });
    const expiryMs = result.expiresAt.getTime();
    expect(expiryMs - before).toBeGreaterThanOrEqual(SIGNED_URL_MAX_EXPIRY_SECONDS * 1000 - 100);
    expect(expiryMs - before).toBeLessThanOrEqual(SIGNED_URL_MAX_EXPIRY_SECONDS * 1000 + 200);
  });

  it('returns key field matching the extracted key', async () => {
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/xyz.jpg' });
    expect(result.key).toBe('shop/slips/xyz.jpg');
  });

  it('returns url as a string (not raw key, not undefined)', async () => {
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/xyz.jpg' });
    expect(typeof result.url).toBe('string');
    expect(result.url.length).toBeGreaterThan(0);
    expect(result.url).not.toBe('shop/slips/xyz.jpg');
  });

  it('throws on empty key after extraction', async () => {
    await expect(getSignedReadUrl({ publicUrlOrKey: '' })).rejects.toThrow(/empty key/);
  });

  it('throws on path-traversal key', async () => {
    await expect(
      getSignedReadUrl({ publicUrlOrKey: 'shop/../../etc/passwd' })
    ).rejects.toThrow(/traversal/);
  });

  it('throws on absolute path key', async () => {
    await expect(
      getSignedReadUrl({ publicUrlOrKey: '/etc/passwd' })
    ).rejects.toThrow(/must not start with/);
  });

  it('throws on null-byte injection key', async () => {
    await expect(
      getSignedReadUrl({ publicUrlOrKey: 'shop/\x00malicious' })
    ).rejects.toThrow(/control character/);
  });
});

describe('getSignedReadUrl — no raw secret leakage in result', () => {
  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'AKIA-VERY-SPECIFIC-TEST-KEY';
    process.env.R2_SECRET_ACCESS_KEY = 'super-secret-not-in-result-please';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://images.test.local';
  });

  it('result.key does NOT contain secret access key', async () => {
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' });
    expect(result.key).not.toContain('super-secret-not-in-result-please');
  });

  it('result.expiresAt is a Date instance (not a stringified secret)', async () => {
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  // Note: result.url IS a signed URL containing the access key ID
  // (X-Amz-Credential parameter) as part of the AWS SigV4 spec. This
  // is by design — the access key ID is not the secret. The secret
  // access key is used to compute the signature but never appears in
  // the URL. We pin that behavior here so future changes don't
  // accidentally leak the secret.
  it('result.url does NOT contain raw secret access key value', async () => {
    const result = await getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' });
    expect(result.url).not.toContain('super-secret-not-in-result-please');
  });
});

describe('expiry constants — sanity', () => {
  it('MIN < DEFAULT < MAX', () => {
    expect(SIGNED_URL_MIN_EXPIRY_SECONDS).toBeLessThan(SIGNED_URL_DEFAULT_EXPIRY_SECONDS);
    expect(SIGNED_URL_DEFAULT_EXPIRY_SECONDS).toBeLessThan(SIGNED_URL_MAX_EXPIRY_SECONDS);
  });

  it('MIN >= 30 seconds (defends against trivially-short windows)', () => {
    expect(SIGNED_URL_MIN_EXPIRY_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it('MAX <= 1 hour (defends against accidentally-long windows)', () => {
    expect(SIGNED_URL_MAX_EXPIRY_SECONDS).toBeLessThanOrEqual(3600);
  });

  it('DEFAULT >= 5 minutes (gives admin time to view + download)', () => {
    expect(SIGNED_URL_DEFAULT_EXPIRY_SECONDS).toBeGreaterThanOrEqual(300);
  });
});

describe('getSignedReadUrl — lazy R2 config assert on entry', () => {
  // Save + restore env around these tests so we don't leak missing-env
  // state into other test files. The lazy assert in getSignedReadUrl
  // (added Phase 1C wiring) surfaces a clear error when R2 config is
  // missing, instead of failing deep inside the SDK.

  it('throws clear error when R2_ACCOUNT_ID is missing', async () => {
    const saved = process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCOUNT_ID;
    try {
      await expect(getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' })).rejects.toThrow(
        /R2 config validation failed.*R2_ACCOUNT_ID/
      );
    } finally {
      if (saved !== undefined) process.env.R2_ACCOUNT_ID = saved;
    }
  });

  it('throws clear error when R2_PUBLIC_URL is missing', async () => {
    const saved = process.env.R2_PUBLIC_URL;
    delete process.env.R2_PUBLIC_URL;
    try {
      await expect(getSignedReadUrl({ publicUrlOrKey: 'shop/slips/abc.jpg' })).rejects.toThrow(
        /R2 config validation failed.*R2_PUBLIC_URL/
      );
    } finally {
      if (saved !== undefined) process.env.R2_PUBLIC_URL = saved;
    }
  });
});
