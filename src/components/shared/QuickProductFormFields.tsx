'use client';

import { useMemo } from 'react';
import { Info, AlertCircle } from 'lucide-react';
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
import {
  QUICK_PRODUCT_BULK_MAX_RANGE,
  type QuickProductCategory,
  type QuickProductFormState,
} from './quick-product-form.types';

/**
 * QuickProductFormFields — Tier 3.9-D (2026-05-23) shared form layout.
 *
 * Presentational only. Owns no submit logic. Used by:
 *  - `CreateQuickProductCodeDialog` (sale, posts to /api/sale/quick-product-codes)
 *  - `QuickInventoryProductDialog` (inventory, posts to /api/products)
 *
 * Differences expressed via `showBulkRange` + `showImageUrl` flags:
 *  - Sale dialog enables both bulk range and image URL.
 *  - Inventory dialog (D1) hides bulk range — bulk inventory create
 *    needs an API route extension deferred to PR 3.9-D2.
 *  - Inventory dialog (D1) hides image URL — real image upload happens
 *    after product creation via `/api/products/[id]/images`. A flat URL
 *    field on a brand-new product would not match the existing R2 path
 *    convention.
 */

export interface QuickProductFormFieldsProps {
  readonly form: QuickProductFormState;
  readonly onChange: <K extends keyof QuickProductFormState>(
    key: K,
    value: QuickProductFormState[K]
  ) => void;
  readonly fieldErrors: Record<string, readonly string[]>;
  readonly categories: readonly QuickProductCategory[];
  readonly showBulkRange?: boolean;
  readonly showImageUrl?: boolean;
  readonly stockCodePlaceholder?: string;
  readonly saleCodePlaceholder?: string;
}

