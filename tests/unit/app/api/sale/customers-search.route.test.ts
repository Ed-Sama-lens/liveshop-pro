/**
 * Unit tests for GET /api/sale/customers/search.
 *
 * Boss 2026-05-13 push-readiness harden: minimal PII-safe customer
 * lookup for Manual Create. This test file covers the full RBAC matrix,
 * input validation, shop scoping, the OR-search shape passed to prisma,
 * and most importantly enforces the field whitelist on the response —
 * if the route ever starts leaking forbidden PII fields, these tests
 * fail.
 *
 * Mocks next-auth + prisma so tests run without a database.
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

const mockCustomerFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
    },
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

async function callRoute(query: string = '') {
  const { GET } = await import('@/app/api/sale/customers/search/route');
  const url = `http://localhost:3000/api/sale/customers/search${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

// Forbidden field set — these MUST NOT appear in any response payload.
const FORBIDDEN_RESPONSE_KEYS = [
  'shopId',
  'facebookId',
  'address',
  'district',
  'province',
  'postalCode',
  'labels',
  'notes',
  'channel',
  'bannedReason',
  'shippingType',
  'lifetimeValue',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_RESPONSE_KEYS = [
  'customerId',
  'name',
  'phone',
  'email',
  'isBanned',
  'orderCount',
] as const;

describe('GET /api/sale/customers/search', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCustomerFindMany.mockReset();
    mockCustomerFindMany.mockResolvedValue([]);
  });

  describe('auth/RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const { status, body } = await callRoute('?q=ab');
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it('returns 403 when user has no shopId', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', null));
      const { status, body } = await callRoute('?q=ab');
      expect(status).toBe(403);
      expect(body.error).toMatch(/shop/i);
    });

    it('returns 200 for OWNER', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute('?q=ab');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('returns 200 for MANAGER', async () => {
      mockGetSession.mockResolvedValue(makeUser('MANAGER'));
      const { status } = await callRoute('?q=ab');
      expect(status).toBe(200);
    });

    it('returns 200 for CHAT_SUPPORT', async () => {
      mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
      const { status } = await callRoute('?q=ab');
      expect(status).toBe(200);
    });

    it('returns 403 for WAREHOUSE', async () => {
      mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
      const { status, body } = await callRoute('?q=ab');
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it('returns 403 for CUSTOMER', async () => {
      mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
      const { status, body } = await callRoute('?q=ab');
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });
  });

  describe('query validation', () => {
    it('returns 400 when q is missing', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute('');
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.fields?.q).toBeDefined();
    });

    it('returns 400 when q is too short (1 char)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute('?q=a');
      expect(status).toBe(400);
      expect(body.fields?.q?.[0]).toMatch(/at least 2/i);
    });

    it('returns 400 when limit exceeds max (21)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status, body } = await callRoute('?q=ab&limit=21');
      expect(status).toBe(400);
      expect(body.fields?.limit).toBeDefined();
    });

    it('accepts limit at boundary (20)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      const { status } = await callRoute('?q=ab&limit=20');
      expect(status).toBe(200);
    });

    it('trims whitespace from q before validation', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      // "  a  " trims to "a" which is < 2 chars → 400
      const { status } = await callRoute('?q=%20%20a%20%20');
      expect(status).toBe(400);
    });
  });

  describe('shop scoping + search shape', () => {
    it('passes shopId from session into where clause', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-42'));
      await callRoute('?q=alice');
      const call = mockCustomerFindMany.mock.calls[0]?.[0];
      expect(call.where.shopId).toBe('shop-42');
    });

    it('searches OR(name, phone, email) case-insensitive', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      await callRoute('?q=alice');
      const call = mockCustomerFindMany.mock.calls[0]?.[0];
      expect(call.where.OR).toEqual([
        { name: { contains: 'alice', mode: 'insensitive' } },
        { phone: { contains: 'alice', mode: 'insensitive' } },
        { email: { contains: 'alice', mode: 'insensitive' } },
      ]);
    });

    it('respects limit (take) param', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      await callRoute('?q=alice&limit=5');
      const call = mockCustomerFindMany.mock.calls[0]?.[0];
      expect(call.take).toBe(5);
    });

    it('defaults limit to 20 when omitted', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      await callRoute('?q=alice');
      const call = mockCustomerFindMany.mock.calls[0]?.[0];
      expect(call.take).toBe(20);
    });

    it('cross-shop probe returns empty list (no leak)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER', 'shop-a'));
      mockCustomerFindMany.mockResolvedValue([]);
      const { status, body } = await callRoute('?q=bob');
      expect(status).toBe(200);
      expect(body.data.customers).toEqual([]);
    });
  });

  describe('response shape (PII whitelist)', () => {
    const rawRow = {
      id: 'cust-1',
      name: 'Alice Tan',
      phone: '+60123456789',
      email: 'alice@example.com',
      isBanned: false,
      _count: { orders: 3 },
    };

    it('returns only the 6 whitelisted fields per row', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      mockCustomerFindMany.mockResolvedValue([rawRow]);
      const { status, body } = await callRoute('?q=alice');
      expect(status).toBe(200);
      const customer = body.data.customers[0];
      const keys = Object.keys(customer).sort();
      expect(keys).toEqual([...ALLOWED_RESPONSE_KEYS].sort());
    });

    it('does NOT return any forbidden PII keys even if upstream leaks them', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      // Defense-in-depth: feed the mock with junk fields. The route
      // builds the response from an explicit field list, so junk drops.
      const junkRow = {
        ...rawRow,
        shopId: 'shop-1',
        facebookId: 'fb-99',
        address: '12 Jalan',
        district: 'D',
        province: 'P',
        postalCode: '12345',
        labels: ['vip'],
        notes: 'secret',
        channel: 'FACEBOOK',
        bannedReason: 'reason-redacted',
        shippingType: 'STANDARD',
        lifetimeValue: '1234.56',
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-12'),
      };
      mockCustomerFindMany.mockResolvedValue([junkRow]);
      const { body } = await callRoute('?q=alice');
      const customer = body.data.customers[0];
      for (const forbidden of FORBIDDEN_RESPONSE_KEYS) {
        expect(customer).not.toHaveProperty(forbidden);
      }
    });

    it('serializes orderCount from _count.orders aggregate', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      mockCustomerFindMany.mockResolvedValue([
        { ...rawRow, _count: { orders: 7 } },
      ]);
      const { body } = await callRoute('?q=alice');
      expect(body.data.customers[0].orderCount).toBe(7);
    });

    it('returns banned customers with isBanned=true (UI handles disable)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      mockCustomerFindMany.mockResolvedValue([{ ...rawRow, isBanned: true }]);
      const { body } = await callRoute('?q=alice');
      expect(body.data.customers[0].isBanned).toBe(true);
    });

    it('selects only whitelisted fields from prisma (defense in depth)', async () => {
      mockGetSession.mockResolvedValue(makeUser('OWNER'));
      await callRoute('?q=alice');
      const call = mockCustomerFindMany.mock.calls[0]?.[0];
      expect(call.select).toEqual({
        id: true,
        name: true,
        phone: true,
        email: true,
        isBanned: true,
        _count: { select: { orders: true } },
      });
    });
  });
});
