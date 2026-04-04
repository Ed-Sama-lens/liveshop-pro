'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ProductFilters } from '@/components/inventory/ProductFilters';
import { ProductTable } from '@/components/inventory/ProductTable';
import { BulkEditBar } from '@/components/inventory/BulkEditBar';
import { LowStockAlert } from '@/components/inventory/LowStockAlert';
import { Pagination } from '@/components/inventory/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Plus, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductRow } from '@/server/repositories/product.repository';
import type { PaginationMeta } from '@/lib/api/response';

interface Category {
  readonly id: string;
  readonly name: string;
}

export default function InventoryPage() {
  const t = useTranslations('inventory');
  const router = useRouter();

  // Filters
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Data
  const [products, setProducts] = useState<readonly ProductRow[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [lowStockCount, setLowStockCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryId) params.set('categoryId', categoryId);
      if (status) params.set('isActive', status);

      const res = await fetch(`/api/products?${params.toString()}`);
      const body = await res.json();

      if (body.success) {
        setProducts(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, categoryId, status]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const body = await res.json();
      if (body.success) {
        setCategories(body.data ?? []);
      }
    } catch {
      // Categories are non-critical
    }
  }, []);

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch('/api/stock/low-stock');
      const body = await res.json();
      if (body.success && Array.isArray(body.data)) {
        setLowStockCount(body.data.length);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchCategories();
    fetchLowStock();
  }, [fetchCategories, fetchLowStock]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, status]);

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;

    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/products/${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size} products deleted`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch {
      toast.error('Bulk delete failed');
    }
  }

  async function handleExportCsv() {
    try {
      const res = await fetch('/api/products/export');
      if (!res.ok) {
        toast.error('Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  }

  function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/products/import', {
          method: 'POST',
          body: formData,
        });
        const body = await res.json();
        if (body.success) {
          const data = body.data;
          toast.success(`Imported: ${data.created} created, ${data.updated} updated`);
          fetchProducts();
        } else {
          toast.error(body.error ?? 'Import failed');
        }
      } catch {
        toast.error('Import failed');
      }
    };
    input.click();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImportClick}>
            <Upload className="size-3.5" />
            {t('importCsv')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="size-3.5" />
            {t('exportCsv')}
          </Button>
          <Button size="sm" onClick={() => router.push('/inventory/new')}>
            <Plus className="size-3.5" />
            {t('newProduct')}
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      <LowStockAlert count={lowStockCount} />

      {/* Filters */}
      <ProductFilters
        search={search}
        onSearchChange={setSearch}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        status={status}
        onStatusChange={setStatus}
        categories={categories}
      />

      {/* Table */}
      <ProductTable
        products={products}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isLoading={isLoading}
      />

      {/* Pagination */}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Bulk Actions */}
      <BulkEditBar
        selectedCount={selectedIds.size}
        onBulkDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
