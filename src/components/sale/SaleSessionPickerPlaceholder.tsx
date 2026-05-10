import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';

/**
 * Live session picker placeholder. No data fetch — renders a static
 * sample of "scheduled / live / ended" sessions so the future picker
 * shape is visible. Disabled controls only.
 */
export function SaleSessionPickerPlaceholder() {
  return (
    <SalePanelCard
      title="Live Sessions / รอบไลฟ์"
      subtitle="เลือกรอบไลฟ์ที่กำลังขายอยู่"
      icon={Radio}
      variant="demo"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-950/40">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Live Session • 10 พ.ค. 2026</p>
            <p className="text-xs text-muted-foreground">เริ่มเมื่อ 20:30 น. • 142 viewers</p>
          </div>
          <Badge className="bg-emerald-600 hover:bg-emerald-600">LIVE</Badge>
        </div>
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Live Session • 11 พ.ค. 2026</p>
            <p className="text-xs text-muted-foreground">กำหนดเริ่ม 21:00 น.</p>
          </div>
          <Badge variant="secondary">SCHEDULED</Badge>
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <Button variant="outline" size="sm" disabled className="w-full">
        ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