export function QuickProductFormFields({
  form,
  onChange,
  fieldErrors,
  categories,
  showBulkRange = false,
  showImageUrl = false,
  stockCodePlaceholder = '20.5.2026-CM',
  saleCodePlaceholder = 'CM',
}: QuickProductFormFieldsProps) {
  // Preview count of how many items will be created in bulk mode.
  const previewCount = useMemo(() => {
    if (!showBulkRange) return 1;
    if (form.startNo === '' || form.endNo === '') return 1;
    const s = parseInt(form.startNo, 10);
    const e = parseInt(form.endNo, 10);
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    if (e < s) return 0;
    return e - s + 1;
  }, [form.startNo, form.endNo, showBulkRange]);

  const previewExample = useMemo(() => {
    if (!showBulkRange) return '';
    if (form.startNo === '' || form.endNo === '') {
      return form.saleCodeBase ? `1 รายการ: ${form.saleCodeBase}` : '';
    }
    const s = parseInt(form.startNo, 10);
    const e = parseInt(form.endNo, 10);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return '';
    if (!form.saleCodeBase) return '';
    return `${previewCount} รายการ: ${form.saleCodeBase}${s} ถึง ${form.saleCodeBase}${e}`;
  }, [form.saleCodeBase, form.startNo, form.endNo, previewCount, showBulkRange]);

  const exceedsMax = previewCount > QUICK_PRODUCT_BULK_MAX_RANGE;

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
    <div className="space-y-4">
      {/* Required: stock + sale code base */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qpf-stockCodeBase">
            รหัสสต็อก <span className="text-destructive">*</span>
          </Label>
          <Input
            id="qpf-stockCodeBase"
            value={form.stockCodeBase}
            onChange={(e) => onChange('stockCodeBase', e.target.value)}
            placeholder={stockCodePlaceholder}
            required
            aria-invalid={fieldErrors.stockCodeBase !== undefined}
          />
          {renderFieldError('stockCodeBase')}
        </div>
        <div>
          <Label htmlFor="qpf-saleCodeBase">
            รหัสขาย <span className="text-destructive">*</span>
          </Label>
          <Input
            id="qpf-saleCodeBase"
            value={form.saleCodeBase}
            onChange={(e) => onChange('saleCodeBase', e.target.value)}
            placeholder={saleCodePlaceholder}
            required
            aria-invalid={fieldErrors.saleCodeBase !== undefined}
          />
          {renderFieldError('saleCodeBase')}
        </div>
      </div>

      {/* Optional: category + optional image URL */}
      <div className={`grid gap-3 ${showImageUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <Label htmlFor="qpf-categoryId">หมวดหมู่ (ไม่บังคับ)</Label>
          <Select
            value={form.categoryId === '' ? '__none__' : form.categoryId}
            onValueChange={(v) => {
              const next = v === '__none__' || v === null ? '' : v;
              onChange('categoryId', next);
            }}
          >
            <SelectTrigger id="qpf-categoryId" className="w-full">
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
        {showImageUrl ? (
          <div>
            <Label htmlFor="qpf-imageUrl">รูปสินค้า URL (ไม่บังคับ)</Label>
            <Input
              id="qpf-imageUrl"
              type="url"
              value={form.imageUrl}
              onChange={(e) => onChange('imageUrl', e.target.value)}
              placeholder="https://..."
              aria-invalid={fieldErrors.imageUrl !== undefined}
            />
            {renderFieldError('imageUrl')}
          </div>
        ) : null}
      </div>

      {/* Optional: name + details */}
      <div>
        <Label htmlFor="qpf-productName">ชื่อสินค้า (ไม่บังคับ — edit ภายหลังได้)</Label>
        <Input
          id="qpf-productName"
          value={form.productName}
          onChange={(e) => onChange('productName', e.target.value)}
          placeholder="ปล่อยว่างได้ — ระบบใช้รหัสขายเป็น placeholder"
        />
      </div>
      <div>
        <Label htmlFor="qpf-productDetails">ข้อมูลสินค้า (ไม่บังคับ)</Label>
        <Textarea
          id="qpf-productDetails"
          value={form.productDetails}
          onChange={(e) => onChange('productDetails', e.target.value)}
          placeholder="คำอธิบายสินค้า"
          rows={2}
        />
      </div>

      {/* Bulk Start/End No — only shown when caller enables it */}
      {showBulkRange ? (
        <div className="rounded-md border border-muted p-3">
          <Label className="text-sm font-medium">สร้างจำนวนมาก (ไม่บังคับ)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            ปล่อยว่างทั้งคู่ = สร้างรายการเดียวตามรหัส. กรอกทั้งคู่ = สร้างรายการต่อท้ายเลข เช่น <code>CM1, CM2, ... CM67</code>
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label htmlFor="qpf-startNo">Start No.</Label>
              <Input
                id="qpf-startNo"
                type="number"
                min={0}
                value={form.startNo}
                onChange={(e) => onChange('startNo', e.target.value)}
                placeholder="1"
                aria-invalid={fieldErrors.startNo !== undefined}
              />
              {renderFieldError('startNo')}
            </div>
            <div>
              <Label htmlFor="qpf-endNo">End No.</Label>
              <Input
                id="qpf-endNo"
                type="number"
                min={0}
                value={form.endNo}
                onChange={(e) => onChange('endNo', e.target.value)}
                placeholder="67"
                aria-invalid={fieldErrors.endNo !== undefined}
              />
              {renderFieldError('endNo')}
            </div>
          </div>
          {previewExample !== '' && (
            <div
              className={`mt-2 text-xs flex items-start gap-1 ${
                exceedsMax ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {exceedsMax ? (
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              ) : (
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
              )}
              <span>
                {exceedsMax
                  ? `จำนวน ${previewCount} รายการ เกินขีดจำกัด ${QUICK_PRODUCT_BULK_MAX_RANGE} ต่อครั้ง`
                  : `จะสร้าง: ${previewExample}`}
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* Quantity + lowStock + price + cost */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qpf-quantity">จำนวน (0 = สินค้าหมด)</Label>
          <Input
            id="qpf-quantity"
            type="number"
            min={0}
            value={form.quantity}
            onChange={(e) => onChange('quantity', e.target.value)}
            placeholder="1"
            aria-invalid={fieldErrors.quantity !== undefined}
          />
          {renderFieldError('quantity')}
        </div>
        <div>
          <Label htmlFor="qpf-lowStockAt">แจ้งเตือนสต็อกต่ำที่ (ไม่บังคับ)</Label>
          <Input
            id="qpf-lowStockAt"
            type="number"
            min={0}
            value={form.lowStockAt}
            onChange={(e) => onChange('lowStockAt', e.target.value)}
            placeholder="ไม่กรอก = ไม่เตือน"
            aria-invalid={fieldErrors.lowStockAt !== undefined}
          />
          {renderFieldError('lowStockAt')}
        </div>
        <div>
          <Label htmlFor="qpf-price">ราคา (RM) — 0 ถ้ายังไม่ระบุ</Label>
          <Input
            id="qpf-price"
            type="text"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => onChange('price', e.target.value)}
            placeholder="0"
            aria-invalid={fieldErrors.price !== undefined}
          />
          {renderFieldError('price')}
        </div>
        <div>
          <Label htmlFor="qpf-cost">ราคาต้นทุน (RM) — ไม่บังคับ</Label>
          <Input
            id="qpf-cost"
            type="text"
            inputMode="decimal"
            value={form.cost}
            onChange={(e) => onChange('cost', e.target.value)}
            placeholder=""
            aria-invalid={fieldErrors.cost !== undefined}
          />
          {renderFieldError('cost')}
        </div>
      </div>
    </div>
  );
}

/**
 * Helper: derive the bulk-mode preview count from current form state.
 * Exported so dialog containers can compute the submit-button label
 * ("สร้าง N รายการ") and disable when exceeding the cap.
 */
export function calcPreviewCount(form: QuickProductFormState): number {
  if (form.startNo === '' || form.endNo === '') return 1;
  const s = parseInt(form.startNo, 10);
  const e = parseInt(form.endNo, 10);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  if (e < s) return 0;
  return e - s + 1;
}

export function exceedsBulkCap(count: number): boolean {
  return count > QUICK_PRODUCT_BULK_MAX_RANGE;
}
