'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X, AlertTriangle, Ban } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SaleBroadcastProductRow } from './SaleProductGridPlaceholder';

/**
 * Manual Create booking modal — fourth /sale mutation surface.
 *
 * Phase 3 skeleton (2026-05-13): UI scaffold only. NO POST wired.
 * Submit button stays disabled with copy "จะเปิดใช้งานในขั้นถัดไป
 * (Phase 4)" so admin can preview the form flow before mutation
 * activation.
 *
 * Wiring deferred to Phase 4 per:
 * - docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md
 *
 * Scope (Phase 3):
 * - Customer search reuses existing `/api/customers?search=` route.
 *   Read-only, shop-scoped, supports OR(name, phone, email)
 *   case-insensitive contains. Pagination defaults limit=20.
 * - Broadcast product picker filters the parent-supplied product
 *   array client-side by displayCode prefix. No new fetch.
 * - Status locked to PENDING_REVIEW. CONFIRMED status NOT exposed
 *   in Phase 3 (defer to later commit per audit M4).
 * - Banned customers: rendered + disabled (audit M2).
 * - Out-of-stock variants: rendered + flagged but selectable (audit M2)
 *   — server-side stock check fires only on status=CONFIRMED, and we
 *   lock to PENDING_REVIEW here.
 * - idempotencyKey auto-generated in Phase 4 — Phase 3 form does
 *   not need it (no POST).
 * - No customer-facing message. No platform integration.
 *
 * Mutation grep impact this commit: ZERO new POSTs. Search fetch is GET.
 */
export interface ManualCreateBookingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Live session bookings target. Required to scope the create call later. */
  readonly liveSessionId: string;
  /** Products available in the selected session (from shell). */
  readonly products: readonly SaleBroadcastProductRow[];
  /**
   * Invoked after a successful create (Phase 4). In Phase 3 this is
   * never called because the submit button is disabled.
   */
  readonly onSuccess?: () => void;
}

interface CustomerSearchHit {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly isBanned: boolean;
  readonly orderCount: number;
}

type CustomerSearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; hits: readonly CustomerSearchHit[] };

interface CustomerSearchResponseBody {
  success?: boolean;
  error?: string;
  data?: ReadonlyArray<{
    id?: string;
    name?: string;
    phone?: string | null;
    email?: string | null;
    isBanned?: boolean;
    _count?: { orders?: number };
  }>;
}

/**
 * Pure: format a customer hit for compact display in the search
 * dropdown. Phone + email both optional. Returns a stable secondary
 * line string.
 */
function formatCustomerSecondaryLine(hit: CustomerSearchHit): string {
  const parts: string[] = [];
  if (hit.phone) parts.push(hit.phone);
  if (hit.email) parts.push(hit.email);
  if (parts.length === 0) return '—';
  return parts.join(' · ');
}

/**
 * Pure: client-side product filter for the picker. Returns rows whose
 * displayCode starts with the typed prefix (case-insensitive), or all
 * rows when prefix is empty/short. Caps result list to 50 for render
 * cost — admin can refine the prefix further.
 */
export function filterProductsByCodePrefix(
  products: readonly SaleBroadcastProductRow[],
  prefix: string
): readonly SaleBroadcastProductRow[] {
  const trimmed = prefix.trim();
  if (trimmed.length === 0) {
    return products.slice(0, 50);
  }
  const needle = trimmed.toLowerCase();
  const matches = products.filter((p) =>
    p.displayCode.toLowerCase().startsWith(needle)
  );
  return matches.slice(0, 50);
}

/**
 * Pure: compute display-only line total for the summary block. Server
 * is authoritative; this preview parses the Decimal-as-string price.
 */
export function previewManualLineTotal(
  unitPrice: string,
  quantity: number
): string {
  const n = Number(unitPrice);
  if (!Number.isFinite(n)) return '0.00';
  return (n * quantity).toFixed(2);
}

