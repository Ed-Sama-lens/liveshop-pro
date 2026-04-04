import { useEffect, useRef, useCallback, useState } from 'react';

interface NotificationStreamData {
  readonly unread: number;
}

/**
 * Hook that connects to the SSE notification stream and tracks
 * the unread notification count in real-time.
 *
 * Falls back to polling if SSE is not supported or the connection fails.
 */
export function useNotificationStream() {
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count');
      const body = await res.json();
      if (body.success) {
        setUnreadCount(body.data.unread);
      }
    } catch {
      // Silent failure
    }
  }, []);

  const startFallbackPolling = useCallback(() => {
    if (fallbackRef.current) clearInterval(fallbackRef.current);
    fallbackRef.current = setInterval(fetchCount, 10000);
  }, [fetchCount]);

  useEffect(() => {
    // Initial fetch
    fetchCount();

    // Try SSE
    if (typeof EventSource === 'undefined') {
      startFallbackPolling();
      return;
    }

    const es = new EventSource('/api/notifications/stream');
    eventSourceRef.current = es;

    es.addEventListener('notification-update', (event) => {
      try {
        const data: NotificationStreamData = JSON.parse(event.data);
        setUnreadCount(data.unread);
      } catch {
        // Invalid data — skip
      }
    });

    es.addEventListener('connected', () => {
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current);
        fallbackRef.current = null;
      }
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      startFallbackPolling();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current);
        fallbackRef.current = null;
      }
    };
  }, [fetchCount, startFallbackPolling]);

  const refresh = useCallback(() => {
    fetchCount();
  }, [fetchCount]);

  return { unreadCount, refresh } as const;
}
