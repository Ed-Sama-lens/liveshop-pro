import { describe, it, expect, vi } from 'vitest';

vi.mock('bull', () => {
  function Bull(this: { name: string; opts: object }, name: string) {
    this.name = name;
    this.opts = {};
  }
  return { default: Bull };
});

vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('FACEBOOK_CLIENT_ID', 'id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'secret');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));

describe('Bull queues', () => {
  it('exports 4 named queues', async () => {
    const { orderQueue, messageQueue, inventoryQueue, analyticsQueue } = await import('@/lib/db/queues');
    expect(orderQueue).toBeDefined();
    expect(messageQueue).toBeDefined();
    expect(inventoryQueue).toBeDefined();
    expect(analyticsQueue).toBeDefined();
  });

  it('orderQueue has name "orders"', async () => {
    const { orderQueue } = await import('@/lib/db/queues');
    expect(orderQueue.name).toBe('orders');
  });

  it('messageQueue has name "messages"', async () => {
    const { messageQueue } = await import('@/lib/db/queues');
    expect(messageQueue.name).toBe('messages');
  });

  it('inventoryQueue has name "inventory"', async () => {
    const { inventoryQueue } = await import('@/lib/db/queues');
    expect(inventoryQueue.name).toBe('inventory');
  });

  it('analyticsQueue has name "analytics"', async () => {
    const { analyticsQueue } = await import('@/lib/db/queues');
    expect(analyticsQueue.name).toBe('analytics');
  });

  it('allQueues contains exactly 4 queues', async () => {
    const { allQueues } = await import('@/lib/db/queues');
    expect(allQueues).toHaveLength(4);
  });

  it('allQueues contains all named queues', async () => {
    const { allQueues, orderQueue, messageQueue, inventoryQueue, analyticsQueue } = await import('@/lib/db/queues');
    expect(allQueues).toContain(orderQueue);
    expect(allQueues).toContain(messageQueue);
    expect(allQueues).toContain(inventoryQueue);
    expect(allQueues).toContain(analyticsQueue);
  });
});

describe('Bull queues — missing REDIS_URL', () => {
  it('throws when REDIS_URL is not set', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.resetModules();
    await expect(import('@/lib/db/queues')).rejects.toThrow('REDIS_URL environment variable is required');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.resetModules();
  });
});
