import { describe, it, expect, vi, beforeAll } from 'vitest';

const VALID_KEY = 'a'.repeat(64);

vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('FACEBOOK_CLIENT_ID', 'id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'secret');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

describe('Token encryption', () => {
  it('encryptToken returns different output on each call (random IV)', async () => {
    const { encryptToken } = await import('@/lib/crypto/token');
    const a = encryptToken('facebook-token');
    const b = encryptToken('facebook-token');
    expect(a).not.toBe(b);
  });

  it('decryptToken(encryptToken(x)) === x', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto/token');
    const plaintext = 'EAAb123456789';
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it('roundtrip preserves unicode content', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto/token');
    const plaintext = 'token-with-special-chars: เทสต์ 测试';
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it('tampered ciphertext throws on decrypt', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto/token');
    const encrypted = encryptToken('secret');
    const parts = encrypted.split(':');
    // Corrupt the auth tag part
    const tampered = `${parts[0]}:${parts[1]}:deadbeefdeadbeefdeadbeefdeadbeef`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('invalid format (not 3 parts) throws descriptive error', async () => {
    const { decryptToken } = await import('@/lib/crypto/token');
    expect(() => decryptToken('not-valid-format')).toThrow('Invalid ciphertext format');
  });

  it('encrypted output has 3 colon-separated parts', async () => {
    const { encryptToken } = await import('@/lib/crypto/token');
    const encrypted = encryptToken('test-token');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
  });

  it('each part of encrypted output is non-empty', async () => {
    const { encryptToken } = await import('@/lib/crypto/token');
    const encrypted = encryptToken('test-token');
    const parts = encrypted.split(':');
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });
});

describe('Token encryption — missing key', () => {
  it('throws descriptive error when TOKEN_ENCRYPTION_KEY not set', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    // Reset module to pick up new env
    vi.resetModules();
    const { encryptToken } = await import('@/lib/crypto/token');
    expect(() => encryptToken('test')).toThrow('TOKEN_ENCRYPTION_KEY environment variable is required');
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    vi.resetModules();
  });

  it('throws descriptive error when TOKEN_ENCRYPTION_KEY is wrong length', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'tooshort');
    vi.resetModules();
    const { encryptToken } = await import('@/lib/crypto/token');
    expect(() => encryptToken('test')).toThrow('64 hex characters');
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    vi.resetModules();
  });
});
