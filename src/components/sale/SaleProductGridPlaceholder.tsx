import { Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SalePanelCard } from './SalePanelCard';

/**
 * Product code grid placeholder — sample of admin-friendly broadcast
 * code cards (A001/B002/etc) that future 2O will wire to
 * BroadcastProduct rows for the selected live session.
 *
 * Static demo only. Cards are not clickable.
 */
const DEMO_CODES: ReadonlyArray<{
  readonly code: string;
  readonly name: string;
  readonly price: string;
  readonly stock: number;
}> = [
  { code: 'A001', name: 'Steamed Bun Set / ขนมจีบ', price: '12.00', stock: 24 },
  { code: 'A002', name: 'Chili Crab Sauce / น้ำพริก', price: '18.50', stock: 9 },
  { code: 'B001', name: 'Pandan Cake / เค้กใบเตย', price: '25.00', stock: 0 },
  { code: 'B002', name: 'Coconut Jelly / วุ้นมะพร้าว', price: '8.00', stock: 41 },
  { code: 'C001', name: 'Curry Puff / กะหรี่ปั๊บ', price: '6.00', stock: 16 },
  { code: 'C002', name: 'Herbal Tea / ชาสมุนไพร', price: '9.50', stock: 5 },
];

export function SaleProductGridPlaceholder() {
  return (
    <SalePanelCard
      title="Product Codes / รหัสสินค้า"
      subtitle="ตารางรหัสสินค้าสำหรับการจองและสร้างออเดอร์เร็ว"
      icon={Grid3x3}
      variant="demo"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEMO_CODES.map((p) => {
          const outOfStock = p.stock === 0;
          const lowStock = !outOfStock && p.stock <= 5;
          return (
            <div
              key={p.code}
              className={`rounded-md border px-2 py-2 text-xs ${
                outOfStock
                  ? 'border-red-300 bg-red-50 opacity-70 dark:border-red-800 dark:bg-red-950/30'
                  : lowStock
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-border'
              }`}
            >
              <p className="font-mono text-sm font-semibold">{p.code}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.name}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-[11px]">RM{p.price}</span>
                <span
                  className={`text-[10px] ${
                    outOfStock
                      ? 'text-red-600'
                      : lowStock
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {outOfStock ? 'หมด' : `${p.stock} ชิ้น`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" disabled className="w-full">
        ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
