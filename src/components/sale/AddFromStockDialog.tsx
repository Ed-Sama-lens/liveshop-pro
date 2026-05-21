'use client';

import { useState, useEffect } from 'react';
import { Plus, AlertCircle, PackagePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * AddFromStockDialog — Tier 3 product code creation.
 *
 * Admin picks a ProductVariant from existing inventory + assigns a
 * displayCode. Resulting BroadcastProduct row is either live-bound
 * (when `selectedLiveSessionId` is provided) or evergreen (when no
 * session selected — gated by ALLOW_EVERGREEN_BROADCAST_PRODUCT flag
 * server-side; the dialog still allows the attempt and surfaces the
 * server error if the flag is off).
 *
 * Variant search uses existing `/api/products?search=...` admin route
 * (auth-gated, paginated, shop-scoped) to avoid adding a new endpoint
 * just for this picker.
 *
 * Pure client component. No data fetch on mount — fetches on
 * search-debounce. POST hits `/api/sale/broadcast-products`.
 *
 * Plan ref: docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md
 */

interface ProductSearchVariantRow {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly attributes: unknown;
  readonly price: string;
  readonly quantity: number;
  readonly reservedQty: number;
}

export interface AddFromStockDialogProps {
  readonly liveSessionId: string | null;
  /**
   * Tier 3.9-Fix-C4 — Sale Date (YYYY-MM-DD) inherited from /sale
   * picker. Forwarded to POST /api/sale/broadcast-products body.
   * When omitted/null, server defaults to today in shop timezone.
   * Boss UI smoke 2026-05-22 revealed AddFromStock without this prop
   * could only add codes to today; switching picker to another date
   * still wrote today → "already exists for this sale date" conflict.
   */
  readonly saleDate?: string | null;
  readonly onCreated?: () => void;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; variants: readonly ProductSearchVariantRow[] };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

function describeAttrs(attributes: unknown): string {
  if (!attributes || typeof attributes !== 'object') return '';
  const entries = Object.entries(attributes as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}

export function AddFromStockDialog({
  liveSessionId,
  saleDate,
  onCreated,
}: AddFromStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [selectedVariant, setSelectedVariant] =
    useState<ProductSearchVariantRow | null>(null);
  const [displayCode, setDisplayCode] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const isEvergreen = liveSessionId === null;

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Search variants via existing `/api/products?search=&limit=`. Picks
  // first variant of each matching product. UI shows up to 20 results.
  useEffect(() => {
    if (!open) return;
    if (debouncedTerm.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced search reset on short term; legitimate fetch-into-state pattern
      setSearchState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setSearchState({ kind: 'loading' });
    (async () => {
      try {
        const url = `/api/products?search=${encodeURIComponent(debouncedTerm)}&limit=20`;
        const res = await fetch(url, { method: 'GET', credentials: 'same-origin' });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setSearchState({
            kind: 'error',
            message: body?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        // Flatten products → first variant of each (matches Manual Create
        // dialog convention; whole-product picker not supported in Tier 3).
        const items = Array.isArray(body.data) ? body.data : [];
        const flat: ProductSearchVariantRow[] = [];
        for (const p of items) {
          if (!Array.isArray(p?.variants) || p.variants.length === 0) continue;
          for (const v of p.variants) {
            if (!v?.id) continue;
            flat.push({
              variantId: v.id,
              productId: p.id,
              productName: p.name,
              sku: v.sku ?? '',
              attributes: v.attributes ?? null,
              price: typeof v.price === 'string' ? v.price : String(v.price ?? '0'),
              quantity: Number(v.quantity ?? 0),
              reservedQty: Number(v.reservedQty ?? 0),
            });
          }
        }
        setSearchState({ kind: 'ready', variants: flat.slice(0, 30) });
      } catch (err) {
        if (cancelled) return;
        setSearchState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, open]);

  function reset(): void {
    setSearchTerm('');
    setDebouncedTerm('');
    setSearchState({ kind: 'idle' });
    setSelectedVariant(null);
    setDisplayCode('');
    setPriceOverride('');
    setSubmitState({ kind: 'idle' });
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  async function handleSubmit(): Promise<void> {
    if (!selectedVariant) return;
    if (displayCode.length === 0) {
      setSubmitState({
        kind: 'error',
        message: 'ใส่รหัสสินค้า (displayCode) ก่อนบันทึก',
      });
      return;
    }
    setSubmitState({ kind: 'submitting' });
    try {
      const body: Record<string, unknown> = {
        variantId: selectedVariant.variantId,
        displayCode,
      };
      if (liveSessionId !== null) body.liveSessionId = liveSessionId;
      if (priceOverride.trim().length > 0) body.priceOverride = priceOverride.trim();
      // Tier 3.9-Fix-C4 — Forward selected saleDate so server writes BP
      // with the picker-bound date, not today. When prop omitted/null,
      // server falls back to today in shop timezone (legacy behavior).
      if (typeof saleDate === 'string' && saleDate.length > 0) {
        body.saleDate = saleDate;
      }
      const res = await fetch('/api/sale/broadcast-products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitState({
          kind: 'error',
          message: json?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      reset();
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setSubmitState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const canSubmit =
    selectedVariant !== null &&
    displayCode.trim().length > 0 &&
    submitState.kind !== 'submitting';

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <PackagePlus className="size-3.5" aria-hidden />
        เพิ่มสินค้าจาก Stock
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เพิ่มรหัสสินค้าจาก Stock</DialogTitle>
          <DialogDescription>
            {isEvergreen
              ? 'สร้างรหัสสินค้าแบบ evergreen (ไม่ผูกรอบไลฟ์). ต้องเปิด ALLOW_EVERGREEN_BROADCAST_PRODUCT บนเซิร์ฟเวอร์ก่อนใช้งาน.'
              : 'สร้างรหัสสินค้าผูกกับรอบไลฟ์ปัจจุบัน. ใช้ในระบบจองทันที.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-from-stock-search">ค้นหาสินค้า (ชื่อ / SKU)</Label>
            <Input
              id="add-from-stock-search"
              placeholder="พิมพ์ชื่อสินค้าหรือ SKU อย่างน้อย 2 ตัวอักษร"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          {searchState.kind === 'loading' && (
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {searchState.kind === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span>ค้นหาไม่สำเร็จ: {searchState.message}</span>
            </div>
          )}
          {searchState.kind === 'ready' && searchState.variants.length === 0 && (
            <p className="text-xs text-muted-foreground">
              ไม่พบสินค้าที่ตรงกับคำค้น
            </p>
          )}
          {searchState.kind === 'ready' && searchState.variants.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {searchState.variants.map((v) => {
                const selected = selectedVariant?.variantId === v.variantId;
                const attrLabel = describeAttrs(v.attributes);
                return (
                  <button
                    key={v.variantId}
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{v.productName}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {v.quantity - v.reservedQty} ชิ้น
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] opacity-80">
                      <span className="font-mono">{v.sku}</span>
                      {attrLabel ? <span>· {attrLabel}</span> : null}
                      <span className="ml-auto font-mono">RM{v.price}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedVariant !== null && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="add-from-stock-displayCode">รหัสสินค้า / Display Code</Label>
                <Input
                  id="add-from-stock-displayCode"
                  placeholder="เช่น A1, B12"
                  value={displayCode}
                  onChange={(e) => setDisplayCode(e.target.value)}
                  maxLength={32}
                />
                <p className="text-[10px] text-muted-foreground">
                  ตัวอักษร A-Z, a-z, 0-9, _, - เท่านั้น (1-32 ตัว)
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-from-stock-priceOverride">
                  ราคาพิเศษ (ทับราคา variant) — ไม่ใส่ก็ได้
                </Label>
                <Input
                  id="add-from-stock-priceOverride"
                  placeholder={`เช่น ${selectedVariant.price}`}
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </>
          )}

          {submitState.kind === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span>{submitState.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={submitState.kind === 'submitting'}
          >
            ยกเลิก
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden />
            {submitState.kind === 'submitting' ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
