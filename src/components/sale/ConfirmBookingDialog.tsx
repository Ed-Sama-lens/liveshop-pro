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

/**
 * Confirm booking modal — first /sale mutation surface (Commit 2O-a).
 *
 * Fires POST /api/sale/bookings/[bookingId]/confirm against the existing
 * route shipped in Commit 2E (rate-limited via 2N-HARDENING). Hard scope:
 * - PENDING_REVIEW row only (caller gates by row.status)
 * - rows with reservationIntegrity MISSING/MULTIPLE are NOT eligible
 *   (caller gates by row.reservationIntegrity)
 * - single-row, no batch
 * - modal confirmation required before request fires
 * - inline error rendering inside modal so admin doesn't lose context
 * - 429-aware: shows Retry-After when server returns it
 * - on success: closes modal + invokes onSuccess() so caller can refetch
 *
 * Error mapping (Boss spec):
 *   401 → "ต้อง sign-in ก่อน — เซสชันหมดอายุ"
 *   403 → "ไม่มีสิทธิ์ confirm (CHAT_SUPPORT ห้าม)"
 *   409 → "สถานะ booking ไม่ถูกต้อง หรือ stock ไม่พอ" (incl insufficient stock)
 *   422 → "ข้อมูล booking ไม่ครบ (variant)"
 *   429 → "ส่งคำสั่งถี่เกินไป กรุณารอ ~{N} วินาที"
 *   500 → "เซิร์ฟเวอร์มีปัญหา integrity — แจ้ง admin"
 *   other → server message or generic fallback
 *
 * No customer-facing messages. No platform integration. No batch action.
 */
export interface ConfirmBookingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly bookingId: string;
  readonly customerName: string;
  readonly displayCode: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
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
      title: 'ไม่มีสิทธิ์ Confirm',
      detail: body?.error ?? 'บัญชีนี้ห้าม confirm (CHAT_SUPPORT)',
    };
  }
  if (status === 409) {
    return {
      title: 'Confirm ไม่ได้',
      detail: body?.error ?? 'สถานะ booking ไม่ถูกต้องหรือ stock ไม่พอ',
    };
  }
  if (status === 422) {
    return {
      title: 'ข้อมูล booking ไม่ครบ',
      detail: body?.error ?? 'BroadcastProduct ไม่มี variant',
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
    title: 'Confirm ไม่สำเร็จ',
    detail: body?.error ?? `HTTP ${status}`,
  };
}

export function ConfirmBookingDialog({
  open,
  onOpenChange,
  bookingId,
  customerName,
  displayCode,
  quantity,
  unitPrice,
  onSuccess,
}: ConfirmBookingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return; // block close mid-request
    if (!next) setInlineError(null);
    onOpenChange(next);
  }

  async function handleConfirm() {
    setInlineError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/sale/bookings/${encodeURIComponent(bookingId)}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({}),
        }
      );

      const retryAfter = res.headers.get('Retry-After');
      let body: { success?: boolean; error?: string } | null = null;
      try {
        body = (await res.json()) as { success?: boolean; error?: string };
      } catch {
        body = null;
      }

      if (!res.ok || body?.success !== true) {
        setInlineError(mapErrorByStatus(res.status, body, retryAfter));
        return;
      }

      toast.success('Confirm สำเร็จ — booking ถูกยืนยันและจองสต็อกแล้ว');
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
          <DialogTitle>ยืนยันการจอง (Confirm Booking)</DialogTitle>
          <DialogDescription>
            ยืนยันการจองนี้จะ <strong>ตัดสต็อกชั่วคราว</strong> (
            reservedQty +{quantity}) — สต็อกจริงยังไม่ลดจนกว่าจะแปลงเป็นออเดอร์.
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
        </dl>

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
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังยืนยัน…
              </>
            ) : (
              'ยืนยัน Confirm'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
