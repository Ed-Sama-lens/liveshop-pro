'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Users, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';
import { ConfirmBookingDialog } from './ConfirmBookingDialog';

/**
 * Booking queue — wired to GET /api/sale/bookings (Commit 2S).
 *
 * In Commit 2O-a the Confirm action is enabled for PENDING_REVIEW rows
 * that have reservationIntegrity OK or NOT_APPLICABLE. MISSING /
 * MULTIPLE rows show an INTEGRITY badge and the Confirm button stays
 * disabled — admin cannot accidentally trigger an integrity-error
 * mutation. Cancel + Create Order remain disabled in this commit.
 */
export type SaleReservationIntegrityLabel =
  | 'OK'
  | 'MISSING'
  | 'MULTIPLE'
  | 'NOT_APPLICABLE';

export interface SaleBookingRow {
  readonly bookingId: string;
  readonly status:
    | 'PENDING_REVIEW'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'CONVERTED_TO_ORDER';
  readonly source: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly broadcastProductId: string;
  readonly displayCode: string | null;
  readonly productName: string | null;
  readonly variantId: string | null;
  readonly variantName: string | null;
  readonly sku: string | null;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
  readonly cancelledAt: string | null;
  readonly convertedOrderId: string | null;
  readonly activeReservationId: string | null;
  /** Added in Commit 2T API response. Older API versions return undefined. */
  readonly activeReservationCount?: number;
  /** Added in Commit 2T API response. Older API versions return undefined. */
  readonly reservationIntegrity?: SaleReservationIntegrityLabel;
  readonly idempotencyKey: string | null;
}

export interface SaleBookingQueueProps {
  readonly state:
    | { readonly kind: 'no-session' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly message: string }
    | {
        readonly kind: 'ready';
        readonly liveSessionId: string;
        readonly bookings: readonly SaleBookingRow[];
      };
  /**
   * Invoked after a successful Confirm mutation so the parent can
   * trigger a refetch of bookings + product grid (stock counts shift
   * on confirm via reservedQty++). Caller is expected to bump a
   * refetch token in state.
   */
  readonly onMutationSuccess?: () => void;
}

/**
 * Pure: is a booking eligible for the Confirm action (Commit 2O-a)?
 *
 * Eligibility rules:
 * - status must be PENDING_REVIEW (no re-confirm of CONFIRMED;
 *   /api/sale/bookings/[id]/confirm is idempotent but UI does not
 *   expose the no-op path).
 * - reservationIntegrity must be OK or NOT_APPLICABLE when present.
 *   MISSING / MULTIPLE rows block — admin must inspect data corruption
 *   via internal tooling before any mutation.
 * - When the field is undefined (pre-2T API response), allow Confirm
 *   on PENDING_REVIEW to preserve degraded-but-functional behavior.
 */
export function isBookingConfirmable(b: SaleBookingRow): boolean {
  if (b.status !== 'PENDING_REVIEW') return false;
  const integrity = b.reservationIntegrity;
  if (integrity === 'MISSING' || integrity === 'MULTIPLE') return false;
  return true;
}

const STATUS_BADGE: Record<
  SaleBookingRow['status'],
  { label: string; className: string }
> = {
  PENDING_REVIEW: {
    label: 'PENDING',
    className:
      'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100',
  },
  CONFIRMED: {
    label: 'CONFIRMED',
    className:
      'bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100',
  },
  CONVERTED_TO_ORDER: {
    label: 'CONVERTED',
    className:
      'bg-blue-100 text-blue-900 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-100',
  },
  CANCELLED: {
    label: 'CANCELLED',
    className: 'bg-muted text-muted-foreground line-through',
  },
  EXPIRED: {
    label: 'EXPIRED',
    className: 'bg-muted text-muted-foreground',
  },
};

