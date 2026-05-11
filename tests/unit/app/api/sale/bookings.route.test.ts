/**
 * Unit tests for GET /api/sale/bookings (Commit 2R route, Commit 2T tests).
 *
 * Covers auth/RBAC matrix + required `liveSessionId` query + the new
 * reservationIntegrity discriminator + activeReservationCount fields
 * added in 2T.
 *
 * POST handler (manual create from 2N) is intentionally NOT covered here;
 * it has its own Docker E2E verifier at scripts/verify-booking-create.ts.
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

// withRateLimit is only used by the POST handler in this file; pass-through.
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

async function callRoute(query: string = '?liveSessionId=live-1') {
  const { GET } = await import('@/app/api/sale/bookings/route');
  const url = `http://localhost:3000/api/sale/bookings${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

function bookingRow(overrides: Partial<{
  status: string;
  reservations: ReadonlyArray<{ id: string }>;
}> = {}) {
  return {
    id: 'b-1',
    status: overrides.status ?? 'PENDING_REVIEW',
    source: 'MANUAL',
    quantity: 2,
    unitPrice: { toString: () => '12.34' },
    customerId: 'cust-1',
    broadcastProductId: 'bp-1',
    createdAt: new Date('2026-05-11T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
    convertedOrderId: null,
    idempotencyKey: null,
    customer: { name: 'Test Customer', phone: '+60123' },
    broadcastProduct: {
      displayCode: 'A001',
      product: { name: 'Test Product' },
      variant: {
        id: 'var-1',
        sku: 'SKU-1',
        attributes: { color: 'red' },
      },
    },
    stockReservations: overrides.reservations ?? [],
  };
}

describe('GET /api/sale/bookings', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockBookingFindMany.mockReset();
    mockBookingFindMany.mockResolvedValue([]);
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

  describe('query validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 when liveSessionId is missing (Boss spec)', async () => {
      const { status, body } = await callRoute('');
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('returns 400 when status enum is invalid', async () => {
      const { status } = await callRoute('?liveSessionId=live-1&status=BOGUS');
      expect(status).toBe(400);
    });

    it('returns 400 when limit exceeds max', async () => {
      const { status } = await callRoute('?liveSessionId=live-1&limit=999');
      expect(status).toBe(400);
    });

    it('passes status filter to prisma when provided', async () => {
      await callRoute('?liveSessionId=live-1&status=CONFIRMED');
      expect(mockBookingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: 'shop-1',
            liveSessionId: 'live-1',
            status: 'CONFIRMED',
          }),
        })
      );
    });
  });

  describe('reservationIntegrity (2T)', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('CONFIRMED + 1 reservation → OK with id', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({ status: 'CONFIRMED', reservations: [{ id: 'res-1' }] }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('OK');
      expect(body.data.bookings[0].activeReservationId).toBe('res-1');
      expect(body.data.bookings[0].activeReservationCount).toBe(1);
    });

    it('CONFIRMED + 0 reservations → MISSING', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({ status: 'CONFIRMED', reservations: [] }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('MISSING');
      expect(body.data.bookings[0].activeReservationId).toBeNull();
      expect(body.data.bookings[0].activeReservationCount).toBe(0);
    });

    it('CONFIRMED + 2 reservations → MULTIPLE', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({
          status: 'CONFIRMED',
          reservations: [{ id: 'res-1' }, { id: 'res-2' }],
        }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('MULTIPLE');
      expect(body.data.bookings[0].activeReservationId).toBeNull();
      expect(body.data.bookings[0].activeReservationCount).toBe(2);
    });

    it('PENDING_REVIEW + 0 reservations → NOT_APPLICABLE', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({ status: 'PENDING_REVIEW', reservations: [] }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('NOT_APPLICABLE');
      expect(body.data.bookings[0].activeReservationId).toBeNull();
    });

    it('CANCELLED + 1 stale reservation → NOT_APPLICABLE but surfaces id', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({ status: 'CANCELLED', reservations: [{ id: 'stale' }] }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('NOT_APPLICABLE');
      expect(body.data.bookings[0].activeReservationId).toBe('stale');
    });

    it('CONVERTED_TO_ORDER + 2 reservations → MULTIPLE (corruption regardless of status)', async () => {
      mockBookingFindMany.mockResolvedValue([
        bookingRow({
          status: 'CONVERTED_TO_ORDER',
          reservations: [{ id: 'a' }, { id: 'b' }],
        }),
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].reservationIntegrity).toBe('MULTIPLE');
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns empty list when no bookings', async () => {
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.data.bookings).toEqual([]);
      expect(body.data.liveSessionId).toBe('live-1');
      expect(body.data.currency).toBe('MYR');
    });

    it('formats unitPrice to fixed 2 decimals', async () => {
      mockBookingFindMany.mockResolvedValue([
        {
          ...bookingRow(),
          unitPrice: { toString: () => '5.5' },
        },
      ]);
      const { body } = await callRoute();
      expect(body.data.bookings[0].unitPrice).toBe('5.50');
    });
  });
});
