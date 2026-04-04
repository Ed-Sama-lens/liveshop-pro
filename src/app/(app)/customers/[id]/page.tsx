'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Pagination } from '@/components/inventory/Pagination';
import { BanCustomerDialog } from '@/components/customers/BanCustomerDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Pencil, Ban, ShieldCheck, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { CustomerRow, CustomerOrderRow } from '@/server/repositories/customer.repository';
import type { PaginationMeta } from '@/lib/api/response';

export default function CustomerDetailPage() {
  const t = useTranslations('customers');
  const tc = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<readonly CustomerOrderRow[]>([]);
  const [orderMeta, setOrderMeta] = useState<PaginationMeta | undefined>();
  const [orderPage, setOrderPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      const body = await res.json();
      if (body.success && body.data) {
        setCustomer(body.data);
      }
    } catch {
      toast.error('Failed to load customer');
    }
  }, [id]);

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(orderPage));
      params.set('limit', '10');
      const res = await fetch(`/api/customers/${id}/orders?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setOrders(body.data ?? []);
        setOrderMeta(body.meta);
      }
    } catch {
      // Non-critical
    }
  }, [id, orderPage]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchCustomer(), fetchOrders()]).finally(() => setIsLoading(false));
  }, [fetchCustomer, fetchOrders]);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Delete failed');
        return;
      }
      toast.success(t('deleted'));
      router.push('/customers');
    } catch {
      toast.error('Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function handleRecalculateLtv() {
    // This will be a PATCH to update the customer — for now trigger a re-fetch
    // In future, a dedicated LTV endpoint can be added
    setIsRecalculating(true);
    try {
      await fetchCustomer();
      toast.success('LTV refreshed');
    } finally {
      setIsRecalculating(false);
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

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-muted-foreground">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline">{customer.channel}</Badge>
            {customer.isBanned && (
              <Badge variant="destructive">{t('bannedStatus')}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/customers/${id}/edit`} />}>
            <Pencil className="size-3.5" />
            {t('editCustomer')}
          </Button>
          <Button
            variant={customer.isBanned ? 'outline' : 'destructive'}
            size="sm"
            onClick={() => setBanDialogOpen(true)}
          >
            {customer.isBanned ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}
            {customer.isBanned ? t('unban') : t('ban')}
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger render={<Button variant="destructive" size="sm" />}>
              <Trash2 className="size-3.5" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('delete')}</DialogTitle>
                <DialogDescription>{t('confirmDelete')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>{tc('cancel')}</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>{tc('confirm')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Ban Banner */}
      {customer.isBanned && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/10">
          <strong>{t('isBanned')}</strong>
          {customer.bannedReason && <span className="ml-2">— {customer.bannedReason}</span>}
        </div>
      )}

      {/* Profile Card */}
      <Card className="p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {customer.phone && <div><span className="text-muted-foreground">{t('phone')}:</span> {customer.phone}</div>}
          {customer.email && <div><span className="text-muted-foreground">{t('email')}:</span> {customer.email}</div>}
          {customer.facebookId && <div><span className="text-muted-foreground">{t('facebookId')}:</span> {customer.facebookId}</div>}
          {customer.shippingType && <div><span className="text-muted-foreground">{t('shippingType')}:</span> {customer.shippingType}</div>}
          {customer.address && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{t('address')}:</span> {customer.address}
              {customer.district && `, ${customer.district}`}
              {customer.province && `, ${customer.province}`}
              {customer.postalCode && ` ${customer.postalCode}`}
            </div>
          )}
          {customer.labels.length > 0 && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{t('labels')}:</span>{' '}
              <span className="inline-flex flex-wrap gap-1 ml-1">
                {customer.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
                ))}
              </span>
            </div>
          )}
          {customer.notes && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{t('notes')}:</span> {customer.notes}
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3 border-t pt-3">
          <div className="text-lg font-bold">
            {t('lifetimeValue')}: ฿{Number(customer.lifetimeValue).toLocaleString()}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={handleRecalculateLtv} disabled={isRecalculating}>
            <RefreshCw className={`size-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Purchase History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('purchaseHistory')}</h2>
        {orders.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('orderNumber')}</TableHead>
                  <TableHead>{t('orderStatus')}</TableHead>
                  <TableHead>{t('orderTotal')}</TableHead>
                  <TableHead>{t('orderDate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.orderNumber ?? order.id.slice(0, 8)}</TableCell>
                    <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                    <TableCell className="font-mono">฿{Number(order.total).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {orderMeta && (
              <Pagination page={orderMeta.page} totalPages={orderMeta.totalPages} onPageChange={setOrderPage} />
            )}
          </>
        )}
      </div>

      {/* Ban Dialog */}
      <BanCustomerDialog
        customerId={id}
        isBanned={customer.isBanned}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
        onSuccess={fetchCustomer}
      />
    </div>
  );
}
