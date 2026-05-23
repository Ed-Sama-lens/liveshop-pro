/**
 * Tier 3.9-G5 — route tests for GET /api/sale/summary range mode.
 *
 * Coverage:
 *   - Range mode dispatch (from + to)
 *   - Single-day mode still works (regression of PR #70)
 *   - Ambiguous saleDate + from/to → 400
 *   - Range cap rejection
 *   - Bad date format rejection
 *   - to < from rejection
 *   - Cross-shop isolation under range mode
 *   - Auth/RBAC unchanged across both modes
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

const mockSummarizeByDate = vi.fn();
const mockSummarizeByRange = vi.fn();
vi.mock('@/server/repositories/sale-summary.repository', () => ({
  saleSummaryRepository: {
    summarizeByDate: mockSummarizeByDate,
    summarizeByRange: mockSummarizeByRange,
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

const SINGLE_RESULT = Object.freeze({
  saleDate: '2026-05-23',
  shopId: 'shop-1',
  currency: 'MYR' as const,
  items: [],
  totals: {
    broadcastProductCount: 0,
    totalBookings: 0,
    totalOrders: 0,
    totalOrderTouches: 0,
    totalOrderedQuantity: 0,
    totalGross: '0.00',
  },
});

const RANGE_RESULT = Object.freeze({
  from: '2026-05-17',
  to: '2026-05-23',
  shopId: 'shop-1',
  currency: 'MYR' as const,
  days: [],
  byCode: [],
  totals: {
    broadcastProductCount: 0,
    totalBookings: 0,
    totalOrders: 0,
    totalOrderTouches: 0,
    totalOrderedQuantity: 0,
    totalGross: '0.00',
    dayCount: 7,
  },
  stockSnapshotNote: 'snapshot note',
});

describe('GET /api/sale/summary — range mode dispatch (Tier 3.9-G5)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSummarizeByDate.mockReset();
    mockSummarizeByRange.mockReset();
    mockSummarizeByDate.mockResolvedValue(SINGLE_RESULT);
    mockSummarizeByRange.mockResolvedValue(RANGE_RESULT);
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
  });

  describe('mode selection', () => {
    it('saleDate-only dispatches to summarizeByDate (single mode regression)', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
      expect(mockSummarizeByDate).toHaveBeenCalledWith({
        shopId: 'shop-1',
        saleDate: '2026-05-23',
      });
      expect(mockSummarizeByRange).not.toHaveBeenCalled();
    });

    it('from + to dispatches to summarizeByRange', async () => {
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(200);
      expect(mockSummarizeByRange).toHaveBeenCalledWith({
        shopId: 'shop-1',
        from: '2026-05-17',
        to: '2026-05-23',
      });
      expect(mockSummarizeByDate).not.toHaveBeenCalled();
    });

    it('returns 400 when no params provided', async () => {
      const { status } = await callRoute('');
      expect(status).toBe(400);
      expect(mockSummarizeByDate).not.toHaveBeenCalled();
      expect(mockSummarizeByRange).not.toHaveBeenCalled();
    });
  });

  describe('ambiguity rejection', () => {
    it('saleDate + from → 400 (ambiguous)', async () => {
      const { status, body } = await callRoute('?saleDate=2026-05-23&from=2026-05-17');
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.fields.saleDate).toEqual(['ambiguous with from/to']);
    });

    it('saleDate + to → 400', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23&to=2026-05-23');
      expect(status).toBe(400);
    });

    it('saleDate + from + to → 400', async () => {
      const { status } = await callRoute(
        '?saleDate=2026-05-23&from=2026-05-17&to=2026-05-23'
      );
      expect(status).toBe(400);
    });
  });

  describe('range validation', () => {
    it('returns 400 when to < from', async () => {
      const { status } = await callRoute('?from=2026-05-23&to=2026-05-22');
      expect(status).toBe(400);
    });

    it('returns 400 when range exceeds 31 days', async () => {
      const { status } = await callRoute('?from=2026-01-01&to=2026-02-15');
      expect(status).toBe(400);
    });

    it('accepts exactly 31 days', async () => {
      const { status } = await callRoute('?from=2026-05-01&to=2026-05-31');
      expect(status).toBe(200);
    });

    it('returns 400 when from is malformed', async () => {
      const { status } = await callRoute('?from=17-05-2026&to=2026-05-23');
      expect(status).toBe(400);
    });

    it('returns 400 when to is malformed', async () => {
      const { status } = await callRoute('?from=2026-05-17&to=23-05');
      expect(status).toBe(400);
    });

    it('returns 400 when only from is provided', async () => {
      const { status } = await callRoute('?from=2026-05-17');
      expect(status).toBe(400);
    });

    it('returns 400 when only to is provided', async () => {
      const { status } = await callRoute('?to=2026-05-23');
      expect(status).toBe(400);
    });
  });

  describe('auth / RBAC stay consistent across modes', () => {
    it('range mode 401 when unauth', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(401);
    });

    it('range mode 403 when no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(403);
    });

    it('range mode allows CHAT_SUPPORT (same read tier as single)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(200);
    });

    it('range mode denies WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(403);
    });

    it('range mode denies CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(status).toBe(403);
    });
  });

  describe('cross-shop isolation', () => {
    it('range mode always uses session shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER', 'shop-B'));
      await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(mockSummarizeByRange).toHaveBeenCalledWith({
        shopId: 'shop-B',
        from: '2026-05-17',
        to: '2026-05-23',
      });
    });
  });

  describe('response shape', () => {
    it('range response carries from / to / days / byCode / totals / stockSnapshotNote', async () => {
      const { body } = await callRoute('?from=2026-05-17&to=2026-05-23');
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        from: '2026-05-17',
        to: '2026-05-23',
        shopId: 'shop-1',
        currency: 'MYR',
      });
      expect(Array.isArray(body.data.days)).toBe(true);
      expect(Array.isArray(body.data.byCode)).toBe(true);
      expect(body.data.totals).toMatchObject({
        totalOrders: 0,
        totalOrderTouches: 0,
        dayCount: 7,
      });
      expect(typeof body.data.stockSnapshotNote).toBe('string');
    });

    it('range response carries no PII fields', async () => {
      const { body } = await callRoute('?from=2026-05-17&to=2026-05-23');
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/"customerName"/);
      expect(json).not.toMatch(/"customerPhone"/);
      expect(json).not.toMatch(/"customerEmail"/);
      expect(json).not.toMatch(/"phone":/);
      expect(json).not.toMatch(/"email":/);
    });
  });
});
