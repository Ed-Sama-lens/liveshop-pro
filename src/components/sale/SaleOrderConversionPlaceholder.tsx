import { ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SalePanelCard } from './SalePanelCard';

/**
 * Order conversion placeholder — visualizes the booking → order
 * consolidation flow already shipped by Commit 2H/2I:
 *   bookingRepository.convertToOrder({shopId, liveSessionId, customerId, ...})
 *
 * Demo summary only. No POST. No real conversion call.
 */
const DEMO_ROWS: ReadonlyArray<{
  readonly code: string;
  readonly desc: string;
  readonly qty: number;
  readonly unit: string;
  readonly total: string;
}> = [
  { code: 'A002', desc: 'Chili Crab Sauce', qty: 1, unit: '18.50', total: '18.50' },
  { code: 'B002', desc: 'Coconut Jelly',   qty: 3, unit: '8.00',  total: '24.00' },
  { code: 'C001', desc: 'Curry Puff',      qty: 5, unit: '6.00',  total: '30.00' },
];

const SUBTOTAL = '72.50';
const SHIPPING_FEE = '0.00';
const TOTAL = '72.50';

export function SaleOrderConversionPlaceholder() {
  return (
    <SalePanelCard
      title="Create Order / สร้างออเดอร์"
      subtitle="รวมรายการจอง CONFIRMED ของลูกค้าใน 1 รอบไลฟ์ให้กลายเป็น 1 ออเดอร์"
      icon={ShoppingCart}
      variant="demo"
    >
      <div className="rounded-md border border-border">
        <ul className="divide-y divide-border text-xs">
          {DEMO_ROWS.map((r) => (
            <li key={r.code} className="flex items-center gap-2 px-2 py-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{r.code}</span>
              <span className="min-w-0 flex-1 truncate">{r.desc}</span>
              <span className="font-mono text-[11px] text-muted-foreground">×{r.qty}</span>
              <span className="w-14 text-right font-mono text-[11px]">RM{r.unit}</span>
              <span className="w-16 text-right font-mono text-[11px] font-semibold">
                RM{r.total}
              </span>
            </li>
          ))}
        </ul>
        <Separator />
        <div className="space-y-1 px-2 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">RM{SUBTOTAL}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span className="font-mono">RM{SHIPPING_FEE}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono">RM{TOTAL}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px]">
          channel: MANUAL
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          status: RESERVED
        </Badge>
      </div>
      <Button variant="outline" size="sm" disabled className="w-full">
        Create Order / สร้างออเดอร์ — ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
