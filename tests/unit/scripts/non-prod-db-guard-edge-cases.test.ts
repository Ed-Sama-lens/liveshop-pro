import { describe, it, expect } from 'vitest';
import {
  evaluateNonProdDatabase,
  PROD_HOST_DENY_LIST,
  ALLOWED_LOCAL_HOSTS,
  REQUIRED_DB_NAME,
  PROD_URL_MARKERS,
} from '@/../scripts/lib/non-prod-db-guard';

/**
 * Extended edge-case coverage for the non-prod DB guard. The existing
 * `non-prod-db-guard.test.ts` (29 tests) covers each layer's happy and
 * primary-fail path. This file adds:
 *
 *   - layer-order verification (most-specific failure surfaces first)
 *   - cross-layer interactions (confirm-flag + prod host together)
 *   - Vercel / Railway / Supabase / Neon production-like patterns
 *   - IPv6, port, query-string, credential variations
 *   - log-safety: the GuardOk result MUST NOT expose the password
 *
 * Hard rule: NEVER soften the guard. Tests assert reject paths; if a
 * future change weakens any layer, these tests fail.
 */

const NON_PROD_LOCAL_URL = `postgresql://liveshop:liveshop_dev_2024@localhost:5432/${REQUIRED_DB_NAME}`;

describe('evaluateNonProdDatabase — layer-order priority (most-specific reject wins)', () => {
  it('missing confirm + missing url → confirm error surfaces first (layer 1 cheapest)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: undefined,
      databaseUrl: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('CONFIRM_NON_PROD_DB');
  });

  it('confirm wrong value + prod url → confirm error surfaces first', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'TRUE', // wrong case
      databaseUrl: `postgresql://u:p@junction.proxy.rlwy.net:5432/${REQUIRED_DB_NAME}`,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('CONFIRM_NON_PROD_DB');
  });

  it('confirm OK + missing url → layer 2 surfaces', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('DATABASE_URL');
  });

  it('confirm OK + invalid URL → layer 3 parse error surfaces', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'not-a-url-at-all',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('valid URL');
  });

  it('deny-list takes priority over allowlist (layer 4 before 6)', () => {
    // Hostname matches deny-list AND not in allowlist → layer 4 fires
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@junction.proxy.rlwy.net:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('production');
      expect(r.reason).not.toContain('allowlist');
    }
  });

  it('marker check fires even when host is localhost (layer 5 catches injected prod path)', () => {
    // Sneaky URL: localhost host but path includes prod marker
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/liveshop_pro?app=nazhahatyai',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('nazhahatyai');
  });
});

describe('evaluateNonProdDatabase — production-platform host patterns', () => {
  const PROD_LIKE_HOSTS = [
    'junction.proxy.rlwy.net',
    'liveshop.up.rlwy.net',
    'sub.junction.proxy.rlwy.net',
    'something.rlwy.net',
  ] as const;

  for (const host of PROD_LIKE_HOSTS) {
    it(`rejects Railway-shaped host: ${host}`, () => {
      const r = evaluateNonProdDatabase({
        confirmNonProdDb: 'true',
        databaseUrl: `postgresql://u:p@${host}:5432/liveshop_pro`,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('production');
    });
  }

  it('rejects URL where prod marker appears in user field', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://nazhahatyai_admin:p@localhost:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('nazhahatyai');
  });

  it('rejects URL where prod marker appears in DB name', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/nazhahatyai_backup',
    });
    expect(r.ok).toBe(false);
    // Layer 5 fires first (URL marker), even before layer 7 (DB name).
    if (!r.ok) expect(r.reason).toContain('nazhahatyai');
  });
});

describe('evaluateNonProdDatabase — host allowlist edge cases', () => {
  it('rejects 0.0.0.0 (not in allowlist)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@0.0.0.0:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('allowlist');
  });

  it('rejects bracketed IPv6 localhost (not exact-match in allowlist)', () => {
    // URL parser strips brackets; resulting hostname '::1' is not 'localhost' / '127.0.0.1'
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@[::1]:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('allowlist');
  });

  it('rejects subdomain.localhost (not exact-match)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@db.localhost:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('allowlist');
  });

  it('rejects localhost.evil.com (substring abuse)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost.evil.com:5432/liveshop_pro',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('allowlist');
  });

  it('accepts 127.0.0.1 explicitly', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@127.0.0.1:5432/liveshop_pro',
    });
    expect(r.ok).toBe(true);
  });
});

