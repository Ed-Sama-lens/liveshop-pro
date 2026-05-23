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
 * QuickInventoryProductDialog — Tier 3.9-D (2026-05-23).
 *
 * Boss inventory creation pattern (mirrors `/sale` quick-create UX).
 * Creates ONE Product with ONE default Variant by POSTing to the
 * existing `/api/products` route. Does NOT create a BroadcastProduct
 * row (no saleDate involved on the inventory side).
 *
 * Bulk Start/End No. is intentionally hidden in this PR (D1). Bulk
 * inventory create requires a new repository method + API route to
 * loop the existing single-product create — deferred to PR 3.9-D2.
 * The shared `QuickProductFormFields` already supports bulk visually;
 * this dialog simply does not pass `showBulkRange`.
 *
 * Image upload is also deferred for this dialog. Real upload uses
 * `POST /api/products/[id]/images` after the product row is created,
 * so a flat URL field on a brand-new product would not match the R2
 * path convention. Admin can add images on the inventory edit page
 * after creating the product.
 *
 * Defaults align with the inventory product schema in
 * `src/lib/validation/product.schemas.ts`:
 *   - name optional (server fills placeholder from saleCode/stockCode)
 *   - price empty → '0'
 *   - quantity defaults to 1
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, readonly string[]>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  // Reset form whenever dialog closes
  useEffect(() => {
    if (!open) {
      setForm({ ...EMPTY_QUICK_PRODUCT_FORM });
      setFieldErrors({});
      setTopLevelError(null);
      setIsSubmitting(false);
    }
  }, [open]);

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

    const payload = buildInventoryCreatePayload(form);

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { id?: string };
        error?: string;
        fields?: Record<string, string[]>;
      };
      if (!res.ok || !body.success) {
        if (body.fields) setFieldErrors(body.fields);
        setTopLevelError(body.error ?? 'Create failed');
        return;
      }

      setOpen(false);
      onCreated?.();
      // Refresh the inventory list so the new product appears
      // immediately when the user lands back on /inventory.
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
          <QuickProductFormFields
            form={form}
            onChange={updateField}
            fieldErrors={fieldErrors}
            categories={categories}
          />

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
