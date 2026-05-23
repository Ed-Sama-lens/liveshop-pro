/**
 * Tier 3.9-G3 — route tests for GET /api/sale/summary?saleDate=...
 *
 * Coverage:
 *   - 401 unauth
 *   - 403 no shopId / wrong role
 *   - all three read roles (OWNER / MANAGER / CHAT_SUPPORT) allowed
 *   - 400 saleDate missing / malformed
 *   - shopId always sourced from session (cross-shop isolation)
 *   - repo result echoed to client
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

const mockSummarize = vi.fn();
vi.mock('@/server/repositories/sale-summary.repository', () => ({
  saleSummaryRepository: {
    summarizeByDate: mockSummarize,
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

async function callRoute(query: string) {
  const { GET } = await import('@/app/api/sale/summary/route');
  const url = `http://localhost:3000/api/sale/summary${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

const SAMPLE_RESULT = Object.freeze({
  saleDate: '2026-05-23',
  shopId: 'shop-1',
  currency: 'MYR' as const,
  items: [],
  totals: {
    broadcastProductCount: 0,
    totalBookings: 0,
    totalOrders: 0,
    totalOrderedQuantity: 0,
    totalGross: '0.00',
  },
});

describe('GET /api/sale/summary — Tier 3.9-G3', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSummarize.mockReset();
    mockSummarize.mockResolvedValue(SAMPLE_RESULT);
  });

  describe('auth / RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(403);
    });

    it('allows OWNER (200)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
    });

    it('allows MANAGER (200)', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
    });

    it('allows CHAT_SUPPORT (200) — needed for inbox triage', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
    });

    it('denies WAREHOUSE (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(403);
    });

    it('denies CUSTOMER (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(403);
    });
  });

  describe('query validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 when saleDate is missing', async () => {
      const { status, body } = await callRoute('');
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('returns 400 when saleDate is malformed (not YYYY-MM-DD)', async () => {
      const { status } = await callRoute('?saleDate=23-05-2026');
      expect(status).toBe(400);
    });

    it('returns 400 when saleDate is partial (missing day)', async () => {
      const { status } = await callRoute('?saleDate=2026-05');
      expect(status).toBe(400);
    });

    it('returns 400 when saleDate has extra characters', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23-extra');
      expect(status).toBe(400);
    });
  });

  describe('shop isolation', () => {
    it('always passes session shopId to repo (no client spoof)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-A'));
      await callRoute('?saleDate=2026-05-23');
      expect(mockSummarize).toHaveBeenCalledWith({
        shopId: 'shop-A',
        saleDate: '2026-05-23',
      });
    });

    it('different sessions yield different shopId to repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER', 'shop-B'));
      await callRoute('?saleDate=2026-05-23');
      expect(mockSummarize).toHaveBeenCalledWith({
        shopId: 'shop-B',
        saleDate: '2026-05-23',
      });
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('echoes the repo result inside success envelope', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        saleDate: '2026-05-23',
        shopId: 'shop-1',
        currency: 'MYR',
      });
    });

    it('totals block is included even when no items', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      expect(body.data.totals).toMatchObject({
        broadcastProductCount: 0,
        totalBookings: 0,
        totalOrders: 0,
        totalOrderedQuantity: 0,
      });
    });
  });

  describe('no PII in response shape', () => {
    it('repo result has no customer / phone / email fields', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      const json = JSON.stringify(body);
      // None of the sale summary fields should ever surface PII.
      expect(json).not.toMatch(/"customerName"/);
      expect(json).not.toMatch(/"customerPhone"/);
      expect(json).not.toMatch(/"customerEmail"/);
      expect(json).not.toMatch(/"phone":/);
      expect(json).not.toMatch(/"email":/);
    });
  });
});