export function ManualCreateBookingDialog({
  open,
  onOpenChange,
  liveSessionId,
  products,
}: ManualCreateBookingDialogProps) {
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerSearchState, setCustomerSearchState] =
    useState<CustomerSearchState>({ kind: 'idle' });
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchHit | null>(null);
  const [productCodeInput, setProductCodeInput] = useState('');
  const [selectedProduct, setSelectedProduct] =
    useState<SaleBroadcastProductRow | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  // Stable ids for accessibility (label/input wiring).
  const customerSearchId = useId();
  const productSearchId = useId();
  const quantityId = useId();

  // ── Debounced customer search ──
  //
  // 350ms debounce + minimum 2 chars + skip when a customer is already
  // selected (search panel hidden). Cancel-on-unmount + cancel-on-edit
  // pattern matches the shell's fetch lifecycle.
  useEffect(() => {
    if (selectedCustomer !== null) {
      setCustomerSearchState({ kind: 'idle' });
      return;
    }
    const term = customerSearchInput.trim();
    if (term.length < 2) {
      setCustomerSearchState({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setCustomerSearchState({ kind: 'loading' });
      (async () => {
        try {
          const url = `/api/customers?search=${encodeURIComponent(term)}&limit=20`;
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
          });
          let body: CustomerSearchResponseBody | null = null;
          try {
            body = (await res.json()) as CustomerSearchResponseBody;
          } catch {
            body = null;
          }
          if (cancelled) return;
          if (!res.ok || body?.success !== true || !Array.isArray(body.data)) {
            setCustomerSearchState({
              kind: 'error',
              message: body?.error ?? `HTTP ${res.status}`,
            });
            return;
          }
          const hits: CustomerSearchHit[] = body.data.map((raw) => ({
            id: String(raw.id ?? ''),
            name: String(raw.name ?? '—'),
            phone: raw.phone ?? null,
            email: raw.email ?? null,
            isBanned: raw.isBanned === true,
            orderCount:
              typeof raw._count?.orders === 'number' ? raw._count.orders : 0,
          }));
          setCustomerSearchState({ kind: 'ready', hits });
        } catch (err) {
          if (cancelled) return;
          setCustomerSearchState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [customerSearchInput, selectedCustomer]);

  // Reset all state on close so reopening starts fresh.
  function resetForm() {
    setCustomerSearchInput('');
    setCustomerSearchState({ kind: 'idle' });
    setSelectedCustomer(null);
    setProductCodeInput('');
    setSelectedProduct(null);
    setQuantity(1);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const visibleProducts = useMemo(
    () => filterProductsByCodePrefix(products, productCodeInput),
    [products, productCodeInput]
  );

  const canPreviewSummary =
    selectedCustomer !== null &&
    selectedProduct !== null &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 999;

  const lineTotalPreview = canPreviewSummary
    ? previewManualLineTotal(selectedProduct!.unitPrice, quantity)
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>สร้าง booking เอง (Manual Create)</DialogTitle>
          <DialogDescription>
            เลือกลูกค้า + รหัสสินค้า + จำนวน. สถานะเริ่มต้น{' '}
            <code>PENDING_REVIEW</code> — admin ต้องกด Confirm ภายหลังเพื่อจองสต็อก.
          </DialogDescription>
        </DialogHeader>

        {/* ── Customer step ── */}
        <div className="space-y-1.5">
          <Label htmlFor={customerSearchId} className="text-xs">
            ลูกค้า
          </Label>
          {selectedCustomer === null ? (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={customerSearchId}
                  className="pl-7"
                  placeholder="พิมพ์ชื่อ / เบอร์ / อีเมล (อย่างน้อย 2 ตัวอักษร)"
                  value={customerSearchInput}
                  onChange={(e) => setCustomerSearchInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <CustomerSearchResults
                state={customerSearchState}
                onPick={(hit) => setSelectedCustomer(hit)}
              />
            </>
          ) : (
            <SelectedCustomerCard
              hit={selectedCustomer}
              onClear={() => {
                setSelectedCustomer(null);
                setCustomerSearchInput('');
              }}
            />
          )}
        </div>

        <Separator />

        {/* ── Product step ── */}
        <div className="space-y-1.5">
          <Label htmlFor={productSearchId} className="text-xs">
            รหัสสินค้า (BroadcastProduct)
          </Label>
          {selectedProduct === null ? (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={productSearchId}
                  className="pl-7 font-mono"
                  placeholder="กรองด้วย display code เช่น A0..."
                  value={productCodeInput}
                  onChange={(e) => setProductCodeInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <ProductPickerList
                visible={visibleProducts}
                totalCount={products.length}
                onPick={(p) => setSelectedProduct(p)}
              />
            </>
          ) : (
            <SelectedProductCard
              product={selectedProduct}
              onClear={() => {
                setSelectedProduct(null);
                setProductCodeInput('');
              }}
            />
          )}
        </div>

        <Separator />

        {/* ── Quantity + Status ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={quantityId} className="text-xs">
              จำนวน
            </Label>
            <Input
              id={quantityId}
              type="number"
              min={1}
              max={999}
              step={1}
              value={quantity}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                if (Number.isNaN(parsed)) {
                  setQuantity(1);
                  return;
                }
                if (parsed < 1) {
                  setQuantity(1);
                  return;
                }
                if (parsed > 999) {
                  setQuantity(999);
                  return;
                }
                setQuantity(parsed);
              }}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">สถานะเริ่มต้น</Label>
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5">
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 text-[10px]">
                PENDING
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Confirm ภายหลัง
              </span>
            </div>
          </div>
        </div>

        {/* ── Summary block ── */}
        {canPreviewSummary && lineTotalPreview !== null ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Session</dt>
              <dd className="text-right font-mono">
                {liveSessionId.slice(0, 12)}…
              </dd>
              <dt className="text-muted-foreground">ลูกค้า</dt>
              <dd className="truncate text-right">{selectedCustomer!.name}</dd>
              <dt className="text-muted-foreground">รหัส</dt>
              <dd className="text-right font-mono">
                {selectedProduct!.displayCode}
              </dd>
              <dt className="text-muted-foreground">สินค้า</dt>
              <dd className="truncate text-right">
                {selectedProduct!.productName}
              </dd>
              <dt className="text-muted-foreground">จำนวน</dt>
              <dd className="text-right font-mono">×{quantity}</dd>
              <dt className="text-muted-foreground">ราคาต่อชิ้น</dt>
              <dd className="text-right font-mono">
                RM{selectedProduct!.unitPrice}
              </dd>
              <dt className="font-medium">รวม</dt>
              <dd className="text-right font-mono font-semibold">
                RM{lineTotalPreview}
              </dd>
            </dl>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            เลือกลูกค้า + รหัสสินค้า + จำนวนให้ครบเพื่อดูสรุปก่อนสร้าง.
          </p>
        )}

        {/* ── Phase 3 skeleton notice ── */}
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Phase 3 — preview ก่อนเปิดใช้งาน</p>
          <p className="mt-1 text-[11px]">
            ฟอร์มนี้ยังไม่ส่งคำขอ. Phase 4 จะเปิด submit + ส่ง POST
            /api/sale/bookings พร้อม error mapping เต็มรูปแบบ.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button disabled title="จะเปิดใช้งานในขั้นถัดไป (Phase 4)">
            <Loader2 className="size-4 opacity-0" aria-hidden />
            จะเปิดใช้งานในขั้นถัดไป
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components (local — exported for testability where useful) ──

function CustomerSearchResults({
  state,
  onPick,
}: {
  readonly state: CustomerSearchState;
  readonly onPick: (hit: CustomerSearchHit) => void;
}) {
  if (state.kind === 'idle') {
    return (
      <p className="text-[11px] text-muted-foreground">
        พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหาลูกค้า.
      </p>
    );
  }
  if (state.kind === 'loading') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        กำลังค้นหา…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className="text-[11px] text-destructive">ค้นหาไม่สำเร็จ: {state.message}</p>
    );
  }
  if (state.hits.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        ไม่พบลูกค้าที่ตรงกับคำค้น.
      </p>
    );
  }
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-border text-xs">
      {state.hits.map((hit) => {
        const banned = hit.isBanned;
        return (
          <li
            key={hit.id}
            className={`border-b border-border last:border-b-0 ${
              banned ? 'opacity-60' : ''
            }`}
          >
            <button
              type="button"
              disabled={banned}
              onClick={() => !banned && onPick(hit)}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left enabled:hover:bg-muted/50 disabled:cursor-not-allowed"
              title={banned ? 'ลูกค้านี้ถูก ban — เลือกไม่ได้' : undefined}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{hit.name}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {formatCustomerSecondaryLine(hit)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {hit.orderCount} ออเดอร์
                </span>
                {banned ? (
                  <Badge
                    variant="destructive"
                    className="gap-0.5 text-[9px]"
                  >
                    <Ban className="size-2.5" aria-hidden />
                    BANNED
                  </Badge>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedCustomerCard({
  hit,
  onClear,
}: {
  readonly hit: CustomerSearchHit;
  readonly onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
      <div className="min-w-0">
        <p className="truncate font-medium">{hit.name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {formatCustomerSecondaryLine(hit)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="ล้างการเลือกลูกค้า"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ProductPickerList({
  visible,
  totalCount,
  onPick,
}: {
  readonly visible: readonly SaleBroadcastProductRow[];
  readonly totalCount: number;
  readonly onPick: (p: SaleBroadcastProductRow) => void;
}) {
  if (totalCount === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        ไม่มี BroadcastProduct ในรอบนี้.
      </p>
    );
  }
  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        ไม่พบรหัสสินค้าที่ตรงกับคำค้น.
      </p>
    );
  }
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-border text-xs">
      {visible.map((p) => {
        const outOfStock = p.availableQty === 0;
        return (
          <li
            key={p.broadcastProductId}
            className="border-b border-border last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {p.displayCode}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.productName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {p.variantName || p.sku}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px]">RM{p.unitPrice}</span>
                {outOfStock ? (
                  <Badge
                    variant="outline"
                    className="gap-0.5 border-red-300 text-[9px] text-red-700"
                  >
                    <AlertTriangle className="size-2.5" aria-hidden />
                    หมด
                  </Badge>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.availableQty} ชิ้น
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedProductCard({
  product,
  onClear,
}: {
  readonly product: SaleBroadcastProductRow;
  readonly onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {product.displayCode}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{product.productName}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {product.variantName || product.sku} · RM{product.unitPrice} ·{' '}
            {product.availableQty} ชิ้น
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="ล้างการเลือกสินค้า"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

// Keep an icon import warm so future Phase 4 wiring already has the
// Plus icon available without a follow-up edit.
export const _ManualCreateDialogIcons = Object.freeze({
  Plus,
});
