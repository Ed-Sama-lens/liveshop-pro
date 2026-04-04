'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ProductForm } from '@/components/inventory/ProductForm';

interface Category {
  readonly id: string;
  readonly name: string;
}

export default function NewProductPage() {
  const t = useTranslations('inventory');
  const [categories, setCategories] = useState<readonly Category[]>([]);

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
    fetchCategories();
  }, [fetchCategories]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('newProduct')}</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}
