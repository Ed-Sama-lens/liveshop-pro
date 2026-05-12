'use client';

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Users, AlertTriangle, AlertOctagon, CheckCircle2, XCircle, ShoppingCart, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';
import { ConfirmBookingDialog } from './ConfirmBookingDialog';
import { CancelBookingDialog } from './CancelBookingDialog';
import { CreateOrderDialog } from './CreateOrderDialog';
import { ManualCreateBookingDialog } from './ManualCreateBookingDialog';
import type { SaleBroadcastProductRow } from './SaleProductGridPlaceholder';
import {
  isBookingConfirmable,
  isBookingCancellable,
  isBookingSelectable,
  isBookingSelectableInContext,
  deriveSelectionLock,
  type SaleReservationIntegrityLabel as HelperReservationIntegrityLabel,
  type SelectionLockContext,
} from './booking-queue.helpers';

export {
  isBookingConfirmable,
  isBookingCancellable,
  isBookingSelectable,
  isBookingSelectableInContext,
  deriveSelectionLock,
} from './booking-queue.helpers';

/**
 * Booking queue — wired to GET /api/sale/bookings (Commit 2S).
 *
 * In Commit 2O-a the Confirm action is enabled for PENDING_REVIEW rows
 * that have reservationIntegrity OK or NOT_APPLICABLE. MISSING /
 * MULTIPLE rows show an INTEGRITY badge and the Confirm button stays
 * disabled — admin cannot accidentally trigger an integrity-error
 * mutation. Cancel + Create Order remain disabled in this commit.
 */
// Re-export the integrity label type from the helper module so existing
// consumers can keep importing it from this file (no breaking change).
export type SaleReservationIntegrityLabel = HelperReservationIntegrityLabel;

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
  /**
   * Invoked when admin clicks a customer name in a booking row. Used
   * by SaleWorkspaceShell to thread the chosen customer into the
   * Customer Panel for live read-only display.
   *
   * Passing the row's full customer name as a hint lets the parent
   * show an instant label while the customer fetch is in flight.
   */
  readonly onCustomerSelected?: (
    customerId: string,
    customerNameHint: string
  ) => void;
  /**
   * BroadcastProduct rows for the currently selected live session,
   * threaded from `SaleWorkspaceShell.productState`. Consumed by
   * `ManualCreateBookingDialog` (Phase 3 skeleton) for client-side
   * product code filtering. Empty array is acceptable — the modal
   * surfaces an empty-state message.
   */
  readonly products?: readonly SaleBroadcastProductRow[];
}

