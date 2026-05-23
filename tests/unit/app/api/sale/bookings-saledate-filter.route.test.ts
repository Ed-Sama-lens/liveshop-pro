/**
 * Tier 3.9-F (2026-05-23) — supplemental route tests for
 * `GET /api/sale/bookings` saleDate filter.
 *
 * The original `bookings.route.test.ts` covers auth/RBAC + the
 * liveSessionId path. This file fills the saleDate-only invariants
 * surfaced by Boss UI smoke 2026-05-22:
 *
 *   - saleDate alone is accepted (no liveSessionId required)
 *   - saleDate + liveSessionId may coexist
 *   - saleDate filter reaches the prisma `where.broadcastProduct.saleDate`
 *   - omitting both saleDate and liveSessionId → 400
 *   - bad saleDate format → 400
 *
 * Tests use the same mocking strategy as `bookings.route.test.ts`
 * so behavior matches the production code path.
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

const mockBookingFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    booking: { findMany: mockBookingFindMany },
  },
}));

vi.mock('@/server/repositories/booking.repository', () => ({
  bookingRepository: {
    confirm: vi.fn(),
    cancel: vi.fn(),
    convertToOrder: vi.fn(),
    createManual: vi.fn(),
  },
}));

vi.mock('@/server/services/activity.service', () => ({ logActivity: vi.fn() }));

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
  const { GET } = await import('@/app/api/sale/bookings/route');
  const url = `http://localhost:3000/api/sale/bookings${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

describe('GET /api/sale/bookings — saleDate filter invariants (Tier 3.9-F)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockBookingFindMany.mockReset();
    mockBookingFindMany.mockResolvedValue([]);
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
  });

  describe('saleDate-only path (no liveSessionId)', () => {
    it('returns 200 with saleDate alone (Boss UI smoke smoke fix)', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(200);
    });

    it('pushes saleDate to prisma where.broadcastProduct.saleDate (as Date)', async () => {
      await callRoute('?saleDate=2026-05-23');
      expect(mockBookingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop-1',
            broadcastProduct: expect.objectContaining({
              saleDate: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('still scopes by shopId (cross-shop isolation)', async () => {
      await callRoute('?saleDate=2026-05-23');
      const callArg = mockBookingFindMany.mock.calls[0][0] as {
        where: { shopId: string };
      };
      expect(callArg.where.shopId).toBe('shop-1');
    });

    it('response.data.saleDate echoes the requested filter', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      expect(body.data.saleDate).toBe('2026-05-23');
    });

    it('response.data.liveSessionId is null when only saleDate provided', async () => {
      const { body } = await callRoute('?saleDate=2026-05-23');
      expect(body.data.liveSessionId).toBeNull();
    });
  });

  describe('saleDate + liveSessionId combined', () => {
    it('returns 200 when both provided', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23&liveSessionId=live-1');
      expect(status).toBe(200);
    });

    it('passes BOTH filters to prisma where', async () => {
      await callRoute('?saleDate=2026-05-23&liveSessionId=live-1');
      expect(mockBookingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            liveSessionId: 'live-1',
            broadcastProduct: expect.objectContaining({
              saleDate: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('saleDate + status combined', () => {
    it('passes both saleDate and status to prisma where', async () => {
      await callRoute('?saleDate=2026-05-23&status=CONFIRMED');
      expect(mockBookingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'CONFIRMED',
            broadcastProduct: expect.objectContaining({
              saleDate: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('rejection paths', () => {
    it('returns 400 when both saleDate and liveSessionId are missing', async () => {
      const { status } = await callRoute('');
      expect(status).toBe(400);
    });

    it('returns 400 for malformed saleDate (not YYYY-MM-DD)', async () => {
      const { status } = await callRoute('?saleDate=23-05-2026');
      expect(status).toBe(400);
    });

    it('returns 400 for partially malformed saleDate (missing day)', async () => {
      const { status } = await callRoute('?saleDate=2026-05');
      expect(status).toBe(400);
    });

    it('returns 400 for saleDate with extra characters', async () => {
      const { status } = await callRoute('?saleDate=2026-05-23-extra');
      expect(status).toBe(400);
    });
  });

  describe('cross-shop isolation under saleDate filter', () => {
    it('uses authenticated shopId regardless of any spoof attempt', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-A'));
      await callRoute('?saleDate=2026-05-23');
      const callArg = mockBookingFindMany.mock.calls[0][0] as {
        where: { shopId: string };
      };
      expect(callArg.where.shopId).toBe('shop-A');
    });

    it('user with no shopId is denied (403) even with valid saleDate', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callRoute('?saleDate=2026-05-23');
      expect(status).toBe(403);
    });
  });
});
