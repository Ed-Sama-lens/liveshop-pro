'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import type { PaymentRow } from '@/server/repositories/payment.repository';

interface PaymentSectionProps {
  readonly orderId: string;
  readonly totalAmount: string;
}

const PAYMENT_METHODS = ['TRANSFER', 'QR_CODE', 'COD'] as const;

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-yellow-600 border-yellow-300 dark:text-yellow-400',
  VERIFIED: 'text-green-600 border-green-300 dark:text-green-400',
  FAILED: 'text-red-600 border-red-300 dark:text-red-400',
  REFUNDED: 'text-gray-600 border-gray-300 dark:text-gray-400',
};

export function PaymentSection({ orderId, totalAmount }: PaymentSectionProps) {
  const t = useTranslations('orders');

  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create payment form
  const [method, setMethod] = useState<string>('TRANSFER');
  const [amount, setAmount] = useState(totalAmount);
  const [isCreating, setIsCreating] = useState(false);

  // Slip upload
  const [isUploading, setIsUploading] = useState(false);

  // Verify/reject
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchPayment = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/payment`);
      const body = await res.json();
      if (body.success && body.data) {
        setPayment(body.data);
      }
    } catch {
      // Non-critical
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  async function handleCreatePayment(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, amount }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('paymentCreated'));
        setPayment(body.data);
        setShowCreate(false);
      } else {
        toast.error(body.error ?? 'Failed to create payment');
      }
    } catch {
      toast.error('Failed to create payment');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUploadSlip() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size exceeds 5 MB limit');
        return;
      }

      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`/api/orders/${orderId}/payment/slip`, {
          method: 'POST',
          body: formData,
        });
        const body = await res.json();
        if (body.success) {
          toast.success(t('slipUploaded'));
          setPayment(body.data);
        } else {
          toast.error(body.error ?? 'Upload failed');
        }
      } catch {
        toast.error('Upload failed');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  }

  async function handleVerify(verified: boolean) {
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(verified ? t('paymentVerified2') : t('paymentRejected'));
        setPayment(body.data);
      } else {
        toast.error(body.error ?? 'Verification failed');
      }
    } catch {
      toast.error('Verification failed');
    } finally {
      setIsVerifying(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  // No payment yet — show create option
  if (!payment) {
    return (
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">{t('payment')}</h3>
        {showCreate ? (
          <form onSubmit={handleCreatePayment} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('paymentMethod')}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'TRANSFER')}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('paymentAmount')}</Label>
              <Input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isCreating}>
                {t('createPayment')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            {t('createPayment')}
          </Button>
        )}
      </Card>
    );
  }

  // Payment exists — show details
  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">{t('payment')}</h3>
      <div className="space-y-3">
        {/* Payment Info */}
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('paymentMethod')}:</span>{' '}
            {payment.method}
          </div>
          <div>
            <span className="text-muted-foreground">{t('paymentAmount')}:</span>{' '}
            <span className="font-mono">RM{Number(payment.amount).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('paymentStatus')}:</span>{' '}
            <Badge variant="outline" className={PAYMENT_STATUS_COLOR[payment.status] ?? ''}>
              {t(`payment${payment.status.charAt(0)}${payment.status.slice(1).toLowerCase()}` as Parameters<typeof t>[0])}
            </Badge>
          </div>
          {payment.verifiedAt && (
            <div className="text-muted-foreground text-xs">
              Verified: {new Date(payment.verifiedAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Slip Image */}
        {payment.slipUrl && (
          <div>
            <p className="mb-1 text-sm text-muted-foreground">{t('uploadSlip')}</p>
            <Image
              src={payment.slipUrl}
              alt="Payment slip"
              width={200}
              height={300}
              className="rounded border object-contain"
            />
          </div>
        )}

        {/* Actions */}
        {payment.status === 'PENDING' && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleUploadSlip}
              disabled={isUploading}
            >
              <Upload className="size-3.5" />
              {t('uploadSlip')}
            </Button>
            <Button
              size="sm"
              onClick={() => handleVerify(true)}
              disabled={isVerifying}
            >
              <CheckCircle className="size-3.5" />
              {t('verifyPayment')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleVerify(false)}
              disabled={isVerifying}
            >
              <XCircle className="size-3.5" />
              {t('rejectPayment')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
