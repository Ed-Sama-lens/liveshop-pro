import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SalePanelCard } from './SalePanelCard';

/**
 * Booking queue placeholder. Sample rows show the lifecycle states the
 * backend already supports (PENDING_REVIEW / CONFIRMED / CONVERTED_TO_ORDER /
 * CANCELLED). No data fetch. No row actions wired.
 */
const DEMO_BOOKINGS: ReadonlyArray<{
  readonly id: string;
  readonly code: string;
  readonly customer: string;
  readonly qty: number;
  readonly status:
    | 'PENDING_REVIEW'
    | 'CONFIRMED'
    | 'CONVERTED_TO_ORDER'
    | 'CANCELLED';
}> = [
  { id: 'bk_demo_1', code: 'A001', customer: 'คุณ สุดา ส.', qty: 2, status: 'PENDING_REVIEW' },
  { id: 'bk_demo_2', code: 'A002', customer: 'Mr Tan W.', qty: 1, status: 'CONFIRMED' },
  { id: 'bk_demo_3', code: 'B002', customer: 'คุณ สมหมาย', qty: 3, status: 'CONFIRMED' },
  { id: 'bk_demo_4', code: 'C001', customer: '王女士', qty: 5, status: 'CONVERTED_TO_ORDER' },
  { id: 'bk_demo_5', code: 'C002', customer: 'คุณ มานี', qty: 1, status: 'CANCELLED' },
];

const STATUS_BADGE: Record<
  (typeof DEMO_BOOKINGS)[number]['status'],
  { label: string; className: string }
> = {
  PENDING_REVIEW: {
    label: 'PENDING',
    className: 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100',
  },
  CONFIRMED: {
    label: 'CONFIRMED',
    className: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100',
  },
  CONVERTED_TO_ORDER: {
    label: 'CONVERTED',
    className: 'bg-blue-100 text-blue-900 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-100',
  },
  CANCELLED: {
    label: 'CANCELLED',
    className: 'bg-muted text-muted-foreground line-through',
  },
};

export function SaleBookingQueuePlaceholder() {
  return (
    <SalePanelCard
      title="Customer Bookings / รายการจอง"
      subtitle="จองสินค้าตามลูกค้า แยกตามสถานะ"
      icon={Users}
      variant="demo"
    >
      <div className="space-y-1.5">
        {DEMO_BOOKINGS.map((b) => {
          const badge = STATUS_BADGE[b.status];
          return (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{b.code}</span>
                <span className="truncate">{b.customer}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px]">×{b.qty}</span>
                <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled className="flex-1">
          Confirm / ยืนยัน
        </Button>
        <Button variant="outline" size="sm" disabled className="flex-1">
          Cancel / ยกเลิก
        </Button>
      </div>
    </SalePanelCard>
  );
}
