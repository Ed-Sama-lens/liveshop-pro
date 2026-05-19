/**
 * Unit tests for the production-safety guard used by local verifier
 * scripts. Targets the pure `evaluateNonProdDatabase` function so the
 * 6-layer policy is testable without launching a subprocess.
 *
 * Every test asserts:
 *   - explicit reject reason text
 *   - never a false-positive accept on any production-shaped URL
 *
 * This file should be the FIRST thing reviewed in any PR that
 * loosens the guard. If a check goes missing here, the tests below
 * must catch it.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateNonProdDatabase,
  PROD_HOST_DENY_LIST,
  ALLOWED_LOCAL_HOSTS,
  REQUIRED_DB_NAME,
} from '../../../scripts/lib/non-prod-db-guard';

const VALID_LOCAL_URL = `postgresql://liveshop:pw@localhost:5432/${REQUIRED_DB_NAME}`;

describe('evaluateNonProdDatabase — layer 1 acknowledgment', () => {
  it('rejects when CONFIRM_NON_PROD_DB is undefined', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('CONFIRM_NON_PROD_DB');
  });

  it('rejects when CONFIRM_NON_PROD_DB is empty string', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: '',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects when CONFIRM_NON_PROD_DB is "false"', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: 'false',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects when CONFIRM_NON_PROD_DB is "1" (must be literal "true")', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: '1',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects when CONFIRM_NON_PROD_DB is "TRUE" (case-sensitive)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: 'TRUE',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — layer 2 DATABASE_URL present', () => {
  it('rejects when DATABASE_URL is undefined', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: undefined,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('DATABASE_URL');
  });

  it('rejects when DATABASE_URL is empty string', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: '',
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — layer 3 URL parse', () => {
  it('rejects when DATABASE_URL is not a valid URL', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: 'not-a-url',
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not a valid URL');
  });
});

describe('evaluateNonProdDatabase — layer 4 host deny-list', () => {
  it.each(PROD_HOST_DENY_LIST)('rejects production host %s', (host) => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@${host}:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(host);
  });

  it('rejects partial-match production host (substring)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@some.junction.proxy.rlwy.net:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects sub.rlwy.net (matches rlwy.net substring)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@sub.rlwy.net:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — layer 5 URL markers', () => {
  it('rejects URL containing nazhahatyai anywhere', () => {
    const r = evaluateNonProdDatabase({
      // even via a hostname that passes host deny-list, the URL marker triggers reject
      databaseUrl: `postgresql://nazhahatyai_user:p@localhost:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('nazhahatyai');
  });

  it('rejects URL with nazhahatyai in pathname', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@localhost:5432/nazhahatyai_prod`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — layer 6 host allowlist', () => {
  it.each(ALLOWED_LOCAL_HOSTS)('accepts local host %s with valid DB name', (host) => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@${host}:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects non-local hostname (192.168.x.x)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@192.168.1.5:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects non-local hostname (db.example.com)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@db.example.com:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects hostname 0.0.0.0 (not in explicit allowlist)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@0.0.0.0:5432/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — layer 7 DB name', () => {
  it('rejects wrong DB name (production-shaped suffix)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: 'postgresql://u:p@localhost:5432/postgres',
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(REQUIRED_DB_NAME);
  });

  it('rejects DB name with extra suffix', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@localhost:5432/${REQUIRED_DB_NAME}_prod`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects empty DB name (trailing /)', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: 'postgresql://u:p@localhost:5432/',
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateNonProdDatabase — accept path', () => {
  it('accepts the canonical local URL', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: VALID_LOCAL_URL,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe(VALID_LOCAL_URL);
      expect(r.sanitizedHost).toBe('localhost:5432');
    }
  });

  it('accepts 127.0.0.1 with explicit port', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@127.0.0.1:6543/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sanitizedHost).toBe('127.0.0.1:6543');
  });

  it('reports default port 5432 in sanitizedHost when not in URL', () => {
    const r = evaluateNonProdDatabase({
      databaseUrl: `postgresql://u:p@localhost/${REQUIRED_DB_NAME}`,
      confirmNonProdDb: 'true',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sanitizedHost).toBe('localhost:5432');
  });
});

describe('evaluateNonProdDatabase — invariants', () => {
  it('ALLOWED_LOCAL_HOSTS does NOT contain any production marker', () => {
    for (const h of ALLOWED_LOCAL_HOSTS) {
      for (const denied of PROD_HOST_DENY_LIST) {
        expect(h.includes(denied)).toBe(false);
      }
    }
  });

  it('REQUIRED_DB_NAME does NOT contain production marker', () => {
    expect(REQUIRED_DB_NAME.includes('nazhahatyai')).toBe(false);
  });

  it('all PROD_HOST_DENY_LIST entries are non-empty', () => {
    for (const h of PROD_HOST_DENY_LIST) {
      expect(h.length).toBeGreaterThan(0);
    }
  });

  it('all ALLOWED_LOCAL_HOSTS entries are exact local addresses', () => {
    const allowed = new Set<string>(['localhost', '127.0.0.1']);
    for (const h of ALLOWED_LOCAL_HOSTS) {
      expect(allowed.has(h)).toBe(true);
    }
  });
});
