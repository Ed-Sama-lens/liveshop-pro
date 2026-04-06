'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { PaginationMeta } from '@/lib/api/response';
import { useStorefrontAuth } from '@/components/storefront/StorefrontAuth';

interface OrderItem {
  readonly id: string;
  readonly productName: string;
  readonly variantName: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly totalPrice: string;
}

interface CustomerOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly totalAmount: string;
  readonly channel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly itemCount: number;
  readonly items: readonly OrderItem[];
  readonly latestPayment: {
    readonly status: string;
    readonly method: string;
    readonly amount: string;
  } | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  RESERVED: { icon: <Clock className="size-4" />, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  CONFIRMED: { icon: <CheckCircle className="size-4" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  SHIPPED: { icon: <Truck className="size-4" />, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  DELIVERED: { icon: <CheckCircle className="size-4" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  CANCELLED: { icon: <XCircle className="size-4" />, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export default function CustomerOrdersPage() {
  const t = useTranslations('storefront');
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const { getCustomerId } = useStorefrontAuth();

  const [orders, setOrders] = useState<readonly CustomerOrder[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<Record<string, unknown> | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/storefront/${shopId}/orders?page=${page}&limit=10`, {
        headers: { 'x-customer-id': getCustomerId() },
      });
      const body = await res.json();
      if (body.success) {
        setOrders(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [shopId, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchOrderDetail = async (orderId: string) => {
    setSelectedOrder(orderId);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/storefront/${shopId}/orders/${orderId}`, {
        headers: { 'x-customer-id': getCustomerId() },
      });
      const body = await res.json();
      if (body.success) {
        setOrderDetail(body.data);
      }
    } catch {
      toast.error('Failed to load order details');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Detail View
  if (selectedOrder && orderDetail) {
    const detail = orderDetail as {
      orderNumber: string;
      status: string;
      totalAmount: string;
      createdAt: string;
      items: readonly OrderItem[];
      payment: { status: string; method: string; amount: string; createdAt: string } | null;
      shipping: { carrier: string; trackingNumber: string; status: string; createdAt: string } | null;
      timeline: readonly { action: string; note: string | null; createdAt: string }[];
      notes: string | null;
    };

    const statusCfg = STATUS_CONFIG[detail.status] ?? STATUS_CONFIG.RESERVED;

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <button
          onClick={() => { setSelectedOrder(null); setOrderDetail(null); }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('backToOrders')}
        </button>

        {/* Order Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('orderNumber')}{detail.orderNumber}</CardTitle>
              <Badge className={statusCfg.color}>
                {statusCfg.icon}
                <span className="ml-1">{detail.status}</span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('orderDate')}: {new Date(detail.createdAt).toLocaleDateString()}
            </p>
          </CardHeader>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('orderItems')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {detail.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-muted-foreground"> — {item.variantName}</span>
                    )}
                    <span className="text-muted-foreground"> x{item.quantity}</span>
                  </div>
                  <span className="font-mono">RM{Number(item.totalPrice).toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t pt-3 flex justify-between font-bold">
                <span>{t('total')}</span>
                <span className="font-mono">RM{Number(detail.totalAmount).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        {detail.payment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('paymentStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{detail.payment.method}</Badge>
                  <Badge variant={detail.payment.status === 'VERIFIED' ? 'default' : 'secondary'}>
                    {detail.payment.status}
                  </Badge>
                </div>
                <span className="font-mono">RM{Number(detail.payment.amount).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shipping */}
        {detail.shipping && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('shippingInfo')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="size-4 text-muted-foreground" />
                  <span className="font-medium">{detail.shipping.carrier}</span>
                  <Badge variant="outline">{detail.shipping.status}</Badge>
                </div>
                {detail.shipping.trackingNumber && (
                  <p className="text-sm text-muted-foreground pl-6">
                    {t('trackingNumber')}: <span className="font-mono">{detail.shipping.trackingNumber}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        {detail.timeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detail.timeline.map((event, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="size-2 rounded-full bg-primary mt-1.5" />
                      {i < detail.timeline.length - 1 && (
                        <div className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className="font-medium">{event.action}</p>
                      {event.note && (
                        <p className="text-muted-foreground">{event.note}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // List View
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/shop/${shopId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="size-4" />
            {t('continueShopping')}
          </Link>
          <h1 className="text-2xl font-bold">{t('myOrders')}</h1>
        </div>
        <Link href={`/shop/${shopId}/cart`}>
          <Button variant="outline" size="sm">
            <ShoppingCart className="mr-2 size-4" />
            {t('cart')}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="size-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t('noOrders')}</p>
            <Link href={`/shop/${shopId}`}>
              <Button variant="outline" className="mt-4">
                {t('continueShopping')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {orders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.RESERVED;
              return (
                <Card
                  key={order.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => fetchOrderDetail(order.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{t('orderNumber')}{order.orderNumber}</span>
                        <Badge className={statusCfg.color}>
                          {statusCfg.icon}
                          <span className="ml-1">{order.status}</span>
                        </Badge>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>
                        {new Date(order.createdAt).toLocaleDateString()} — {order.itemCount} {t('orderItems')}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        RM{Number(order.totalAmount).toLocaleString()}
                      </span>
                    </div>

                    {/* Item preview */}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {order.items.slice(0, 2).map((item) => (
                        <span key={item.id} className="mr-3">
                          {item.productName} x{item.quantity}
                        </span>
                      ))}
                      {order.items.length > 2 && (
                        <span>+{order.items.length - 2} more</span>
                      )}
                    </div>

                    {order.latestPayment && (
                      <div className="mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {order.latestPayment.method}: {order.latestPayment.status}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                {page} / {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {isLoadingDetail && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}
