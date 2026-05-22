/**
 * Tier 3.9-F (2026-05-23) — route tests for
 * `POST /api/sale/broadcast-products/batch` (Tier 3.9-C, shipped in PR #53).
 *
 * Coverage:
 *   - 401 when unauthenticated
 *   - 403 when no shopId
 *   - 403 when CHAT_SUPPORT (read-only) / WAREHOUSE / CUSTOMER
 *   - OWNER + MANAGER reach body validation
 *   - 400 on invalid body (empty items)
 *   - saleDate propagated to repository when provided
 *   - shopId always sourced from session (cross-shop isolation)
 *
 * Mirrors mocking strategy of `broadcast-products-new-routes.test.ts`.
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

const mockCreateMany = vi.fn();
vi.mock('@/server/repositories/broadcast-product.repository', () => ({
  broadcastProductRepository: {
    createMany: mockCreateMany,
  },
}));

vi.mock('@/server/services/activity.service', () => ({
  logActivity: vi.fn(() => Promise.resolve()),
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

async function callRoute(body: unknown) {
  const { POST } = await import('@/app/api/sale/broadcast-products/batch/route');
  const url = 'http://localhost:3000/api/sale/broadcast-products/batch';
  const req = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const data = await res.json();
  return { status: res.status, body: data };
}

const VALID_BATCH_BODY = {
  items: [
    {
      variantId: 'var-1',
      displayCode: 'CM1',
    },
  ],
};

describe('POST /api/sale/broadcast-products/batch — Tier 3.9-F', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateMany.mockReset();
    mockCreateMany.mockResolvedValue([
      {
        broadcastProductId: 'bp-1',
        shopId: 'shop-1',
        liveSessionId: null,
        displayCode: 'CM1',
        displayOrder: 1,
        isPinned: false,
        productId: 'prod-1',
        productName: 'Test',
        variantId: 'var-1',
        sku: 'SKU-1',
        attributes: {},
        priceOverride: null,
        variantPrice: '10.00',
        stockQuantity: 10,
        reservedQty: 0,
        availableQty: 10,
        imageUrl: null,
        saleDate: '2026-05-23',
      },
    ]);
  });

  describe('auth / RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(403);
    });

    it('denies CHAT_SUPPORT (read-only role)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(403);
    });

    it('denies WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(403);
    });

    it('denies CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(403);
    });

    it('OWNER reaches repo (creates batch)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(201);
      expect(mockCreateMany).toHaveBeenCalled();
    });

    it('MANAGER reaches repo (creates batch)', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute(VALID_BATCH_BODY);
      expect(status).toBe(201);
      expect(mockCreateMany).toHaveBeenCalled();
    });
  });

  describe('body validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 when items is empty', async () => {
      const { status } = await callRoute({ items: [] });
      expect(status).toBe(400);
      expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it('returns 400 when items is missing', async () => {
      const { status } = await callRoute({});
      expect(status).toBe(400);
    });

    it('returns 400 when displayCode is missing on an item', async () => {
      const { status } = await callRoute({
        items: [{ variantId: 'var-1' }],
      });
      expect(status).toBe(400);
    });

    it('returns 400 when variantId is missing on an item', async () => {
      const { status } = await callRoute({
        items: [{ displayCode: 'CM1' }],
      });
      expect(status).toBe(400);
    });
  });

  describe('saleDate propagation (PR #51 + #53 invariant)', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('forwards saleDate to broadcastProductRepository.createMany when provided', async () => {
      await callRoute({ ...VALID_BATCH_BODY, saleDate: '2026-05-23' });
      expect(mockCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          saleDate: '2026-05-23',
        })
      );
    });

    it('does NOT forward saleDate when omitted (repository defaults to today)', async () => {
      await callRoute(VALID_BATCH_BODY);
      const callArg = mockCreateMany.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.saleDate).toBeUndefined();
    });

    it('forwards liveSessionId only when provided', async () => {
      await callRoute({ ...VALID_BATCH_BODY, liveSessionId: 'live-1' });
      expect(mockCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          liveSessionId: 'live-1',
        })
      );
    });

    it('omits liveSessionId from repo input when not in body', async () => {
      await callRoute(VALID_BATCH_BODY);
      const callArg = mockCreateMany.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.liveSessionId).toBeUndefined();
    });
  });

  describe('cross-shop isolation', () => {
    it('uses shopId from session, never from client', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-attacker'));
      await callRoute({
        ...VALID_BATCH_BODY,
        // attempt to spoof shopId — must be ignored
        shopId: 'shop-victim',
      } as unknown);
      const callArg = mockCreateMany.mock.calls[0][0] as { shopId: string };
      expect(callArg.shopId).toBe('shop-attacker');
    });
  });
});
