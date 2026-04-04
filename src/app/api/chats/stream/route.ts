import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

/**
 * GET /api/chats/stream — Server-Sent Events for chat updates.
 *
 * Emits 'chat-update' events whenever the chat list changes.
 * Uses a lightweight polling approach on the server side (checks DB every 3s)
 * but delivers updates to the client via SSE — eliminating per-client HTTP polling.
 *
 * In production, swap the server-side poll for Redis PubSub or Postgres LISTEN/NOTIFY.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return new Response('No shop associated', { status: 403 });
    }

    const shopId = user.shopId;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let lastCheck = '';
        let closed = false;

        // Send initial connection event
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ shopId })}\n\n`));

        // Check for updates every 3 seconds
        const interval = setInterval(async () => {
          if (closed) return;

          try {
            // Import prisma dynamically to avoid edge runtime issues
            const { prisma } = await import('@/lib/db/prisma');

            // Get latest message timestamp for this shop's chats
            const latestChat = await prisma.chat.findFirst({
              where: { shopId },
              orderBy: { lastMessageAt: 'desc' },
              select: { lastMessageAt: true, unreadCount: true },
            });

            const checksum = latestChat
              ? `${latestChat.lastMessageAt?.toISOString()}-${latestChat.unreadCount}`
              : 'empty';

            // Only send if something changed
            if (checksum !== lastCheck) {
              lastCheck = checksum;
              const data = JSON.stringify({
                type: 'chat-update',
                timestamp: new Date().toISOString(),
              });
              controller.enqueue(encoder.encode(`event: chat-update\ndata: ${data}\n\n`));
            }
          } catch {
            // DB error — skip this tick
          }
        }, 3000);

        // Keep-alive ping every 30 seconds
        const keepAlive = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`: keep-alive\n\n`));
          } catch {
            // Stream closed
          }
        }, 30000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          closed = true;
          clearInterval(interval);
          clearInterval(keepAlive);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response('Authentication required', { status: 401 });
  }
}
