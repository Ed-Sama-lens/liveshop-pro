/**
 * Unit tests for POST /api/sale/orders/from-bookings
 * (Commit 2I route, Commit 2O-c2 tests).
 *
 * Covers auth/RBAC matrix + body validation + repo invocation contract +
 * idempotent replay surface. Conversion business logic is already
 * covered end-to-end by scripts/verify-booking-conversion.ts (8/8) — these
 * tests focus on the route layer.
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

const mockConvertToOrder = vi.fn();
vi.mock('@/server/repositories/booking.repository', () => ({
  bookingRepository: {
    confirm: vi.fn(),
    cancel: vi.fn(),
    convertToOrder: mockConvertToOrder,
    createManual: vi.fn(),
  },
}));

vi.mock('@/server/services/activity.service', () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

// withRateLimit pass-through so tests don't trip the limiter.
vi.mock('@/lib/validation/middleware', async () => {
  const actual = await vi.importActual<typeof import('@/lib/validation/middleware')>(
    '@/lib/validation/middleware'
  );
  return {
    ...actual,
    withRateLimit: async (_req: unknown, handler: () => Promise<unknown>) => handler(),
  };
});

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
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

const VALID_BODY = {
  liveSessionId: 'live-1',
  customerId: 'cust-1',
  bookingIds: ['b-1', 'b-2'],
};

async function callRoute(body: unknown) {
  const { POST } = await import('@/app/api/sale/orders/from-bookings/route');
  const req = new NextRequest('http://localhost:3000/api/sale/orders/from-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('POST /api/sale/orders/from-bookings', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockConvertToOrder.mockReset();
    mockConvertToOrder.mockResolvedValue(
      Object.freeze({
        orderId: 'order-1',
        orderNumber: 'ORD-000001',
        status: 'RESERVED',
        idempotent: false,
        bookingCount: 2,
        bookingIds: Object.freeze(['b-1', 'b-2']),
        totalAmount: '120.00',
      })
    );
  });

  describe('auth/RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(403);
      expect(body.error).toMatch(/shop/i);
    });

    it('allows OWNER (200 + calls repo)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockConvertToOrder).toHaveBeenCalledOnce();
      const args = mockConvertToOrder.mock.calls[0][0];
      expect(args.shopId).toBe('shop-1');
      expect(args.liveSessionId).toBe('live-1');
      expect(args.customerId).toBe('cust-1');
      expect(args.bookingIds).toEqual(['b-1', 'b-2']);
      expect(args.changedById).toBe('user-1');
    });

    it('allows MANAGER (200 + calls repo)', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute(VALID_BODY);
      expect(status).toBe(200);
      expect(mockConvertToOrder).toHaveBeenCalledOnce();
    });

    it('denies CHAT_SUPPORT (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(403);
      expect(body.error).toMatch(/permission/i);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('denies WAREHOUSE (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callRoute(VALID_BODY);
      expect(status).toBe(403);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('denies CUSTOMER (403)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callRoute(VALID_BODY);
      expect(status).toBe(403);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });
  });

  describe('body validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 when liveSessionId is missing', async () => {
      const { status, body } = await callRoute({
        customerId: 'cust-1',
        bookingIds: ['b-1'],
      });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('returns 400 when customerId is missing', async () => {
      const { status } = await callRoute({
        liveSessionId: 'live-1',
        bookingIds: ['b-1'],
      });
      expect(status).toBe(400);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('returns 400 when bookingIds is empty', async () => {
      const { status, body } = await callRoute({
        liveSessionId: 'live-1',
        customerId: 'cust-1',
        bookingIds: [],
      });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('returns 400 when bookingIds exceeds 100', async () => {
      const tooMany = Array.from({ length: 101 }, (_, i) => `b-${i}`);
      const { status } = await callRoute({
        liveSessionId: 'live-1',
        customerId: 'cust-1',
        bookingIds: tooMany,
      });
      expect(status).toBe(400);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('returns 400 when liveSessionId is empty string', async () => {
      const { status } = await callRoute({
        liveSessionId: '',
        customerId: 'cust-1',
        bookingIds: ['b-1'],
      });
      expect(status).toBe(400);
      expect(mockConvertToOrder).not.toHaveBeenCalled();
    });

    it('accepts the maximum bookingIds (100)', async () => {
      const maxBookings = Array.from({ length: 100 }, (_, i) => `b-${i}`);
      mockConvertToOrder.mockResolvedValueOnce(
        Object.freeze({
          orderId: 'order-1',
          orderNumber: 'ORD-000001',
          status: 'RESERVED',
          idempotent: false,
          bookingCount: 100,
          bookingIds: Object.freeze(maxBookings),
          totalAmount: '999.00',
        })
      );
      const { status } = await callRoute({
        liveSessionId: 'live-1',
        customerId: 'cust-1',
        bookingIds: maxBookings,
      });
      expect(status).toBe(200);
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns success envelope with all expected fields', async () => {
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        orderId: 'order-1',
        orderNumber: 'ORD-000001',
        status: 'RESERVED',
        idempotent: false,
        bookingCount: 2,
        totalAmount: '120.00',
        currency: 'MYR',
      });
      expect(body.data.bookingIds).toEqual(['b-1', 'b-2']);
    });

    it('surfaces idempotent: true when repo returns idempotent replay', async () => {
      mockConvertToOrder.mockResolvedValueOnce(
        Object.freeze({
          orderId: 'order-1',
          orderNumber: 'ORD-000001',
          status: 'RESERVED',
          idempotent: true,
          bookingCount: 2,
          bookingIds: Object.freeze(['b-1', 'b-2']),
          totalAmount: '120.00',
        })
      );
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(200);
      expect(body.data.idempotent).toBe(true);
    });
  });

  describe('repository error propagation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('maps NotFoundError → 404 via toAppError', async () => {
      const { NotFoundError } = await import('@/lib/errors');
      mockConvertToOrder.mockRejectedValueOnce(
        new NotFoundError('Customer not found')
      );
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('maps ConflictError → 409 via toAppError', async () => {
      const { ConflictError } = await import('@/lib/errors');
      mockConvertToOrder.mockRejectedValueOnce(
        new ConflictError('Booking already converted')
      );
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
    });

    it('maps AppError with code 422 → 422', async () => {
      const { AppError } = await import('@/lib/errors');
      mockConvertToOrder.mockRejectedValueOnce(
        new AppError('No bookings to convert', 'NO_BOOKINGS_TO_CONVERT', 422)
      );
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(422);
      expect(body.success).toBe(false);
    });

    it('maps unknown thrown value → 500 generic', async () => {
      mockConvertToOrder.mockRejectedValueOnce(
        new Error('unexpected db corruption')
      );
      const { status, body } = await callRoute(VALID_BODY);
      expect(status).toBe(500);
      expect(body.success).toBe(false);
    });
  });
});
