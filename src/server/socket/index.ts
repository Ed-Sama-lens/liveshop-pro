import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { shopRoom } from './rooms';
import { logger } from '@/lib/logging/logger';

// Typed events
export interface ServerToClientEvents {
  'order:created': (data: { orderId: string; shopId: string }) => void;
  'order:updated': (data: { orderId: string; status: string }) => void;
  'chat:message': (data: { chatId: string; content: string }) => void;
  'stock:updated': (data: { productId: string; quantity: number }) => void;
  'live:comment': (data: { sessionId: string; comment: string; user: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (data: { shopId: string }) => void;
  'room:leave': (data: { shopId: string }) => void;
}

type TypedSocketIOServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

let io: TypedSocketIOServer | null = null;

export function initSocketServer(httpServer: HTTPServer): TypedSocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, '[Socket.IO] Client connected');

    socket.on('room:join', ({ shopId }) => {
      const room = shopRoom(shopId);
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, '[Socket.IO] Joined room');
    });

    socket.on('room:leave', ({ shopId }) => {
      const room = shopRoom(shopId);
      socket.leave(room);
      logger.debug({ socketId: socket.id, room }, '[Socket.IO] Left room');
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, '[Socket.IO] Client disconnected');
    });
  });

  logger.info('[Socket.IO] Server initialized');
  return io;
}

export function getSocketServer(): TypedSocketIOServer {
  if (!io) {
    throw new Error('Socket.IO server not initialized. Call initSocketServer() first.');
  }
  return io;
}

/**
 * Emit an event to all sockets in a shop-scoped room.
 * NEVER broadcasts globally — always scoped to shop:{shopId}.
 */
export function emitToRoom<E extends keyof ServerToClientEvents>(
  shopId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  const server = getSocketServer();
  const room = shopRoom(shopId);
  server.to(room).emit(event, ...args);
}
