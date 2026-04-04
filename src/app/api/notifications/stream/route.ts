import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

/**
 * GET /api/notifications/stream — SSE for notification updates.
 *
 * Emits 'notification-update' events when the unread count changes.
 * Server-side polling (3s) with checksum comparison — lightweight and reliable.
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
        let lastCount = -1;
        let closed = false;

        // Send initial connection event
        controller.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ shopId })}\n\n`)
        );

        // Check for updates every 3 seconds
        const interval = setInterval(async () => {
          if (closed) return;

          try {
            const { prisma } = await import('@/lib/db/prisma');
            const count = await prisma.notification.count({
              where: { shopId, isRead: false },
            });

            if (count !== lastCount) {
              lastCount = count;
              const data = JSON.stringify({
                type: 'notification-update',
                unread: count,
                timestamp: new Date().toISOString(),
              });
              controller.enqueue(encoder.encode(`event: notification-update\ndata: ${data}\n\n`));
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
