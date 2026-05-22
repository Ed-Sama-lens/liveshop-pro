'use client';

import { useState, useEffect } from 'react';
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
  calcPreviewCount,
  exceedsBulkCap,
} from '@/components/shared/QuickProductFormFields';
import {
  EMPTY_QUICK_PRODUCT_FORM,
  type QuickProductCategory,
  type QuickProductFormState,
} from '@/components/shared/quick-product-form.types';

/**
 * CreateQuickProductCodeDialog — Tier 3.8 (PR-B) UI.
 *
 * Boss live-selling workflow: create Product + Variant +
 * BroadcastProduct in one shot from /sale, without switching to
 * /inventory. Single mode (one code) and bulk mode (Start/End No.,
 * e.g. CM1..CM67).
 *
 * Tier 3.9-D (2026-05-23): field layout extracted to shared
 * `QuickProductFormFields` so `/inventory/new` can reuse the same
 * layout. Behavior here is unchanged — same payload, same route,
 * same defaults, same Thai labels.
 *
 * Entry points:
 *  - Product Codes panel empty-state CTA (replaces Add-from-Stock
 *    when stock is empty)
 *  - Optional: AddFromStockDialog "create new" fallback when search
 *    returns 0 results (handled separately)
 *
 * POSTs to /api/sale/quick-product-codes (Tier 3.8 route).
 *
 * Plan ref: docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md
 */

// Re-export the shared category type to preserve import path used by
// callers of this dialog (no consumer breaking change).
export type { QuickProductCategory as QuickProductCodeCategory };

export interface CreateQuickProductCodeDialogProps {
  readonly categories: readonly QuickProductCategory[];
  readonly onCreated: () => void;
  /** Allow rendering as a controlled child of another dialog */
  readonly defaultOpen?: boolean;
  /** Optional override for trigger label */
  readonly triggerLabel?: string;
  /**
   * Tier 3.9 — Sale Date (YYYY-MM-DD) inherited from parent. When
   * omitted/null, server defaults to today in shop timezone. When
   * provided, all created trios share this saleDate.
   */
  readonly saleDate?: string | null;
}

export function CreateQuickProductCodeDialog({
  categories,
  onCreated,
  defaultOpen = false,
  triggerLabel,
  saleDate,
}: CreateQuickProductCodeDialogProps) {
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

  const previewCount = calcPreviewCount(form);
  const exceedsMax = exceedsBulkCap(previewCount);

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

    const payload: Record<string, unknown> = {
      stockCodeBase: form.stockCodeBase.trim(),
      saleCodeBase: form.saleCodeBase.trim(),
    };
    if (form.categoryId && form.categoryId !== '__none__') {
      payload.categoryId = form.categoryId;
    }
    if (form.productName.trim() !== '') payload.productName = form.productName.trim();
    if (form.productDetails.trim() !== '') {
      payload.productDetails = form.productDetails.trim();
    }
    if (form.imageUrl.trim() !== '') payload.imageUrl = form.imageUrl.trim();
    if (form.startNo !== '') payload.startNo = parseInt(form.startNo, 10);
    if (form.endNo !== '') payload.endNo = parseInt(form.endNo, 10);
    payload.quantity = form.quantity === '' ? 1 : parseInt(form.quantity, 10);
    if (form.lowStockAt !== '') payload.lowStockAt = parseInt(form.lowStockAt, 10);
    payload.price = form.price.trim();
    if (form.cost.trim() !== '') payload.cost = form.cost.trim();
    // Tier 3.9 — inherit saleDate from parent; server falls back to
    // today in shop timezone when omitted.
    if (saleDate) payload.saleDate = saleDate;

    try {
      const res = await fetch('/api/sale/quick-product-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { createdCount: number };
        error?: string;
        fields?: Record<string, string[]>;
      };
      if (!res.ok || !body.success) {
        if (body.fields) setFieldErrors(body.fields);
        setTopLevelError(body.error ?? 'Create failed');
        return;
      }

      // Success — close + signal refresh
      setOpen(false);
      onCreated();
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
        {triggerLabel ?? '+ สร้างสินค้า + รหัส CF'}
      </Button>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>สร้างสินค้า + รหัส CF (Quick Create)</DialogTitle>
          <DialogDescription>
            สร้างสินค้าใหม่ในคลัง + รหัส CF (Product Code) พร้อมกัน. เหมาะกับการเตรียมรหัสจำนวนมากก่อนไลฟ์.
            ข้อมูลที่ไม่กรอกสามารถ edit ภายหลังได้.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <QuickProductFormFields
            form={form}
            onChange={updateField}
            fieldErrors={fieldErrors}
            categories={categories}
            showBulkRange
            showImageUrl
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
            <Button type="submit" disabled={isSubmitting || exceedsMax}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {previewCount > 1
                ? `สร้าง ${previewCount} รายการ`
                : 'สร้างรหัสสินค้า'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
