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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil } from 'lucide-react';
import type { CustomerRow } from '@/server/repositories/customer.repository';

interface CustomerTableProps {
  readonly customers: readonly CustomerRow[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onSelectionChange: (ids: ReadonlySet<string>) => void;
  readonly isLoading?: boolean;
}

function CustomerTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="size-4" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function CustomerTable({
  customers,
  selectedIds,
  onSelectionChange,
  isLoading = false,
}: CustomerTableProps) {
  const t = useTranslations('customers');

  const allSelected = customers.length > 0 && customers.every((c) => selectedIds.has(c.id));

  function handleSelectAll(checked: boolean) {
    if (checked) {
      onSelectionChange(new Set(customers.map((c) => c.id)));
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

  if (!isLoading && customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noCustomers')}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
          </TableHead>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('phone')}</TableHead>
          <TableHead>{t('channel')}</TableHead>
          <TableHead>{t('labels')}</TableHead>
          <TableHead>{t('lifetimeValue')}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <CustomerTableSkeleton />
        ) : (
          customers.map((customer) => (
            <TableRow
              key={customer.id}
              data-state={selectedIds.has(customer.id) ? 'selected' : undefined}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(customer.id)}
                  onCheckedChange={(checked: boolean) => handleSelectOne(customer.id, checked)}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {customer.name}
                  </Link>
                  {customer.isBanned && (
                    <Badge variant="destructive" className="text-xs">
                      {t('bannedStatus')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.phone ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{customer.channel}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {customer.labels.slice(0, 3).map((label) => (
                    <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
                  ))}
                  {customer.labels.length > 3 && (
                    <Badge variant="secondary" className="text-xs">+{customer.labels.length - 3}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">
                RM{Number(customer.lifetimeValue).toLocaleString()}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" render={<Link href={`/customers/${customer.id}`} />}>
                  <Pencil className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
