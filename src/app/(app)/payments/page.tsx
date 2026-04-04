'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

interface PaymentEntry {
  readonly id: string;
  readonly orderId: string;
  readonly amount: string;
  readonly status: string;
  readonly method: string;
  readonly slipUrl: string | null;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
  readonly order: {
    readonly id: string;
    readonly orderNumber: string;
    readonly totalAmount: string;
    readonly status: string;
    readonly customer: {
      readonly id: string;
      readonly name: string;
      readonly phone: string | null;
    };
  };
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  VERIFIED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REFUNDED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3.5 w-3.5" />,
  VERIFIED: <CheckCircle className="h-3.5 w-3.5" />,
  FAILED: <XCircle className="h-3.5 w-3.5" />,
};

export default function PaymentsPage() {
  const t = useTranslations('payments');
  const [payments, setPayments] = useState<readonly PaymentEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selectedPayment, setSelectedPayment] = useState<PaymentEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ orderNumber: '', method: 'COD', note: '' });
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const limit = 20;

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/payments?${params}`);
      const body = await res.json();
      if (body.success) {
        setPayments(body.data ?? []);
        setTotal(body.meta?.total ?? 0);
      }
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/pending-count');
      const body = await res.json();
      if (body.success) setPendingCount(body.data.count);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchPendingCount();
  }, [fetchPayments, fetchPendingCount]);

  async function handleAction(paymentId: string, action: 'VERIFY' | 'REJECT') {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(action === 'VERIFY' ? t('verified') : t('rejected'));
        setSelectedPayment(null);
        fetchPayments();
        fetchPendingCount();
      } else {
        toast.error(body.error ?? 'Failed');
      }
    } catch {
      toast.error('Failed to process payment');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleManualPayment() {
    if (!manualForm.orderNumber.trim()) return;
    setIsSubmittingManual(true);
    try {
      // Look up order by number to get ID
      const searchRes = await fetch(`/api/orders?search=${encodeURIComponent(manualForm.orderNumber.trim())}&limit=1`);
      const searchBody = await searchRes.json();
      const order = searchBody.data?.[0];
      if (!order) {
        toast.error(t('orderNotFound'));
        setIsSubmittingManual(false);
        return;
      }

      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          method: manualForm.method,
          note: manualForm.note || undefined,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('manualPaymentRecorded'));
        setManualDialogOpen(false);
        setManualForm({ orderNumber: '', method: 'COD', note: '' });
        fetchPayments();
        fetchPendingCount();
      } else {
        toast.error(body.error ?? 'Failed');
      }
    } catch {
      toast.error('Failed to record manual payment');
    } finally {
      setIsSubmittingManual(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm">
              {t('pendingCount', { count: pendingCount })}
            </Badge>
          )}
          <Button size="sm" onClick={() => setManualDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('manualPayment')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={statusFilter === 'PENDING' ? 'ring-2 ring-primary' : 'cursor-pointer hover:bg-muted/50'}
              onClick={() => { setStatusFilter('PENDING'); setPage(1); }}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">{t('pending')}</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {['VERIFIED', 'FAILED', 'all'].map((s) => (
          <Card key={s}
                className={statusFilter === s ? 'ring-2 ring-primary' : 'cursor-pointer hover:bg-muted/50'}
                onClick={() => { setStatusFilter(s); setPage(1); }}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {s === 'VERIFIED' && <CheckCircle className="h-5 w-5 text-green-500" />}
                {s === 'FAILED' && <XCircle className="h-5 w-5 text-red-500" />}
                {s === 'all' && <CreditCard className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {s === 'all' ? t('allPayments') : t(s.toLowerCase() as 'verified' | 'failed')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            {t('paymentsList')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">{t('noPayments')}</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Slip Thumbnail */}
                  <div className="h-16 w-16 shrink-0 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                    {p.slipUrl ? (
                      <img
                        src={p.slipUrl}
                        alt="Slip"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{p.order.orderNumber}</span>
                      <Badge className={`text-xs ${STATUS_STYLES[p.status] ?? ''}`}>
                        <span className="mr-1">{STATUS_ICONS[p.status]}</span>
                        {p.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {p.order.customer.name}
                      {p.order.customer.phone && ` · ${p.order.customer.phone}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.method} · {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-mono font-bold">
                      ฿{Number(p.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('orderTotal')}: ฿{Number(p.order.totalAmount).toLocaleString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPayment(p)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t('review')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {t('page')} {page} / {totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('reviewPayment')}</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('orderNumber')}</span>
                  <span className="font-mono font-bold">{selectedPayment.order.orderNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('customer')}</span>
                  <span>{selectedPayment.order.customer.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('method')}</span>
                  <span>{selectedPayment.method}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('paymentAmount')}</span>
                  <span className="font-mono font-bold">฿{Number(selectedPayment.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('orderTotal')}</span>
                  <span className="font-mono">฿{Number(selectedPayment.order.totalAmount).toLocaleString()}</span>
                </div>
                {selectedPayment.amount !== selectedPayment.order.totalAmount && (
                  <div className="rounded bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800 dark:text-amber-300">
                    ⚠ {t('amountMismatch')}
                  </div>
                )}
              </div>

              {/* Slip Image */}
              {selectedPayment.slipUrl ? (
                <div className="rounded-lg border overflow-hidden bg-muted">
                  <img
                    src={selectedPayment.slipUrl}
                    alt="Payment slip"
                    className="w-full max-h-96 object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-lg border p-8 text-center text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('noSlip')}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose render={<Button variant="outline" />}>
              {t('close')}
            </DialogClose>
            {selectedPayment?.status === 'PENDING' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => selectedPayment && handleAction(selectedPayment.id, 'REJECT')}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('reject')}
                </Button>
                <Button
                  onClick={() => selectedPayment && handleAction(selectedPayment.id, 'VERIFY')}
                  disabled={isProcessing}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t('verify')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('manualPayment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('manualPaymentDesc')}</p>

            <div className="space-y-2">
              <Label>{t('orderNumber')}</Label>
              <Input
                value={manualForm.orderNumber}
                onChange={(e) => setManualForm({ ...manualForm, orderNumber: e.target.value })}
                placeholder="ORD-20260404-0001"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('method')}</Label>
              <Select
                value={manualForm.method}
                onValueChange={(v) => setManualForm({ ...manualForm, method: v ?? 'COD' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COD">{t('cashOnDelivery')}</SelectItem>
                  <SelectItem value="TRANSFER">{t('bankTransfer')}</SelectItem>
                  <SelectItem value="QR_CODE">{t('qrCode')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('noteOptional')}</Label>
              <Textarea
                value={manualForm.note}
                onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                placeholder={t('manualNotePlaceholder')}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('close')}
            </DialogClose>
            <Button
              onClick={handleManualPayment}
              disabled={isSubmittingManual || !manualForm.orderNumber.trim()}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t('confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
