/**
 * Unit tests for GET /api/sale/live-sessions/[liveSessionId]/broadcast-products
 * (Commit 2Q route, Commit 2T tests).
 *
 * Covers auth/RBAC matrix + cross-shop session resolution + the new
 * `filteredInvalidCount` integrity field added in 2T.
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

const mockLiveSessionFindFirst = vi.fn();
const mockBroadcastProductFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    liveSession: { findFirst: mockLiveSessionFindFirst },
    broadcastProduct: { findMany: mockBroadcastProductFindMany },
  },
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

async function callRoute(liveSessionId: string = 'live-1') {
  const { GET } = await import(
    '@/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route'
  );
  const url = `http://localhost:3000/api/sale/live-sessions/${liveSessionId}/broadcast-products`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req, {
    params: Promise.resolve({ liveSessionId }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function variantPayload(overrides: Partial<{ shopId: string }> = {}) {
  return {
    id: 'var-1',
    sku: 'SKU-1',
    attributes: { color: 'red' },
    price: { toString: () => '12.34' },
    quantity: 10,
    reservedQty: 2,
    product: { shopId: overrides.shopId ?? 'shop-1' },
  };
}

describe('GET /api/sale/live-sessions/[id]/broadcast-products', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockLiveSessionFindFirst.mockReset();
    mockBroadcastProductFindMany.mockReset();
    mockLiveSessionFindFirst.mockResolvedValue({ id: 'live-1' });
    mockBroadcastProductFindMany.mockResolvedValue([]);
  });

  describe('auth/RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callRoute();
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute();
      expect(status).toBe(403);
    });

    it('allows OWNER (200)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callRoute();
      expect(status).toBe(200);
    });

    it('allows MANAGER (200)', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute();
      expect(status).toBe(200);
    });

    it('allows CHAT_SUPPORT (200)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute();
      expect(status).toBe(200);
    });

    it('denies WAREHOUSE (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute();
      expect(status).toBe(403);
    });

    it('denies CUSTOMER (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute();
      expect(status).toBe(403);
    });
  });

  describe('cross-shop session ownership', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 404 when live session does not belong to shop', async () => {
      mockLiveSessionFindFirst.mockResolvedValue(null);
      const { status, body } = await callRoute('foreign-session');
      expect(status).toBe(404);
      expect(body.error).toMatch(/Live session not found/i);
    });

    it('returns 400 when liveSessionId is empty', async () => {
      const { status } = await callRoute('');
      expect(status).toBe(400);
    });
  });

  describe('filteredInvalidCount integrity field (2T)', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 0 when all rows valid', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-1',
          displayCode: 'A001',
          displayOrder: 0,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-1', name: 'Test Product', images: [] },
          variant: variantPayload(),
        },
      ]);
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.data.filteredInvalidCount).toBe(0);
      expect(body.data.products).toHaveLength(1);
    });

    it('counts cross-shop variants', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-good',
          displayCode: 'A001',
          displayOrder: 0,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-1', name: 'OK', images: [] },
          variant: variantPayload(),
        },
        {
          id: 'bp-bad',
          displayCode: 'X001',
          displayOrder: 1,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-2',
          product: { shopId: 'shop-1', name: 'OK', images: [] },
          variant: variantPayload({ shopId: 'shop-other' }),
        },
      ]);
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.data.filteredInvalidCount).toBe(1);
      expect(body.data.products).toHaveLength(1);
      expect(body.data.products[0].broadcastProductId).toBe('bp-good');
    });

    it('counts BPs whose product.shopId leaks', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-bad-prod',
          displayCode: 'X001',
          displayOrder: 0,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-other', name: 'Bad', images: [] },
          variant: variantPayload(),
        },
      ]);
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.data.filteredInvalidCount).toBe(1);
      expect(body.data.products).toHaveLength(0);
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('formats unitPrice to fixed 2 decimals', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-1',
          displayCode: 'A001',
          displayOrder: 0,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-1', name: 'Test', images: ['https://r2/img.jpg'] },
          variant: {
            ...variantPayload(),
            price: { toString: () => '5.5' },
          },
        },
      ]);
      const { body } = await callRoute();
      expect(body.data.products[0].unitPrice).toBe('5.50');
      expect(body.data.products[0].imageUrl).toBe('https://r2/img.jpg');
      expect(body.data.currency).toBe('MYR');
    });

    it('uses priceOverride when present', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-1',
          displayCode: 'A001',
          displayOrder: 0,
          priceOverride: { toString: () => '9.99' },
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-1', name: 'Test', images: [] },
          variant: variantPayload(),
        },
      ]);
      const { body } = await callRoute();
      expect(body.data.products[0].unitPrice).toBe('9.99');
      expect(body.data.products[0].priceOverride).toBe('9.99');
    });

    it('clamps availableQty to non-negative', async () => {
      mockBroadcastProductFindMany.mockResolvedValue([
        {
          id: 'bp-1',
          displayCode: 'A001',
          displayOrder: 0,
          priceOverride: null,
          productId: 'p-1',
          variantId: 'var-1',
          product: { shopId: 'shop-1', name: 'Test', images: [] },
          variant: {
            ...variantPayload(),
            quantity: 1,
            reservedQty: 5,
          },
        },
      ]);
      const { body } = await callRoute();
      expect(body.data.products[0].availableQty).toBe(0);
    });
  });
});