// `isBookingConfirmable` lives in ./booking-queue.helpers.ts and is
// re-exported above for backward compatibility. See test coverage in
// tests/unit/components/sale/booking-queue.helpers.test.ts (20 cases).

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
  onCustomerSelected,
  products,
}: SaleBookingQueueProps) {
  const [confirmTarget, setConfirmTarget] = useState<SaleBookingRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaleBookingRow | null>(null);
  // 2O-c1: Create-Order selection state. Lives in this component only —
  // no shell prop drilling per Boss D1. Cleared whenever the booking
  // list changes (defensive: stale ids could carry across session
  // switch). Lock context is derived from selected rows; passing it
  // through `useMemo` keeps row render cheap.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  // 2O-c2: Create Order dialog open state. Only set true when user
  // clicks the Create Order button with ≥1 selected row.
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  // Phase 3 (2026-05-13): Manual Create dialog open state. Mounted
  // only when admin clicks the "+ สร้าง booking เอง" trigger. Phase 3
  // skeleton has submit DISABLED — no POST fires. Wiring activates in
  // Phase 4.
  const [manualCreateOpen, setManualCreateOpen] = useState(false);

  // SaleBookingRow doesn't carry liveSessionId (it lives once on the
  // parent state shape returned by GET /api/sale/bookings). Augment
  // each row with the session id when feeding the lock helpers so the
  // pure helper signature stays narrow and self-documenting.
  const liveSessionId = state.kind === 'ready' ? state.liveSessionId : null;

  const lockContext = useMemo<SelectionLockContext | null>(() => {
    if (state.kind !== 'ready' || liveSessionId === null) return null;
    if (selectedIds.size === 0) return null;
    const selectedRows = state.bookings
      .filter((b) => selectedIds.has(b.bookingId))
      .map((b) => ({ ...b, liveSessionId }));
    if (selectedRows.length === 0) return null;
    return deriveSelectionLock(selectedRows);
  }, [state, selectedIds, liveSessionId]);

  function toggleSelected(bookingId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set<string>());
  }

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

  const selectedCount = selectedIds.size;
  const subtitle = selectedCount > 0
    ? `${state.bookings.length} รายการ — เลือก ${selectedCount} (Create Order รอ 2O-c2)`
    : `${state.bookings.length} รายการ (ใหม่ → เก่า) — Confirm + Cancel + Select พร้อมใช้`;

  return (
    <SalePanelCard
      title="Customer Bookings / รายการจอง"
      subtitle={subtitle}
      icon={Users}
      variant="live"
    >
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {state.bookings.slice(0, 20).map((b) => {
          const badge = STATUS_BADGE[b.status];
          const integrityBadge = renderIntegrityBadge(b.reservationIntegrity);
          const confirmable = isBookingConfirmable(b);
          const cancellable = isBookingCancellable(b);
          const selectable = isBookingSelectable(b);
          const isSelected = selectedIds.has(b.bookingId);
          const selectableInContext =
            liveSessionId !== null
              ? isBookingSelectableInContext(
                  { ...b, liveSessionId },
                  lockContext
                )
              : false;
          // Show checkbox slot only for rows where status + integrity
          // allow selection. Disable when out-of-context (different
          // customer or session) unless already selected.
          const showCheckbox = selectable;
          const checkboxDisabled = !isSelected && !selectableInContext;
          // While selected for Create Order, Cancel must NOT fire (it
          // would release stock under a row admin chose to convert).
          // Re-enable Cancel by unselecting.
          const cancelDisabled = isSelected;
          return (
            <div
              key={b.bookingId}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                {showCheckbox ? (
                  <Checkbox
                    checked={isSelected}
                    disabled={checkboxDisabled}
                    onCheckedChange={() => toggleSelected(b.bookingId)}
                    aria-label={`เลือก booking ${b.displayCode ?? b.bookingId.slice(0, 8)} สำหรับ Create Order`}
                    title={
                      checkboxDisabled
                        ? 'เลือกได้เฉพาะลูกค้าและรอบไลฟ์เดียวกัน'
                        : undefined
                    }
                  />
                ) : (
                  <span className="inline-block w-4" aria-hidden />
                )}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {b.displayCode ?? '?'}
                </span>
                {onCustomerSelected ? (
                  <button
                    type="button"
                    className="truncate text-left underline-offset-2 hover:underline focus-visible:underline"
                    onClick={() =>
                      onCustomerSelected(b.customerId, b.customerName)
                    }
                    title="คลิกเพื่อดูข้อมูลลูกค้า"
                  >
                    {b.customerName}
                  </button>
                ) : (
                  <span className="truncate">{b.customerName}</span>
                )}
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
                {cancellable ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 gap-1 px-2 text-[10px]"
                    disabled={cancelDisabled}
                    title={cancelDisabled ? 'ยกเลิกเลือกก่อนถึงจะ Cancel ได้' : undefined}
                    onClick={() => setCancelTarget(b)}
                  >
                    <XCircle className="size-3" aria-hidden />
                    Cancel
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

      {/*
        Create Order strip (Commit 2O-c1)
        - Always rendered when ≥1 booking shown so admin can preview the
          flow even before selecting anything.
        - selectedIds.size === 0: button disabled with placeholder copy.
        - selectedIds.size ≥ 1: button enabled but DOES NOT POST. Click
          fires a sonner toast confirming the selection shape and
          announces 2O-c2 wiring is pending. No fetch, no router push,
          no mutation. This is the "non-mutating placeholder" path Boss
          approved in the 2O-c1 spec.

        Manual Create trigger row (Phase 3 2026-05-13)
        - Single "+ สร้าง booking เอง" button beneath the Create Order
          strip. Opens ManualCreateBookingDialog. Phase 3 skeleton has
          submit DISABLED — no POST fires.
      */}
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium">
            Create Order: <span className="font-mono">{selectedIds.size}</span> รายการที่เลือก
          </span>
          {selectedIds.size > 0 ? (
            <button
              type="button"
              className="text-[11px] underline-offset-2 hover:underline text-muted-foreground"
              onClick={clearSelection}
            >
              ล้างการเลือก
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={selectedIds.size > 0 ? 'default' : 'outline'}
            className="flex-1 gap-1"
            disabled={selectedIds.size === 0}
            onClick={() => {
              // 2O-c2: open Create Order dialog. The dialog handles
              // POST /api/sale/orders/from-bookings + success/error
              // path + parent refetch via onMutationSuccess.
              setCreateOrderOpen(true);
            }}
          >
            <ShoppingCart className="size-3.5" aria-hidden />
            สร้างออเดอร์ ({selectedIds.size})
          </Button>
          <Button variant="outline" size="sm" disabled className="flex-1">
            Bulk Confirm — ปิดเฟสนี้
          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full gap-1"
          onClick={() => setManualCreateOpen(true)}
        >
          <Plus className="size-3.5" aria-hidden />
          สร้าง booking เอง (Manual Create — Phase 3 preview)
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

      {cancelTarget ? (
        <CancelBookingDialog
          open={cancelTarget !== null}
          onOpenChange={(next) => {
            if (!next) setCancelTarget(null);
          }}
          bookingId={cancelTarget.bookingId}
          customerName={cancelTarget.customerName}
          displayCode={cancelTarget.displayCode}
          quantity={cancelTarget.quantity}
          unitPrice={cancelTarget.unitPrice}
          activeReservationId={cancelTarget.activeReservationId}
          onSuccess={() => {
            setCancelTarget(null);
            onMutationSuccess?.();
          }}
        />
      ) : null}

      {/*
        Create Order dialog (Commit 2O-c2). Mounted only when admin
        clicks the Create Order button with ≥1 selection AND we have
        a valid lock context (which is guaranteed by the button's
        disabled state — defensive guard anyway). selectedRows is
        derived inline from selectedIds + state.bookings so the dialog
        receives full booking data without doing its own lookup.
      */}
      {createOrderOpen && lockContext !== null ? (
        <CreateOrderDialog
          open={createOrderOpen}
          onOpenChange={(next) => {
            if (!next) setCreateOrderOpen(false);
          }}
          selectedRows={state.bookings.filter((b) => selectedIds.has(b.bookingId))}
          customerId={lockContext.customerId}
          liveSessionId={lockContext.liveSessionId}
          onSuccess={() => {
            setCreateOrderOpen(false);
            clearSelection();
            onMutationSuccess?.();
          }}
        />
      ) : null}

      {/*
        Manual Create dialog (Phase 3 skeleton 2026-05-13). Mounted
        only when admin clicks the "+ สร้าง booking เอง" trigger AND a
        live session is selected. Submit DISABLED in Phase 3 — no POST.
        Phase 4 enables submit + adds error mapping + parent refetch.
      */}
      {manualCreateOpen ? (
        <ManualCreateBookingDialog
          open={manualCreateOpen}
          onOpenChange={(next) => {
            if (!next) setManualCreateOpen(false);
          }}
          liveSessionId={state.liveSessionId}
          products={products ?? []}
          onSuccess={() => {
            // Reserved for Phase 4. Skeleton submit never invokes this
            // (button is disabled). Wired now to avoid a Phase 4 prop
            // edit on the placeholder.
            setManualCreateOpen(false);
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
