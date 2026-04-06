'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Eye, EyeOff, ExternalLink, Palette, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import type { StorefrontProductRow } from '@/server/repositories/storefront.repository';
import type { BrandingRow } from '@/server/repositories/branding.repository';

interface ProductOption {
  readonly id: string;
  readonly name: string;
  readonly stockCode: string;
}

export default function StorefrontPage() {
  const t = useTranslations('storefront');

  // ─── Published Products State ───────────────────────────────────────────
  const [products, setProducts] = useState<readonly StorefrontProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [availableProducts, setAvailableProducts] = useState<readonly ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  // ─── Branding State ─────────────────────────────────────────────────────
  const [branding, setBranding] = useState<BrandingRow | null>(null);
  const [isLoadingBranding, setIsLoadingBranding] = useState(true);
  const [brandingForm, setBrandingForm] = useState({
    logo: '',
    banner: '',
    primaryColor: '#000000',
    accentColor: '#000000',
    description: '',
  });
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // ─── Payment Settings State ────────────────────────────────────────────
  const [paymentForm, setPaymentForm] = useState({
    promptpayQrUrl: '',
    promptpayNote: '',
    bankName: '',
    bankAccount: '',
    bankAccountName: '',
    bankNote: '',
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // ─── Fetch Published Products ───────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const res = await fetch('/api/storefront/admin/products');
      const body = await res.json();
      if (body.success) {
        setProducts(body.data ?? []);
      }
    } catch {
      toast.error('Failed to load storefront products');
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // ─── Fetch Available Products (for publish dialog) ──────────────────────
  const fetchAvailableProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?limit=100&isActive=true');
      const body = await res.json();
      if (body.success) {
        // API returns paginated data — extract items array
        const items = Array.isArray(body.data) ? body.data : [];
        setAvailableProducts(items);
      }
    } catch {
      toast.error('Failed to load available products');
    }
  }, []);

  // ─── Fetch Branding ─────────────────────────────────────────────────────
  const fetchBranding = useCallback(async () => {
    setIsLoadingBranding(true);
    try {
      const res = await fetch('/api/storefront/admin/branding');
      const body = await res.json();
      if (body.success && body.data) {
        setBranding(body.data);
        setBrandingForm({
          logo: body.data.logo ?? '',
          banner: body.data.banner ?? '',
          primaryColor: body.data.primaryColor ?? '#000000',
          accentColor: body.data.accentColor ?? '#000000',
          description: body.data.description ?? '',
        });
        setPaymentForm({
          promptpayQrUrl: body.data.promptpayQrUrl ?? '',
          promptpayNote: body.data.promptpayNote ?? '',
          bankName: body.data.bankName ?? '',
          bankAccount: body.data.bankAccount ?? '',
          bankAccountName: body.data.bankAccountName ?? '',
          bankNote: body.data.bankNote ?? '',
        });
      }
    } catch {
      toast.error('Failed to load branding');
    } finally {
      setIsLoadingBranding(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchBranding();
    fetchAvailableProducts();
  }, [fetchProducts, fetchBranding, fetchAvailableProducts]);

  // ─── Publish Product ────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selectedProductId) return;
    try {
      const res = await fetch('/api/storefront/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('published'));
        setPublishDialogOpen(false);
        setSelectedProductId('');
        fetchProducts();
      } else {
        toast.error(body.error ?? 'Failed to publish');
      }
    } catch {
      toast.error('Failed to publish product');
    }
  }

  // ─── Toggle Visibility ──────────────────────────────────────────────────
  async function handleToggleVisibility(id: string, currentVisible: boolean) {
    try {
      const res = await fetch(`/api/storefront/admin/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: !currentVisible }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('updated'));
        fetchProducts();
      }
    } catch {
      toast.error('Failed to update');
    }
  }

  // ─── Unpublish ──────────────────────────────────────────────────────────
  async function handleUnpublish(id: string) {
    try {
      const res = await fetch(`/api/storefront/admin/products/${id}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('unpublished'));
        fetchProducts();
      }
    } catch {
      toast.error('Failed to unpublish');
    }
  }

  // ─── Save Branding ─────────────────────────────────────────────────────
  async function handleSaveBranding() {
    setIsSavingBranding(true);
    try {
      const res = await fetch('/api/storefront/admin/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo: brandingForm.logo || null,
          banner: brandingForm.banner || null,
          primaryColor: brandingForm.primaryColor || null,
          accentColor: brandingForm.accentColor || null,
          description: brandingForm.description || null,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('brandingUpdated'));
        fetchBranding();
      } else {
        toast.error(body.error ?? 'Failed to save branding');
      }
    } catch {
      toast.error('Failed to save branding');
    } finally {
      setIsSavingBranding(false);
    }
  }

  // ─── Save Payment Settings ──────────────────────────────────────────────
  async function handleSavePayment() {
    setIsSavingPayment(true);
    try {
      const res = await fetch('/api/storefront/admin/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptpayQrUrl: paymentForm.promptpayQrUrl || null,
          promptpayNote: paymentForm.promptpayNote || null,
          bankName: paymentForm.bankName || null,
          bankAccount: paymentForm.bankAccount || null,
          bankAccountName: paymentForm.bankAccountName || null,
          bankNote: paymentForm.bankNote || null,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('paymentSettingsUpdated'));
        fetchBranding();
      } else {
        toast.error(body.error ?? 'Failed to save payment settings');
      }
    } catch {
      toast.error('Failed to save payment settings');
    } finally {
      setIsSavingPayment(false);
    }
  }

  // ─── Get published product IDs for filtering ───────────────────────────
  const publishedProductIds = new Set(products.map((p) => p.productId));
  const unpublishedProducts = availableProducts.filter(
    (p) => !publishedProductIds.has(p.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('management')}</h1>
        {branding?.shopId && (
          <Button
            variant="outline"
            size="sm"
            render={<a href="/shop/nazha-hatyai" target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="mr-2 size-4" />
            {t('previewStorefront')}
          </Button>
        )}
      </div>

      {/* Published Products */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('publishedProducts')}</CardTitle>
          <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 size-4" />
              {t('publishProduct')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('selectProduct')}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Select value={selectedProductId} onValueChange={(v) => setSelectedProductId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectProduct')} />
                  </SelectTrigger>
                  <SelectContent>
                    {unpublishedProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.stockCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button onClick={handlePublish} disabled={!selectedProductId}>
                  {t('publishProduct')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingProducts ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('noPublished')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('products')}</TableHead>
                  <TableHead className="text-center">{t('visible')}</TableHead>
                  <TableHead className="text-center">{t('sortOrder')}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((sp) => (
                  <TableRow key={sp.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{sp.product.name}</span>
                        {sp.product.category && (
                          <Badge variant="outline" className="ml-2">
                            {sp.product.category.name}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {sp.product.variants.length} variant(s)
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={sp.isVisible}
                        onCheckedChange={() => handleToggleVisibility(sp.id, sp.isVisible)}
                      />
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {sp.sortOrder}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnpublish(sp.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-5" />
            {t('branding')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingBranding ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 max-w-lg">
              <div className="space-y-2">
                <Label>{t('logo')}</Label>
                <Input
                  value={brandingForm.logo}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, logo: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label>{t('banner')}</Label>
                <Input
                  value={brandingForm.banner}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, banner: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('primaryColor')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandingForm.primaryColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, primaryColor: e.target.value })
                      }
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={brandingForm.primaryColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, primaryColor: e.target.value })
                      }
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('accentColor')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandingForm.accentColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, accentColor: e.target.value })
                      }
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={brandingForm.accentColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, accentColor: e.target.value })
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('shopDescription')}</Label>
                <Textarea
                  value={brandingForm.description}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, description: e.target.value })
                  }
                  rows={4}
                />
              </div>

              <Button onClick={handleSaveBranding} disabled={isSavingBranding}>
                {isSavingBranding ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            {t('paymentSettings')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t('paymentSettingsDesc')}</p>
        </CardHeader>
        <CardContent>
          {isLoadingBranding ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-6 max-w-lg">
              {/* PromptPay QR Section */}
              <div className="space-y-4">
                <h3 className="font-medium">{t('promptpayQr')}</h3>

                <div className="space-y-2">
                  <Label>{t('promptpayQrUrl')}</Label>
                  <Input
                    value={paymentForm.promptpayQrUrl}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, promptpayQrUrl: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('promptpayNote')}</Label>
                  <Textarea
                    value={paymentForm.promptpayNote}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, promptpayNote: e.target.value })
                    }
                    rows={3}
                    placeholder="Instructions for customers..."
                  />
                </div>
              </div>

              {/* Bank Transfer Section */}
              <div className="space-y-4">
                <h3 className="font-medium">{t('bankTransfer')}</h3>

                <div className="space-y-2">
                  <Label>{t('bankName')}</Label>
                  <Input
                    value={paymentForm.bankName}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, bankName: e.target.value })
                    }
                    placeholder="e.g. Maybank"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('bankAccount')}</Label>
                  <Input
                    value={paymentForm.bankAccount}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, bankAccount: e.target.value })
                    }
                    placeholder="e.g. 562021676858"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('bankAccountName')}</Label>
                  <Input
                    value={paymentForm.bankAccountName}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, bankAccountName: e.target.value })
                    }
                    placeholder="e.g. Nazha Hatyai Sales Marketing"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('bankNote')}</Label>
                  <Textarea
                    value={paymentForm.bankNote}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, bankNote: e.target.value })
                    }
                    rows={3}
                    placeholder="Transfer instructions for customers..."
                  />
                </div>
              </div>

              <Button onClick={handleSavePayment} disabled={isSavingPayment}>
                {isSavingPayment ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
