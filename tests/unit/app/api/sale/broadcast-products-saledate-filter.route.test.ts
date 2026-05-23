/**
 * Track T5 (2026-05-23) — `GET /api/sale/broadcast-products` saleDate
 * filter route tests.
 *
 * Existing `broadcast-products.route.test.ts` covers the
 * live-sessions/[id]/broadcast-products variant (legacy live-bound).
 * Existing `broadcast-products-new-routes.test.ts` covers the
 * top-level routes (RBAC + id validation).
 *
 * This file closes the gap: saleDate filter on the top-level
 * `GET /api/sale/broadcast-products`. The route forwards `saleDate`
 * (string or 'untagged') to `broadcastProductRepository.list`.
 *
 * Coverage:
 *   - saleDate string passes through to repository
 *   - saleDate 'untagged' passes through
 *   - bad saleDate format → 400 (schema-level)
 *   - cross-shop isolation
 *   - shopId always sourced from session
 *   - response echoes the requested saleDate when provided
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

const mockList = vi.fn();
vi.mock('@/server/repositories/broadcast-product.repository', () => ({
  broadcastProductRepository: {
    list: mockList,
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/validation/middleware', async () => {
  const actual = await vi.importActual<typeof import('@/lib/validation/middleware')>(
    '@/lib/validation/middleware'
  );
  return {
    ...actual,
    withRateLimit: async (_req: unknown, handler: () => Promise<unknown>) => handler(),
  };
});

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
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

async function callRoute(query: string) {
  const { GET } = await import('@/app/api/sale/broadcast-products/route');
  const url = `http://localhost:3000/api/sale/broadcast-products${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

describe('GET /api/sale/broadcast-products — saleDate filter (Track T5)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue([]);
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
  });

  describe('saleDate string mode', () => {
    it('forwards saleDate string to repository.list', async () => {
      await callRoute('?saleDate=2026-05-23');
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          saleDate: '2026-05-23',
        })
      );
    });

    it('response echoes the requested saleDate', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      expect(body.data.saleDate).toBe('2026-05-23');
    });

    it('returns 200 + empty products array when repository returns []', async () => {
      const { status, body } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
      expect(Array.isArray(body.data.products)).toBe(true);
      expect(body.data.products).toHaveLength(0);
    });
  });

  describe('saleDate "untagged" sentinel', () => {
    it('forwards untagged sentinel to repository', async () => {
      await callRoute('?saleDate=untagged');
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          saleDate: 'untagged',
        })
      );
    });

    it('response echoes untagged sentinel', async () => {
      const { body } = await callRoute('?saleDate=untagged');
      expect(body.data.saleDate).toBe('untagged');
    });
  });

  describe('validation', () => {
    it('returns 400 on malformed saleDate (not YYYY-MM-DD / not "untagged")', async () => {
      const { status } = await callRoute('?saleDate=23-05-2026');
      expect(status).toBe(400);
      expect(mockList).not.toHaveBeenCalled();
    });

    it('returns 400 on partial date', async () => {
      const { status } = await callRoute('?saleDate=2026-05');
      expect(status).toBe(400);
    });
  });

  describe('no saleDate provided', () => {
    it('does NOT pass saleDate to repository when omitted', async () => {
      await callRoute('');
      const callArg = mockList.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.saleDate).toBeUndefined();
    });

    it('response.saleDate is null when not provided', async () => {
      const { body } = await callRoute('');
      expect(body.data.saleDate).toBeNull();
    });
  });

  describe('cross-shop isolation', () => {
    it('shopId always sourced from session, never from client', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-attacker'));
      await callRoute('?saleDate=2026-05-23&shopId=shop-victim');
      const callArg = mockList.mock.calls[0][0] as { shopId: string };
      expect(callArg.shopId).toBe('shop-attacker');
    });

    it('user with no shopId denied 403 even with valid saleDate', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(403);
      expect(mockList).not.toHaveBeenCalled();
    });
  });

  describe('saleDate + other filters combine', () => {
    it('saleDate + liveSessionId both forwarded', async () => {
      await callRoute('?saleDate=2026-05-23&liveSessionId=live-1');
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          saleDate: '2026-05-23',
          liveSessionId: 'live-1',
        })
      );
    });

    it('saleDate + scope=evergreen both forwarded', async () => {
      await callRoute('?saleDate=2026-05-23&scope=evergreen');
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          saleDate: '2026-05-23',
          scope: 'evergreen',
        })
      );
    });

    it('saleDate + search query both forwarded', async () => {
      await callRoute('?saleDate=2026-05-23&q=cm');
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          saleDate: '2026-05-23',
          q: 'cm',
        })
      );
    });
  });
});
