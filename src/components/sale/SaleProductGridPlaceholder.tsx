'use client';

import { Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';

/**
 * Product code grid — wired to
 * GET /api/sale/live-sessions/[liveSessionId]/broadcast-products
 * (Commit 2S). Read-only. No action wired.
 */
export interface SaleBroadcastProductRow {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly displayOrder: number;
  readonly productId: string;
  readonly productName: string;
  readonly variantId: string;
  readonly variantName: string;
  readonly sku: string;
  readonly unitPrice: string;
  readonly priceOverride: string | null;
  readonly stockQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  readonly imageUrl: string | null;
}

export interface SaleProductGridProps {
  readonly state:
    | { readonly kind: 'no-session' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly message: string }
    | {
        readonly kind: 'ready';
        readonly liveSessionId: string;
        readonly products: readonly SaleBroadcastProductRow[];
      };
}

export function SaleProductGridPlaceholder({ state }: SaleProductGridProps) {
  if (state.kind === 'no-session') {
    return (
      <SalePanelCard
        title="Product Codes / รหัสสินค้า"
        subtitle="เลือกรอบไลฟ์ก่อนเพื่อดูสินค้า"
        icon={Grid3x3}
        variant="placeholder"
      >
        <p className="text-sm text-muted-foreground">รอเลือกรอบไลฟ์</p>
      </SalePanelCard>
    );
  }

  if (state.kind === 'loading') {
    return (
      <SalePanelCard
        title="Product Codes / รหัสสินค้า"
        subtitle="กำลังโหลดสินค้าของรอบไลฟ์"
        icon={Grid3x3}
        variant="live"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </SalePanelCard>
    );
  }

  if (state.kind === 'error') {
    return (
      <SalePanelCard
        title="Product Codes / รหัสสินค้า"
        subtitle="โหลดข้อมูลไม่สำเร็จ"
        icon={Grid3x3}
        variant="live"
      >
        <p className="text-sm text-destructive">{state.message}</p>
      </SalePanelCard>
    );
  }

  if (state.products.length === 0) {
    return (
      <SalePanelCard
        title="Product Codes / รหัสสินค้า"
        subtitle="ยังไม่มีสินค้าในรอบไลฟ์นี้"
        icon={Grid3x3}
        variant="live"
      >
        <p className="text-sm text-muted-foreground">
          ยังไม่มี BroadcastProduct ในรอบไลฟ์นี้ — กลับไปตั้งค่าใน Live Selling
        </p>
      </SalePanelCard>
    );
  }

  return (
    <SalePanelCard
      title="Product Codes / รหัสสินค้า"
      subtitle={`${state.products.length} ชิ้น ในรอบนี้`}
      icon={Grid3x3}
      variant="live"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {state.products.slice(0, 12).map((p) => {
          const outOfStock = p.availableQty === 0;
          const lowStock = !outOfStock && p.availableQty <= 5;
          return (
            <div
              key={p.broadcastProductId}
              className={`rounded-md border px-2 py-2 text-xs ${
                outOfStock
                  ? 'border-red-300 bg-red-50 opacity-70 dark:border-red-800 dark:bg-red-950/30'
                  : lowStock
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-border'
              }`}
            >
              <p className="font-mono text-sm font-semibold">{p.displayCode}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {p.productName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{p.sku}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-[11px]">RM{p.unitPrice}</span>
                <span
                  className={`text-[10px] ${
                    outOfStock
                      ? 'text-red-600'
                      : lowStock
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {outOfStock ? 'หมด' : `${p.availableQty} ชิ้น`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {state.products.length > 12 ? (
        <p className="text-[11px] text-muted-foreground">
          แสดง 12 จาก {state.products.length} ชิ้น — ดูทั้งหมดในเฟสถัดไป
        </p>
      ) : null}
      <Button variant="outline" size="sm" disabled className="w-full">
        จองสินค้า — ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
