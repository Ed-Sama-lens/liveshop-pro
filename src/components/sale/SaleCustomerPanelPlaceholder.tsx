import { User2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SalePanelCard } from './SalePanelCard';

/**
 * Customer panel placeholder. Shows where customer profile, contact info,
 * and language preference will live. Demo customer record only — no
 * lookup, no edit, no save.
 *
 * Localization note on language preference: customer-facing storefront
 * and future order summary templates use zh default, en/th optional
 * (Boss accepted direction). Admin app remains Thai default.
 */
const DEMO_CUSTOMER = {
  name: '王女士 / Wang Lijuan',
  phone: '+60 12-345 6789',
  shippingType: 'STANDARD',
  preferredLocale: 'zh',
  lifetimeValue: '1,248.50',
  isBanned: false,
} as const;

export function SaleCustomerPanelPlaceholder() {
  return (
    <SalePanelCard
      title="Customer Panel / ข้อมูลลูกค้า"
      subtitle="ดู/แก้ไขข้อมูลลูกค้า + ภาษาสำหรับข้อความให้ลูกค้า"
      icon={User2}
      variant="demo"
    >
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{DEMO_CUSTOMER.name}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{DEMO_CUSTOMER.phone}</p>
          </div>
          {DEMO_CUSTOMER.isBanned ? (
            <Badge variant="destructive">BANNED</Badge>
          ) : (
            <Badge variant="secondary">ACTIVE</Badge>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-right font-mono">{DEMO_CUSTOMER.shippingType}</dd>
          <dt className="text-muted-foreground">Preferred locale</dt>
          <dd className="text-right">
            <Badge variant="outline" className="font-mono text-[10px]">
              {DEMO_CUSTOMER.preferredLocale}
            </Badge>
          </dd>
          <dt className="text-muted-foreground">Lifetime value</dt>
          <dd className="text-right font-mono">RM{DEMO_CUSTOMER.lifetimeValue}</dd>
        </dl>
      </div>
      <p className="text-[11px] text-muted-foreground">
        ภาษาสำหรับข้อความหาลูกค้า: zh default, en/th optional — เปิดใช้ใน commit ถัดไป
      </p>
      <Button variant="outline" size="sm" disabled className="w-full">
        ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
