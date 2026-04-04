'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShipmentStatusBadge } from '@/components/shipping/ShipmentStatusBadge';
import { toast } from 'sonner';
import Link from 'next/link';
import type { ShipmentRow } from '@/server/repositories/shipment.repository';
import { VALID_SHIPMENT_TRANSITIONS } from '@/lib/validation/shipping.schemas';

export default function ShipmentDetailPage() {
  const t = useTranslations('shipping');
  const tc = useTranslations('common');
  const params = useParams();
  const id = params.id as string;

  const [shipment, setShipment] = useState<ShipmentRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [transitionDialog, setTransitionDialog] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchShipment = useCallback(async () => {
    try {
      const res = await fetch(`/api/shipments/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setShipment(body.data);
      }
    } catch {
      toast.error('Failed to load shipment');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchShipment();
  }, [fetchShipment]);

  async function handleTransition(newStatus: string) {
    setIsTransitioning(true);
    try {
      const res = await fetch(`/api/shipments/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(t('transitionSuccess'));
        setShipment(body.data);
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
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">Shipment not found</p>
      </div>
    );
  }

  const availableTransitions = VALID_SHIPMENT_TRANSITIONS[shipment.status] ?? [];

  const TRANSITION_LABELS: Record<string, string> = {
    ASSIGNED: t('assign'),
    PICKED_UP: t('pickUp'),
    IN_TRANSIT: t('inTransit'),
    DELIVERED: t('deliver'),
    RETURNED: t('return'),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('shipmentDetail')}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <ShipmentStatusBadge status={shipment.status} />
          <Badge variant="outline">{shipment.provider}</Badge>
        </div>
      </div>

      {/* Transition Actions */}
      {availableTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTransitions.map((nextStatus) => (
            <Button
              key={nextStatus}
              variant={nextStatus === 'RETURNED' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setTransitionDialog(nextStatus)}
            >
              {TRANSITION_LABELS[nextStatus] ?? nextStatus}
            </Button>
          ))}
        </div>
      )}

      {/* Details */}
      <Card className="p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('orderNumber')}:</span>{' '}
            <Link href={`/orders/${shipment.orderId}`} className="font-mono hover:underline">
              {shipment.order?.orderNumber ?? shipment.orderId.slice(0, 8)}
            </Link>
          </div>
          <div>
            <span className="text-muted-foreground">{t('customer')}:</span>{' '}
            {shipment.order?.customer?.name ?? '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('trackingNumber')}:</span>{' '}
            <span className="font-mono">{shipment.trackingNumber ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('provider')}:</span>{' '}
            {shipment.provider}
          </div>
          {shipment.shippedAt && (
            <div>
              <span className="text-muted-foreground">{t('shippedAt')}:</span>{' '}
              {new Date(shipment.shippedAt).toLocaleString()}
            </div>
          )}
          {shipment.deliveredAt && (
            <div>
              <span className="text-muted-foreground">{t('deliveredAt')}:</span>{' '}
              {new Date(shipment.deliveredAt).toLocaleString()}
            </div>
          )}
          {shipment.labelUrl && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{t('labelUrl')}:</span>{' '}
              <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                View Label
              </a>
            </div>
          )}
        </div>
      </Card>

      {/* Transition Dialog */}
      <Dialog open={transitionDialog !== null} onOpenChange={(open) => { if (!open) setTransitionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTransition')}</DialogTitle>
            <DialogDescription>
              {shipment.status} → {transitionDialog}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant={transitionDialog === 'RETURNED' ? 'destructive' : 'default'}
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
