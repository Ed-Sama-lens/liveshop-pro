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
import { LiveStatusBadge } from '@/components/live/LiveStatusBadge';
import type { LiveSessionRow } from '@/server/repositories/live.repository';

interface LiveSessionTableProps {
  readonly sessions: readonly LiveSessionRow[];
  readonly isLoading?: boolean;
}

function formatDuration(startedAt: Date | null, endedAt: Date | null): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function LiveSessionTable({ sessions, isLoading = false }: LiveSessionTableProps) {
  const t = useTranslations('live');

  if (!isLoading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('sessionTitle')}</TableHead>
          <TableHead>{t('sessions')}</TableHead>
          <TableHead>{t('viewerCount')}</TableHead>
          <TableHead>{t('orderCount')}</TableHead>
          <TableHead>{t('totalRevenue')}</TableHead>
          <TableHead>{t('duration')}</TableHead>
          <TableHead>{t('scheduledAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <Link
                  href={`/live-selling/${session.id}`}
                  className="font-medium hover:underline"
                >
                  {session.title ?? 'Untitled'}
                </Link>
              </TableCell>
              <TableCell>
                <LiveStatusBadge status={session.status} />
              </TableCell>
              <TableCell className="text-sm">
                {session.viewerCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-sm">
                {session.orderCount.toLocaleString()}
              </TableCell>
              <TableCell className="font-mono text-sm">
                RM{Number(session.totalRevenue).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDuration(session.startedAt, session.endedAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {session.scheduledAt
                  ? new Date(session.scheduledAt).toLocaleString()
                  : '—'}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
