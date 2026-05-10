import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream } from '@/hooks/useChatStream';

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

  emit(type: string, event: Partial<MessageEvent> = {}) {
    (this.listeners[type] ?? []).forEach((l) => l(event as MessageEvent));
  }

  close = vi.fn();
}

describe('useChatStream', () => {
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    MockEventSource.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = MockEventSource;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = originalEventSource;
  });

  it('connects to /api/chats/stream on mount', () => {
    const onUpdate = vi.fn();
    renderHook(() => useChatStream(onUpdate));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/chats/stream');
  });

  it('calls onUpdate when a chat-update event is received', () => {
    const onUpdate = vi.fn();
    renderHook(() => useChatStream(onUpdate));

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('chat-update');
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('calls onUpdate multiple times for multiple events', () => {
    const onUpdate = vi.fn();
    renderHook(() => useChatStream(onUpdate));

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('chat-update');
      es.emit('chat-update');
      es.emit('chat-update');
    });

    expect(onUpdate).toHaveBeenCalledTimes(3);
  });

  it('closes the EventSource on unmount', () => {
    const onUpdate = vi.fn();
    const { unmount } = renderHook(() => useChatStream(onUpdate));

    const es = MockEventSource.instances[0];
    unmount();

    expect(es.close).toHaveBeenCalled();
  });

  it('falls back to polling when EventSource is unavailable', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).EventSource = undefined;

    const onUpdate = vi.fn();
    renderHook(() => useChatStream(onUpdate));

    // Polling interval is 5000ms
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('falls back to polling when SSE connection errors', () => {
    const onUpdate = vi.fn();
    renderHook(() => useChatStream(onUpdate));

    const es = MockEventSource.instances[0];
    act(() => {
      es.onerror?.();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('stops fallback polling on unmount when SSE was active before error', () => {
    // SSE path DOES register cleanup that clears the fallback interval
    const onUpdate = vi.fn();
    const { unmount } = renderHook(() => useChatStream(onUpdate));

    const es = MockEventSource.instances[0];

    // Trigger SSE error — starts polling via fallback
    act(() => {
      es.onerror?.();
    });

    // Unmount — cleanup should clear the fallback interval
    unmount();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('uses the latest onUpdate callback without re-creating the effect', () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useChatStream(cb),
      { initialProps: { cb: firstCallback } },
    );

    const es = MockEventSource.instances[0];

    // Switch callback — should not open a new EventSource
    rerender({ cb: secondCallback });

    act(() => {
      es.emit('chat-update');
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
    // Only one EventSource was created
    expect(MockEventSource.instances).toHaveLength(1);
  });
});
