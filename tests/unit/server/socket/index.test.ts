import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state — defined at module scope so mock factory can close over them.
// vi.clearAllMocks() resets call history; the objects themselves remain stable.
const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockOn = vi.fn();
const mockIoEmit = vi.fn();
const mockIo = {
  on: mockOn,
  to: mockTo,
  emit: mockIoEmit,
};

// The Server constructor mock must be a regular function (not arrow fn) so `new` works.
vi.mock('socket.io', () => {
  function ServerMock(this: unknown) {
    return mockIo;
  }
  return { Server: ServerMock };
});

vi.mock('@/lib/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Reset module registry before each test so the `let io = null` singleton resets.
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  // Restore mockTo to return a fresh object after clearAllMocks wipes implementations.
  mockTo.mockImplementation(() => ({ emit: mockEmit }));
});

describe('getSocketServer()', () => {
  it('throws before initSocketServer() is called', async () => {
    const { getSocketServer } = await import('@/server/socket/index');
    expect(() => getSocketServer()).toThrow('Socket.IO server not initialized');
  });
});

describe('initSocketServer()', () => {
  it('returns an initialized server', async () => {
    const { initSocketServer } = await import('@/server/socket/index');
    const io = initSocketServer({} as never);
    expect(io).toBeDefined();
  });

  it('returns same instance on second call (singleton)', async () => {
    const { initSocketServer } = await import('@/server/socket/index');
    const httpServer = {} as never;
    const io1 = initSocketServer(httpServer);
    const io2 = initSocketServer(httpServer);
    expect(io1).toBe(io2);
  });

  it('registers connection handler', async () => {
    const { initSocketServer } = await import('@/server/socket/index');
    initSocketServer({} as never);
    expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });
});

describe('getSocketServer() after init', () => {
  it('returns the server after initSocketServer() is called', async () => {
    const { initSocketServer, getSocketServer } = await import('@/server/socket/index');
    initSocketServer({} as never);
    expect(() => getSocketServer()).not.toThrow();
    // The returned server is the mockIo object our constructor returned
    expect(getSocketServer()).toBe(mockIo);
  });
});

describe('emitToRoom()', () => {
  it('calls io.to("shop:{shopId}").emit(event, payload)', async () => {
    const { initSocketServer, emitToRoom } = await import('@/server/socket/index');
    initSocketServer({} as never);

    const payload = { orderId: 'o-1', shopId: 'shop-123' };
    emitToRoom('shop-123', 'order:created', payload);

    expect(mockTo).toHaveBeenCalledWith('shop:shop-123');
    expect(mockEmit).toHaveBeenCalledWith('order:created', payload);
  });

  it('NEVER calls io.emit() directly (no global broadcast)', async () => {
    const { initSocketServer, emitToRoom } = await import('@/server/socket/index');
    initSocketServer({} as never);

    emitToRoom('shop-123', 'order:created', { orderId: 'o-1', shopId: 'shop-123' });

    expect(mockIoEmit).not.toHaveBeenCalled();
  });

  it('scopes to correct shop room for each shopId', async () => {
    const { initSocketServer, emitToRoom } = await import('@/server/socket/index');
    initSocketServer({} as never);

    emitToRoom('shop-A', 'order:created', { orderId: 'o-1', shopId: 'shop-A' });
    emitToRoom('shop-B', 'order:created', { orderId: 'o-2', shopId: 'shop-B' });

    expect(mockTo).toHaveBeenNthCalledWith(1, 'shop:shop-A');
    expect(mockTo).toHaveBeenNthCalledWith(2, 'shop:shop-B');
  });

  it('uses shop: prefix — never global or bare shopId as room name', async () => {
    const { initSocketServer, emitToRoom } = await import('@/server/socket/index');
    initSocketServer({} as never);

    emitToRoom('shop-X', 'order:updated', { orderId: 'o-1', status: 'confirmed' });

    const roomArg = mockTo.mock.calls[0][0] as string;
    expect(roomArg).toBe('shop:shop-X');
    expect(roomArg).not.toBe('global');
    expect(roomArg).not.toBe('shop-X');
  });
});

describe('shopRoom() helper', () => {
  it('returns "shop:{shopId}" format', async () => {
    const { shopRoom } = await import('@/server/socket/rooms');
    expect(shopRoom('abc-123')).toBe('shop:abc-123');
  });

  it('isValidRoom returns true for valid shop-prefixed rooms', async () => {
    const { isValidRoom } = await import('@/server/socket/rooms');
    expect(isValidRoom('shop:abc')).toBe(true);
    expect(isValidRoom('shop:some-shop-id')).toBe(true);
  });

  it('isValidRoom returns false for non-shop rooms', async () => {
    const { isValidRoom } = await import('@/server/socket/rooms');
    expect(isValidRoom('global')).toBe(false);
    expect(isValidRoom('shop:')).toBe(false); // empty shopId
    expect(isValidRoom('')).toBe(false);
  });

  it('getRoomShopId extracts shopId from room name', async () => {
    const { getRoomShopId } = await import('@/server/socket/rooms');
    expect(getRoomShopId('shop:my-shop-id')).toBe('my-shop-id');
  });

  it('getRoomShopId returns null for invalid room names', async () => {
    const { getRoomShopId } = await import('@/server/socket/rooms');
    expect(getRoomShopId('global')).toBeNull();
    expect(getRoomShopId('shop:')).toBeNull();
  });
});
