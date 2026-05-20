'use client';

import { useState, useEffect, useMemo } from 'react';
import { PackagePlus, Loader2, Info, AlertCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * CreateQuickProductCodeDialog — Tier 3.8 (PR-B) UI.
 *
 * Boss live-selling workflow: create Product + Variant +
 * BroadcastProduct in one shot from /sale, without switching to
 * /inventory. Single mode (one code) and bulk mode (Start/End No.,
 * e.g. CM1..CM67).
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

export interface QuickProductCodeCategory {
  readonly id: string;
  readonly name: string;
}

export interface CreateQuickProductCodeDialogProps {
  readonly categories: readonly QuickProductCodeCategory[];
  readonly onCreated: () => void;
  /** Allow rendering as a controlled child of another dialog */
  readonly defaultOpen?: boolean;
  /** Optional override for trigger label */
  readonly triggerLabel?: string;
}

type FormState = {
  stockCodeBase: string;
  saleCodeBase: string;
  categoryId: string;
  productName: string;
  productDetails: string;
  imageUrl: string;
  startNo: string;
  endNo: string;
  quantity: string;
  lowStockAt: string;
  price: string;
  cost: string;
};

const EMPTY_FORM: FormState = Object.freeze({
  stockCodeBase: '',
  saleCodeBase: '',
  categoryId: '',
  productName: '',
  productDetails: '',
  imageUrl: '',
  startNo: '',
  endNo: '',
  quantity: '1',
  lowStockAt: '',
  price: '',
  cost: '',
});

const MAX_RANGE = 100;

export function CreateQuickProductCodeDialog({
  categories,
  onCreated,
  defaultOpen = false,
  triggerLabel,
}: CreateQuickProductCodeDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  // Reset form whenever dialog closes
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on dialog close; one-shot cleanup
      setForm({ ...EMPTY_FORM });
      setFieldErrors({});
      setTopLevelError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  // Preview count of how many items will be created
  const previewCount = useMemo(() => {
    if (form.startNo === '' || form.endNo === '') return 1;
    const s = parseInt(form.startNo, 10);
    const e = parseInt(form.endNo, 10);
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    if (e < s) return 0;
    return e - s + 1;
  }, [form.startNo, form.endNo]);

  const previewExample = useMemo(() => {
    if (form.startNo === '' || form.endNo === '') {
      return form.saleCodeBase ? `1 รายการ: ${form.saleCodeBase}` : '';
    }
    const s = parseInt(form.startNo, 10);
    const e = parseInt(form.endNo, 10);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return '';
    if (!form.saleCodeBase) return '';
    return `${previewCount} รายการ: ${form.saleCodeBase}${s} ถึง ${form.saleCodeBase}${e}`;
  }, [form.saleCodeBase, form.startNo, form.endNo, previewCount]);

  const exceedsMax = previewCount > MAX_RANGE;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
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

  function renderFieldError(field: string) {
    const msgs = fieldErrors[field];
    if (!msgs || msgs.length === 0) return null;
    return (
      <p className="text-xs text-destructive mt-1" role="alert">
        {msgs.join('; ')}
      </p>
    );
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
          {/* Required: stock + sale code base */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="stockCodeBase">
                รหัสสต็อก <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stockCodeBase"
                value={form.stockCodeBase}
                onChange={(e) => updateField('stockCodeBase', e.target.value)}
                placeholder="20.5.2026-CM"
                required
                aria-invalid={fieldErrors.stockCodeBase !== undefined}
              />
              {renderFieldError('stockCodeBase')}
            </div>
            <div>
              <Label htmlFor="saleCodeBase">
                รหัสขาย <span className="text-destructive">*</span>
              </Label>
              <Input
                id="saleCodeBase"
                value={form.saleCodeBase}
                onChange={(e) => updateField('saleCodeBase', e.target.value)}
                placeholder="CM"
                required
                aria-invalid={fieldErrors.saleCodeBase !== undefined}
              />
              {renderFieldError('saleCodeBase')}
            </div>
          </div>

          {/* Optional: category + image */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="categoryId">หมวดหมู่ (ไม่บังคับ)</Label>
              <Select
                value={form.categoryId === '' ? '__none__' : form.categoryId}
                onValueChange={(v) => {
                  const next = v === '__none__' || v === null ? '' : v;
                  updateField('categoryId', next);
                }}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="ไม่มีหมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ไม่มีหมวดหมู่</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderFieldError('categoryId')}
            </div>
            <div>
              <Label htmlFor="imageUrl">รูปสินค้า URL (ไม่บังคับ)</Label>
              <Input
                id="imageUrl"
                type="url"
                value={form.imageUrl}
                onChange={(e) => updateField('imageUrl', e.target.value)}
                placeholder="https://..."
                aria-invalid={fieldErrors.imageUrl !== undefined}
              />
              {renderFieldError('imageUrl')}
            </div>
          </div>

          {/* Optional: name + details */}
          <div>
            <Label htmlFor="productName">ชื่อสินค้า (ไม่บังคับ — edit ภายหลังได้)</Label>
            <Input
              id="productName"
              value={form.productName}
              onChange={(e) => updateField('productName', e.target.value)}
              placeholder="ปล่อยว่างได้ — ระบบใช้รหัสขายเป็น placeholder"
            />
          </div>
          <div>
            <Label htmlFor="productDetails">ข้อมูลสินค้า (ไม่บังคับ)</Label>
            <Textarea
              id="productDetails"
              value={form.productDetails}
              onChange={(e) => updateField('productDetails', e.target.value)}
              placeholder="คำอธิบายสินค้า"
              rows={2}
            />
          </div>

          {/* Bulk Start/End No */}
          <div className="rounded-md border border-muted p-3">
            <Label className="text-sm font-medium">สร้างจำนวนมาก (ไม่บังคับ)</Label>
            <p className="text-xs text-muted-foreground mt-1">
              ปล่อยว่างทั้งคู่ = สร้างรายการเดียวตามรหัส. กรอกทั้งคู่ = สร้างรายการต่อท้ายเลข เช่น <code>CM1, CM2, ... CM67</code>
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label htmlFor="startNo">Start No.</Label>
                <Input
                  id="startNo"
                  type="number"
                  min={0}
                  value={form.startNo}
                  onChange={(e) => updateField('startNo', e.target.value)}
                  placeholder="1"
                  aria-invalid={fieldErrors.startNo !== undefined}
                />
                {renderFieldError('startNo')}
              </div>
              <div>
                <Label htmlFor="endNo">End No.</Label>
                <Input
                  id="endNo"
                  type="number"
                  min={0}
                  value={form.endNo}
                  onChange={(e) => updateField('endNo', e.target.value)}
                  placeholder="67"
                  aria-invalid={fieldErrors.endNo !== undefined}
                />
                {renderFieldError('endNo')}
              </div>
            </div>
            {previewExample !== '' && (
              <div
                className={`mt-2 text-xs flex items-start gap-1 ${exceedsMax ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {exceedsMax ? (
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                ) : (
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                )}
                <span>
                  {exceedsMax
                    ? `จำนวน ${previewCount} รายการ เกินขีดจำกัด ${MAX_RANGE} ต่อครั้ง`
                    : `จะสร้าง: ${previewExample}`}
                </span>
              </div>
            )}
          </div>

          {/* Quantity + lowStock + price + cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">จำนวน (0 = สินค้าหมด)</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) => updateField('quantity', e.target.value)}
                placeholder="1"
                aria-invalid={fieldErrors.quantity !== undefined}
              />
              {renderFieldError('quantity')}
            </div>
            <div>
              <Label htmlFor="lowStockAt">แจ้งเตือนสต็อกต่ำที่ (ไม่บังคับ)</Label>
              <Input
                id="lowStockAt"
                type="number"
                min={0}
                value={form.lowStockAt}
                onChange={(e) => updateField('lowStockAt', e.target.value)}
                placeholder="ไม่กรอก = ไม่เตือน"
                aria-invalid={fieldErrors.lowStockAt !== undefined}
              />
              {renderFieldError('lowStockAt')}
            </div>
            <div>
              <Label htmlFor="price">ราคา (RM) — 0 ถ้ายังไม่ระบุ</Label>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => updateField('price', e.target.value)}
                placeholder="0"
                aria-invalid={fieldErrors.price !== undefined}
              />
              {renderFieldError('price')}
            </div>
            <div>
              <Label htmlFor="cost">ราคาต้นทุน (RM) — ไม่บังคับ</Label>
              <Input
                id="cost"
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => updateField('cost', e.target.value)}
                placeholder=""
                aria-invalid={fieldErrors.cost !== undefined}
              />
              {renderFieldError('cost')}
            </div>
          </div>

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
