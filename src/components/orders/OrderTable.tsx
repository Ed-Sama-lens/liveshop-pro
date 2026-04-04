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
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Badge } from '@/components/ui/badge';
import type { OrderRow } from '@/server/repositories/order.repository';

interface OrderTableProps {
  readonly orders: readonly OrderRow[];
  readonly isLoading?: boolean;
}

function OrderTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function OrderTable({ orders, isLoading = false }: OrderTableProps) {
  const t = useTranslations('orders');

  if (!isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
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
          <TableHead>{t('channel')}</TableHead>
          <TableHead>{t('totalAmount')}</TableHead>
          <TableHead>{t('items')}</TableHead>
          <TableHead>{t('createdAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <OrderTableSkeleton />
        ) : (
          orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Link
                  href={`/orders/${order.id}`}
                  className="font-mono text-sm font-medium hover:underline"
                >
                  {order.orderNumber}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {order.customer?.name ?? '—'}
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {order.channel}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">
                ฿{Number(order.totalAmount).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order._count?.items ?? 0}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
