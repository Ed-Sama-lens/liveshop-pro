'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShoppingCart, Search, Store } from 'lucide-react';
import Link from 'next/link';
import type { StorefrontProductRow } from '@/server/repositories/storefront.repository';
import type { BrandingRow } from '@/server/repositories/branding.repository';
import type { PaginationMeta } from '@/lib/api/response';
import { getCurrencySymbol } from '@/components/storefront/CurrencySelector';
import { StorefrontLoginButton } from '@/components/storefront/StorefrontAuth';

export default function ShopPage() {
  const t = useTranslations('storefront');
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;

  const [products, setProducts] = useState<readonly StorefrontProductRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [branding, setBranding] = useState<BrandingRow | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('RM');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch(`/api/storefront/${shopId}/branding`);
      const body = await res.json();
      if (body.success) {
        setBranding(body.data);
        if (body.data.defaultCurrency) {
          setCurrencySymbol(getCurrencySymbol(body.data.defaultCurrency));
        }
      }
    } catch {
      // silently fail
    }
  }, [shopId]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (category) params.set('category', category);

      const res = await fetch(`/api/storefront/${shopId}/products?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setProducts(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [shopId, page, search, category]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Extract unique categories from loaded products
  const categories = Array.from(
    new Set(products.map((p) => p.product.category?.name).filter(Boolean))
  ) as string[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Shop Header */}
      <div className="mb-8 text-center">
        {branding?.banner && (
          <div className="mb-4 h-48 overflow-hidden rounded-xl">
            <img
              src={branding.banner}
              alt="Banner"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mb-2">
          {branding?.logo ? (
            <img src={branding.logo} alt="Logo" className="size-12 rounded-full object-cover" />
          ) : (
            <Store className="size-8 text-muted-foreground" />
          )}
          <h1 className="text-3xl font-bold">
            {branding?.shopName ?? t('title')}
          </h1>
        </div>
        {branding?.description && (
          <p className="text-muted-foreground max-w-2xl mx-auto">{branding.description}</p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        {categories.length > 0 && (
          <Select value={category} onValueChange={(v) => { setCategory(v ?? ''); setPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('allCategories')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('allCategories')}</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <StorefrontLoginButton />
          <Link href={`/shop/${shopId}/cart`}>
            <Button variant="outline" size="default">
              <ShoppingCart className="mr-2 size-4" />
              {t('cart')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">{t('noProducts')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((sp) => {
              const minPrice = Math.min(...sp.product.variants.map((v) => Number(v.price)));
              const maxPrice = Math.max(...sp.product.variants.map((v) => Number(v.price)));
              const totalStock = sp.product.variants.reduce(
                (sum, v) => sum + (v.quantity - v.reservedQty),
                0
              );

              return (
                <Link
                  key={sp.id}
                  href={`/shop/${shopId}/product/${sp.productId}`}
                  className="group"
                >
                  <Card className="overflow-hidden transition-shadow hover:shadow-md">
                    {sp.product.images.length > 0 ? (
                      <div className="aspect-square overflow-hidden bg-muted">
                        <img
                          src={sp.product.images[0]}
                          alt={sp.product.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square bg-muted flex items-center justify-center">
                        <Store className="size-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <CardContent className="p-3">
                      <h3 className="font-medium truncate">{sp.product.name}</h3>
                      {sp.product.category && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {sp.product.category.name}
                        </Badge>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-mono font-bold text-primary">
                          {currencySymbol}{minPrice.toLocaleString()}
                          {maxPrice !== minPrice && ` - ${currencySymbol}${maxPrice.toLocaleString()}`}
                        </span>
                        {totalStock <= 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {t('outOfStock')}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Simple Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                {page} / {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
