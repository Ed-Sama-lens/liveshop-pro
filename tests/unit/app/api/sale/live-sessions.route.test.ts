/**
 * Unit tests for GET /api/sale/live-sessions (Commit 2P route, Commit 2T tests).
 *
 * Covers Boss spec auth/RBAC matrix:
 * - unauthenticated → 401
 * - OWNER → 200
 * - MANAGER → 200
 * - CHAT_SUPPORT → 200
 * - WAREHOUSE → 403
 * - authenticated user without shopId → 403
 *
 * Plus query validation:
 * - invalid status enum → 400
 * - limit over max → 400
 *
 * Mocks next-auth + the live repository + prisma so tests run without
 * a database or running server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SessionUser } from '@/lib/auth/types';

vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('FACEBOOK_CLIENT_ID', 'id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'secret');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));

const mockGetSession = vi.fn();
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>(
    '@/lib/auth/session'
  );
  return {
    ...actual,
    getSession: mockGetSession,
    requireAuth: async () => {
      const user = await mockGetSession();
      if (!user) {
        const { AuthError } = await import('@/lib/errors');
        throw new AuthError('You must be signed in to access this resource');
      }
      return user;
    },
  };
});

const mockFindMany = vi.fn();
vi.mock('@/server/repositories/live.repository', () => ({
  liveRepository: {
    findMany: mockFindMany,
  },
}));

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn(() => ({})) }));

function makeUser(role: SessionUser['role'], shopId: string | null = 'shop-1'): SessionUser {
  return Object.freeze({
    id: 'user-1',
    name: 'Test User',
    email: 'admin@example.com',
    image: null,
    role,
    shopId,
  });
}

async function callRoute(query: string = '') {
  const { GET } = await import('@/app/api/sale/live-sessions/route');
  const url = `http://localhost:3000/api/sale/live-sessions${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

describe('GET /api/sale/live-sessions', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue({ items: [], total: 0 });
  });

  describe('auth/RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status, body } = await callRoute();
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status, body } = await callRoute();
      expect(status).toBe(403);
      expect(body.error).toMatch(/shop/i);
    });

    it('returns 200 for OWNER', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockFindMany).toHaveBeenCalledWith(
        'shop-1',
        { status: undefined },
        { page: 1, limit: 20 }
      );
    });

    it('returns 200 for MANAGER', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute();
      expect(status).toBe(200);
    });

    it('returns 200 for CHAT_SUPPORT (read per RBAC §9)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute();
      expect(status).toBe(200);
    });

    it('returns 403 for WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status, body } = await callRoute();
      expect(status).toBe(403);
      expect(body.error).toMatch(/permission/i);
    });

    it('returns 403 for CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute();
      expect(status).toBe(403);
    });
  });

  describe('query validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 on invalid status enum', async () => {
      const { status, body } = await callRoute('?status=INVALID');
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('returns 400 when limit exceeds max', async () => {
      const { status } = await callRoute('?limit=999');
      expect(status).toBe(400);
    });

    it('accepts valid status filter', async () => {
      const { status } = await callRoute('?status=LIVE');
      expect(status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(
        'shop-1',
        { status: 'LIVE' },
        { page: 1, limit: 20 }
      );
    });

    it('respects page + limit', async () => {
      const { status } = await callRoute('?page=2&limit=5');
      expect(status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(
        'shop-1',
        { status: undefined },
        { page: 2, limit: 5 }
      );
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('includes sessions array + paginated meta', async () => {
      mockFindMany.mockResolvedValue({
        items: [{ id: 's1', status: 'LIVE', title: 'Test' }],
        total: 1,
      });
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.data.sessions).toHaveLength(1);
      expect(body.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });
});
