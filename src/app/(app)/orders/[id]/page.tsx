'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { PaymentSection } from '@/components/orders/PaymentSection';
import { toast } from 'sonner';
import Link from 'next/link';
import type { OrderRow } from '@/server/repositories/order.repository';
import { VALID_TRANSITIONS } from '@/lib/validation/order.schemas';

interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly performedBy: string | null;
  readonly createdAt: string;
}

export default function OrderDetailPage() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [auditLog, setAuditLog] = useState<readonly AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [transitionDialog, setTransitionDialog] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setOrder(body.data);
      }
    } catch {
      toast.error('Failed to load order');
    }
  }, [id]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}/audit`);
      const body = await res.json();
      if (body.success) {
        setAuditLog(body.data ?? []);
      }
    } catch {
      // Non-critical
    }
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchOrder(), fetchAudit()]).finally(() => setIsLoading(false));
  }, [fetchOrder, fetchAudit]);

  async function handleTransition(newStatus: string) {
    setIsTransitioning(true);
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('transitionSuccess'));
        setOrder(body.data);
        fetchAudit();
      } else {
        toast.error(body.error ?? 'Transition failed');
      }
    } catch {
      toast.error('Transition failed');
    } finally {
      setIsTransitioning(false);
      setTransitionDialog(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-muted-foreground">Order not found</p>
      </div>
    );
  }

  const availableTransitions = VALID_TRANSITIONS[order.status] ?? [];

  const TRANSITION_BUTTON_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' }> = {
    CONFIRMED: { label: t('confirm'), variant: 'default' },
    PACKED: { label: t('pack'), variant: 'outline' },
    SHIPPED: { label: t('ship'), variant: 'outline' },
    DELIVERED: { label: t('deliver'), variant: 'default' },
    CANCELLED: { label: t('cancel'), variant: 'destructive' },
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('orderNumber')}{order.orderNumber}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Badge variant="outline">{order.channel}</Badge>
          </div>
        </div>
      </div>

      {/* Status Transition Actions */}
      {availableTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTransitions.map((nextStatus) => {
            const config = TRANSITION_BUTTON_MAP[nextStatus];
            if (!config) return null;
            return (
              <Button
                key={nextStatus}
                variant={config.variant}
                size="sm"
                onClick={() => setTransitionDialog(nextStatus)}
              >
                {config.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Order Info Card */}
      <Card className="p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('customer')}:</span>{' '}
            {order.customer ? (
              <Link href={`/customers/${order.customer.id}`} className="hover:underline">
                {order.customer.name}
              </Link>
            ) : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('createdAt')}:</span>{' '}
            {new Date(order.createdAt).toLocaleString()}
          </div>
          <div>
            <span className="text-muted-foreground">{t('totalAmount')}:</span>{' '}
            <span className="font-mono font-medium">฿{Number(order.totalAmount).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('shippingFee')}:</span>{' '}
            <span className="font-mono">฿{Number(order.shippingFee).toLocaleString()}</span>
          </div>
          {order.notes && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{t('notes')}:</span> {order.notes}
            </div>
          )}
        </div>
      </Card>

      {/* Order Items */}
      {order.items && order.items.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('items')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">{t('unitPrice')}</TableHead>
                <TableHead className="text-right">{t('quantity')}</TableHead>
                <TableHead className="text-right">{t('totalAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{item.variant.sku}</TableCell>
                  <TableCell className="text-right font-mono">฿{Number(item.unitPrice).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono">฿{Number(item.totalPrice).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Payment Section */}
      <PaymentSection orderId={id} totalAmount={order.totalAmount} />

      {/* Audit Log */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('auditLog')}</h2>
        {auditLog.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('noAudit')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                <span>{entry.action}</span>
                {entry.fromStatus && entry.toStatus && (
                  <span>
                    <Badge variant="outline" className="mr-1 text-xs">{entry.fromStatus}</Badge>
                    →
                    <Badge variant="outline" className="ml-1 text-xs">{entry.toStatus}</Badge>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transition Confirmation Dialog */}
      <Dialog open={transitionDialog !== null} onOpenChange={(open) => { if (!open) setTransitionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTransition')}</DialogTitle>
            <DialogDescription>
              {order.status} → {transitionDialog}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant={transitionDialog === 'CANCELLED' ? 'destructive' : 'default'}
              onClick={() => transitionDialog && handleTransition(transitionDialog)}
              disabled={isTransitioning}
            >
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
