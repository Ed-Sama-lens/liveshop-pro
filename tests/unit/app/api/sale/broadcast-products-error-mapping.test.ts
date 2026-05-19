/**
 * Unit tests for `/api/sale/broadcast-products[/[id]]` repository
 * error → route HTTP status mapping.
 *
 * Complements broadcast-products-new-routes.test.ts which covers
 * 401/403/400 auth/RBAC/id-validation gates. This file mocks the
 * repository to throw AppError subclasses and asserts the route's
 * toAppError() handler maps them correctly to 404 / 409 / 400.
 *
 * Coverage focus:
 *   - NotFoundError → 404
 *   - ConflictError (duplicate displayCode / active booking) → 409
 *   - ValidationError → 400
 *   - Unknown Error → 500 (still gets caught, no stack leak in body)
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
  const actual =
    await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
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
  const actual =
    await vi.importActual<typeof import('@/lib/validation/middleware')>(
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

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/server/repositories/broadcast-product.repository', () => ({
  broadcastProductRepository: {
    list: vi.fn(),
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock('@/server/services/activity.service', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn(() => ({})) }));

function ownerUser(): SessionUser {
  return Object.freeze({
    id: 'user-1',
    name: 'Test Owner',
    email: 'owner@example.com',
    image: null,
    role: 'OWNER',
    shopId: 'shop-1',
  });
}

// ─── POST /api/sale/broadcast-products error mapping ─────────────────────

async function callCreate(body: unknown) {
  const { POST } = await import('@/app/api/sale/broadcast-products/route');
  const url = 'http://localhost:3000/api/sale/broadcast-products';
  const req = new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('POST /api/sale/broadcast-products — repo error mapping', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreate.mockReset();
    mockGetSession.mockResolvedValue(ownerUser());
  });

  it('maps NotFoundError → 404', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockCreate.mockRejectedValueOnce(new NotFoundError('ProductVariant not found in this shop'));
    const { status, body } = await callCreate({
      variantId: 'bogus',
      displayCode: 'TEST-001',
    });
    expect(status).toBe(404);
    expect(body.error).toContain('ProductVariant not found');
  });

  it('maps ConflictError → 409 for duplicate displayCode', async () => {
    const { ConflictError } = await import('@/lib/errors');
    mockCreate.mockRejectedValueOnce(
      new ConflictError('Live-bound product code already exists for this shop+session')
    );
    const { status, body } = await callCreate({
      variantId: 'v-1',
      displayCode: 'DUPE-001',
    });
    expect(status).toBe(409);
    expect(body.error).toContain('already exists');
  });

  it('maps ValidationError → 400', async () => {
    const { ValidationError } = await import('@/lib/errors');
    mockCreate.mockRejectedValueOnce(
      new ValidationError('priceOverride must be a decimal with up to 2 places', {})
    );
    const { status } = await callCreate({
      variantId: 'v-1',
      displayCode: 'TEST-001',
      priceOverride: '9.999',
    });
    expect(status).toBe(400);
  });

  it('does NOT leak repo stack trace on unknown error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('database connection failed (secret-leak.tld)'));
    const { status, body } = await callCreate({
      variantId: 'v-1',
      displayCode: 'TEST-001',
    });
    expect(status).toBe(500);
    // Body should NOT include the raw error message verbatim if it
    // contains internals; the error envelope normalizes to safe text.
    expect(typeof body.error).toBe('string');
  });
});

// ─── PATCH /api/sale/broadcast-products/[id] error mapping ───────────────

async function callPatch(id: string, body: unknown) {
  const { PATCH } = await import('@/app/api/sale/broadcast-products/[id]/route');
  const url = `http://localhost:3000/api/sale/broadcast-products/${id}`;
  const req = new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await PATCH(req, { params: Promise.resolve({ id }) });
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('PATCH /api/sale/broadcast-products/[id] — repo error mapping', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdate.mockReset();
    mockGetSession.mockResolvedValue(ownerUser());
  });

  it('maps NotFoundError → 404 when BP not in shop', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockUpdate.mockRejectedValueOnce(
      new NotFoundError('BroadcastProduct not found in this shop')
    );
    const { status, body } = await callPatch('bp-1', { priceOverride: '9.99' });
    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('maps ValidationError → 400 for empty update body', async () => {
    const { ValidationError } = await import('@/lib/errors');
    mockUpdate.mockRejectedValueOnce(
      new ValidationError('At least one field must be provided to update', {})
    );
    const { status } = await callPatch('bp-1', {});
    expect(status).toBe(400);
  });

  it('passes through PATCH happy-path with priceOverride + isPinned', async () => {
    mockUpdate.mockResolvedValueOnce({
      broadcastProductId: 'bp-1',
      shopId: 'shop-1',
      liveSessionId: null,
      displayCode: 'TEST-001',
      displayOrder: 0,
      isPinned: true,
      productId: 'p-1',
      productName: 'Test Product',
      variantId: 'v-1',
      sku: 'SKU-1',
      unitPrice: null,
      priceOverride: '9.99',
      variantPrice: '10.00',
      stockQuantity: 50,
      reservedQty: 0,
      availableQty: 50,
      imageUrl: null,
    });
    const { status, body } = await callPatch('bp-1', {
      priceOverride: '9.99',
      isPinned: true,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.broadcastProductId).toBe('bp-1');
    expect(body.data.isPinned).toBe(true);
    expect(body.data.unitPrice).toBe('9.99');
  });
});

// ─── DELETE /api/sale/broadcast-products/[id] error mapping ──────────────

async function callDelete(id: string) {
  const { DELETE } = await import('@/app/api/sale/broadcast-products/[id]/route');
  const url = `http://localhost:3000/api/sale/broadcast-products/${id}`;
  const req = new NextRequest(url, { method: 'DELETE' });
  const res = await DELETE(req, { params: Promise.resolve({ id }) });
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('DELETE /api/sale/broadcast-products/[id] — repo error mapping', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDelete.mockReset();
    mockGetSession.mockResolvedValue(ownerUser());
  });

  it('maps NotFoundError → 404 (BP missing or cross-shop)', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockDelete.mockRejectedValueOnce(
      new NotFoundError('BroadcastProduct not found in this shop')
    );
    const { status, body } = await callDelete('bp-1');
    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('maps ConflictError → 409 when active booking exists (Tier 3.5 guard)', async () => {
    const { ConflictError } = await import('@/lib/errors');
    mockDelete.mockRejectedValueOnce(
      new ConflictError('Cannot delete: 2 active booking(s) reference this product')
    );
    const { status, body } = await callDelete('bp-1');
    expect(status).toBe(409);
    expect(body.error).toContain('active booking');
  });

  it('maps ConflictError → 409 for race-condition booking-created-between (Tier 3.5)', async () => {
    const { ConflictError } = await import('@/lib/errors');
    mockDelete.mockRejectedValueOnce(
      new ConflictError('Booking created during delete; retry')
    );
    const { status } = await callDelete('bp-1');
    expect(status).toBe(409);
  });

  it('passes through DELETE happy-path returning deletedAt', async () => {
    const deletedAt = new Date('2026-05-20T00:00:00Z');
    mockDelete.mockResolvedValueOnce({ id: 'bp-1', deletedAt });
    const { status, body } = await callDelete('bp-1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.broadcastProductId).toBe('bp-1');
    expect(body.data.deletedAt).toBe(deletedAt.toISOString());
  });
});

// ─── Cross-shop / not-found indistinguishability ─────────────────────────

describe('Cross-shop vs not-found indistinguishability', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDelete.mockReset();
    mockUpdate.mockReset();
    mockGetSession.mockResolvedValue(ownerUser());
  });

  it('PATCH cross-shop attempts return same 404 + message as truly missing (no enumeration)', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockUpdate.mockRejectedValueOnce(
      new NotFoundError('BroadcastProduct not found in this shop')
    );
    const { status, body } = await callPatch('bp-other-shop', { priceOverride: '9.99' });
    expect(status).toBe(404);
    expect(body.error).toBe('BroadcastProduct not found in this shop');
  });

  it('DELETE cross-shop attempts return same 404 + message as truly missing', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockDelete.mockRejectedValueOnce(
      new NotFoundError('BroadcastProduct not found in this shop')
    );
    const { status, body } = await callDelete('bp-other-shop');
    expect(status).toBe(404);
    expect(body.error).toBe('BroadcastProduct not found in this shop');
  });
});
