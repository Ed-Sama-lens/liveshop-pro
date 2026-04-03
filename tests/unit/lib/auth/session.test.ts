import { describe, it, expect, vi } from 'vitest';

// Mock next-auth and prisma to prevent side effects from auth module loading
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    loginEvent: { create: vi.fn() },
  },
}));

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

import { hasRole } from '@/lib/auth/session';
import type { SessionUser } from '@/lib/auth/types';

function makeUser(role: SessionUser['role']): SessionUser {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    image: null,
    role,
    shopId: 'shop-1',
  };
}

describe('hasRole()', () => {
  it('returns true when user role is in allowed list', () => {
    expect(hasRole(makeUser('OWNER'), 'OWNER', 'MANAGER')).toBe(true);
  });

  it('returns true for MANAGER in multi-role list', () => {
    expect(hasRole(makeUser('MANAGER'), 'OWNER', 'MANAGER')).toBe(true);
  });

  it('returns false when user role is not in allowed list', () => {
    expect(hasRole(makeUser('WAREHOUSE'), 'OWNER', 'MANAGER')).toBe(false);
  });

  it('returns false when no allowed roles provided', () => {
    expect(hasRole(makeUser('OWNER'))).toBe(false);
  });

  it('returns true for CHAT_SUPPORT in full role list', () => {
    expect(hasRole(makeUser('CHAT_SUPPORT'), 'OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT')).toBe(true);
  });

  it('returns true for WAREHOUSE when WAREHOUSE is in list', () => {
    expect(hasRole(makeUser('WAREHOUSE'), 'WAREHOUSE')).toBe(true);
  });

  it('returns false for OWNER when only MANAGER allowed', () => {
    expect(hasRole(makeUser('OWNER'), 'MANAGER')).toBe(false);
  });
});
