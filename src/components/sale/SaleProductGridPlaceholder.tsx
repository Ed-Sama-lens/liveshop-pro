'use client';

import { Grid3x3, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';
import { AddFromStockDialog } from './AddFromStockDialog';

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
        /**
         * Added in Commit 2T API response. Non-zero indicates cross-shop
         * defense rejected one or more BroadcastProduct rows server-side.
         * Older API versions return undefined and the warning row is
         * suppressed.
         */
        readonly filteredInvalidCount?: number;
      };
  /**
   * Optional callback fired when a new BroadcastProduct is created via
   * the Add from Stock dialog. Parent uses this to refetch the product
   * grid. Tier 3 PR 4.
   */
  readonly onProductCreated?: () => void;
}

export function SaleProductGridPlaceholder({
  state,
  onProductCreated,
}: SaleProductGridProps) {
  if (state.kind === 'no-session') {
    return (
      <SalePanelCard
        title="รหัสสินค้า / Product Codes"
        subtitle="ยังไม่ได้เลือกรอบไลฟ์ — หรือยังไม่มีรอบไลฟ์ในระบบ"
        icon={Grid3x3}
        variant="placeholder"
      >
        <p className="text-sm text-muted-foreground">
          เมื่อเริ่มรอบไลฟ์ใหม่ รหัสสินค้าที่ตั้งไว้จะปรากฏที่นี่. การจัดการรหัสสินค้าแบบไม่ผูกรอบไลฟ์ (Add from Stock) จะมาในเฟสถัดไป.
        </p>
      </SalePanelCard>
    );
  }

  if (state.kind === 'loading') {
    return (
      <SalePanelCard
        title="รหัสสินค้า / Product Codes"
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
        title="รหัสสินค้า / Product Codes"
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
        title="รหัสสินค้า / Product Codes"
        subtitle="ยังไม่มีรหัสสินค้าในรอบไลฟ์นี้"
        icon={Grid3x3}
        variant="live"
      >
        <p className="text-sm text-muted-foreground">
          กดปุ่มด้านล่างเพื่อสร้างรหัสสินค้าจากคลัง (ProductVariant) ของร้าน. รหัสสินค้าจะผูกกับรอบไลฟ์ปัจจุบัน.
        </p>
        <AddFromStockDialog
          liveSessionId={state.liveSessionId}
          onCreated={onProductCreated}
        />
      </SalePanelCard>
    );
  }

  return (
    <SalePanelCard
      title="รหัสสินค้า / Product Codes"
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
      {state.filteredInvalidCount && state.filteredInvalidCount > 0 ? (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          title="Server-side cross-shop defense rejected one or more BroadcastProduct rows; ask Boss to investigate internal data tooling."
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>
            มีสินค้าบางรายการถูกซ่อนเพราะข้อมูลไม่ถูกต้อง ({state.filteredInvalidCount} รายการ)
          </span>
        </div>
      ) : null}
      <AddFromStockDialog
        liveSessionId={state.liveSessionId}
        onCreated={onProductCreated}
      />
    </SalePanelCard>
  );
}
