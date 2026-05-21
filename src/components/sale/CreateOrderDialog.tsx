'use client';

import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { SaleBookingRow } from './SaleBookingQueuePlaceholder';

/**
 * Create Order modal — third /sale mutation surface (Commit 2O-c2).
 *
 * Fires POST /api/sale/orders/from-bookings against the existing route
 * shipped in Commit 2I (rate-limited via 2N-HARDENING; now 60/15min
 * per IP after Boss RATE_LIMIT_MAX=60 redeploy). Hard scope:
 * - All bookings in `selectedRows` must share customerId + liveSessionId
 *   (caller guarantees via the selection lock in SaleBookingQueue).
 * - Each row must be eligible (caller enforces via isBookingSelectable
 *   + isBookingSelectableInContext; helper rules in
 *   src/components/sale/booking-queue.helpers.ts).
 * - No batch convert across customers or sessions.
 * - Modal confirmation required before request fires.
 * - Inline error rendering keeps the modal open on failure; selection
 *   preserved so admin can retry without re-ticking checkboxes.
 * - 429-aware: shows Retry-After when server returns it.
 * - On success: closes modal + invokes onSuccess() so caller can clear
 *   selection + refetch product grid + booking queue.
 *
 * Error mapping (Boss 2O-c2 spec):
 *   401 → "ต้อง sign-in ก่อน"
 *   403 → "ไม่มีสิทธิ์สร้างออเดอร์"
 *   400 → "ข้อมูลไม่ถูกต้อง / กรุณาตรวจรายการที่เลือก"
 *   409 → "สร้างออเดอร์ไม่ได้ / booking บางรายการอาจถูกเปลี่ยนสถานะแล้ว ..."
 *   422 → "ข้อมูล booking ไม่ครบ"
 *   429 → "ส่งคำสั่งถี่เกินไป / กรุณารอประมาณ {Retry-After} วินาที..."
 *   500 → "เซิร์ฟเวอร์มีปัญหา / กรุณาแจ้ง admin ..."
 *   other → server message or generic fallback
 *
 * No customer-facing messages. No payment mark. No shipment. No
 * platform integration. No auto-send.
 */
export interface CreateOrderDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Tier 3.9-B-Fix-6 — All rows must share customerId. liveSessionId
   * lock relaxed: rows can be evergreen (null) as long as they belong
   * to same customer. UI passes null liveSessionId for V2 conversion
   * path (route `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`).
   */
  readonly selectedRows: readonly SaleBookingRow[];
  readonly customerId: string;
  readonly liveSessionId: string | null;
  readonly onSuccess: () => void;
}

interface InlineError {
  readonly title: string;
  readonly detail: string;
}

function mapErrorByStatus(
  status: number,
  body: { error?: string } | null,
  retryAfter: string | null
): InlineError {
  if (status === 401) {
    return {
      title: 'ต้อง sign-in ก่อน',
      detail: body?.error ?? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    };
  }
  if (status === 403) {
    return {
      title: 'ไม่มีสิทธิ์สร้างออเดอร์',
      detail: body?.error ?? 'บัญชีนี้ห้ามสร้างออเดอร์ (เฉพาะ OWNER/MANAGER)',
    };
  }
  if (status === 400) {
    return {
      title: 'ข้อมูลไม่ถูกต้อง',
      detail: body?.error ?? 'กรุณาตรวจรายการที่เลือก',
    };
  }
  if (status === 409) {
    return {
      title: 'สร้างออเดอร์ไม่ได้',
      detail:
        body?.error ??
        'booking บางรายการอาจถูกเปลี่ยนสถานะแล้ว กรุณาโหลดข้อมูลใหม่',
    };
  }
  if (status === 422) {
    return {
      title: 'ข้อมูล booking ไม่ครบ',
      detail: body?.error ?? 'รายการ booking ขาดข้อมูลที่จำเป็น',
    };
  }
  if (status === 429) {
    const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
    const wait = Number.isFinite(seconds) && seconds > 0
      ? `ประมาณ ${seconds} วินาที`
      : 'สักครู่';
    return {
      title: 'ส่งคำสั่งถี่เกินไป',
      detail: `กรุณารอ${wait}แล้วลองใหม่อีกครั้ง`,
    };
  }
  if (status === 500) {
    return {
      title: 'เซิร์ฟเวอร์มีปัญหา',
      detail: body?.error ?? 'กรุณาแจ้ง admin ตรวจสอบข้อมูล',
    };
  }
  return {
    title: 'สร้างออเดอร์ไม่สำเร็จ',
    detail: body?.error ?? `HTTP ${status}`,
  };
}

/**
 * Pure: compute display-only grand total for the summary table.
 *
 * Server is authoritative — this value is for admin preview only.
 * Uses `Number()` parse on the Decimal-as-string unitPrice; safe within
 * Number precision for realistic order sizes per project convention.
 * Returns fixed-2-decimal string ("RM0.00" fallback on overflow/NaN).
 */
