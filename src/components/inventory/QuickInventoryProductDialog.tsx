'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  QuickProductFormFields,
} from '@/components/shared/QuickProductFormFields';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  type QuickProductCategory,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

/**
 * QuickInventoryProductDialog — Tier 3.9-D + 3.9-D2-B (2026-05-23).
 *
 * Boss inventory creation pattern (mirrors `/sale` quick-create UX).
 *
 * Two submit modes, switched via the "สร้างหลายรหัส / Bulk range"
 * toggle (default OFF):
 *
 *   - SINGLE (default) — creates ONE Product with ONE default Variant
 *     by POSTing to the existing `/api/products` route. Does NOT
 *     create a BroadcastProduct row.
 *   - BULK (Tier 3.9-D2-B) — creates N Product + ProductVariant pairs
 *     in one transaction by POSTing to
 *     `/api/inventory/quick-product-bulk` (Tier 3.9-D2-A). All-or-
 *     nothing. Cap = QUICK_BULK_MAX_RANGE (100). Still does NOT create
 *     BroadcastProduct rows. Still no saleDate involved.
 *
 * Image upload is deferred in both modes for this dialog. Real upload
 * uses `POST /api/products/[id]/images` after the product row is
 * created. Admin can add images on the inventory edit page after
 * creating the product(s).
 *
 * Defaults align with the inventory product / inventory bulk schemas
 * (`src/lib/validation/product.schemas.ts` for single,
 *  `src/lib/validation/inventory.schemas.ts` for bulk):
 *   - name optional (server fills placeholder from saleCode/stockCode)
 *   - price empty → '0'
 *   - quantity defaults to 1 (0 also valid)
 *   - category optional
 *
 * Old `ProductForm` remains available on `/inventory/new` behind an
 * "Advanced" toggle for cases where multiple variants or upfront image
 * upload are required.
 */

export interface QuickInventoryProductDialogProps {
  readonly categories: readonly QuickProductCategory[];
  /** Called after successful create; useful for parent toast/refresh. */
  readonly onCreated?: () => void;
  /** Render as the trigger button only — caller controls placement. */
  readonly triggerLabel?: string;
  /** Render the dialog open from mount (useful for tests / inline use). */
  readonly defaultOpen?: boolean;
}

/**
 * Build the payload for POST /api/inventory/quick-product-bulk from
 * the form state. Used when the bulk-range toggle is ON.
 *
 * Pure — extracted so unit tests can verify shape without rendering.
 *
 * Shape mirrors `inventoryBulkBodySchema`. Sale-only fields (saleDate,
 * imageUrl) are NEVER included. `variants[]` is NEVER included —
 * variant fields are flat at the top level.
 */
export function buildInventoryBulkPayload(
  form: QuickProductFormState
): Record<string, unknown> {
  const stockCodeBase = form.stockCodeBase.trim();
  const saleCodeBase = form.saleCodeBase.trim();
  const name = form.productName.trim();
  const description = form.productDetails.trim();
  const categoryId =
    form.categoryId && form.categoryId !== '__none__' ? form.categoryId : undefined;

  const priceRaw = form.price.trim();
  const price = priceRaw === '' ? '0' : priceRaw;
  const costRaw = form.cost.trim();
  const quantity = form.quantity === '' ? 1 : parseInt(form.quantity, 10);
  const lowStockAtRaw = form.lowStockAt.trim();
  const lowStockAt = lowStockAtRaw === '' ? undefined : parseInt(lowStockAtRaw, 10);

  const startNoRaw = form.startNo.trim();
  const endNoRaw = form.endNo.trim();
  const startNo = startNoRaw === '' ? undefined : parseInt(startNoRaw, 10);
  const endNo = endNoRaw === '' ? undefined : parseInt(endNoRaw, 10);

  const payload: Record<string, unknown> = {
    stockCodeBase,
    saleCodeBase,
    price,
    quantity,
  };
  if (name !== '') payload.productName = name;
  if (description !== '') payload.productDetails = description;
  if (categoryId !== undefined) payload.categoryId = categoryId;
  if (costRaw !== '') payload.cost = costRaw;
  if (lowStockAt !== undefined) payload.lowStockAt = lowStockAt;
  if (startNo !== undefined) payload.startNo = startNo;
  if (endNo !== undefined) payload.endNo = endNo;

  return payload;
}

/**
 * Build the payload for POST /api/products from the form state.
 * Pure — extracted so unit tests can verify shape without rendering.
 */
