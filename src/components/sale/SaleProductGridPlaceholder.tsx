'use client';

import { useState, useEffect, useMemo } from 'react';
import { Grid3x3, AlertTriangle, Pencil } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';
import { AddFromStockDialog } from './AddFromStockDialog';
import {
  CreateQuickProductCodeDialog,
  type QuickProductCodeCategory,
} from './CreateQuickProductCodeDialog';
import { EditProductCodeDialog } from './EditProductCodeDialog';

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
  /**
   * Tier 3.9-B-Fix-2 — BP scope marker. `null` = evergreen (no
   * liveSession parent). Non-null = live-bound to that session.
   * Manual Booking dialog dispatches by this field.
   */
  readonly liveSessionId?: string | null;
  /**
   * Tier 3.6 — surfaces BroadcastProduct.isPinned for the edit dialog.
   * Optional on the row because older API responses (Commit 2S) did
   * not return it. EditProductCodeDialog handles undefined gracefully
   * by treating it as false.
   */
  readonly isPinned?: boolean;
  /**
   * Tier 3.9 — Sale Date (YYYY-MM-DD shop timezone). Optional because
   * pre-3.9 responses omit it. Null = Untagged group fallback.
   */
  readonly saleDate?: string | null;
}

export interface SaleProductGridProps {
  readonly state:
    | { readonly kind: 'no-session' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly message: string }
    | {
        readonly kind: 'ready';
        /**
         * Tier 3.9-B-Fix-2 — Optional. `null` when no live session is
         * active for the selected sale date. Date-first model treats
         * LiveSession as optional event context, not parent.
         */
        readonly liveSessionId: string | null;
        /**
         * Tier 3.9 — primary grouping context. Passed to
         * CreateQuickProductCodeDialog so newly created codes inherit
         * the selected day. AddFromStockDialog also inherits this.
         */
        readonly saleDate: string;
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
   * Optional callback fired when the BroadcastProduct list may have
   * changed: create (Quick Create + AddFromStock), edit
   * (EditProductCode), or delete. Parent uses this to bump
   * `refetchToken` so all dependent panels refetch in parallel.
   *
   * Tier 3 PR 4. Renamed from `onProductCreated` per
   * `2026-05-24-edit-product-code-refresh-audit.md` (F4 audit) —
   * the original name suggested create-only, but the callback
   * already covers all CRUD paths.
   */
  readonly onProductsChanged?: () => void;
}

export function SaleProductGridPlaceholder({
  state,
  onProductsChanged,
}: SaleProductGridProps) {
  /**
   * Tier 3.6 — track which BP row is open in the EditProductCodeDialog.
   * `null` = closed. `'ready'` state still mounts the component; other
   * states have nothing to edit.
   */
  const [editTarget, setEditTarget] = useState<SaleBroadcastProductRow | null>(
    null
  );

  /**
   * Tier 3.8 — categories cached for CreateQuickProductCodeDialog.
   * One-shot fetch on mount. /api/categories is auth-gated, shop-scoped.
   */
  const [quickCategories, setQuickCategories] = useState<
    readonly QuickProductCodeCategory[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/categories', { credentials: 'same-origin' });
        if (!res.ok) return;
        const body = (await res.json()) as {
          success?: boolean;
          data?: ReadonlyArray<{ id: string; name: string }>;
        };
        if (!cancelled && body.success && Array.isArray(body.data)) {
          setQuickCategories(body.data.map((c) => ({ id: c.id, name: c.name })));
        }
      } catch {
        // Non-critical: dialog still works with empty categories list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tier 3.9-C — already-added variant map for current saleDate.
  // Forwarded to AddFromStockDialog so admin sees which variants
  // already exist on the selected day. Empty map = no codes loaded
  // yet (loading / error / empty state).
  const alreadyAddedByVariantId = useMemo<ReadonlyMap<string, string>>(() => {
    if (state.kind !== 'ready') return new Map();
    const map = new Map<string, string>();
    for (const p of state.products) {
      if (p.variantId) {
        map.set(p.variantId, p.displayCode);
      }
    }
    return map;
  }, [state]);

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
          เริ่มจากเลือกสินค้าใน Stock ที่มีอยู่, หรือสร้างใหม่ทั้งสินค้า + รหัส CF
          พร้อมกัน (เร็วกว่าสำหรับขายไลฟ์).
        </p>
        <div className="space-y-2">
          <CreateQuickProductCodeDialog
            categories={quickCategories}
            saleDate={state.kind === 'ready' ? state.saleDate : null}
            onCreated={() => onProductsChanged?.()}
          />
          <AddFromStockDialog
            liveSessionId={state.liveSessionId}
            saleDate={state.kind === 'ready' ? state.saleDate : null}
            alreadyAddedByVariantId={alreadyAddedByVariantId}
            onCreated={onProductsChanged}
          />
        </div>
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
            <button
              key={p.broadcastProductId}
              type="button"
              onClick={() => setEditTarget(p)}
              title={`คลิกเพื่อแก้ไขรหัสสินค้า ${p.displayCode}`}
              aria-label={`แก้ไขรหัสสินค้า ${p.displayCode}`}
              className={`group relative rounded-md border px-2 py-2 text-left text-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                outOfStock
                  ? 'border-red-300 bg-red-50 opacity-70 dark:border-red-800 dark:bg-red-950/30'
                  : lowStock
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-border'
              }`}
            >
              <Pencil
                className="absolute right-1 top-1 size-3 opacity-0 transition-opacity group-hover:opacity-60"
                aria-hidden
              />
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
            </button>
          );
        })}
      </div>
      {editTarget !== null && (
        <EditProductCodeDialog
          product={editTarget}
          canDelete
          open={editTarget !== null}
          onOpenChange={(next) => {
            if (!next) setEditTarget(null);
          }}
          onUpdated={() => {
            setEditTarget(null);
            onProductsChanged?.();
          }}
          onDeleted={() => {
            setEditTarget(null);
            onProductsChanged?.();
          }}
        />
      )}
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
      <div className="space-y-2">
        <CreateQuickProductCodeDialog
          categories={quickCategories}
          saleDate={state.kind === 'ready' ? state.saleDate : null}
          onCreated={() => onProductsChanged?.()}
        />
        <AddFromStockDialog
          liveSessionId={state.liveSessionId}
          saleDate={state.kind === 'ready' ? state.saleDate : null}
          alreadyAddedByVariantId={alreadyAddedByVariantId}
          onCreated={onProductsChanged}
        />
      </div>
    </SalePanelCard>
  );
}