describe('evaluateNonProdDatabase — DB name edge cases', () => {
  it('rejects empty DB name (missing path)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('database name');
  });

  it('rejects similar-but-not-equal DB name (liveshop_pro_v2)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/liveshop_pro_v2',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('database name');
  });

  it('rejects case-mismatched DB name (LIVESHOP_PRO)', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/LIVESHOP_PRO',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('database name');
  });
});

describe('evaluateNonProdDatabase — port + query-string + scheme tolerance', () => {
  it('accepts non-default port', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:6543/liveshop_pro',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sanitizedHost).toContain('6543');
  });

  it('accepts URL with sslmode query string', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/liveshop_pro?sslmode=disable',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts URL with multiple query params', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/liveshop_pro?sslmode=require&connect_timeout=10',
    });
    expect(r.ok).toBe(true);
  });

  it('falls back to port 5432 in sanitizedHost when port omitted', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost/liveshop_pro',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sanitizedHost).toBe('localhost:5432');
  });
});

describe('evaluateNonProdDatabase — log-safety (sanitizedHost must NOT expose password)', () => {
  it('sanitizedHost contains ONLY hostname:port, never the password', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://liveshop:super_secret_pw_123@localhost:5432/liveshop_pro',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sanitizedHost).not.toContain('super_secret_pw_123');
      expect(r.sanitizedHost).not.toContain(':p');
      expect(r.sanitizedHost).toBe('localhost:5432');
    }
  });

  it('sanitizedHost contains ONLY hostname:port, never the username', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://very_specific_username@localhost:5432/liveshop_pro',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sanitizedHost).not.toContain('very_specific_username');
    }
  });

  it('sanitizedHost contains ONLY hostname:port, never the query string', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://u:p@localhost:5432/liveshop_pro?application_name=secret-app',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sanitizedHost).not.toContain('secret-app');
      expect(r.sanitizedHost).not.toContain('application_name');
    }
  });

  it('GuardOk.url field DOES echo full URL (caller responsibility to redact for logs)', () => {
    // Note: the guard exposes the full URL on `r.url` deliberately so
    // verifier code can pass it to Prisma. Callers MUST NOT log r.url
    // raw; they should log r.sanitizedHost. This test pins that the
    // contract has not silently changed — if r.url ever sanitizes itself,
    // verifier scripts would break.
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: 'postgresql://liveshop:full_pw@localhost:5432/liveshop_pro',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain('full_pw'); // raw URL preserved
      expect(r.sanitizedHost).not.toContain('full_pw'); // sanitized field clean
    }
  });
});

describe('evaluateNonProdDatabase — constant immutability + sanity', () => {
  it('PROD_HOST_DENY_LIST contains rlwy.net entries (Railway primary host)', () => {
    expect(PROD_HOST_DENY_LIST.some((h) => h.includes('rlwy.net'))).toBe(true);
  });

  it('PROD_URL_MARKERS contains nazhahatyai (production domain)', () => {
    expect(PROD_URL_MARKERS.some((m) => m === 'nazhahatyai')).toBe(true);
  });

  it('every marker is non-empty', () => {
    for (const m of PROD_URL_MARKERS) {
      expect(m.length).toBeGreaterThan(0);
    }
  });

  it('ALLOWED_LOCAL_HOSTS does not allow IPv6 forms (only localhost / 127.0.0.1)', () => {
    expect(ALLOWED_LOCAL_HOSTS).not.toContain('::1');
    expect(ALLOWED_LOCAL_HOSTS).not.toContain('[::1]');
  });

  it('REQUIRED_DB_NAME does not contain any deny-listed host substring', () => {
    for (const denied of PROD_HOST_DENY_LIST) {
      expect(REQUIRED_DB_NAME.includes(denied)).toBe(false);
    }
  });

  it('baseline happy path still accepts canonical local URL', () => {
    const r = evaluateNonProdDatabase({
      confirmNonProdDb: 'true',
      databaseUrl: NON_PROD_LOCAL_URL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sanitizedHost).toBe('localhost:5432');
      expect(r.url).toBe(NON_PROD_LOCAL_URL);
    }
  });
});
