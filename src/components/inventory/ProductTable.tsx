'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StockBadge } from '@/components/inventory/StockBadge';
import { Pencil, Image as ImageIcon } from 'lucide-react';
import type { ProductRow } from '@/server/repositories/product.repository';

interface ProductTableProps {
  readonly products: readonly ProductRow[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onSelectionChange: (ids: ReadonlySet<string>) => void;
  readonly isLoading?: boolean;
}

function ProductTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="size-4" /></TableCell>
          <TableCell><Skeleton className="size-10 rounded" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-14" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function ProductTable({
  products,
  selectedIds,
  onSelectionChange,
  isLoading = false,
}: ProductTableProps) {
  const t = useTranslations('inventory');

  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));

  function handleSelectAll(checked: boolean) {
    if (checked) {
      onSelectionChange(new Set(products.map((p) => p.id)));
    } else {
      onSelectionChange(new Set());
    }
  }

  function handleSelectOne(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    onSelectionChange(next);
  }

  // Aggregate variant stats for each product
  function getProductStats(product: ProductRow) {
    const variantCount = product._count?.variants ?? product.variants?.length ?? 0;
    // Sum quantities from variants if available
    if (product.variants && product.variants.length > 0) {
      const totalQty = product.variants.reduce((sum, v) => sum + v.quantity, 0);
      const totalReserved = product.variants.reduce((sum, v) => sum + v.reservedQty, 0);
      return { variantCount, totalQty, totalReserved };
    }
    return { variantCount, totalQty: 0, totalReserved: 0 };
  }

  if (!isLoading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noProducts')}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
            />
          </TableHead>
          <TableHead className="w-12">{t('images')}</TableHead>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('stockCode')}</TableHead>
          <TableHead>{t('category')}</TableHead>
          <TableHead>{t('variants')}</TableHead>
          <TableHead>{t('available')}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <ProductTableSkeleton />
        ) : (
          products.map((product) => {
            const { variantCount, totalQty, totalReserved } = getProductStats(product);
            return (
              <TableRow
                key={product.id}
                data-state={selectedIds.has(product.id) ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={(checked: boolean) => handleSelectOne(product.id, checked)}
                  />
                </TableCell>
                <TableCell>
                  {product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      width={40}
                      height={40}
                      className="rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded bg-muted">
                      <ImageIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    <Link
                      href={`/inventory/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    {!product.isActive && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {t('inactive')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {product.stockCode}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {product.category?.name ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{variantCount}</Badge>
                </TableCell>
                <TableCell>
                  <StockBadge quantity={totalQty} reservedQty={totalReserved} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" render={<Link href={`/inventory/${product.id}`} />}>
                    <Pencil className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
