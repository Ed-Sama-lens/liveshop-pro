'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X, AlertTriangle, Ban } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  filterProductsByCodePrefix,
  previewManualLineTotal,
  formatCustomerSecondaryLine,
} from './manual-create.helpers';

/**
 * Manual Create booking modal — fourth /sale mutation surface.
 *
 * Phase 4 (2026-05-13): POST wired against existing route
 * POST /api/sale/bookings (Commit 2N route, shipped + tested via
 * verify-booking-create.ts 13/13 Docker E2E). Submit fires once per
 * click with idempotencyKey from crypto.randomUUID() generated at
 * dialog open. Status locked to PENDING_REVIEW per Phase 4 plan in
 * docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md
 * — admin confirms via the existing Confirm button on the resulting
 * row, keeping the two-step flow safer for first manual run.
 *
 * Mutation surface delta: 3 → 4 POSTs (Confirm + Cancel + CreateOrder +
 * ManualCreate). All POSTs confined to this module.
 *
 * Scope:
 * - Customer search uses sale-scoped minimal route
 *   `GET /api/sale/customers/search?q=&limit=` (Boss 2026-05-13 push
 *   harden). Returns ONLY customerId / name / phone / email /
 *   isBanned / orderCount — strictly minimum PII for the picker. See
 *   route docstring for the full PII whitelist + forbidden-field list.
 * - Broadcast product picker filters the parent-supplied product
 *   array client-side by displayCode prefix. No new fetch.
 * - Status locked to PENDING_REVIEW. CONFIRMED status NOT exposed
 *   yet (defer to later commit per audit M4).
 * - Banned customers: rendered + disabled (audit M2).
 * - Out-of-stock variants: rendered + flagged but selectable (audit M2)
 *   — server-side stock check fires only on status=CONFIRMED, and we
 *   lock to PENDING_REVIEW here.
 * - idempotencyKey: crypto.randomUUID() (UUID v4, 36 chars; matches
 *   server regex `^[A-Za-z0-9_-]{8,128}$`). Generated once per manual-
 *   create draft via lazy useState init. STABLE across retry — a 429
 *   or 500 followed by re-submit reuses the same key so the server
 *   replays idempotently rather than creating a second booking. Key
 *   regenerates only when the modal closes + reopens (resetForm).
 *   Boss 2026-05-13 push harden DoD §3.
 * - No customer-facing message. No platform integration.
 *
 * Error mapping (8 cases — mirrors Confirm/Cancel/CreateOrder pattern):
 *   401 → "ต้อง sign-in ก่อน"
 *   403 → "ไม่มีสิทธิ์สร้าง booking"
 *   400 → "ข้อมูลไม่ถูกต้อง"
 *   404 → "ลูกค้าหรือสินค้าไม่พบ"
 *   409 → "สร้างไม่ได้ — กรุณาตรวจข้อมูล"
 *   422 → "BroadcastProduct ไม่มี variant"
 *   429 → "ส่งคำสั่งถี่เกินไป กรุณารอ ~{N} วินาที"
 *   500 → "เซิร์ฟเวอร์มีปัญหา"
 *   other → server message or generic fallback
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
  data?: {
    customers?: ReadonlyArray<{
      customerId?: string;
      name?: string;
      phone?: string | null;
      email?: string | null;
      isBanned?: boolean;
      orderCount?: number;
    }>;
  };
}

interface InlineError {
  readonly title: string;
  readonly detail: string;
}

function mapErrorByStatus(
  status: number,
  body: { error?: string } | null,
  retryAfter: string | null
): InlineError {
  if (status === 401) {
    return {
      title: 'ต้อง sign-in ก่อน',
      detail: body?.error ?? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    };
  }
  if (status === 403) {
    return {
      title: 'ไม่มีสิทธิ์สร้าง booking',
      detail: body?.error ?? 'บัญชีนี้ห้ามสร้าง booking (เฉพาะ OWNER/MANAGER)',
    };
  }
  if (status === 400) {
    return {
      title: 'ข้อมูลไม่ถูกต้อง',
      detail: body?.error ?? 'กรุณาตรวจรายการที่กรอก',
    };
  }
  if (status === 404) {
    return {
      title: 'ลูกค้าหรือสินค้าไม่พบ',
      detail: body?.error ?? 'ลูกค้าหรือสินค้าอาจถูกลบหรือเปลี่ยนสถานะแล้ว',
    };
  }
  if (status === 409) {
    return {
      title: 'สร้างไม่ได้',
      detail:
        body?.error ??
        'ตรวจสอบสถานะลูกค้า (ถูก ban?) หรือสต็อก หรือ idempotency key',
    };
  }
  if (status === 422) {
    return {
      title: 'ข้อมูล booking ไม่ครบ',
      detail: body?.error ?? 'BroadcastProduct ไม่มี variant',
    };
  }
  if (status === 429) {
    const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
    const wait =
      Number.isFinite(seconds) && seconds > 0
        ? `ประมาณ ${seconds} วินาที`
        : 'สักครู่';
    return {
      title: 'ส่งคำสั่งถี่เกินไป',
      detail: `กรุณารอ${wait}แล้วลองใหม่อีกครั้ง`,
    };
  }
  if (status === 500) {
    return {
      title: 'เซิร์ฟเวอร์มีปัญหา',
      detail: body?.error ?? 'กรุณาแจ้ง admin ตรวจสอบข้อมูล booking',
    };
  }
  return {
    title: 'สร้าง booking ไม่สำเร็จ',
    detail: body?.error ?? `HTTP ${status}`,
  };
}

/**
 * Pure: generate a fresh idempotency key. Matches server regex
 * `^[A-Za-z0-9_-]{8,128}$` (UUID v4 hex+dashes, 36 chars).
 * Wrapped so tests can mock + so the call site stays declarative.
 */
function makeIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function ManualCreateBookingDialog({
  open,
  onOpenChange,
  liveSessionId,
  products,
  onSuccess,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  // idempotencyKey lifecycle (Boss 2026-05-13 push harden DoD §3):
  // - generated ONCE per manual-create draft (lazy useState init below)
  // - reused across every retry inside that draft (handleSubmit reads
  //   from state — it does NOT call makeIdempotencyKey()), so 429 /
  //   500 / network-fail retries replay the same key and the server
  //   responds idempotent on the second hit
  // - regenerated only when the modal closes + reopens (resetForm
  //   below). Selected customer / product / quantity changes inside the
  //   same open modal do NOT regenerate the key — they belong to the
  //   same draft.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    makeIdempotencyKey()
  );

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
          // Minimal PII-safe sale-scoped search endpoint (Boss
          // 2026-05-13 push harden). Returns only customerId / name /
          // phone / email / isBanned / orderCount. See route + tests
          // at src/app/api/sale/customers/search/route.ts.
          const url = `/api/sale/customers/search?q=${encodeURIComponent(term)}&limit=20`;
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
          const list = body?.data?.customers;
          if (!res.ok || body?.success !== true || !Array.isArray(list)) {
            setCustomerSearchState({
              kind: 'error',
              message: body?.error ?? `HTTP ${res.status}`,
            });
            return;
          }
          const hits: CustomerSearchHit[] = list.map((raw) => ({
            id: String(raw.customerId ?? ''),
            name: String(raw.name ?? '—'),
            phone: raw.phone ?? null,
            email: raw.email ?? null,
            isBanned: raw.isBanned === true,
            orderCount:
              typeof raw.orderCount === 'number' ? raw.orderCount : 0,
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

  // Reset all state on close so reopening starts fresh. Generates a
  // new idempotency key — a fresh open is intentionally a fresh
  // creation attempt.
  function resetForm() {
    setCustomerSearchInput('');
    setCustomerSearchState({ kind: 'idle' });
    setSelectedCustomer(null);
    setProductCodeInput('');
    setSelectedProduct(null);
    setQuantity(1);
    setInlineError(null);
    setIdempotencyKey(makeIdempotencyKey());
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return; // block close mid-request
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (
      !selectedCustomer ||
      !selectedProduct ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      return;
    }
    setInlineError(null);
    setIsSubmitting(true);
    try {
      // POST body invariants (Boss 2026-05-13 push harden DoD §3 + §4):
      // - status is HARD-CODED 'PENDING_REVIEW'; CONFIRMED never sent
      //   from this UI even though server accepts it.
      // - idempotencyKey read from component state — same value every
      //   retry inside this draft. Do NOT call makeIdempotencyKey() here.
      const res = await fetch('/api/sale/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          liveSessionId,
          customerId: selectedCustomer.id,
          broadcastProductId: selectedProduct.broadcastProductId,
          quantity,
          status: 'PENDING_REVIEW' as const,
          idempotencyKey,
        }),
      });

      const retryAfter = res.headers.get('Retry-After');
      type CreateBookingResponseBody = {
        success?: boolean;
        error?: string;
        data?: {
          bookingId?: string;
          status?: string;
          idempotent?: boolean;
        };
      };
      let body: CreateBookingResponseBody | null = null;
      try {
        body = (await res.json()) as CreateBookingResponseBody;
      } catch {
        body = null;
      }

      if (!res.ok || body?.success !== true) {
        setInlineError(mapErrorByStatus(res.status, body, retryAfter));
        return;
      }

      const idempotent = body?.data?.idempotent === true;
      const verb = idempotent
        ? 'booking มีอยู่แล้ว'
        : 'สร้าง booking สำเร็จ';
      const code = selectedProduct.displayCode;
      const name = selectedCustomer.name;
      toast.success(`${verb} — ${name} × ${code} × ${quantity}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setInlineError({
        title: 'การเชื่อมต่อขัดข้อง',
        detail: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setIsSubmitting(false);
    }
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

        {/* ── Activation notice ── */}
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">หมายเหตุ</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px]">
            <li>booking ถูกสร้างเป็น <code>PENDING_REVIEW</code> — ยังไม่ตัดสต็อก.</li>
            <li>กด Confirm ที่แถวจองเพื่อจองสต็อก (reservedQty +N).</li>
            <li>ห้ามใช้สร้าง booking ของลูกค้าจริงจนกว่า Boss จะอนุมัติ smoke test.</li>
          </ul>
        </div>

        {inlineError ? (
          <div
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950/40"
            role="alert"
          >
            <p className="font-medium text-red-900 dark:text-red-100">
              {inlineError.title}
            </p>
            <p className="mt-1 text-xs text-red-800 dark:text-red-200">
              {inlineError.detail}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !canPreviewSummary}
            title={
              !canPreviewSummary
                ? 'กรอกลูกค้า + สินค้า + จำนวนให้ครบก่อน'
                : undefined
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังสร้าง…
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden />
                สร้าง booking (PENDING_REVIEW)
              </>
            )}
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