export function buildInventoryCreatePayload(
  form: QuickProductFormState
): Record<string, unknown> {
  const stockCode = form.stockCodeBase.trim();
  const saleCode = form.saleCodeBase.trim();
  const name = form.productName.trim();
  const description = form.productDetails.trim();
  const categoryId =
    form.categoryId && form.categoryId !== '__none__' ? form.categoryId : undefined;

  // SKU mirrors the `/sale` quick-create repository convention: when
  // the operator does not provide an explicit SKU we use the stockCode
  // verbatim (1 product = 1 default variant in this single-variant
  // dialog). Inventory ProductForm later supports adding more variants.
  const sku = stockCode;
  const priceRaw = form.price.trim();
  const price = priceRaw === '' ? '0' : priceRaw;
  const costPriceRaw = form.cost.trim();
  const quantity = form.quantity === '' ? 1 : parseInt(form.quantity, 10);
  const lowStockAtRaw = form.lowStockAt.trim();
  const lowStockAt = lowStockAtRaw === '' ? undefined : parseInt(lowStockAtRaw, 10);

  const variant: Record<string, unknown> = {
    sku,
    attributes: {},
    price,
    quantity,
  };
  if (costPriceRaw !== '') variant.costPrice = costPriceRaw;
  if (lowStockAt !== undefined) variant.lowStockAt = lowStockAt;

  const payload: Record<string, unknown> = {
    name,
    stockCode,
    variants: [variant],
  };
  if (saleCode !== '') payload.saleCode = saleCode;
  if (description !== '') payload.description = description;
  if (categoryId !== undefined) payload.categoryId = categoryId;

  return payload;
}

export function QuickInventoryProductDialog({
  categories,
  onCreated,
  triggerLabel,
  defaultOpen = false,
}: QuickInventoryProductDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState<QuickProductFormState>({ ...EMPTY_QUICK_PRODUCT_FORM });
  const [bulkMode, setBulkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, readonly string[]>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset form whenever dialog closes
  useEffect(() => {
    if (!open) {
      setForm({ ...EMPTY_QUICK_PRODUCT_FORM });
      setBulkMode(false);
      setFieldErrors({});
      setTopLevelError(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
    }
  }, [open]);

  // Reset bulk range fields when toggling bulk mode OFF to avoid stale
  // startNo/endNo carrying over into single-mode submit.
  function toggleBulkMode(next: boolean) {
    setBulkMode(next);
    if (!next) {
      setForm((prev) => ({ ...prev, startNo: '', endNo: '' }));
    }
    setFieldErrors({});
    setTopLevelError(null);
  }

  function updateField<K extends keyof QuickProductFormState>(
    key: K,
    value: QuickProductFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFieldErrors({});
    setTopLevelError(null);
    setSuccessMessage(null);

    const endpoint = bulkMode
      ? '/api/inventory/quick-product-bulk'
      : '/api/products';
    const payload = bulkMode
      ? buildInventoryBulkPayload(form)
      : buildInventoryCreatePayload(form);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { id?: string; createdCount?: number };
        error?: string;
        fields?: Record<string, string[]>;
      };
      if (!res.ok || !body.success) {
        if (body.fields) setFieldErrors(body.fields);
        setTopLevelError(body.error ?? 'Create failed');
        return;
      }

      // Bulk mode: show short success summary in-dialog so admin sees
      // createdCount before closing. Single mode keeps the previous
      // close-on-success UX.
      if (bulkMode && typeof body.data?.createdCount === 'number') {
        setSuccessMessage(`สร้างสินค้า ${body.data.createdCount} รายการสำเร็จ`);
        onCreated?.();
        router.refresh();
        // Reset form for next bulk batch, keep dialog open so admin can
        // continue adding ranges without re-opening.
        setForm({ ...EMPTY_QUICK_PRODUCT_FORM });
        return;
      }

      setOpen(false);
      onCreated?.();
      router.refresh();
    } catch (err) {
      setTopLevelError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="default"
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <PackagePlus className="mr-2 h-4 w-4" />
        {triggerLabel ?? '+ สร้างสินค้าใหม่ (Quick Create)'}
      </Button>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>สร้างสินค้าใหม่ในคลัง</DialogTitle>
          <DialogDescription>
            กรอกเฉพาะรหัสสต็อก + รหัสขาย เป็นขั้นต่ำ. ข้อมูลที่ไม่กรอกสามารถ edit ภายหลังได้.
            ระบบจะสร้างสินค้าหนึ่งรายการพร้อม variant พื้นฐาน. เพิ่ม variants / รูป /
            รายละเอียดเพิ่มเติมได้จากหน้าแก้ไขสินค้า. หากต้องการสร้างหลาย variants
            พร้อมกัน ให้สลับไปใช้ Advanced form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-dashed border-muted bg-muted/30 px-3 py-2">
            <input
              type="checkbox"
              id="qid-bulk-mode"
              checked={bulkMode}
              onChange={(e) => toggleBulkMode(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4"
              aria-label="bulk-range-toggle"
            />
            <label
              htmlFor="qid-bulk-mode"
              className="cursor-pointer select-none text-sm font-medium"
            >
              สร้างหลายรหัส (Bulk range)
            </label>
            {bulkMode && (
              <span className="ml-auto text-xs text-muted-foreground">
                สูงสุด 100 รายการ / รอบ
              </span>
            )}
          </div>

          <QuickProductFormFields
            form={form}
            onChange={updateField}
            fieldErrors={fieldErrors}
            categories={categories}
            showBulkRange={bulkMode}
          />

          {successMessage !== null && (
            <div
              role="status"
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"
            >
              {successMessage}
            </div>
          )}

          {topLevelError !== null && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {topLevelError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              สร้างสินค้า
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
