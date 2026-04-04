import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that connects to the SSE chat stream and calls `onUpdate`
 * whenever a chat-update event is received.
 *
 * Falls back to polling if SSE is not supported or the connection fails.
 */
export function useChatStream(onUpdate: () => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUpdateRef = useRef(onUpdate);

  // Keep onUpdate ref fresh without re-triggering effect
  onUpdateRef.current = onUpdate;

  const startFallbackPolling = useCallback(() => {
    // Clear any existing fallback
    if (fallbackRef.current) clearInterval(fallbackRef.current);
    fallbackRef.current = setInterval(() => {
      onUpdateRef.current();
    }, 5000);
  }, []);

  useEffect(() => {
    // Try SSE first
    if (typeof EventSource === 'undefined') {
      startFallbackPolling();
      return;
    }

    const es = new EventSource('/api/chats/stream');
    eventSourceRef.current = es;

    es.addEventListener('chat-update', () => {
      onUpdateRef.current();
    });

    es.addEventListener('connected', () => {
      // SSE connected — clear any fallback polling
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current);
        fallbackRef.current = null;
      }
    });

    es.onerror = () => {
      // SSE failed — fall back to polling
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
  }, [startFallbackPolling]);
}
