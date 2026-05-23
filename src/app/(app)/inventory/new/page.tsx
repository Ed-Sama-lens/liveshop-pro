'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ProductForm } from '@/components/inventory/ProductForm';
import { QuickInventoryProductDialog } from '@/components/inventory/QuickInventoryProductDialog';

interface Category {
  readonly id: string;
  readonly name: string;
}

/**
 * /inventory/new — product creation page.
 *
 * Tier 3.9-D (2026-05-23): Default mode is the Quick Create dialog —
 * mirrors the `/sale` Quick Create UX so Boss does not see the long
 * variant-rich `ProductForm` for the common single-product case. The
 * original multi-variant `ProductForm` is preserved behind an Advanced
 * toggle for power-user flows (multiple SKUs, custom variant
 * attributes, full image upload).
 *
 * Bulk Start/End No. (mass code generation) is intentionally hidden in
 * the inventory page; that pattern remains a `/sale` flow because it
 * implies broadcast-product creation. PR 3.9-D2 will revisit.
 */
export default function NewProductPage() {
  const t = useTranslations('inventory');
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const body = await res.json();
      if (body.success) {
        setCategories(body.data ?? []);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState mount pattern; refactor to React Query / SWR is a separate task
    fetchCategories();
  }, [fetchCategories]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('newProduct')}</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Quick form' : 'Advanced form'}
        </Button>
      </div>

      {showAdvanced ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Advanced form: หลาย variants, อัปโหลดรูปหลังสร้าง, customize attributes
            ต่อ variant.
          </p>
          <ProductForm mode="create" categories={categories} />
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Quick form: กรอกเฉพาะรหัสสต็อก + รหัสขาย เพียงพอแล้ว. สร้างสินค้าเดี่ยว
            พร้อม variant พื้นฐาน. แก้ไขเพิ่มเติม / เพิ่ม variants / อัปโหลดรูปได้จากหน้าแก้ไขสินค้า.
            หากต้องสร้าง multi-variant ตั้งแต่ต้น ให้กด Advanced form.
          </p>
          <QuickInventoryProductDialog categories={categories} />
        </div>
      )}
    </div>
  );
}
