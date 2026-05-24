import { describe, it, expect } from 'vitest';
import {
  evaluateR2Config,
  assertR2Config,
  R2_REQUIRED_VARS,
  type R2EnvSource,
} from '@/lib/upload/r2-config';

/**
 * Pure-fn tests for the R2 config validator. Validator is lazy
 * (called per request, not at startup) so missing R2 env on
 * Vercel preview / dev shells does not crash the entire app.
 *
 * Hard rules pinned:
 *   - never returns the secret access key in any field
 *   - reason string is safe to log (no secrets)
 *   - missing/invalid arrays surface specific problem var names
 */

const VALID: R2EnvSource = {
  R2_ACCOUNT_ID: 'cf-account',
  R2_ACCESS_KEY_ID: 'AKIA-test',
  R2_SECRET_ACCESS_KEY: 'super-secret-not-in-result',
  R2_BUCKET_NAME: 'liveshop-images',
  R2_PUBLIC_URL: 'https://images.example.test',
};

describe('R2_REQUIRED_VARS contract', () => {
  it('contains exactly 5 entries', () => {
    expect(R2_REQUIRED_VARS).toHaveLength(5);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(R2_REQUIRED_VARS)).toBe(true);
  });

  it('lists every R2 var name needed by the storage layer', () => {
    expect(R2_REQUIRED_VARS).toContain('R2_ACCOUNT_ID');
    expect(R2_REQUIRED_VARS).toContain('R2_ACCESS_KEY_ID');
    expect(R2_REQUIRED_VARS).toContain('R2_SECRET_ACCESS_KEY');
    expect(R2_REQUIRED_VARS).toContain('R2_BUCKET_NAME');
    expect(R2_REQUIRED_VARS).toContain('R2_PUBLIC_URL');
  });
});

describe('evaluateR2Config — happy path', () => {
  it('returns ok=true when every var present + valid', () => {
    const r = evaluateR2Config(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accountId).toBe('cf-account');
      expect(r.bucketName).toBe('liveshop-images');
      expect(r.publicUrl).toBe('https://images.example.test');
    }
  });

  it('result freeze: caller cannot mutate', () => {
    const r = evaluateR2Config(VALID);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('OK result does NOT expose the secret access key', () => {
    const r = evaluateR2Config(VALID);
    expect(JSON.stringify(r)).not.toContain('super-secret-not-in-result');
  });

  it('OK result does NOT expose the access key ID', () => {
    const r = evaluateR2Config(VALID);
    expect(JSON.stringify(r)).not.toContain('AKIA-test');
  });
});

describe('evaluateR2Config — missing var', () => {
  it('reports R2_ACCOUNT_ID missing when undefined', () => {
    const r = evaluateR2Config({ ...VALID, R2_ACCOUNT_ID: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain('R2_ACCOUNT_ID');
      expect(r.reason).toContain('R2_ACCOUNT_ID');
    }
  });

  it('reports R2_SECRET_ACCESS_KEY missing when empty string', () => {
    const r = evaluateR2Config({ ...VALID, R2_SECRET_ACCESS_KEY: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain('R2_SECRET_ACCESS_KEY');
    }
  });

  it('reports multiple missing in single result', () => {
    const r = evaluateR2Config({
      ...VALID,
      R2_ACCOUNT_ID: undefined,
      R2_BUCKET_NAME: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain('R2_ACCOUNT_ID');
      expect(r.missing).toContain('R2_BUCKET_NAME');
      expect(r.missing).toHaveLength(2);
    }
  });

  it('missing-var reason does NOT leak partial config values', () => {
    const r = evaluateR2Config({
      ...VALID,
      R2_ACCOUNT_ID: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).not.toContain('super-secret-not-in-result');
      expect(r.reason).not.toContain('AKIA-test');
    }
  });
});

describe('evaluateR2Config — invalid URL', () => {
  it('reports R2_PUBLIC_URL invalid when not parseable', () => {
    const r = evaluateR2Config({ ...VALID, R2_PUBLIC_URL: 'not-a-url' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid).toContain('R2_PUBLIC_URL');
      expect(r.reason).toContain('R2_PUBLIC_URL');
    }
  });

  it('accepts URL with custom subdomain', () => {
    const r = evaluateR2Config({
      ...VALID,
      R2_PUBLIC_URL: 'https://images.custom.test.com/path/sub',
    });
    expect(r.ok).toBe(true);
  });
});

describe('assertR2Config — throwing variant', () => {
  it('returns OK result when valid', () => {
    const r = assertR2Config(VALID);
    expect(r.ok).toBe(true);
    expect(r.accountId).toBe('cf-account');
  });

  it('throws when missing var', () => {
    expect(() => assertR2Config({ ...VALID, R2_ACCOUNT_ID: undefined })).toThrow(
      /R2 config validation failed.*R2_ACCOUNT_ID/
    );
  });

  it('throw message does NOT include secret values', () => {
    try {
      assertR2Config({ ...VALID, R2_ACCOUNT_ID: undefined });
    } catch (err) {
      expect(String(err)).not.toContain('super-secret-not-in-result');
      expect(String(err)).not.toContain('AKIA-test');
    }
  });
});

describe('lazy contract — validator does NOT run at module import', () => {
  it('importing r2-config does not throw even when env empty', () => {
    // If the validator ran at import, this file would have thrown
    // when the test runner imported it (process.env on the test
    // machine likely does not have R2_* set). The fact that we got
    // here = lazy contract holds.
    expect(R2_REQUIRED_VARS.length).toBe(5);
  });
});
