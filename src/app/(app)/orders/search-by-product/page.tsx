'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SearchCheck, Package, Users, Hash, Calendar } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { PaginationMeta } from '@/lib/api/response';

interface SearchResult {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  totalAmount: string;
  customerName: string;
  customerId: string;
  customerPhone: string | null;
  quantity: number;
  unitPrice: string;
  variantSku: string;
  variantAttributes: Record<string, string>;
}

interface ProductInfo {
  id: string;
  name: string;
  stockCode: string;
  saleCode: string | null;
}

interface SearchSummary {
  totalOrders: number;
  totalCustomers: number;
  totalQuantity: number;
}

const ORDER_STATUSES = ['RESERVED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;

const STATUS_COLORS: Record<string, string> = {
  RESERVED: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PACKED: 'bg-purple-100 text-purple-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function SearchByProductPage() {
  const t = useTranslations('searchByProduct');

  const [productCode, setProductCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Set default date range: last 7 days
  useEffect(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    setDateTo(formatDate(today));
    setDateFrom(formatDate(weekAgo));
  }, []);

  const handleSearch = useCallback(async (searchPage = 1) => {
    if (!productCode.trim() || !dateFrom || !dateTo) {
      toast.error(t('fillRequired'));
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({
        productCode: productCode.trim(),
        dateFrom,
        dateTo,
        page: String(searchPage),
        limit: '50',
      });
      if (status) params.set('status', status);

      const res = await fetch(`/api/orders/search-by-product?${params.toString()}`);
      const body = await res.json();

      if (body.success) {
        setProduct(body.data.product);
        setResults(body.data.orders ?? []);
        setSummary(body.data.summary);
        setMeta(body.meta);
        setPage(searchPage);
      } else {
        toast.error(body.error ?? t('searchFailed'));
      }
    } catch {
      toast.error(t('searchFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [productCode, dateFrom, dateTo, status, t]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SearchCheck className="size-6" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('description')}</p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('searchCriteria')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="productCode">{t('productCode')}</Label>
              <Input
                id="productCode"
                placeholder={t('productCodePlaceholder')}
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFrom">{t('dateFrom')}</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">{t('dateTo')}</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('statusFilter')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v === 'ALL' ? '' : (v ?? ''))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('allStatuses')}</SelectItem>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={() => handleSearch()} disabled={isLoading}>
              <SearchCheck className="mr-2 size-4" />
              {isLoading ? t('searching') : t('search')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && product && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="size-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('product')}</p>
                  <p className="font-bold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.stockCode}
                    {product.saleCode ? ` / ${product.saleCode}` : ''}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Hash className="size-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('totalOrders')}</p>
                  <p className="text-2xl font-bold font-mono">{summary.totalOrders}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="size-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('uniqueCustomers')}</p>
                  <p className="text-2xl font-bold font-mono">{summary.totalCustomers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="size-8 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('totalQuantity')}</p>
                  <p className="text-2xl font-bold font-mono">{summary.totalQuantity}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {hasSearched && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('results')}
              {meta && ` (${meta.total})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {product === null ? t('productNotFound') : t('noResults')}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('orderNumber')}</TableHead>
                        <TableHead>{t('customerName')}</TableHead>
                        <TableHead>{t('phone')}</TableHead>
                        <TableHead>{t('variant')}</TableHead>
                        <TableHead className="text-right">{t('qty')}</TableHead>
                        <TableHead className="text-right">{t('unitPrice')}</TableHead>
                        <TableHead>{t('status')}</TableHead>
                        <TableHead>{t('orderDate')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row) => (
                        <TableRow key={`${row.orderId}-${row.variantSku}`}>
                          <TableCell>
                            <Link
                              href={`/orders/${row.orderId}`}
                              className="font-mono text-primary hover:underline"
                            >
                              {row.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/customers/${row.customerId}`}
                              className="hover:underline"
                            >
                              {row.customerName}
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.customerPhone ?? '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.variantSku}
                            {Object.keys(row.variantAttributes).length > 0 && (
                              <span className="text-muted-foreground ml-1">
                                ({Object.values(row.variantAttributes).join(' / ')})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                          <TableCell className="text-right font-mono">{Number(row.unitPrice).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[row.orderStatus] ?? ''}>
                              {row.orderStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(row.orderDate).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {meta && meta.totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => handleSearch(page - 1)}
                    >
                      {t('previous')}
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground px-3">
                      {page} / {meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= meta.totalPages}
                      onClick={() => handleSearch(page + 1)}
                    >
                      {t('next')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
