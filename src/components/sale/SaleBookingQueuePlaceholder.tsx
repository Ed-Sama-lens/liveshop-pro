'use client';

import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';

/**
 * Booking queue — wired to
 * GET /api/sale/bookings?liveSessionId=...
 * (Commit 2S). Read-only. Confirm/Cancel buttons stay disabled.
 */
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

export function SaleBookingQueuePlaceholder({ state }: SaleBookingQueueProps) {
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
      subtitle={`${state.bookings.length} รายการ (ใหม่ → เก่า)`}
      icon={Users}
      variant="live"
    >
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {state.bookings.slice(0, 20).map((b) => {
          const badge = STATUS_BADGE[b.status];
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
                <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
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
          Confirm / ยืนยัน — ยังไม่เปิดใช้งาน
        </Button>
        <Button variant="outline" size="sm" disabled className="flex-1">
          Cancel / ยกเลิก — ยังไม่เปิดใช้งาน
        </Button>
      </div>
    </SalePanelCard>
  );
}
