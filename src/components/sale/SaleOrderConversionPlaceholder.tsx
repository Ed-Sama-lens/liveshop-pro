import { ShoppingCart, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SalePanelCard } from './SalePanelCard';

/**
 * Order conversion placeholder — visual hint only.
 *
 * Prior versions rendered seeded demo rows ("Chili Crab Sauce" etc) to
 * preview the layout. Tier 1 IA consolidation removes the fake rows
 * because they were misleading at first glance — admins could not tell
 * placeholder from real data, especially with production seeded with
 * Boss's own test records.
 *
 * Real conversion happens via the per-row Create Order action inside
 * SaleBookingQueuePlaceholder using the existing CreateOrderDialog
 * (POST /api/sale/orders/from-bookings). This panel is informational
 * scaffolding for a future "batch convert" UI; until that ships, render
 * a clear no-data state.
 */
export function SaleOrderConversionPlaceholder() {
  return (
    <SalePanelCard
      title="สร้างออเดอร์ / Create Order"
      subtitle="รวมรายการจอง CONFIRMED ของลูกค้าให้กลายเป็น 1 ออเดอร์"
      icon={ShoppingCart}
      variant="demo"
    >
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
        <p>
          ใช้ปุ่ม{' '}
          <span className="font-medium text-foreground">Create Order</span> ใน
          รายการจอง (Booking Queue) เพื่อแปลงรายการที่ CONFIRMED แล้วเป็นออเดอร์
          ทีละลูกค้า. หน้านี้ยังไม่รองรับ batch convert.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled className="w-full">
        Batch convert — เร็ว ๆ นี้
      </Button>
    </SalePanelCard>
  );
}
