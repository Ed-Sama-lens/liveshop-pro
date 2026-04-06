'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { CartRow } from '@/server/repositories/cart.repository';
import { useStorefrontAuth } from '@/components/storefront/StorefrontAuth';

export default function CartPage() {
  const t = useTranslations('storefront');
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const { getCustomerId } = useStorefrontAuth();

  const [cart, setCart] = useState<CartRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const headers = {
    'Content-Type': 'application/json',
    'x-customer-id': getCustomerId(),
  };

  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/storefront/${shopId}/cart`, {
        headers: { 'x-customer-id': getCustomerId() },
      });
      const body = await res.json();
      if (body.success) {
        setCart(body.data);
      }
    } catch {
      toast.error('Failed to load cart');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  async function handleUpdateQuantity(itemId: string, quantity: number) {
    try {
      const res = await fetch(`/api/storefront/${shopId}/cart/${itemId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ quantity }),
      });
      const body = await res.json();
      if (body.success) {
        setCart(body.data);
      } else {
        toast.error(body.error ?? 'Failed to update');
      }
    } catch {
      toast.error('Failed to update cart');
    }
  }

  async function handleRemoveItem(itemId: string) {
    try {
      const res = await fetch(`/api/storefront/${shopId}/cart/${itemId}`, {
        method: 'DELETE',
        headers,
      });
      const body = await res.json();
      if (body.success) {
        setCart(body.data);
        toast.success(t('removeFromCart'));
      }
    } catch {
      toast.error('Failed to remove item');
    }
  }

  async function handleClearCart() {
    try {
      const res = await fetch(`/api/storefront/${shopId}/cart`, {
        method: 'DELETE',
        headers,
      });
      const body = await res.json();
      if (body.success) {
        setCart(null);
        fetchCart();
      }
    } catch {
      toast.error('Failed to clear cart');
    }
  }

  const items = cart?.items ?? [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.variant.price) * item.quantity,
    0
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back link */}
      <Link href={`/shop/${shopId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" />
        {t('continueShopping')}
      </Link>

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <ShoppingCart className="size-6" />
        {t('cart')}
      </h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="size-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">{t('cartEmpty')}</p>
          <Link href={`/shop/${shopId}`}>
            <Button variant="outline" className="mt-4">
              {t('continueShopping')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cart Items */}
          {items.map((item) => {
            const attrs = typeof item.variant.attributes === 'object' && item.variant.attributes
              ? Object.values(item.variant.attributes as Record<string, string>).join(' / ')
              : item.variant.sku;
            const available = item.variant.quantity - item.variant.reservedQty;

            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {item.product.images.length > 0 ? (
                      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <img
                          src={item.product.images[0]}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="size-20 shrink-0 rounded-lg bg-muted" />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{item.product.name}</h3>
                      <p className="text-xs text-muted-foreground">{attrs}</p>
                      <p className="text-sm font-mono font-bold mt-1">
                        RM{Number(item.variant.price).toLocaleString()}
                      </p>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon-xs"
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val <= available) {
                                handleUpdateQuantity(item.id, val);
                              }
                            }}
                            className="w-14 h-6 text-center text-xs font-mono"
                            min={1}
                            max={available}
                          />
                          <Button
                            variant="outline"
                            size="icon-xs"
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= available}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold">
                            RM{(Number(item.variant.price) * item.quantity).toLocaleString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>{t('subtotal')}</span>
                <span className="font-mono">RM{subtotal.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClearCart} className="flex-1">
              {t('clearCart')}
            </Button>
            <Link href={`/shop/${shopId}/checkout`} className="flex-1">
              <Button className="w-full" size="lg">
                {t('checkout')} — RM{subtotal.toLocaleString()}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