export function SaleBookingQueuePlaceholder({
  state,
  onMutationSuccess,
}: SaleBookingQueueProps) {
  const [confirmTarget, setConfirmTarget] = useState<SaleBookingRow | null>(null);

  if (state.kind === 'no-session') {
    return (
      <SalePanelCard
        title="Customer Bookings / รายการจอง"
        subtitle="เลือกรอบไลฟ์ก่อนเพื่อดูรายการจอง"
        icon={Users}
        variant="placeholder"
      >
        <p className="text-sm text-muted-foreground">รอเลือกรอบไลฟ์</p>
      </SalePanelCard>
    );
  }

  if (state.kind === 'loading') {
    return (
      <SalePanelCard
        title="Customer Bookings / รายการจอง"
        subtitle="กำลังโหลดรายการจอง"
        icon={Users}
        variant="live"
      >
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </SalePanelCard>
    );
  }

  if (state.kind === 'error') {
    return (
      <SalePanelCard
        title="Customer Bookings / รายการจอง"
        subtitle="โหลดข้อมูลไม่สำเร็จ"
        icon={Users}
        variant="live"
      >
        <p className="text-sm text-destructive">{state.message}</p>
      </SalePanelCard>
    );
  }

  if (state.bookings.length === 0) {
    return (
      <SalePanelCard
        title="Customer Bookings / รายการจอง"
        subtitle="ยังไม่มีรายการจองในรอบไลฟ์นี้"
        icon={Users}
        variant="live"
      >
        <p className="text-sm text-muted-foreground">
          ยังไม่มีลูกค้าจองในรอบนี้ — เริ่มจองจาก inbox/comment เมื่อพร้อม
        </p>
      </SalePanelCard>
    );
  }

  return (
    <SalePanelCard
      title="Customer Bookings / รายการจอง"
      subtitle={`${state.bookings.length} รายการ (ใหม่ → เก่า) — Confirm พร้อมใช้`}
      icon={Users}
      variant="live"
    >
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {state.bookings.slice(0, 20).map((b) => {
          const badge = STATUS_BADGE[b.status];
          const integrityBadge = renderIntegrityBadge(b.reservationIntegrity);
          const confirmable = isBookingConfirmable(b);
          return (
            <div
              key={b.bookingId}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {b.displayCode ?? '?'}
                </span>
                <span className="truncate">{b.customerName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px]">×{b.quantity}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  RM{b.unitPrice}
                </span>
                {integrityBadge}
                <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
                {confirmable ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => setConfirmTarget(b)}
                  >
                    <CheckCircle2 className="size-3" aria-hidden />
                    Confirm
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {state.bookings.length > 20 ? (
        <p className="text-[11px] text-muted-foreground">
          แสดง 20 จาก {state.bookings.length} รายการ
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled className="flex-1">
          Cancel / ยกเลิก — ยังไม่เปิดใช้งาน
        </Button>
        <Button variant="outline" size="sm" disabled className="flex-1">
          Bulk Confirm — ปิดเฟสนี้
        </Button>
      </div>

      {confirmTarget ? (
        <ConfirmBookingDialog
          open={confirmTarget !== null}
          onOpenChange={(next) => {
            if (!next) setConfirmTarget(null);
          }}
          bookingId={confirmTarget.bookingId}
          customerName={confirmTarget.customerName}
          displayCode={confirmTarget.displayCode}
          quantity={confirmTarget.quantity}
          unitPrice={confirmTarget.unitPrice}
          onSuccess={() => {
            setConfirmTarget(null);
            onMutationSuccess?.();
          }}
        />
      ) : null}
    </SalePanelCard>
  );
}

/**
 * Pure: render a small integrity badge next to a booking row when the
 * GET /api/sale/bookings response flags reservation corruption.
 *
 * Boss spec (Commit 2U):
 * - OK / NOT_APPLICABLE  → no badge (return null)
 * - MISSING              → amber warning icon + 'INTEGRITY' label
 * - MULTIPLE             → red warning icon + 'INTEGRITY' label
 *
 * Internal IDs are deliberately NOT shown — admin sees only that the
 * row has an integrity issue. The future Confirm wiring (2O-a) will
 * disable mutation on MISSING/MULTIPLE rows; for 2U the buttons remain
 * disabled by default so no row-level gating is required yet.
 *
 * Older API responses (pre-2T) may omit `reservationIntegrity`; the
 * helper returns null in that case so degraded payloads still render.
 */
function renderIntegrityBadge(
  integrity: SaleBookingRow['reservationIntegrity']
): ReactElement | null {
  if (!integrity || integrity === 'OK' || integrity === 'NOT_APPLICABLE') {
    return null;
  }
  if (integrity === 'MISSING') {
    return (
      <Badge
        className="gap-0.5 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 text-[10px]"
        title="Reservation MISSING — booking marked CONFIRMED but no active stock reservation"
      >
        <AlertTriangle className="size-2.5" aria-hidden />
        INTEGRITY
      </Badge>
    );
  }
  // MULTIPLE
  return (
    <Badge
      className="gap-0.5 bg-red-100 text-red-900 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-100 text-[10px]"
      title="Reservation MULTIPLE — more than one active stock reservation"
    >
      <AlertOctagon className="size-2.5" aria-hidden />
      INTEGRITY
    </Badge>
  );
}