function previewGrandTotal(rows: readonly SaleBookingRow[]): string {
  let totalCents = 0;
  for (const r of rows) {
    const n = Number(r.unitPrice);
    if (!Number.isFinite(n)) continue;
    totalCents += Math.round(n * 100) * r.quantity;
  }
  if (!Number.isFinite(totalCents)) return '0.00';
  const sign = totalCents < 0 ? '-' : '';
  const abs = Math.abs(totalCents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, '0')}`;
}

function previewLineTotal(unitPrice: string, quantity: number): string {
  const n = Number(unitPrice);
  if (!Number.isFinite(n)) return '0.00';
  return (n * quantity).toFixed(2);
}

export function CreateOrderDialog({
  open,
  onOpenChange,
  selectedRows,
  customerId,
  liveSessionId,
  onSuccess,
}: CreateOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

  const count = selectedRows.length;
  // All rows share customerName by caller invariant (same customerId).
  // Pull from first row defensively; render '—' on empty (shouldn't happen
  // — Create Order button only opens dialog when count ≥ 1).
  const customerName = selectedRows[0]?.customerName ?? '—';
  const grandTotal = previewGrandTotal(selectedRows);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return; // block close mid-request
    if (!next) setInlineError(null);
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (count === 0) return;
    setInlineError(null);
    setIsSubmitting(true);
    try {
      const bookingIds = selectedRows.map((b) => b.bookingId);
      // Tier 3.9-B-Fix-6 — Dispatch by liveSessionId:
      //   - non-null → V1 legacy path (liveSessionId + customerId + bookingIds)
      //   - null → V2 bookingIds-only (requires ALLOW_BOOKINGIDS_ONLY_CONVERSION=true)
      const requestBody: Record<string, unknown> =
        liveSessionId !== null
          ? { liveSessionId, customerId, bookingIds }
          : { bookingIds };
      const res = await fetch('/api/sale/orders/from-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestBody),
      });

      const retryAfter = res.headers.get('Retry-After');
      type CreateOrderResponseBody = {
        success?: boolean;
        error?: string;
        data?: {
          orderId?: string;
          orderNumber?: string;
          idempotent?: boolean;
          bookingCount?: number;
          totalAmount?: string;
        };
      };
      let body: CreateOrderResponseBody | null = null;
      try {
        body = (await res.json()) as CreateOrderResponseBody;
      } catch {
        body = null;
      }

      if (!res.ok || body?.success !== true) {
        setInlineError(mapErrorByStatus(res.status, body, retryAfter));
        return;
      }

      const orderNumber = body?.data?.orderNumber ?? '?';
      const idempotent = body?.data?.idempotent === true;
      const verb = idempotent ? 'ออเดอร์อยู่แล้ว' : 'สร้างออเดอร์สำเร็จ';
      toast.success(`${verb} — Order #${orderNumber}`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setInlineError({
        title: 'การเชื่อมต่อขัดข้อง',
        detail: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>สร้างออเดอร์จากรายการจอง</DialogTitle>
          <DialogDescription>
            รวม <strong>{count}</strong> รายการที่เลือกเป็น Order เดียว.
            booking ที่เลือกจะถูกเปลี่ยนสถานะเป็น <code>CONVERTED_TO_ORDER</code>.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-muted-foreground">ลูกค้า</dt>
          <dd className="text-right truncate">{customerName}</dd>
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="text-right font-mono">{customerId.slice(0, 12)}…</dd>
          <dt className="text-muted-foreground">Session</dt>
          <dd className="text-right font-mono">{liveSessionId !== null ? `${liveSessionId.slice(0, 12)}…` : '— (evergreen)'}</dd>
        </dl>

        <div className="rounded-md border border-border">
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Code</th>
                  <th className="px-2 py-1 text-left">Item</th>
                  <th className="px-2 py-1 text-right">Qty</th>
                  <th className="px-2 py-1 text-right">Unit</th>
                  <th className="px-2 py-1 text-right">Line</th>
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((r) => (
                  <tr key={r.bookingId} className="border-t border-border">
                    <td className="px-2 py-1 font-mono text-[10px]">
                      {r.displayCode ?? '?'}
                    </td>
                    <td className="px-2 py-1 truncate">
                      {r.productName ?? r.bookingId.slice(0, 8)}
                      {r.variantName ? (
                        <span className="ml-1 text-muted-foreground">
                          ({r.variantName})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">×{r.quantity}</td>
                    <td className="px-2 py-1 text-right font-mono">RM{r.unitPrice}</td>
                    <td className="px-2 py-1 text-right font-mono font-semibold">
                      RM{previewLineTotal(r.unitPrice, r.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Separator />
          <div className="flex items-center justify-between px-2 py-2 text-sm">
            <span className="font-medium">รวมทั้งสิ้น (Grand Total)</span>
            <span className="font-mono font-semibold">RM{grandTotal}</span>
          </div>
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">หมายเหตุ</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>สร้าง Order แล้ว booking จะถูก convert (สถานะ CONVERTED_TO_ORDER).</li>
            <li><strong>ยังไม่ mark paid</strong> — admin บันทึก payment แยกในหน้า /admin/orders.</li>
            <li><strong>ยังไม่ส่งข้อความหาลูกค้า</strong> — Phase 1 ไม่ auto-send.</li>
            <li>Order จะถูกสร้างใน <code>RESERVED</code> สถานะ; สต็อกถูกจองอยู่แล้ว.</li>
          </ul>
        </div>

        {inlineError ? (
          <div
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950/40"
            role="alert"
          >
            <p className="font-medium text-red-900 dark:text-red-100">
              {inlineError.title}
            </p>
            <p className="mt-1 text-xs text-red-800 dark:text-red-200">
              {inlineError.detail}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || count === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังสร้าง…
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" aria-hidden />
                ยืนยันสร้างออเดอร์ ({count})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
