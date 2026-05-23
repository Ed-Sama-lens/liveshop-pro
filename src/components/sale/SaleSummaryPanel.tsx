'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SalePanelCard } from './SalePanelCard';
import {
  countLowStockItems,
  countOutOfStockItems,
  hasOrderTouchDelta,
  formatGross,
  isYyyyMmDd,
  sumBookingsByStatus,
  type SummaryFetchState,
  type SummaryApiEnvelope,
} from './sale-summary-panel.helpers';

/**
 * Compact "สรุปวันนี้" panel for the `/sale` workspace.
 *
 * Tier 3.9-G6 (2026-05-23). Read-only consumer of `GET /api/sale/summary?saleDate=...`.
 * No mutation. No PII. Refetches when `saleDate` changes.
 *
 * Mirrors the existing `SalePanelCard` layout used by sibling panels.
 */

export interface SaleSummaryPanelProps {
  /** Selected saleDate in YYYY-MM-DD. Null = panel shows idle state. */
  readonly saleDate: string | null;
  /**
   * Refetch token bumped by parent on mutations. Causes the panel to
   * pull fresh totals after a booking confirm / cancel / order create.
   */
  readonly refetchToken?: number;
}

export function SaleSummaryPanel({
  saleDate,
  refetchToken = 0,
}: SaleSummaryPanelProps) {
  const [state, setState] = useState<SummaryFetchState>({ kind: 'idle' });

  const fetchSummary = useCallback(
    async (date: string, signal: AbortSignal) => {
      setState({ kind: 'loading', saleDate: date });
      try {
        const res = await fetch(
          `/api/sale/summary?saleDate=${encodeURIComponent(date)}`,
          { credentials: 'same-origin', signal }
        );
        const body = (await res.json()) as SummaryApiEnvelope;
        if (signal.aborted) return;
        if (!res.ok || !body.success || !body.data) {
          setState({
            kind: 'error',
            saleDate: date,
            message: body.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setState({ kind: 'ready', saleDate: date, result: body.data });
      } catch (err) {
        if (signal.aborted) return;
        setState({
          kind: 'error',
          saleDate: date,
          message: err instanceof Error ? err.message : 'Network error',
        });
      }
    },
    []
  );

  useEffect(() => {
    if (saleDate === null || !isYyyyMmDd(saleDate)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to idle on null/invalid saleDate; one-shot
      setState({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    fetchSummary(saleDate, controller.signal);
    return () => controller.abort();
  }, [saleDate, refetchToken, fetchSummary]);

  return (
    <SalePanelCard
      title="สรุปวันนี้ / Today's Sale Summary"
      subtitle={
        saleDate === null
          ? 'เลือกวันที่ขายเพื่อดูสรุป'
          : `ข้อมูลของวันที่ ${saleDate}`
      }
      icon={BarChart3}
      variant="live"
    >
      {renderBody(state)}
    </SalePanelCard>
  );
}

function renderBody(state: SummaryFetchState) {
  if (state.kind === 'idle') {
    return (
      <p className="text-xs text-muted-foreground">
        ยังไม่ได้เลือกวันที่ขาย
      </p>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div
        className="flex items-center gap-2 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
        กำลังโหลดสรุปของวันที่ {state.saleDate}...
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        โหลดสรุปไม่สำเร็จ: {state.message}
      </div>
    );
  }

  // Ready
  const { items, totals } = state.result;
  const lowStock = countLowStockItems(items);
  const outOfStock = countOutOfStockItems(items);
  const showTouchDelta = hasOrderTouchDelta(totals);

  if (totals.broadcastProductCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        ยังไม่มีรหัสสินค้าในวันที่ขายนี้
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bookings strip */}
      <div className="grid grid-cols-5 gap-2 text-xs">
        <Metric label="ทั้งหมด" value={totals.totalBookings} />
        <Metric
          label="รอตรวจ"
          value={sumBookingsByStatus(items, 'pendingReview')}
          tone="warn"
        />
        <Metric
          label="ยืนยัน"
          value={sumBookingsByStatus(items, 'confirmed')}
          tone="ok"
        />
        <Metric
          label="ยกเลิก"
          value={sumBookingsByStatus(items, 'cancelled')}
          tone="muted"
        />
        <Metric
          label="ส่งออเดอร์"
          value={sumBookingsByStatus(items, 'convertedToOrder')}
          tone="muted"
        />
      </div>

      {/* Orders + revenue strip */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Metric label="ออเดอร์" value={totals.totalOrders} tone="ok" />
        <Metric
          label="จำนวนชิ้นที่ขายได้"
          value={totals.totalOrderedQuantity}
        />
        <Metric label="ยอดรวม" value={formatGross(totals.totalGross)} />
      </div>

      {/* Stock health + auxiliary chips */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-[11px]">
          รหัสสินค้า {totals.broadcastProductCount}
        </Badge>
        {lowStock > 0 ? (
          <Badge
            variant="outline"
            className="border-amber-500/60 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300"
          >
            สต๊อกใกล้หมด {lowStock}
          </Badge>
        ) : null}
        {outOfStock > 0 ? (
          <Badge
            variant="outline"
            className="border-destructive/60 bg-destructive/10 text-[11px] text-destructive"
          >
            สต๊อกหมด {outOfStock}
          </Badge>
        ) : null}
        {showTouchDelta ? (
          <Badge
            variant="outline"
            className="text-[10px] text-muted-foreground"
            title="ออเดอร์เดียวที่ครอบหลายรหัสจะนับ 1 ใน 'ออเดอร์' และนับซ้ำใน touches"
          >
            order touches {totals.totalOrderTouches}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  readonly label: string;
  readonly value: number | string;
  readonly tone?: 'default' | 'ok' | 'warn' | 'muted';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';
  return (
    <div className="rounded-md border border-border/60 bg-card/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

