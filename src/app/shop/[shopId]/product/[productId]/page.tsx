'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ShoppingCart, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { StorefrontProductRow } from '@/server/repositories/storefront.repository';
import { getCurrencySymbol } from '@/components/storefront/CurrencySelector';
import { useStorefrontAuth } from '@/components/storefront/StorefrontAuth';

export default function ProductDetailPage() {
  const t = useTranslations('storefront');
  const params = useParams<{ shopId: string; productId: string }>();
  const { shopId, productId } = params;

  const [product, setProduct] = useState<StorefrontProductRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('RM');
  const { getCustomerId } = useStorefrontAuth();

  // Fetch shop's default currency
  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch(`/api/storefront/${shopId}/branding`);
        const body = await res.json();
        if (body.success && body.data.defaultCurrency) {
          setCurrencySymbol(getCurrencySymbol(body.data.defaultCurrency));
        }
      } catch {
        // fall back to default symbol
      }
    }
    fetchBranding();
  }, [shopId]);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/storefront/${shopId}/products/${productId}`);
        const body = await res.json();
        if (body.success) {
          setProduct(body.data);
          // Auto-select first variant
          if (body.data.product.variants.length > 0) {
            setSelectedVariantId(body.data.product.variants[0].id);
          }
        }
      } catch {
        toast.error('Failed to load product');
      } finally {
        setIsLoading(false);
      }
    }
    fetchProduct();
  }, [shopId, productId]);

  const selectedVariant = product?.product.variants.find(
    (v) => v.id === selectedVariantId
  );
  const availableStock = selectedVariant
    ? selectedVariant.quantity - selectedVariant.reservedQty
    : 0;

  async function handleAddToCart() {
    if (!selectedVariantId || !product) return;
    setIsAddingToCart(true);
    try {
      const res = await fetch(`/api/storefront/${shopId}/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-id': getCustomerId(),
        },
        body: JSON.stringify({
          productId: product.productId,
          variantId: selectedVariantId,
          quantity,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('addedToCart'));
      } else {
        toast.error(body.error ?? 'Failed to add to cart');
      }
    } catch {
      toast.error('Failed to add to cart');
    } finally {
      setIsAddingToCart(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('noProducts')}</p>
        <Link href={`/shop/${shopId}`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 size-4" />
            {t('continueShopping')}
          </Button>
        </Link>
      </div>
    );
  }

  const { product: prod } = product;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back link */}
      <Link href={`/shop/${shopId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" />
        {t('continueShopping')}
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          {prod.images.length > 0 ? (
            <>
              <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                <img
                  src={prod.images[0]}
                  alt={prod.name}
                  className="h-full w-full object-cover"
                />
              </div>
              {prod.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {prod.images.slice(1, 5).map((img, i) => (
                    <div key={i} className="aspect-square overflow-hidden rounded-lg bg-muted">
                      <img src={img} alt={`${prod.name} ${i + 2}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="aspect-square rounded-xl bg-muted flex items-center justify-center">
              <span className="text-muted-foreground">No image</span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{prod.name}</h1>
            {prod.category && (
              <Badge variant="outline" className="mt-1">
                {prod.category.name}
              </Badge>
            )}
          </div>

          {prod.description && (
            <p className="text-muted-foreground">{prod.description}</p>
          )}

          {/* Variant Selection */}
          {prod.variants.length > 1 && (
            <div className="space-y-2">
              <Label>{t('selectVariant')}</Label>
              <Select value={selectedVariantId} onValueChange={(v) => { setSelectedVariantId(v ?? ''); setQuantity(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectVariant')} />
                </SelectTrigger>
                <SelectContent>
                  {prod.variants.map((v) => {
                    const attrs = typeof v.attributes === 'object' && v.attributes
                      ? Object.values(v.attributes as Record<string, string>).join(' / ')
                      : v.sku;
                    const stock = v.quantity - v.reservedQty;
                    return (
                      <SelectItem key={v.id} value={v.id} disabled={stock <= 0}>
                        {attrs} — {currencySymbol}{Number(v.price).toLocaleString()}
                        {stock <= 0 ? ` (${t('outOfStock')})` : ` (${stock})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Price */}
          {selectedVariant && (
            <div className="text-3xl font-bold font-mono text-primary">
              {currencySymbol}{Number(selectedVariant.price).toLocaleString()}
            </div>
          )}

          {/* Stock */}
          {selectedVariant && (
            <div>
              {availableStock > 0 ? (
                <Badge variant="outline" className="text-green-600">
                  {t('inStock')} ({availableStock})
                </Badge>
              ) : (
                <Badge variant="destructive">{t('outOfStock')}</Badge>
              )}
            </div>
          )}

          {/* Quantity & Add to Cart */}
          {availableStock > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label>{t('quantity')}</Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= availableStock) {
                        setQuantity(val);
                      }
                    }}
                    className="w-16 text-center font-mono"
                    min={1}
                    max={availableStock}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                    disabled={quantity >= availableStock}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleAddToCart}
                disabled={isAddingToCart || !selectedVariantId}
              >
                <ShoppingCart className="mr-2 size-4" />
                {isAddingToCart ? '...' : t('addToCart')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

