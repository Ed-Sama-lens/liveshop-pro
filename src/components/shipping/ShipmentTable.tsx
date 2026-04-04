'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShipmentStatusBadge } from '@/components/shipping/ShipmentStatusBadge';
import type { ShipmentRow } from '@/server/repositories/shipment.repository';

interface ShipmentTableProps {
  readonly shipments: readonly ShipmentRow[];
  readonly isLoading?: boolean;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function ShipmentTable({ shipments, isLoading = false }: ShipmentTableProps) {
  const t = useTranslations('shipping');

  if (!isLoading && shipments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noShipments')}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('orderNumber')}</TableHead>
          <TableHead>{t('customer')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('provider')}</TableHead>
          <TableHead>{t('trackingNumber')}</TableHead>
          <TableHead>{t('shippedAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          shipments.map((shipment) => (
            <TableRow key={shipment.id}>
              <TableCell>
                <Link
                  href={`/shipping/${shipment.id}`}
                  className="font-mono text-sm font-medium hover:underline"
                >
                  {shipment.order?.orderNumber ?? shipment.orderId.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {shipment.order?.customer?.name ?? '—'}
              </TableCell>
              <TableCell>
                <ShipmentStatusBadge status={shipment.status} />
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{shipment.provider}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {shipment.trackingNumber ?? '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {shipment.shippedAt
                  ? new Date(shipment.shippedAt).toLocaleString()
                  : '—'}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
