import { describe, it, expect, vi } from 'vitest';

const mockNext = vi.fn().mockResolvedValue({ id: '1' });

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('FACEBOOK_CLIENT_ID', 'id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'secret');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));

describe('createShopMiddleware()', () => {
  it('throws when shopId missing on shop-scoped create', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware(
        { model: 'Product', action: 'create', args: { data: { name: 'test' } } },
        mockNext
      )
    ).rejects.toThrow('shopId is required for Product.create');
  });

  it('throws when shopId missing on upsert for shop-scoped model', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware(
        { model: 'Order', action: 'upsert', args: { data: { name: 'test' } } },
        mockNext
      )
    ).rejects.toThrow('shopId is required for Order.upsert');
  });

  it('passes through when shopId present on shop-scoped create', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware(
        { model: 'Product', action: 'create', args: { data: { shopId: 'shop-1', name: 'test' } } },
        mockNext
      )
    ).resolves.toBeDefined();
  });

  it('passes through on read operations without shopId check', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware({ model: 'Product', action: 'findMany', args: {} }, mockNext)
    ).resolves.toBeDefined();
  });

  it('passes through on non-shop-scoped models', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware({ model: 'User', action: 'create', args: { data: { name: 'test' } } }, mockNext)
    ).resolves.toBeDefined();
  });

  it('passes through on findUnique for shop-scoped model', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    await expect(
      middleware({ model: 'Customer', action: 'findUnique', args: { where: { id: '1' } } }, mockNext)
    ).resolves.toBeDefined();
  });

  it('passes through createMany without shopId (allows bulk operations)', async () => {
    // createMany is in writeOps but the check only covers create and upsert for shopId in data
    // createMany goes to next — it's a write op without the specific shopId in data check
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();

    // createMany does NOT have the shopId check (only create and upsert do)
    // This should pass through since createMany check is not in source
    // Actually the source only checks 'create' | 'upsert' for shopId in data
    await expect(
      middleware({ model: 'Product', action: 'createMany', args: { data: [{ name: 'test' }] } }, mockNext)
    ).resolves.toBeDefined();
  });
});

describe('SHOP_SCOPED_MODELS list', () => {
  it('contains Product', async () => {
    // We test indirectly: Product.create without shopId throws
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();
    await expect(
      middleware({ model: 'Product', action: 'create', args: { data: {} } }, mockNext)
    ).rejects.toThrow();
  });

  it('contains Customer', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();
    await expect(
      middleware({ model: 'Customer', action: 'create', args: { data: {} } }, mockNext)
    ).rejects.toThrow();
  });

  it('does not include User (not shop-scoped)', async () => {
    const { createShopMiddleware } = await import('@/lib/db/rls');
    const middleware = createShopMiddleware();
    await expect(
      middleware({ model: 'User', action: 'create', args: { data: { email: 'test@test.com' } } }, mockNext)
    ).resolves.toBeDefined();
  });
});
