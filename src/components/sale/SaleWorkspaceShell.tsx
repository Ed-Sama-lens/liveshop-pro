'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Radio, Settings2, Calendar as CalendarIcon } from 'lucide-react';
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
import { SaleSummaryPanel } from './SaleSummaryPanel';
import {
  SaleSourceFilterChips,
  type SourceFilterValue,
} from './SaleSourceFilterChips';
import { DEFAULT_SHOP_TIMEZONE, todaySaleDate } from '@/lib/sale/sale-date';

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
      // Tier 3.9-B-Fix-2 — `liveSessionId` is optional event context
      // (nullable). Date-first model treats LiveSession as optional
      // channel, not parent. Downstream dialogs (Manual Create /
      // AddFromStock) must handle null and dispatch by BP.liveSessionId.
      liveSessionId: string | null;
      saleDate: string;
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
   * Tier 3.9 — Sale Date is the primary grouping context for product
   * codes. Defaults to today in shop timezone. Boss can switch dates
   * to view a different selling day. LiveSession is now optional
   * event-context, not the parent of product codes.
   *
   * Shop timezone defaults to Asia/Kuala_Lumpur per D-Date-2.
   * Future: read shop.timezone via /api/sale/shop-context.
   */
  const [selectedSaleDate, setSelectedSaleDate] = useState<string>(() =>
    todaySaleDate(DEFAULT_SHOP_TIMEZONE)
  );
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

  // Tier 3.9 — selected live session is now an OPTIONAL event filter,
  // not the universal parent. Product fetches key off `selectedSaleDate`
  // (date-first). Booking fetch still keys off liveSessionId for now
  // because /api/sale/bookings filters by liveSessionId; date-aware
  // booking fetch is deferred to a follow-up after parser runtime lands.
  const selectedId =
    sessionState.kind === 'ready' ? sessionState.selectedId : null;

  // Product Codes — fetch by sale date using new unified endpoint.
  // /api/sale/broadcast-products?saleDate=YYYY-MM-DD returns evergreen
  // + live-bound rows matching that calendar day. Pre-3.9 endpoint
  // /api/sale/live-sessions/[id]/broadcast-products is no longer used
  // by /sale UI but kept available for legacy callers.
  useEffect(() => {
    if (!selectedSaleDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on date clear; legitimate panel-reset pattern
      setProductState({ kind: 'no-session' });
      return;
    }
    let cancelled = false;
    setProductState({ kind: 'loading' });
    (async () => {
      try {
        const url = `/api/sale/broadcast-products?scope=all&saleDate=${encodeURIComponent(selectedSaleDate)}&limit=200`;
        const res = await fetch(url, { method: 'GET', credentials: 'same-origin' });
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
          saleDate: selectedSaleDate,
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
    return () => {
      cancelled = true;
    };
  }, [selectedSaleDate, selectedId, refetchToken]);

  // Tier 3.9-B-Fix-2 — Booking queue fetches by saleDate (date-first).
  // Route accepts liveSessionId OR saleDate. We always pass saleDate;
  // if Boss explicitly wants session-only filter later, add a UI toggle.
  // Joins BP.saleDate server-side. Booking without BP cannot exist
  // (schema FK required), so all bookings show under their BP's date.
  useEffect(() => {
    if (!selectedSaleDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on no-date; legitimate panel-reset pattern
      setBookingState({ kind: 'no-session' });
      return;
    }
    let cancelled = false;
    setBookingState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch(
          `/api/sale/bookings?saleDate=${encodeURIComponent(selectedSaleDate)}&limit=100`,
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
          liveSessionId: selectedId ?? '',
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
  }, [selectedSaleDate, selectedId, refetchToken]);

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

  /**
   * Render priority (Tier 1.5 unified workspace, Boss 2026-05-17 spec):
   * 1. Header — title + omnichannel subtitle + admin escape link to /live-selling
   * 2. Source filter card — chips for context
   * 3. Primary row — Product Codes + Booking Queue (the two surfaces an
   *    operator touches most often during a sale)
   * 4. Secondary row — Customer + Order Conversion (per-row context)
   * 5. Tertiary row — Live Sessions picker + Inbox placeholder (context
   *    and coming-soon)
   *
   * Previous layout was a 6-card grid with all panels weighted equally,
   * which buried the primary work (products + bookings) under context
   * panels. New three-row hierarchy follows operator workflow:
   * "pick what to sell → take a booking → close the customer/order".
   */
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">ขายของไลฟ์สด</h1>
          <p className="text-sm text-muted-foreground">
            จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tier 3.9 — Sale Date picker. Primary grouping context.
              Defaults to today in shop timezone (Asia/Kuala_Lumpur).
              Switching date refetches product codes for that day. */}
          <label
            htmlFor="sale-date-picker"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs"
            title="วันที่ขาย / Sale Date — รหัสสินค้าจะแสดงตามวันที่ที่เลือก"
          >
            <CalendarIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">วันที่ขาย</span>
            <input
              id="sale-date-picker"
              type="date"
              value={selectedSaleDate}
              onChange={(e) => setSelectedSaleDate(e.target.value)}
              className="border-0 bg-transparent p-0 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="เลือกวันที่ขาย"
            />
          </label>
          <Link
            href="/live-selling"
            title="จัดการรอบไลฟ์ (สร้าง / แก้ไข / ปิดรอบ)"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings2 className="size-3.5" aria-hidden />
            จัดการรอบไลฟ์
          </Link>
        </div>
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

      {/* Tier 3.9-G6 — Daily summary strip.
          Compact read-only health panel above the primary work surface so
          admin can glance at today's booking + order + stock totals
          without manual counting. */}
      <ErrorBoundarySection>
        <SaleSummaryPanel
          saleDate={selectedSaleDate}
          refetchToken={refetchToken}
        />
      </ErrorBoundarySection>

      {/* Primary work surface — products + bookings.
          Operators spend the most time here during a live sale, so these
          two panels get the full row width on large screens. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ErrorBoundarySection>
          <SaleProductGridPlaceholder
            state={productState}
            onProductsChanged={() => setRefetchToken((n) => n + 1)}
          />
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
      </div>

      {/* Secondary surface — customer detail + order conversion.
          These follow per-booking interactions; mid-priority. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ErrorBoundarySection>
          <SaleCustomerPanelPlaceholder
            selectedCustomerId={selectedCustomerId}
            customerNameHint={selectedCustomerNameHint}
          />
        </ErrorBoundarySection>
        <ErrorBoundarySection>
          <SaleOrderConversionPlaceholder />
        </ErrorBoundarySection>
      </div>

      {/* Tertiary surface — live session context + inbox.
          Live session is now a context filter, not the universal root.
          Inbox is coming-soon. Both collapse to the bottom so the page
          stays useful when no live session is selected. */}
      <details className="rounded-md border border-border">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40">
          <Radio className="size-3.5" aria-hidden />
          บริบทเพิ่มเติม — รอบไลฟ์ปัจจุบัน + ช่องทางที่กำลังมา (Inbox / Messenger / Telegram / WhatsApp)
        </summary>
        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
          <ErrorBoundarySection>
            <SaleSessionPickerPlaceholder state={sessionState} />
          </ErrorBoundarySection>
          <ErrorBoundarySection>
            <SaleInboxPlaceholder />
          </ErrorBoundarySection>
        </div>
      </details>
    </div>
  );
}
