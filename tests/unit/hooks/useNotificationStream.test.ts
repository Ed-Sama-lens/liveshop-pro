import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationStream } from '@/hooks/useNotificationStream';

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  emit(type: string, data?: unknown) {
    const event = data !== undefined
      ? ({ data: JSON.stringify(data) } as MessageEvent)
      : ({} as MessageEvent);
    (this.listeners[type] ?? []).forEach((l) => l(event));
  }

  close = vi.fn();
}

function makeFetchResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

describe('useNotificationStream — sync/SSE tests (real timers)', () => {
  let originalEventSource: typeof EventSource;
  const mockFetch = vi.fn();

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    MockEventSource.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = originalEventSource;
  });

  it('returns unreadCount of 0 initially before first fetch resolves', () => {
    // Never resolve — initial render value
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useNotificationStream());
    expect(result.current.unreadCount).toBe(0);
  });

  it('fetches initial unread count from /api/notifications/count on mount', async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse({ success: true, data: { unread: 5 } }),
    );

    const { result } = renderHook(() => useNotificationStream());

    await waitFor(() => expect(result.current.unreadCount).toBe(5));
    expect(mockFetch).toHaveBeenCalledWith('/api/notifications/count');
  });

  it('connects to /api/notifications/stream on mount', () => {
    mockFetch.mockReturnValue(makeFetchResponse({ success: true, data: { unread: 0 } }));
    renderHook(() => useNotificationStream());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/notifications/stream');
  });

  it('updates unreadCount when a notification-update SSE event fires', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ success: true, data: { unread: 0 } }));

    const { result } = renderHook(() => useNotificationStream());

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('notification-update', { unread: 12 });
    });

    expect(result.current.unreadCount).toBe(12);
  });

  it('ignores malformed SSE data without throwing', async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ success: true, data: { unread: 3 } }));

    const { result } = renderHook(() => useNotificationStream());
    await waitFor(() => expect(result.current.unreadCount).toBe(3));

    const es = MockEventSource.instances[0];
    // Emit raw non-JSON string directly
    act(() => {
      (es.listeners['notification-update'] ?? []).forEach((l) =>
        l({ data: 'not-json' } as MessageEvent),
      );
    });

    // Count should remain at 3 — bad data was ignored
    expect(result.current.unreadCount).toBe(3);
  });

  it('closes the EventSource on unmount', () => {
    mockFetch.mockReturnValue(makeFetchResponse({ success: true, data: { unread: 0 } }));
    const { unmount } = renderHook(() => useNotificationStream());

    const es = MockEventSource.instances[0];
    unmount();

    expect(es.close).toHaveBeenCalled();
  });

  it('refresh() re-fetches the notification count', async () => {
    mockFetch
      .mockReturnValueOnce(makeFetchResponse({ success: true, data: { unread: 0 } }))
      .mockReturnValueOnce(makeFetchResponse({ success: true, data: { unread: 4 } }));

    const { result } = renderHook(() => useNotificationStream());
    await waitFor(() => expect(result.current.unreadCount).toBe(0));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(4));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not update count when fetch response has success: false', async () => {
    mockFetch.mockReturnValue(
      makeFetchResponse({ success: false }),
    );

    const { result } = renderHook(() => useNotificationStream());

    await act(async () => {
      // Flush microtasks so the fetch promise resolves
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('handles fetch network errors silently without throwing', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('network failure')));

    const { result } = renderHook(() => useNotificationStream());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.unreadCount).toBe(0);
  });
});

describe('useNotificationStream — polling tests (fake timers)', () => {
  let originalEventSource: typeof EventSource;
  const mockFetch = vi.fn();

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    MockEventSource.instances = [];
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = originalEventSource;
  });

  it('falls back to polling when EventSource is unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = undefined;

    // First call: mount fetch (unread: 1), subsequent: polling (unread: 7)
    mockFetch
      .mockReturnValueOnce(makeFetchResponse({ success: true, data: { unread: 1 } }))
      .mockReturnValue(makeFetchResponse({ success: true, data: { unread: 7 } }));

    const { result } = renderHook(() => useNotificationStream());

    // Flush mount fetch (microtasks + promise chain)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.unreadCount).toBe(1);

    // Advance past polling interval (10 000ms) then flush the resulting fetch
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.unreadCount).toBe(7);
  });

  it('falls back to polling when SSE errors', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;

    mockFetch
      .mockReturnValueOnce(makeFetchResponse({ success: true, data: { unread: 2 } }))
      .mockReturnValue(makeFetchResponse({ success: true, data: { unread: 9 } }));

    const { result } = renderHook(() => useNotificationStream());

    // Flush mount fetch
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.unreadCount).toBe(2);

    const es = MockEventSource.instances[0];
    act(() => {
      es.onerror?.();
    });

    // Advance past polling interval (10 000ms) then flush the resulting fetch
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.unreadCount).toBe(9);
  });
});
