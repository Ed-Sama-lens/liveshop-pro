/**
 * Block F (2026-05-23) — route tests for booking confirm + cancel.
 *
 * POST /api/sale/bookings/[bookingId]/confirm
 * POST /api/sale/bookings/[bookingId]/cancel
 *
 * Both routes share the same RBAC matrix: OWNER + MANAGER only.
 * CHAT_SUPPORT / WAREHOUSE / CUSTOMER all 403.
 *
 * Coverage:
 *   - 401 unauth
 *   - 403 no shopId
 *   - 403 wrong role
 *   - 200 OWNER + MANAGER reach repo
 *   - Cross-shop isolation (session shopId always wins)
 *   - cancel body validation (targetStatus + reason)
 *   - bookingId routed correctly
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

const mockConfirm = vi.fn();
const mockCancel = vi.fn();
vi.mock('@/server/repositories/booking.repository', () => ({
  bookingRepository: {
    confirm: mockConfirm,
    cancel: mockCancel,
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

async function callConfirm(bookingId: string) {
  const { POST } = await import('@/app/api/sale/bookings/[bookingId]/confirm/route');
  const url = `http://localhost:3000/api/sale/bookings/${bookingId}/confirm`;
  const req = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const res = await POST(req, { params: Promise.resolve({ bookingId }) });
  const body = await res.json();
  return { status: res.status, body };
}

async function callCancel(bookingId: string, payload: unknown) {
  const { POST } = await import('@/app/api/sale/bookings/[bookingId]/cancel/route');
  const url = `http://localhost:3000/api/sale/bookings/${bookingId}/cancel`;
  const req = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const res = await POST(req, { params: Promise.resolve({ bookingId }) });
  const body = await res.json();
  return { status: res.status, body };
}

const CONFIRM_HAPPY = Object.freeze({
  bookingId: 'b-1',
  status: 'CONFIRMED',
  idempotent: false,
  reservationId: 'res-1',
  variantId: 'var-1',
  quantity: 2,
});

const CANCEL_HAPPY = Object.freeze({
  bookingId: 'b-1',
  status: 'CANCELLED',
  idempotent: false,
  stockReleased: false,
  releasedQuantity: 0,
});

describe('POST /api/sale/bookings/[bookingId]/confirm', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(CONFIRM_HAPPY);
  });

  describe('auth / RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callConfirm('b-1');
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(403);
    });

    it('denies CHAT_SUPPORT (read-only role)', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(403);
    });

    it('denies WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(403);
    });

    it('denies CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(403);
    });

    it('OWNER reaches repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(200);
      expect(mockConfirm).toHaveBeenCalled();
    });

    it('MANAGER reaches repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callConfirm('b-1');
      expect(status).toBe(200);
      expect(mockConfirm).toHaveBeenCalled();
    });
  });

  describe('routing + cross-shop isolation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('passes bookingId from path to repo', async () => {
      await callConfirm('booking-abc-123');
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'booking-abc-123' })
      );
    });

    it('always passes session shopId to repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-A'));
      await callConfirm('b-1');
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: 'shop-A' })
      );
    });

    it('passes changedById from session user', async () => {
      await callConfirm('b-1');
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ changedById: 'user-1' })
      );
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('envelopes repo result as success data', async () => {
      const { body } = await callConfirm('b-1');
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        bookingId: 'b-1',
        status: 'CONFIRMED',
        idempotent: false,
        reservationId: 'res-1',
        quantity: 2,
      });
    });
  });
});

describe('POST /api/sale/bookings/[bookingId]/cancel', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCancel.mockReset();
    mockCancel.mockResolvedValue(CANCEL_HAPPY);
  });

  describe('auth / RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(401);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(403);
    });

    it('denies CHAT_SUPPORT', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(403);
    });

    it('denies WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(403);
    });

    it('denies CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(403);
    });

    it('OWNER reaches repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(200);
      expect(mockCancel).toHaveBeenCalled();
    });

    it('MANAGER reaches repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(status).toBe(200);
      expect(mockCancel).toHaveBeenCalled();
    });
  });

  describe('body validation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('returns 400 when targetStatus is missing', async () => {
      const { status } = await callCancel('b-1', {});
      expect(status).toBe(400);
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it('returns 400 when targetStatus is invalid value', async () => {
      const { status } = await callCancel('b-1', { targetStatus: 'BOGUS' });
      expect(status).toBe(400);
    });

    it('accepts targetStatus EXPIRED', async () => {
      mockCancel.mockResolvedValue({ ...CANCEL_HAPPY, status: 'EXPIRED' });
      const { status, body } = await callCancel('b-1', { targetStatus: 'EXPIRED' });
      expect(status).toBe(200);
      expect(body.data.status).toBe('EXPIRED');
    });

    it('accepts optional reason', async () => {
      await callCancel('b-1', { targetStatus: 'CANCELLED', reason: 'OOS' });
      expect(mockCancel).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'OOS' })
      );
    });
  });

  describe('routing + cross-shop isolation', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('passes bookingId from path to repo', async () => {
      await callCancel('booking-xyz-99', { targetStatus: 'CANCELLED' });
      expect(mockCancel).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'booking-xyz-99' })
      );
    });

    it('always passes session shopId to repo', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-B'));
      await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(mockCancel).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: 'shop-B' })
      );
    });
  });

  describe('response shape', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
    });

    it('envelopes repo result as success data', async () => {
      const { body } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        bookingId: 'b-1',
        status: 'CANCELLED',
        idempotent: false,
        stockReleased: false,
        releasedQuantity: 0,
      });
    });

    it('surfaces stockReleased + releasedQuantity from repo', async () => {
      mockCancel.mockResolvedValue({
        ...CANCEL_HAPPY,
        stockReleased: true,
        releasedQuantity: 3,
      });
      const { body } = await callCancel('b-1', { targetStatus: 'CANCELLED' });
      expect(body.data.stockReleased).toBe(true);
      expect(body.data.releasedQuantity).toBe(3);
    });
  });
});
