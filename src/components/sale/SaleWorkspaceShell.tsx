'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorBoundarySection } from '@/components/ErrorBoundarySection';
import {
  SaleSessionPickerPlaceholder,
  type SaleSessionRow,
} from './SaleSessionPickerPlaceholder';
import {
  SaleProductGridPlaceholder,
  type SaleBroadcastProductRow,
} from './SaleProductGridPlaceholder';
import {
  SaleBookingQueuePlaceholder,
  type SaleBookingRow,
} from './SaleBookingQueuePlaceholder';
import { SaleCustomerPanelPlaceholder } from './SaleCustomerPanelPlaceholder';
import { SaleOrderConversionPlaceholder } from './SaleOrderConversionPlaceholder';
import { SaleInboxPlaceholder } from './SaleInboxPlaceholder';
import {
  SaleSourceFilterChips,
  type SourceFilterValue,
} from './SaleSourceFilterChips';

/**
 * /sale workspace shell (Commit 2S — wired to read-only APIs).
 *
 * Client component that orchestrates fetches to the three read-only
 * sale endpoints added in 2P/2Q/2R and threads results through to the
 * panel placeholders.
 *
 * Strict no-mutation contract still applies:
 * - only GET fetches against /api/sale/* read endpoints
 * - no POST / PUT / DELETE
 * - no router.push() from action buttons
 * - all create/confirm/cancel/convert buttons remain disabled
 * - no useEffect polling — single fetch on mount + on selected-session change
 *
 * Auto-selection
 * - If the GET /api/sale/live-sessions response contains a LIVE session,
 *   that one is auto-selected.
 * - Otherwise the most recent SCHEDULED session, else first ENDED, else
 *   the first row.
 * - The user cannot manually re-select in 2S (future commit can add an
 *   interactive selector).
 *
 * Server-side rendering
 * - This is a client component because the project convention for admin
 *   pages is `'use client'` + fetch from useEffect (see /dashboard,
 *   /orders, /inventory, /customers, /live-selling). Mixing a server
 *   component fetch here would diverge from that pattern.
 */
type SessionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      sessions: readonly SaleSessionRow[];
      selectedId: string | null;
    };

type ProductState =
  | { kind: 'no-session' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      liveSessionId: string;
      products: readonly SaleBroadcastProductRow[];
      filteredInvalidCount?: number;
    };

type BookingState =
  | { kind: 'no-session' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      liveSessionId: string;
      bookings: readonly SaleBookingRow[];
    };

function pickSelectedSession(
  sessions: readonly SaleSessionRow[]
): string | null {
  if (sessions.length === 0) return null;
  const live = sessions.find((s) => s.status === 'LIVE');
  if (live) return live.id;
  const scheduled = sessions.find((s) => s.status === 'SCHEDULED');
  if (scheduled) return scheduled.id;
  return sessions[0].id;
}

