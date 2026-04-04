'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const SALE_CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;

interface OrderItemForm {
  readonly productId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly productName: string;
  readonly variantSku: string;
}

interface Customer {
  readonly id: string;
  readonly name: string;
}

interface Product {
  readonly id: string;
  readonly name: string;
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly price: string;
    readonly quantity: number;
    readonly reservedQty: number;
  }[];
}

export function OrderForm() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const router = useRouter();

  const [customerId, setCustomerId] = useState('');
  const [channel, setChannel] = useState('MANUAL');
  const [shippingFee, setShippingFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<readonly OrderItemForm[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<readonly Product[]>([]);

  async function searchCustomers(query: string) {
    setCustomerSearch(query);
    if (query.length < 2) {
      setCustomers([]);
      return;
    }
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=10`);
      const body = await res.json();
      if (body.success) {
        setCustomers(body.data ?? []);
      }
    } catch {
      // Non-critical
    }
  }

  function selectCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setCustomers([]);
  }

  async function searchProducts(query: string) {
    setProductSearch(query);
    if (query.length < 2) {
      setProducts([]);
      return;
    }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=10`);
      const body = await res.json();
      if (body.success) {
        setProducts(body.data ?? []);
      }
    } catch {
      // Non-critical
    }
  }

  function addItem(product: Product, variant: Product['variants'][number]) {
    const newItem: OrderItemForm = {
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      unitPrice: variant.price,
      productName: product.name,
      variantSku: variant.sku,
    };
    setItems([...items, newItem]);
    setProductSearch('');
    setProducts([]);
  }

  function updateItemQuantity(index: number, quantity: number) {
    setItems(items.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, quantity) } : item)));
  }

  function updateItemPrice(index: number, unitPrice: string) {
    setItems(items.map((item, i) => (i === index ? { ...item, unitPrice } : item)));
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function calculateTotal(): number {
    const itemsTotal = items.reduce((sum, item) => sum + parseFloat(item.unitPrice || '0') * item.quantity, 0);
    return itemsTotal + parseFloat(shippingFee || '0');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          channel,
          shippingFee,
          notes: notes || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }),
      });

      const body = await res.json();
      if (body.success) {
        toast.success(t('created'));
        router.push(`/orders/${body.data.id}`);
      } else {
        toast.error(body.error ?? 'Failed to create order');
      }
    } catch {
      toast.error('Failed to create order');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer Selection */}
      <div className="space-y-2">
        <Label>{t('customer')}</Label>
        <div className="relative">
          <Input
            placeholder={t('selectCustomer')}
            value={customerSearch}
            onChange={(e) => searchCustomers(e.target.value)}
          />
          {customers.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => selectCustomer(c)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedCustomer && (
          <p className="text-xs text-muted-foreground">
            Selected: {selectedCustomer.name}
          </p>
        )}
      </div>

      {/* Channel */}
      <div className="space-y-2">
        <Label>{t('channel')}</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v ?? 'MANUAL')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SALE_CHANNELS.map((ch) => (
              <SelectItem key={ch} value={ch}>
                {ch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order Items */}
      <div className="space-y-3">
        <Label>{t('items')}</Label>

        {/* Search Products */}
        <div className="relative">
          <Input
            placeholder={t('selectProduct')}
            value={productSearch}
            onChange={(e) => searchProducts(e.target.value)}
          />
          {products.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {products.map((product) => (
                <div key={product.id} className="border-b last:border-0">
                  <div className="px-3 py-2 text-sm font-medium bg-muted/50">
                    {product.name}
                  </div>
                  {product.variants?.map((variant) => {
                    const available = variant.quantity - variant.reservedQty;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent flex justify-between"
                        onClick={() => addItem(product, variant)}
                        disabled={available <= 0}
                      >
                        <span>{variant.sku}</span>
                        <span className="text-muted-foreground">
                          ฿{Number(variant.price).toLocaleString()} ({available} avail.)
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Item List */}
        {items.length > 0 && (
          <Card className="divide-y">
            {items.map((item, index) => (
              <div key={`${item.variantId}-${index}`} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.variantSku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                    className="w-16 text-center"
                    min={1}
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="text"
                    value={item.unitPrice}
                    onChange={(e) => updateItemPrice(index, e.target.value)}
                    className="w-24"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}

        {items.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Plus className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-1 text-sm text-muted-foreground">{t('addItem')}</p>
          </div>
        )}
      </div>

      {/* Shipping Fee */}
      <div className="space-y-2">
        <Label>{t('shippingFee')}</Label>
        <Input
          type="text"
          value={shippingFee}
          onChange={(e) => setShippingFee(e.target.value)}
          className="w-32"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>{t('notes')}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <span className="font-medium">{t('totalAmount')}</span>
        <span className="text-lg font-bold font-mono">฿{calculateTotal().toLocaleString()}</span>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tc('cancel')}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
