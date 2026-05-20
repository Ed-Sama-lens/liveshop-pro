/**
 * Unit tests for POST /api/sale/quick-product-codes (Tier 3.8).
 *
 * Focus: route-layer auth + RBAC + Zod validation gates. Repository
 * mocked. End-to-end transactional behavior covered by Docker
 * verifier scripts/verify-sale-quick-bulk-product-codes.ts.
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

vi.mock('@/lib/validation/middleware', async () => {
  const actual = await vi.importActual<typeof import('@/lib/validation/middleware')>(
    '@/lib/validation/middleware'
  );
  return {
    ...actual,
    withRateLimit: async (
      _req: unknown,
      handler: () => Promise<Response>
    ): Promise<Response> => handler(),
  };
});

const mockCreateBulk = vi.fn();
vi.mock('@/server/repositories/quick-product-codes.repository', () => ({
  quickProductCodesRepository: {
    createBulk: mockCreateBulk,
  },
}));

vi.mock('@/server/services/activity.service', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

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
  const { POST } = await import('@/app/api/sale/quick-product-codes/route');
  const url = 'http://localhost:3000/api/sale/quick-product-codes';
  const req = new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('POST /api/sale/quick-product-codes (Tier 3.8)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateBulk.mockReset();
  });

  describe('auth / RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callRoute({});
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute({});
      expect(status).toBe(403);
    });

    it('denies CHAT_SUPPORT (read-only role)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status, body } = await callRoute({});
      expect(status).toBe(403);
      expect(body.error).toBe('Insufficient permissions');
    });

    it('denies WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute({});
      expect(status).toBe(403);
    });

    it('allows OWNER (proceeds to body validation)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callRoute({});
      // Empty body → Zod fails → 400
      expect(status).toBe(400);
    });

    it('allows MANAGER (proceeds to body validation)', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute({});
      expect(status).toBe(400);
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('rejects missing stockCodeBase', async () => {
      const { status, body } = await callRoute({ saleCodeBase: 'CM' });
      expect(status).toBe(400);
      expect(body.error).toBe('Validation failed');
    });

    it('rejects missing saleCodeBase', async () => {
      const { status } = await callRoute({ stockCodeBase: 'STK' });
      expect(status).toBe(400);
    });

    it('rejects bulk range exceeding 100', async () => {
      const { status } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 200,
      });
      expect(status).toBe(400);
    });

    it('rejects endNo < startNo', async () => {
      const { status } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 10,
        endNo: 1,
      });
      expect(status).toBe(400);
    });
  });

  describe('happy path (mocked repo)', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 201 + result on single create', async () => {
      mockCreateBulk.mockResolvedValue({
        createdCount: 1,
        items: [
          {
            productId: 'p1',
            variantId: 'v1',
            broadcastProductId: 'bp1',
            stockCode: 'STK-CM1',
            saleCode: 'CM1',
            displayCode: 'CM1',
          },
        ],
      });

      const { status, body } = await callRoute({
        stockCodeBase: 'STK-CM1',
        saleCodeBase: 'CM1',
      });

      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.createdCount).toBe(1);
      expect(body.data.items[0].broadcastProductId).toBe('bp1');
      expect(mockCreateBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          stockCodeBase: 'STK-CM1',
          saleCodeBase: 'CM1',
        })
      );
    });

    it('returns 201 + result on bulk create', async () => {
      mockCreateBulk.mockResolvedValue({
        createdCount: 5,
        items: Array.from({ length: 5 }, (_, i) => ({
          productId: `p${i + 1}`,
          variantId: `v${i + 1}`,
          broadcastProductId: `bp${i + 1}`,
          stockCode: `STK-CM${i + 1}`,
          saleCode: `CM${i + 1}`,
          displayCode: `CM${i + 1}`,
        })),
      });

      const { status, body } = await callRoute({
        stockCodeBase: 'STK-CM',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 5,
      });

      expect(status).toBe(201);
      expect(body.data.createdCount).toBe(5);
      expect(body.data.items).toHaveLength(5);
    });

    it('forwards optional fields to repo', async () => {
      mockCreateBulk.mockResolvedValue({
        createdCount: 1,
        items: [
          {
            productId: 'p1',
            variantId: 'v1',
            broadcastProductId: 'bp1',
            stockCode: 'STK',
            saleCode: 'CM',
            displayCode: 'CM',
          },
        ],
      });

      await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        categoryId: 'cat-1',
        productName: 'Test',
        productDetails: 'Detail',
        imageUrl: 'https://example.com/img.png',
        quantity: 0,
        price: '9.99',
        cost: '5.00',
        lowStockAt: 2,
      });

      expect(mockCreateBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'cat-1',
          productName: 'Test',
          imageUrl: 'https://example.com/img.png',
          quantity: 0,
          price: '9.99',
          cost: '5.00',
          lowStockAt: 2,
        })
      );
    });
  });

  describe('repo error propagation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 409 on ConflictError from repo', async () => {
      const { ConflictError } = await import('@/lib/errors');
      mockCreateBulk.mockRejectedValue(new ConflictError('Duplicate code: stockCode'));

      const { status, body } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
      });

      expect(status).toBe(409);
      expect(body.error).toContain('Duplicate');
    });

    it('returns 400 on ValidationError from repo (bad displayCode shape)', async () => {
      const { ValidationError } = await import('@/lib/errors');
      mockCreateBulk.mockRejectedValue(
        new ValidationError('displayCode must contain only A-Z, a-z, 0-9, _, -')
      );

      const { status, body } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM!@#',
      });

      // Schema-level validation should pass (no character restriction
      // at schema layer), repo guard fires next → 400.
      expect(status).toBe(400);
      expect(body.error).toContain('displayCode');
    });
  });
});