export function SaleWorkspaceShell() {
  const [sessionState, setSessionState] = useState<SessionState>({ kind: 'loading' });
  const [productState, setProductState] = useState<ProductState>({ kind: 'no-session' });
  const [bookingState, setBookingState] = useState<BookingState>({ kind: 'no-session' });
  /**
   * Increments when a /sale mutation (Confirm in 2O-a; Cancel/Convert
   * later) returns success. The product + booking effect re-runs on
   * change, refreshing stock counts and booking lifecycle state. The
   * sessions list is intentionally NOT refetched per mutation since
   * confirm/cancel/convert do not affect LiveSession rows.
   */
  const [refetchToken, setRefetchToken] = useState(0);
  /**
   * Selected customer context for the Customer Panel (Phase 4 of
   * 2026-05-12 10-hour plan). Set by Booking Queue row-click handler.
   * Customer Panel fetches the full record from GET /api/customers/[id].
   * `selectedCustomerNameHint` lets the panel show an instant label
   * while the fetch is in flight.
   */
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerNameHint, setSelectedCustomerNameHint] = useState<string | null>(null);

  /**
   * Tier 1 source filter. Local-only filter applied to the booking
   * queue rendering. `'ALL'` shows everything. Filtering happens in
   * memory; the GET fetch still pulls all bookings for the selected
   * session (no server-side filter change). When the GET endpoint
   * relaxes `liveSessionId` requirement in a follow-up, this filter
   * becomes the primary classifier for the cross-source queue.
   */
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>('ALL');

  // Fetch live sessions on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sale/live-sessions', {
          method: 'GET',
          credentials: 'same-origin',
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setSessionState({
            kind: 'error',
            message: body?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        const sessions = (body.data?.sessions ?? []) as SaleSessionRow[];
        const selectedId = pickSelectedSession(sessions);
        setSessionState({ kind: 'ready', sessions, selectedId });
      } catch (err) {
        if (cancelled) return;
        setSessionState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch products + bookings whenever selectedId changes.
  const selectedId =
    sessionState.kind === 'ready' ? sessionState.selectedId : null;

  useEffect(() => {
    if (!selectedId) {
      setProductState({ kind: 'no-session' });
      setBookingState({ kind: 'no-session' });
      return;
    }

    let cancelled = false;
    setProductState({ kind: 'loading' });
    setBookingState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(
          `/api/sale/live-sessions/${encodeURIComponent(selectedId)}/broadcast-products`,
          { method: 'GET', credentials: 'same-origin' }
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setProductState({
            kind: 'error',
            message: body?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setProductState({
          kind: 'ready',
          liveSessionId: selectedId,
          products: (body.data?.products ?? []) as SaleBroadcastProductRow[],
          filteredInvalidCount:
            typeof body.data?.filteredInvalidCount === 'number'
              ? body.data.filteredInvalidCount
              : undefined,
        });
      } catch (err) {
        if (cancelled) return;
        setProductState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();

    (async () => {
      try {
        const res = await fetch(
          `/api/sale/bookings?liveSessionId=${encodeURIComponent(selectedId)}&limit=100`,
          { method: 'GET', credentials: 'same-origin' }
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setBookingState({
            kind: 'error',
            message: body?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setBookingState({
          kind: 'ready',
          liveSessionId: selectedId,
          bookings: (body.data?.bookings ?? []) as SaleBookingRow[],
        });
      } catch (err) {
        if (cancelled) return;
        setBookingState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, refetchToken]);

  /**
   * Apply local source filter to the booking queue. `'ALL'` returns the
   * raw fetch unchanged. Specific source value filters in memory. We do
   * this client-side because the existing GET endpoint scopes by
   * liveSessionId, not by source — but rows already carry `b.source` so
   * a JS filter is correct and cheap at expected admin volumes (< 200
   * rows per session per Phase 1).
   */
  const filteredBookingState: BookingState = useMemo(() => {
    if (bookingState.kind !== 'ready') return bookingState;
    if (sourceFilter === 'ALL') return bookingState;
    return {
      kind: 'ready',
      liveSessionId: bookingState.liveSessionId,
      bookings: bookingState.bookings.filter((b) => b.source === sourceFilter),
    };
  }, [bookingState, sourceFilter]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">ขายของไลฟ์สด</h1>
        <p className="text-sm text-muted-foreground">
          จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              ตัวกรองตามแหล่งที่มา
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              ช่องทางที่ขีดทับ = เร็ว ๆ นี้ (รอ inbound runtime)
            </p>
          </div>
          <SaleSourceFilterChips
            value={sourceFilter}
            onChange={setSourceFilter}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ErrorBoundarySection>
          <SaleSessionPickerPlaceholder state={sessionState} />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleProductGridPlaceholder state={productState} />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleBookingQueuePlaceholder
            state={filteredBookingState}
            onMutationSuccess={() => setRefetchToken((n) => n + 1)}
            onCustomerSelected={(customerId, customerNameHint) => {
              setSelectedCustomerId(customerId);
              setSelectedCustomerNameHint(customerNameHint);
            }}
            products={
              productState.kind === 'ready' ? productState.products : []
            }
          />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleCustomerPanelPlaceholder
            selectedCustomerId={selectedCustomerId}
            customerNameHint={selectedCustomerNameHint}
          />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleOrderConversionPlaceholder />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleInboxPlaceholder />
        </ErrorBoundarySection>
      </div>
    </div>
  );
}
