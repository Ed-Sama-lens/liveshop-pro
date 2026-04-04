'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariantForm, type VariantFormData } from '@/components/inventory/VariantForm';
import { Plus, Loader2, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface Category {
  readonly id: string;
  readonly name: string;
}

interface ProductFormProps {
  readonly mode: 'create' | 'edit';
  readonly categories: readonly Category[];
  readonly initialData?: {
    readonly id: string;
    readonly name: string;
    readonly stockCode: string;
    readonly saleCode: string | null;
    readonly description: string | null;
    readonly categoryId: string | null;
    readonly images: readonly string[];
    readonly variants: readonly {
      readonly sku: string;
      readonly attributes: Record<string, string>;
      readonly price: string;
      readonly costPrice: string | null;
      readonly quantity: number;
      readonly lowStockAt: number | null;
    }[];
  };
}

const EMPTY_VARIANT: VariantFormData = {
  sku: '',
  attributes: {},
  price: '',
  costPrice: '',
  quantity: 0,
  lowStockAt: undefined,
};

export function ProductForm({ mode, categories, initialData }: ProductFormProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState(initialData?.name ?? '');
  const [stockCode, setStockCode] = useState(initialData?.stockCode ?? '');
  const [saleCode, setSaleCode] = useState(initialData?.saleCode ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? '');
  const [images, setImages] = useState<readonly string[]>(initialData?.images ?? []);
  const [variants, setVariants] = useState<VariantFormData[]>(
    initialData?.variants?.map((v) => ({
      sku: v.sku,
      attributes: { ...v.attributes },
      price: v.price,
      costPrice: v.costPrice ?? '',
      quantity: v.quantity,
      lowStockAt: v.lowStockAt ?? undefined,
    })) ?? [{ ...EMPTY_VARIANT }]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleVariantChange = useCallback(
    (index: number, data: VariantFormData) => {
      setVariants((prev) => prev.map((v, i) => (i === index ? data : v)));
    },
    []
  );

  const handleVariantRemove = useCallback((index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  function addVariant() {
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !initialData?.id) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append('files', file);
      }

      const res = await fetch(`/api/products/${initialData.id}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? 'Upload failed');
        return;
      }

      const body = await res.json();
      if (body.success && body.data?.images) {
        setImages(body.data.images);
        toast.success('Images uploaded');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      // Reset file input
      e.target.value = '';
    }
  }

  async function handleDeleteImage(filename: string) {
    if (!initialData?.id) return;

    try {
      const res = await fetch(`/api/products/${initialData.id}/images/${filename}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        toast.error('Failed to delete image');
        return;
      }

      setImages((prev) => prev.filter((img) => !img.endsWith(filename)));
    } catch {
      toast.error('Failed to delete image');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        name,
        stockCode,
        saleCode: saleCode || undefined,
        description: description || undefined,
        categoryId: categoryId || undefined,
        variants: variants.map((v) => ({
          sku: v.sku,
          attributes: v.attributes,
          price: v.price,
          costPrice: v.costPrice || undefined,
          quantity: v.quantity,
          lowStockAt: v.lowStockAt,
        })),
      };

      const url =
        mode === 'create'
          ? '/api/products'
          : `/api/products/${initialData!.id}`;

      const method = mode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'create' ? payload : {
          name: payload.name,
          stockCode: payload.stockCode,
          saleCode: payload.saleCode,
          description: payload.description,
          categoryId: payload.categoryId,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? 'Save failed');
        return;
      }

      toast.success(mode === 'create' ? t('created') : t('updated'));
      router.push('/inventory');
      router.refresh();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="name">{t('name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stockCode">{t('stockCode')}</Label>
          <Input
            id="stockCode"
            value={stockCode}
            onChange={(e) => setStockCode(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="saleCode">{t('saleCode')}</Label>
          <Input
            id="saleCode"
            value={saleCode}
            onChange={(e) => setSaleCode(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">{t('category')}</Label>
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('selectCategory')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allCategories')}</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">{t('description')}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {/* Images (edit mode only) */}
      {mode === 'edit' && (
        <div className="space-y-2">
          <Label>{t('images')}</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((src) => {
              const filename = src.split('/').pop() ?? '';
              return (
                <div key={src} className="group relative">
                  <Image
                    src={src}
                    alt=""
                    width={80}
                    height={80}
                    className="rounded object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(filename)}
                    className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-white group-hover:block"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
            <label className="flex size-20 cursor-pointer items-center justify-center rounded border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground">
              {isUploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Upload className="size-5" />
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
                disabled={isUploading}
              />
            </label>
          </div>
        </div>
      )}

      {/* Variants */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('variants')}</Label>
          <Button variant="outline" size="sm" type="button" onClick={addVariant}>
            <Plus className="size-3.5" />
            {t('addVariant')}
          </Button>
        </div>
        {variants.map((v, i) => (
          <VariantForm
            key={i}
            index={i}
            value={v}
            onChange={handleVariantChange}
            onRemove={handleVariantRemove}
            canRemove={variants.length > 1}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {t('save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/inventory')}
        >
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}
