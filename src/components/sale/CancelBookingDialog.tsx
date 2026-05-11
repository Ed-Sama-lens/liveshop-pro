'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Cancel booking modal — second /sale mutation surface (Commit 2O-b).
 *
 * Fires POST /api/sale/bookings/[bookingId]/cancel against the existing
 * route shipped in Commit 2E (rate-limited via 2N-HARDENING). Hard scope:
 * - CONFIRMED row only (caller gates by isBookingCancellable)
 * - rows with reservationIntegrity MISSING/MULTIPLE are NOT eligible
 * - single-row, no batch
 * - required reason (3-200 chars trimmed)
 * - modal confirmation required before request fires
 * - inline error rendering inside modal so admin doesn't lose context
 * - 429-aware: shows Retry-After when server returns it
 * - on success: closes modal + invokes onSuccess() so caller can refetch
 *
 * Error mapping (Boss 2O-b spec):
 *   401 → "ต้อง sign-in ก่อน"
 *   403 → "ไม่มีสิทธิ์ยกเลิก"
 *   400 → "ข้อมูลไม่ถูกต้อง / reason ไม่ถูกต้อง"
 *   409 → "ยกเลิกไม่ได้ / สถานะ booking ไม่ใช่ CONFIRMED แล้ว ..."
 *   422 → "ข้อมูล booking ไม่ครบ"
 *   429 → "ส่งคำสั่งถี่เกินไป / กรุณารอประมาณ {Retry-After} วินาที"
 *   500 → "เซิร์ฟเวอร์มีปัญหา integrity"
 *   other → server message or generic fallback
 *
 * targetStatus is hard-coded "CANCELLED" — Boss spec explicitly forbids
 * exposing EXPIRED through this UI (EXPIRED is reserved for future
 * auto-expire workflow).
 *
 * No customer-facing messages. No platform integration. No batch action.
 */
export interface CancelBookingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly bookingId: string;
  readonly customerName: string;
  readonly displayCode: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  /** Suffix of the active reservation id, if present (display hint only). */
  readonly activeReservationId: string | null;
  readonly onSuccess: () => void;
}

interface InlineError {
  readonly title: string;
  readonly detail: string;
}

const REASON_MIN = 3;
const REASON_MAX = 200;

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
      title: 'ไม่มีสิทธิ์ยกเลิก',
      detail: body?.error ?? 'บัญชีนี้ห้ามยกเลิก booking',
    };
  }
  if (status === 400) {
    return {
      title: 'ข้อมูลไม่ถูกต้อง',
      detail: body?.error ?? 'reason ไม่ถูกต้อง',
    };
  }
  if (status === 409) {
    return {
      title: 'ยกเลิกไม่ได้',
      detail:
        body?.error ??
        'สถานะ booking ไม่ใช่ CONFIRMED แล้ว หรือมีการเปลี่ยนแปลงจากหน้าต่างอื่น กรุณาโหลดข้อมูลใหม่',
    };
  }
  if (status === 422) {
    return {
      title: 'ข้อมูล booking ไม่ครบ',
      detail: body?.error ?? 'ข้อมูล booking ไม่สมบูรณ์',
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
      title: 'เซิร์ฟเวอร์มีปัญหา integrity',
      detail: body?.error ?? 'กรุณาแจ้ง admin ตรวจสอบข้อมูล booking',
    };
  }
  return {
    title: 'ยกเลิกไม่สำเร็จ',
    detail: body?.error ?? `HTTP ${status}`,
  };
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  customerName,
  displayCode,
  quantity,
  unitPrice,
  activeReservationId,
  onSuccess,
}: CancelBookingDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return; // block close mid-request
    if (!next) {
      setInlineError(null);
      setReason('');
    }
    onOpenChange(next);
  }

  async function handleCancel() {
    if (!reasonValid) return;
    setInlineError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/sale/bookings/${encodeURIComponent(bookingId)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            targetStatus: 'CANCELLED',
            reason: trimmed,
          }),
        }
      );

      const retryAfter = res.headers.get('Retry-After');
      type CancelResponseBody = {
        success?: boolean;
        error?: string;
        data?: { releasedQuantity?: number };
      };
      let body: CancelResponseBody | null = null;
      try {
        body = (await res.json()) as CancelResponseBody;
      } catch {
        body = null;
      }

      if (!res.ok || body?.success !== true) {
        setInlineError(mapErrorByStatus(res.status, body, retryAfter));
        return;
      }

      const released = body?.data?.releasedQuantity ?? quantity;
      toast.success(`ยกเลิกสำเร็จ — คืน ${released} ชิ้นสู่ stock`);
      setReason('');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยกเลิกการจอง</DialogTitle>
          <DialogDescription>
            ยกเลิกการจองนี้จะ <strong>คืนสต็อก</strong> (reservedQty -{quantity})
            — เปลี่ยนสถานะ booking เป็น CANCELLED.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">Booking</dt>
          <dd className="text-right font-mono text-xs">{bookingId.slice(0, 12)}…</dd>
          <dt className="text-muted-foreground">Code</dt>
          <dd className="text-right font-mono">{displayCode ?? '—'}</dd>
          <dt className="text-muted-foreground">ลูกค้า</dt>
          <dd className="text-right">{customerName}</dd>
          <dt className="text-muted-foreground">จำนวน</dt>
          <dd className="text-right font-mono">×{quantity}</dd>
          <dt className="text-muted-foreground">ราคาต่อชิ้น</dt>
          <dd className="text-right font-mono">RM{unitPrice}</dd>
          {activeReservationId ? (
            <>
              <dt className="text-muted-foreground">Reservation</dt>
              <dd className="text-right font-mono text-xs">
                …{activeReservationId.slice(-6)}
              </dd>
            </>
          ) : null}
        </dl>

        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">
            เหตุผลการยกเลิก <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={REASON_MAX}
            placeholder="เช่น ลูกค้ายกเลิก / สินค้าหมด / ส่งไม่ได้ ..."
            disabled={isSubmitting}
            aria-required="true"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {trimmed.length < REASON_MIN
                ? `อย่างน้อย ${REASON_MIN} ตัวอักษร`
                : trimmed.length > REASON_MAX
                  ? `เกิน ${REASON_MAX} ตัวอักษร`
                  : 'ok'}
            </span>
            <span className="font-mono">
              {trimmed.length} / {REASON_MAX}
            </span>
          </div>
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
            ยกเลิกการกด
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isSubmitting || !reasonValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังยกเลิก…
              </>
            ) : (
              'ยืนยันยกเลิก'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
