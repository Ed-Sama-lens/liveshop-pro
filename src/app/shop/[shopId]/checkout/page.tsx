'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, CheckCircle, Upload, QrCode, Building2, Copy, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import type { CartRow } from '@/server/repositories/cart.repository';
import { useStorefrontAuth } from '@/components/storefront/StorefrontAuth';

export default function CheckoutPage() {
  const t = useTranslations('storefront');
  const params = useParams<{ shopId: string }>();
  const router = useRouter();
  const shopId = params.shopId;
  const { getCustomerId } = useStorefrontAuth();

  const [cart, setCart] = useState<CartRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    orderId: string;
    orderNumber: string;
    totalAmount: string;
  } | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    district: '',
    province: '',
    postalCode: '',
    shippingType: 'STANDARD',
    notes: '',
  });

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

  const items = cart?.items ?? [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.variant.price) * item.quantity,
    0
  );

  async function handleCheckout() {
    if (!form.name || !form.phone || !form.address) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${shopId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-id': getCustomerId(),
        },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          district: form.district || undefined,
          province: form.province || undefined,
          postalCode: form.postalCode || undefined,
          notes: form.notes || undefined,
        }),
      });
      const body = await res.json();
      if (body.success) {
        setOrderResult(body.data);
        toast.success(t('orderPlaced'));
      } else {
        toast.error(body.error ?? 'Checkout failed');
      }
    } catch {
      toast.error('Checkout failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Order Confirmation + Payment ─────────────────────────────────────────
  if (orderResult) {
    return (
      <PaymentInstructions
        shopId={shopId}
        orderId={orderResult.orderId}
        orderNumber={orderResult.orderNumber}
        totalAmount={orderResult.totalAmount}
        t={t}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">{t('cartEmpty')}</p>
        <Link href={`/shop/${shopId}`}>
          <Button variant="outline">{t('continueShopping')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href={`/shop/${shopId}/cart`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" />
        {t('cart')}
      </Link>

      <h1 className="text-2xl font-bold mb-6">{t('checkoutTitle')}</h1>

      <div className="space-y-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t('cart')} ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.product.name} x{item.quantity}
                  </span>
                  <span className="font-mono">
                    RM{(Number(item.variant.price) * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                <span>{t('total')}</span>
                <span className="font-mono">RM{subtotal.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Info Form */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('customerName')} *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('customerPhone')} *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('customerEmail')}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('customerAddress')} *</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('customerDistrict')}</Label>
                <Input
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('customerProvince')}</Label>
                <Input
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('customerPostalCode')}</Label>
                <Input
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('shippingType')}</Label>
              <Select value={form.shippingType} onValueChange={(v) => setForm({ ...form, shippingType: v ?? 'STANDARD' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="EXPRESS">Express</SelectItem>
                  <SelectItem value="PICKUP">Pickup</SelectItem>
                  <SelectItem value="COD">Cash on Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('orderNotes')}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleCheckout}
          disabled={isSubmitting || !form.name || !form.phone || !form.address}
        >
          {isSubmitting ? '...' : `${t('placeOrder')} — RM{subtotal.toLocaleString()}`}
        </Button>
      </div>
    </div>
  );
}

// ─── Payment Instructions Component ───────────────────────────────────────

interface PaymentMethod {
  readonly type: string;
  readonly label: string;
  readonly details: Record<string, string | null>;
}

interface PaymentInstructionsProps {
  readonly shopId: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly totalAmount: string;
  readonly t: (key: string) => string;
}

