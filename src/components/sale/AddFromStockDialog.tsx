'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, AlertCircle, PackagePlus, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
 * AddFromStockDialog — Tier 3.9-C (2026-05-22) rewrite.
 *
 * Multi-select stock-to-broadcast workflow:
 * - Search by name / saleCode / SKU
 * - Checkbox per row (single OR multi); select-all visible
 * - Already-added rows for the selected saleDate are hidden by default
 *   ("show already added" toggle restores them in disabled state)
 * - displayCode auto-defaults from variant.saleCode || sku
 * - priceOverride defaults blank → server uses variant.price
 * - Batch submit hits POST /api/sale/broadcast-products/batch in one
 *   atomic transaction. All-or-nothing — any conflict rolls back.
 * - Inherits selected saleDate from /sale picker (C4 fix retained).
 *
 * Replaces the prior single-select / forced-displayCode flow that
 * required Boss to type "รหัสสินค้า" + "ราคาพิเศษ" for every code.
 */

interface ProductSearchVariantRow {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
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
   * picker. Forwarded to POST batch body. When omitted/null, server
   * defaults to today in shop timezone.
   * Boss UI smoke 2026-05-22 revealed AddFromStock without this prop
   * could only add codes to today; switching picker to another date
   * still wrote today → "already exists for this sale date" conflict.
   */
  readonly saleDate?: string | null;
  /**
   * Tier 3.9-C — display codes already broadcast on the selected
   * saleDate. Used to hide / disable already-added rows in the search
   * result list. Caller (SaleProductGridPlaceholder) derives this from
   * state.products and forwards via prop. Map: variantId → displayCode
   * so already-added badges can render the conflicting code.
   */
  readonly alreadyAddedByVariantId?: ReadonlyMap<string, string>;
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

/**
 * Per-selected-row state: displayCode + optional priceOverride.
 * Defaults are computed when the row is selected — admin can edit
 * if they expand the "Advanced" detail block per row (deferred to a
 * future PR; current UI uses defaults exclusively, which is what Boss
 * asked for).
 */
interface SelectedRowState {
  readonly variant: ProductSearchVariantRow;
  readonly displayCode: string;
  readonly priceOverride: string;
}

function describeAttrs(attributes: unknown): string {
  if (!attributes || typeof attributes !== 'object') return '';
  const entries = Object.entries(attributes as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}

/**
 * Pure helper: default displayCode for a stock variant.
 * Priority: variant.saleCode → product.saleCode (passed via row) → sku.
 * Always returns a non-empty string (sku guaranteed by schema).
 */
function defaultDisplayCode(v: ProductSearchVariantRow): string {
  if (v.saleCode && v.saleCode.trim().length > 0) return v.saleCode.trim();
  if (v.sku && v.sku.trim().length > 0) return v.sku.trim();
  return v.stockCode;
}

export function AddFromStockDialog({
  liveSessionId,
  saleDate,
  alreadyAddedByVariantId,
  onCreated,
}: AddFromStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' });
  const [selectedById, setSelectedById] = useState<ReadonlyMap<string, SelectedRowState>>(
    () => new Map()
  );
  const [showAlreadyAdded, setShowAlreadyAdded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const isEvergreen = liveSessionId === null;

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Search variants via existing `/api/products?search=&limit=`.
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
              stockCode: p.stockCode ?? '',
              saleCode: p.saleCode ?? null,
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
    setSelectedById(new Map());
    setShowAlreadyAdded(false);
    setShowAdvanced(false);
    setSubmitState({ kind: 'idle' });
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function toggleVariant(v: ProductSearchVariantRow): void {
    setSelectedById((prev) => {
      const next = new Map(prev);
      if (next.has(v.variantId)) {
        next.delete(v.variantId);
      } else {
        next.set(v.variantId, {
          variant: v,
          displayCode: defaultDisplayCode(v),
          priceOverride: '',
        });
      }
      return next;
    });
  }

  function updateRow(variantId: string, patch: Partial<SelectedRowState>): void {
    setSelectedById((prev) => {
      const next = new Map(prev);
      const existing = next.get(variantId);
      if (!existing) return prev;
      next.set(variantId, { ...existing, ...patch });
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedById(new Map());
  }

  // Filter result rows by already-added preference. Selected rows
  // always stay visible so admin can deselect without re-toggling
  // the "show already added" switch.
  const visibleVariants = useMemo<readonly ProductSearchVariantRow[]>(() => {
    if (searchState.kind !== 'ready') return [];
    const added = alreadyAddedByVariantId ?? new Map();
    return searchState.variants.filter((v) => {
      if (selectedById.has(v.variantId)) return true;
      if (added.has(v.variantId)) return showAlreadyAdded;
      return true;
    });
  }, [searchState, alreadyAddedByVariantId, selectedById, showAlreadyAdded]);

  function selectAllVisible(): void {
    setSelectedById((prev) => {
      const next = new Map(prev);
      for (const v of visibleVariants) {
        if (next.has(v.variantId)) continue;
        if (alreadyAddedByVariantId?.has(v.variantId)) continue;
        next.set(v.variantId, {
          variant: v,
          displayCode: defaultDisplayCode(v),
          priceOverride: '',
        });
      }
      return next;
    });
  }

  async function handleSubmit(): Promise<void> {
    if (selectedById.size === 0) return;
    setSubmitState({ kind: 'submitting' });
    try {
      const items = Array.from(selectedById.values()).map((r) => {
        const item: Record<string, string> = {
          variantId: r.variant.variantId,
          displayCode: r.displayCode.trim(),
        };
        if (r.priceOverride.trim().length > 0) {
          item.priceOverride = r.priceOverride.trim();
        }
        return item;
      });
      const body: Record<string, unknown> = { items };
      if (liveSessionId !== null) body.liveSessionId = liveSessionId;
      // Tier 3.9-Fix-C4 — Forward selected saleDate so server writes BP
      // with the picker-bound date, not today. When prop omitted/null,
      // server falls back to today in shop timezone (legacy behavior).
      if (typeof saleDate === 'string' && saleDate.length > 0) {
        body.saleDate = saleDate;
      }
      const res = await fetch('/api/sale/broadcast-products/batch', {
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

  const selectedCount = selectedById.size;
  const canSubmit = selectedCount > 0 && submitState.kind !== 'submitting';
  const alreadyAddedCount = useMemo(() => {
    if (searchState.kind !== 'ready') return 0;
    const added = alreadyAddedByVariantId ?? new Map();
    return searchState.variants.filter((v) => added.has(v.variantId)).length;
  }, [searchState, alreadyAddedByVariantId]);

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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>เพิ่มรหัสสินค้าจาก Stock</DialogTitle>
            <DialogDescription>
              เลือกสินค้าจาก Stock หลายตัวพร้อมกัน — รหัสสินค้า / Display Code จะใช้ค่า saleCode/SKU
              อัตโนมัติ ไม่ต้องพิมพ์ซ้ำ.{' '}
              {isEvergreen
                ? 'รายการที่เพิ่มจะใช้ saleDate ที่เลือก (ไม่ผูกรอบไลฟ์).'
                : 'รายการที่เพิ่มจะผูกกับรอบไลฟ์ปัจจุบัน.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Search input */}
            <div className="space-y-1.5">
              <Label htmlFor="add-from-stock-search">ค้นหาสินค้า (ชื่อ / saleCode / SKU)</Label>
              <Input
                id="add-from-stock-search"
                placeholder="พิมพ์ชื่อสินค้า / รหัสขาย / SKU อย่างน้อย 2 ตัวอักษร"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            {/* Toolbar: select-all + clear + already-added toggle */}
            {searchState.kind === 'ready' && searchState.variants.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    เลือก: <span className="font-mono">{selectedCount}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={selectAllVisible}
                    disabled={visibleVariants.length === 0}
                  >
                    เลือกทั้งหมดที่แสดง
                  </Button>
                  {selectedCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={clearSelection}
                    >
                      ล้างการเลือก
                    </Button>
                  )}
                </div>
                {alreadyAddedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAlreadyAdded((v) => !v)}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showAlreadyAdded ? (
                      <ChevronDown className="size-3" aria-hidden />
                    ) : (
                      <ChevronRight className="size-3" aria-hidden />
                    )}
                    แสดงรายการที่เพิ่มแล้ว ({alreadyAddedCount}) ในวันที่ขายนี้
                  </button>
                )}
              </div>
            )}

            {/* Search result list */}
            {searchState.kind === 'loading' && (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
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
              <p className="text-xs text-muted-foreground">ไม่พบสินค้าที่ตรงกับคำค้น</p>
            )}
            {searchState.kind === 'ready' && visibleVariants.length === 0 && searchState.variants.length > 0 && (
              <p className="text-xs text-muted-foreground">
                ทุกสินค้าที่ค้นหาเจอ ถูกเพิ่มเข้ารหัสสินค้าของวันที่ขายนี้แล้ว.
                เปิด “แสดงรายการที่เพิ่มแล้ว” ถ้าต้องการตรวจสอบ.
              </p>
            )}
            {searchState.kind === 'ready' && visibleVariants.length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                {visibleVariants.map((v) => {
                  const selected = selectedById.has(v.variantId);
                  const alreadyAddedCode = alreadyAddedByVariantId?.get(v.variantId) ?? null;
                  const outOfStock = v.quantity - v.reservedQty <= 0;
                  const attrLabel = describeAttrs(v.attributes);
                  return (
                    <label
                      key={v.variantId}
                      className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                        selected
                          ? 'bg-primary/10'
                          : alreadyAddedCode !== null
                            ? 'bg-muted/40 opacity-60'
                            : 'hover:bg-muted/40 cursor-pointer'
                      }`}
                    >
                      <Checkbox
                        checked={selected}
                        disabled={alreadyAddedCode !== null && !selected}
                        onCheckedChange={() => toggleVariant(v)}
                        className="mt-0.5"
                        aria-label={`เลือก ${v.productName} ${v.sku}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{v.productName}</span>
                          {v.saleCode && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {v.saleCode}
                            </Badge>
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            SKU {v.sku}
                          </span>
                          {alreadyAddedCode !== null && (
                            <Badge variant="secondary" className="text-[10px]">
                              เพิ่มแล้วเป็น {alreadyAddedCode}
                            </Badge>
                          )}
                          {outOfStock && (
                            <Badge variant="destructive" className="text-[10px]">
                              หมด
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>RM{v.price}</span>
                          <span>คงเหลือ {v.quantity - v.reservedQty}</span>
                          {attrLabel && <span>· {attrLabel}</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Advanced override panel — collapsed by default */}
            {selectedCount > 0 && (
              <div className="rounded-md border border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span>ตั้งค่ารหัสสินค้า / ราคาพิเศษ (ไม่บังคับ — ใช้ค่า default ได้)</span>
                  {showAdvanced ? (
                    <ChevronDown className="size-3" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3" aria-hidden />
                  )}
                </button>
                {showAdvanced && (
                  <div className="border-t border-border p-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {Array.from(selectedById.values()).map((r) => (
                      <div
                        key={r.variant.variantId}
                        className="grid grid-cols-12 items-center gap-1.5 text-[11px]"
                      >
                        <div className="col-span-4 truncate">
                          <span className="font-medium">{r.variant.productName}</span>
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {r.variant.sku}
                          </span>
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={r.displayCode}
                            onChange={(e) =>
                              updateRow(r.variant.variantId, { displayCode: e.target.value })
                            }
                            placeholder="รหัสสินค้า"
                            className="h-7 text-[11px]"
                          />
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={r.priceOverride}
                            onChange={(e) =>
                              updateRow(r.variant.variantId, { priceOverride: e.target.value })
                            }
                            placeholder={`ราคาพิเศษ (default RM${r.variant.price})`}
                            className="h-7 text-[11px]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Submit error inline */}
            {submitState.kind === 'error' && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                <span>{submitState.message}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="gap-1"
            >
              <Plus className="size-3.5" aria-hidden />
              + บันทึก {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
