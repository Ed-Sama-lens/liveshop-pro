'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProductForm } from '@/components/inventory/ProductForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  readonly id: string;
  readonly name: string;
}

interface ProductData {
  readonly id: string;
  readonly name: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly images: string[];
  readonly variants: readonly {
    readonly sku: string;
    readonly attributes: Record<string, string>;
    readonly price: string;
    readonly costPrice: string | null;
    readonly quantity: number;
    readonly lowStockAt: number | null;
  }[];
}

export default function EditProductPage() {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<ProductData | null>(null);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setProduct(body.data);
      }
    } catch {
      toast.error('Failed to load product');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

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
    fetchProduct();
    fetchCategories();
  }, [fetchProduct, fetchCategories]);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Delete failed');
        return;
      }
      toast.success(t('deleted'));
      router.push('/inventory');
      router.refresh();
    } catch {
      toast.error('Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">Product not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('editProduct')}</h1>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger render={<Button variant="destructive" size="sm" />}>
            <Trash2 className="size-3.5" />
            {t('delete')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('delete')}</DialogTitle>
              <DialogDescription>{t('confirmDelete')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
              >
                {tc('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {tc('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ProductForm
        mode="edit"
        categories={categories}
        initialData={product}
      />
    </div>
  );
}
