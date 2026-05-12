'use client';

import { useEffect, useState } from 'react';
import { Construction } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Live Sale / ขายผ่านไลฟ์</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์
        </p>
      </header>

      <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Construction
            className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              ระยะทดสอบ: Confirm + Cancel + Create Order ใช้งานแล้ว — Manual Create ยังปิดอยู่
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
              3 mutations wired: Confirm + Cancel (per-row, modal) + Create Order
              (multi-select, modal). MISSING/MULTIPLE integrity rows block all 3 mutations.
              Manual Create modal + Bulk actions remain disabled until separate
              Boss/ChatGPT approval. No customer-facing message sent.
            </p>
          </div>
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
            state={bookingState}
            onMutationSuccess={() => setRefetchToken((n) => n + 1)}
            onCustomerSelected={(customerId, customerNameHint) => {
              setSelectedCustomerId(customerId);
              setSelectedCustomerNameHint(customerNameHint);
            }}
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
