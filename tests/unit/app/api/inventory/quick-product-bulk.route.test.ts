/**
 * Unit tests for POST /api/inventory/quick-product-bulk (Tier 3.9-D2-A).
 *
 * Focus: route-layer auth + RBAC + Zod validation gates + activity log
 * action name. Repository mocked. End-to-end transactional behavior
 * (atomicity / reuse-or-create / BroadcastProduct absence) covered by
 * Docker verifier scripts in later D2-C PR.
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
vi.mock('@/server/repositories/inventory-bulk.repository', () => ({
  inventoryBulkRepository: {
    createBulk: mockCreateBulk,
  },
}));

const mockLogActivity = vi.fn().mockResolvedValue(undefined);
vi.mock('@/server/services/activity.service', () => ({
  logActivity: mockLogActivity,
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
  const { POST } = await import('@/app/api/inventory/quick-product-bulk/route');
  const url = 'http://localhost:3000/api/inventory/quick-product-bulk';
  const req = new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('POST /api/inventory/quick-product-bulk (Tier 3.9-D2-A)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateBulk.mockReset();
    mockLogActivity.mockClear();
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

    it('denies CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
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

    it('rejects partial range (startNo only)', async () => {
      const { status } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
      });
      expect(status).toBe(400);
    });

    it('rejects partial range (endNo only)', async () => {
      const { status } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        endNo: 10,
      });
      expect(status).toBe(400);
    });
  });

  describe('schema strictness — sale-only fields rejected', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      mockCreateBulk.mockResolvedValue({ createdCount: 1, items: [] });
    });

    it('does not forward saleDate to repository (Boss exclusion)', async () => {
      await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        saleDate: '2026-05-23',
      });
      // Zod schema strips unknown keys via default behavior; repo receives no saleDate.
      const args = mockCreateBulk.mock.calls[0]?.[0] ?? {};
      expect('saleDate' in args).toBe(false);
    });

    it('does not forward imageUrl to repository (Boss exclusion)', async () => {
      await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        imageUrl: 'https://example.com/x.png',
      });
      const args = mockCreateBulk.mock.calls[0]?.[0] ?? {};
      expect('imageUrl' in args).toBe(false);
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
            stockCode: 'STK-CM1',
            saleCode: 'CM1',
            productCreated: true,
            variantCreated: true,
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
      expect(body.data.items[0].productId).toBe('p1');
      // Response shape: NO broadcastProductId field (vs sale flow)
      expect('broadcastProductId' in body.data.items[0]).toBe(false);
    });

    it('returns 201 + N items on bulk range', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        productId: `p${i + 1}`,
        variantId: `v${i + 1}`,
        stockCode: `STK${i + 1}`,
        saleCode: `CM${i + 1}`,
        productCreated: true,
        variantCreated: true,
      }));
      mockCreateBulk.mockResolvedValue({ createdCount: 5, items });

      const { status, body } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        startNo: 1,
        endNo: 5,
      });

      expect(status).toBe(201);
      expect(body.data.createdCount).toBe(5);
      expect(body.data.items).toHaveLength(5);
    });

    it('forwards shopId from session to repo (tenant isolation)', async () => {
      mockCreateBulk.mockResolvedValue({ createdCount: 1, items: [] });
      await callRoute({ stockCodeBase: 'STK', saleCodeBase: 'CM' });
      const args = mockCreateBulk.mock.calls[0]?.[0];
      expect(args.shopId).toBe('shop-1');
    });
  });

  describe('activity log', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('logs INVENTORY_PRODUCT_BULK_CREATED with createdCount metadata', async () => {
      mockCreateBulk.mockResolvedValue({
        createdCount: 2,
        items: [
          { productId: 'p1', variantId: 'v1', stockCode: 'STK1', saleCode: 'CM1', productCreated: true, variantCreated: true },
          { productId: 'p2', variantId: 'v2', stockCode: 'STK2', saleCode: 'CM2', productCreated: false, variantCreated: false },
        ],
      });

      await callRoute({ stockCodeBase: 'STK', saleCodeBase: 'CM', startNo: 1, endNo: 2 });

      expect(mockLogActivity).toHaveBeenCalledOnce();
      const logArgs = mockLogActivity.mock.calls[0]?.[0];
      expect(logArgs.action).toBe('INVENTORY_PRODUCT_BULK_CREATED');
      expect(logArgs.entity).toBe('product');
      expect(logArgs.metadata.createdCount).toBe(2);
      expect(logArgs.metadata.productCreatedCount).toBe(1);
      expect(logArgs.metadata.variantCreatedCount).toBe(1);
    });
  });

  describe('error mapping', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 409 on ConflictError from repo', async () => {
      const { ConflictError } = await import('@/lib/errors');
      mockCreateBulk.mockRejectedValue(new ConflictError('Variant SKU collision.'));

      const { status, body } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
      });

      expect(status).toBe(409);
      expect(body.error).toMatch(/SKU collision/);
    });

    it('returns 400 on ValidationError from repo', async () => {
      const { ValidationError } = await import('@/lib/errors');
      mockCreateBulk.mockRejectedValue(
        new ValidationError('Category not found in this shop', {
          categoryId: ['unknown or cross-shop'],
        })
      );

      const { status } = await callRoute({
        stockCodeBase: 'STK',
        saleCodeBase: 'CM',
        categoryId: 'cat-other-shop',
      });

      expect(status).toBe(400);
    });
  });
});