function PaymentInstructions({ shopId, orderId, orderNumber, totalAmount, t }: PaymentInstructionsProps) {
  const [methods, setMethods] = useState<readonly PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('QR_CODE');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/storefront/${shopId}/payment-info`);
        const body = await res.json();
        if (body.success && body.data.methods.length > 0) {
          setMethods(body.data.methods);
          setSelectedMethod(body.data.methods[0].type);
        }
      } catch {
        // Silent
      } finally {
        setIsLoadingMethods(false);
      }
    }
    load();
  }, [shopId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSlipFile(file);
    setSlipPreview(URL.createObjectURL(file));
  }

  async function handleUploadSlip() {
    if (!slipFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('slip', slipFile);
      formData.append('method', selectedMethod);

      const customerId = localStorage.getItem('liveshop_customer_id') ?? '';
      const res = await fetch(`/api/storefront/${shopId}/orders/${orderId}/slip`, {
        method: 'POST',
        headers: { 'x-customer-id': customerId },
        body: formData,
      });
      const body = await res.json();
      if (body.success) {
        setIsUploaded(true);
        toast.success(t('slipUploaded'));
      } else {
        toast.error(body.error ?? 'Upload failed');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  }

  const activeMethod = methods.find((m) => m.type === selectedMethod);

  // ─── Slip uploaded success ───────────────────────────────────────
  if (isUploaded) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <CheckCircle className="size-16 mx-auto text-green-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('paymentSlipSent')}</h1>
        <p className="text-muted-foreground mb-2">
          {t('orderNumber')}: <span className="font-mono font-bold">{orderNumber}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-6">{t('paymentVerifyNote')}</p>
        <Link href={`/shop/${shopId}`}>
          <Button>{t('continueShopping')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 space-y-6">
      {/* Order Summary Header */}
      <div className="text-center space-y-2">
        <CheckCircle className="size-12 mx-auto text-green-500" />
        <h1 className="text-xl font-bold">{t('orderPlaced')}</h1>
        <p className="text-muted-foreground">
          {t('orderNumber')}: <span className="font-mono font-bold">{orderNumber}</span>
        </p>
        <p className="text-2xl font-mono font-bold text-primary">
          RM{Number(totalAmount).toLocaleString()}
        </p>
      </div>

      {/* Payment Method Selection */}
      {!isLoadingMethods && methods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('paymentSelectMethod')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Method tabs */}
            <div className="flex gap-2">
              {methods.map((m) => (
                <Button
                  key={m.type}
                  variant={selectedMethod === m.type ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedMethod(m.type)}
                >
                  {m.type === 'QR_CODE' ? (
                    <QrCode className="mr-1 h-4 w-4" />
                  ) : (
                    <Building2 className="mr-1 h-4 w-4" />
                  )}
                  {m.label}
                </Button>
              ))}
            </div>

            {/* Method details */}
            {activeMethod && activeMethod.type === 'QR_CODE' && (
              <div className="space-y-3 pt-2">
                {activeMethod.details.qrImageUrl && (
                  <div className="flex justify-center">
                    <div className="rounded-lg border bg-white p-3">
                      <Image
                        src={activeMethod.details.qrImageUrl}
                        alt="PromptPay QR"
                        width={280}
                        height={280}
                        className="mx-auto"
                      />
                    </div>
                  </div>
                )}
                {activeMethod.details.note && (
                  <div className="rounded-lg bg-blue-50 p-3 text-sm whitespace-pre-wrap dark:bg-blue-950/30">
                    {activeMethod.details.note}
                  </div>
                )}
              </div>
            )}

            {activeMethod && activeMethod.type === 'TRANSFER' && (
              <div className="space-y-2 pt-2">
                <div className="rounded-lg border p-3 space-y-2">
                  {activeMethod.details.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bank</span>
                      <span className="font-medium">{activeMethod.details.bankName}</span>
                    </div>
                  )}
                  {activeMethod.details.accountNumber && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Account</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{activeMethod.details.accountNumber}</span>
                        <button
                          onClick={() => copyToClipboard(activeMethod.details.accountNumber!)}
                          className="text-primary hover:text-primary/80"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                  {activeMethod.details.accountName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{activeMethod.details.accountName}</span>
                    </div>
                  )}
                </div>
                {activeMethod.details.note && (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm whitespace-pre-wrap dark:bg-amber-950/30">
                    {activeMethod.details.note}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Slip Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('uploadPaymentSlip')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {slipPreview ? (
            <div className="space-y-2">
              <div className="relative rounded-lg border overflow-hidden">
                <img src={slipPreview} alt="Payment slip" className="w-full max-h-64 object-contain bg-muted" />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setSlipFile(null);
                  setSlipPreview(null);
                }}
              >
                {t('changeSlip')}
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/50 transition-colors">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('tapToUploadSlip')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleUploadSlip}
            disabled={!slipFile || isUploading}
          >
            {isUploading ? (
              '...'
            ) : (
              <>
                <Upload className="mr-1 h-4 w-4" />
                {t('submitSlip')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Link href={`/shop/${shopId}`} className="block text-center">
        <Button variant="ghost" size="sm">{t('continueShopping')}</Button>
      </Link>
    </div>
  );
}
