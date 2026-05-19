/**
 * Unit tests for `/api/sale/broadcast-products` Tier 3 routes (GET + POST)
 * and `/api/sale/broadcast-products/[id]` Tier 3.5 routes (PATCH + DELETE).
 *
 * These routes back the unified `/sale` Product Codes panel + the
 * Add-from-Stock / Edit / Delete dialogs (Tier 3.6 UI). Coverage focus:
 *   - auth gate (401 when unauthenticated)
 *   - RBAC matrix (OWNER / MANAGER / CHAT_SUPPORT / WAREHOUSE)
 *   - shop scope (`user.shopId` required)
 *   - id validation (empty / too long)
 *   - DELETE OWNER-only restriction
 *
 * Separate file from the legacy broadcast-products.route.test.ts so the
 * older live-session-scoped GET tests stay focused and this file owns
 * the new Tier 3/3.5/3.6 surface.
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

// Stub the rate limiter so withRateLimit is a passthrough in tests.
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

// Repository mocks. The tests assert route-layer auth/validation only;
// repository calls are stubbed to controlled return values.
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/server/repositories/broadcast-product.repository', () => ({
  broadcastProductRepository: {
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

// Activity service: fire-and-forget; route does .catch(() => {}). Mock
// so the test doesn't depend on real DB.
vi.mock('@/server/services/activity.service', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
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

// ─── GET /api/sale/broadcast-products ────────────────────────────────────

async function callList(query: string = '') {
  const { GET } = await import('@/app/api/sale/broadcast-products/route');
  const url = `http://localhost:3000/api/sale/broadcast-products${query}`;
  const req = new NextRequest(url, { method: 'GET' });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

describe('GET /api/sale/broadcast-products (Tier 3 list)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { status, body } = await callList();
    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 403 when user has no shopId', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER', null));
    const { status } = await callList();
    expect(status).toBe(403);
  });

  it('allows OWNER (200)', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    const { status } = await callList();
    expect(status).toBe(200);
  });

  it('allows MANAGER (200)', async () => {
    mockGetSession.mockResolvedValue(makeUser('MANAGER'));
    const { status } = await callList();
    expect(status).toBe(200);
  });

  it('allows CHAT_SUPPORT (200)', async () => {
    mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
    const { status } = await callList();
    expect(status).toBe(200);
  });

  it('denies WAREHOUSE (403)', async () => {
    mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
    const { status } = await callList();
    expect(status).toBe(403);
  });

  it('denies CUSTOMER (403)', async () => {
    mockGetSession.mockResolvedValue(makeUser('CUSTOMER'));
    const { status } = await callList();
    expect(status).toBe(403);
  });
});

// ─── POST /api/sale/broadcast-products ───────────────────────────────────

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

describe('POST /api/sale/broadcast-products (Tier 3 create)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreate.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { status } = await callCreate({});
    expect(status).toBe(401);
  });

  it('returns 403 when user has no shopId', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER', null));
    const { status } = await callCreate({});
    expect(status).toBe(403);
  });

  it('denies CHAT_SUPPORT (read-only role)', async () => {
    mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
    const { status } = await callCreate({});
    expect(status).toBe(403);
  });

  it('denies WAREHOUSE', async () => {
    mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
    const { status } = await callCreate({});
    expect(status).toBe(403);
  });

  it('OWNER passes role gate (proceeds to body validation)', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    // Empty body triggers Zod validation (400) — not the 403 role gate.
    const { status } = await callCreate({});
    expect(status).toBe(400);
  });

  it('MANAGER passes role gate (proceeds to body validation)', async () => {
    mockGetSession.mockResolvedValue(makeUser('MANAGER'));
    const { status } = await callCreate({});
    expect(status).toBe(400);
  });
});

// ─── PATCH /api/sale/broadcast-products/[id] ─────────────────────────────

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

describe('PATCH /api/sale/broadcast-products/[id] (Tier 3.5 update)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdate.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { status } = await callPatch('bp-1', {});
    expect(status).toBe(401);
  });

  it('returns 403 when user has no shopId', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER', null));
    const { status } = await callPatch('bp-1', {});
    expect(status).toBe(403);
  });

  it('denies CHAT_SUPPORT', async () => {
    mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
    const { status } = await callPatch('bp-1', {});
    expect(status).toBe(403);
  });

  it('denies WAREHOUSE', async () => {
    mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
    const { status } = await callPatch('bp-1', {});
    expect(status).toBe(403);
  });

  it('returns 400 when id is empty', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    const { status, body } = await callPatch('', {});
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid broadcast product id');
  });

  it('returns 400 when id exceeds 128 chars', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    const longId = 'x'.repeat(129);
    const { status, body } = await callPatch(longId, {});
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid broadcast product id');
  });
});

// ─── DELETE /api/sale/broadcast-products/[id] ────────────────────────────

async function callDelete(id: string) {
  const { DELETE } = await import('@/app/api/sale/broadcast-products/[id]/route');
  const url = `http://localhost:3000/api/sale/broadcast-products/${id}`;
  const req = new NextRequest(url, { method: 'DELETE' });
  const res = await DELETE(req, { params: Promise.resolve({ id }) });
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('DELETE /api/sale/broadcast-products/[id] (Tier 3.5 delete)', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDelete.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { status } = await callDelete('bp-1');
    expect(status).toBe(401);
  });

  it('returns 403 when user has no shopId', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER', null));
    const { status } = await callDelete('bp-1');
    expect(status).toBe(403);
  });

  it('denies MANAGER — OWNER only for hard delete', async () => {
    mockGetSession.mockResolvedValue(makeUser('MANAGER'));
    const { status, body } = await callDelete('bp-1');
    expect(status).toBe(403);
    expect(body.error).toBe('Only OWNER can delete broadcast products');
  });

  it('denies CHAT_SUPPORT', async () => {
    mockGetSession.mockResolvedValue(makeUser('CHAT_SUPPORT'));
    const { status } = await callDelete('bp-1');
    expect(status).toBe(403);
  });

  it('denies WAREHOUSE', async () => {
    mockGetSession.mockResolvedValue(makeUser('WAREHOUSE'));
    const { status } = await callDelete('bp-1');
    expect(status).toBe(403);
  });

  it('returns 400 when id is empty', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    const { status, body } = await callDelete('');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid broadcast product id');
  });

  it('returns 400 when id exceeds 128 chars', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    const longId = 'x'.repeat(129);
    const { status, body } = await callDelete(longId);
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid broadcast product id');
  });

  it('OWNER passes role + id gate (calls repository.delete)', async () => {
    mockGetSession.mockResolvedValue(makeUser('OWNER'));
    mockDelete.mockResolvedValue({ id: 'bp-1', deletedAt: new Date('2026-05-19T00:00:00Z') });
    const { status, body } = await callDelete('bp-1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.broadcastProductId).toBe('bp-1');
    expect(mockDelete).toHaveBeenCalledWith({ shopId: 'shop-1', id: 'bp-1' });
  });
});
