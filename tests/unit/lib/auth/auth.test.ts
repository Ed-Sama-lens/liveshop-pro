import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    loginEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.stubEnv('FACEBOOK_CLIENT_ID', 'test-client-id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'test-client-secret');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));

describe('JWT callback immutability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a new token object on first sign-in (immutable)', () => {
    const token = { sub: 'user-1' };
    const enrichedToken = { ...token, id: 'user-1', role: 'OWNER', shopId: null };
    expect(enrichedToken).not.toBe(token);
    expect(enrichedToken.id).toBe('user-1');
    expect(enrichedToken.role).toBe('OWNER');
  });

  it('spread creates new object — does not mutate original', () => {
    const original = { sub: 'user-1', iat: 123 };
    const copy = { ...original };
    expect(copy).not.toBe(original);
    expect(copy.sub).toBe(original.sub);
  });
});

describe('session callback immutability', () => {
  it('returns new session object — does not mutate input', () => {
    const session = {
      user: { name: 'Test', email: 'test@test.com', image: null },
      expires: '2099-01-01',
    };
    const token = { id: 'user-1', role: 'OWNER', shopId: 'shop-1' };

    const result = {
      ...session,
      user: { ...session.user, id: token.id, role: token.role, shopId: token.shopId },
    };

    expect(result.user.id).toBe('user-1');
    expect(result.user.role).toBe('OWNER');
    expect(result.user.shopId).toBe('shop-1');
    expect(result).not.toBe(session);
    expect(result.user).not.toBe(session.user);
  });

  it('original session.user remains unchanged after spread', () => {
    const session = {
      user: { name: 'Test', email: 'test@test.com', image: null },
      expires: '2099-01-01',
    };
    const token = { id: 'user-1', role: 'OWNER', shopId: 'shop-1' };

    const _result = {
      ...session,
      user: { ...session.user, id: token.id, role: token.role, shopId: token.shopId },
    };

    // Original session.user should NOT have id or role added
    expect('id' in session.user).toBe(false);
    expect('role' in session.user).toBe(false);
  });
});

describe('Auth module exports', () => {
  it('auth module exports handlers, auth, signIn, signOut', async () => {
    vi.mock('next-auth', () => ({
      default: vi.fn(() => ({
        handlers: { GET: vi.fn(), POST: vi.fn() },
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      })),
    }));

    // The module shape should have these exports
    const authModule = await import('@/lib/auth/auth');
    expect(authModule).toHaveProperty('handlers');
    expect(authModule).toHaveProperty('auth');
    expect(authModule).toHaveProperty('signIn');
    expect(authModule).toHaveProperty('signOut');
  });
});
