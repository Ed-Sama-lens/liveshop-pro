'use client';

import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';

/**
 * Live session picker — wired to GET /api/sale/live-sessions (Commit 2S).
 *
 * Read-only. Caller orchestrates the fetch via SaleWorkspaceShell and
 * passes the result down as props. This component just renders.
 * No interactive selection in 2S — the parent auto-picks the first
 * LIVE/SCHEDULED session and passes its id to the product/booking
 * panels. A future commit can wire a session selector dropdown.
 */
export interface SaleSessionRow {
  readonly id: string;
  readonly title: string | null;
  readonly status: string;
  readonly scheduledAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly viewerCount: number;
}

export interface SaleSessionPickerProps {
  readonly state:
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly message: string }
    | {
        readonly kind: 'ready';
        readonly sessions: readonly SaleSessionRow[];
        readonly selectedId: string | null;
      };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: string, selected: boolean) {
  if (status === 'LIVE') {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">
        {selected ? 'LIVE • SELECTED' : 'LIVE'}
      </Badge>
    );
  }
  if (status === 'SCHEDULED') {
    return <Badge variant="secondary">SCHEDULED</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function SaleSessionPickerPlaceholder({ state }: SaleSessionPickerProps) {
  if (state.kind === 'loading') {
    return (
      <SalePanelCard
        title="Live Sessions / รอบไลฟ์"
        subtitle="กำลังโหลดรอบไลฟ์ของร้าน"
        icon={Radio}
        variant="live"
      >
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </SalePanelCard>
    );
  }

  if (state.kind === 'error') {
    return (
      <SalePanelCard
        title="Live Sessions / รอบไลฟ์"
        subtitle="โหลดข้อมูลไม่สำเร็จ"
        icon={Radio}
        variant="live"
      >
        <p className="text-sm text-destructive">{state.message}</p>
      </SalePanelCard>
    );
  }

  const { sessions, selectedId } = state;

  if (sessions.length === 0) {
    return (
      <SalePanelCard
        title="Live Sessions / รอบไลฟ์"
        subtitle="ยังไม่มีรอบไลฟ์ของร้านนี้"
        icon={Radio}
        variant="live"
      >
        <p className="text-sm text-muted-foreground">
          ยังไม่มีไลฟ์สำหรับวันนี้ — ไปที่ Live Selling เพื่อเริ่มรอบใหม่
        </p>
      </SalePanelCard>
    );
  }

  return (
    <SalePanelCard
      title="Live Sessions / รอบไลฟ์"
      subtitle={`${sessions.length} รอบ — auto-selected: ${selectedId ?? '—'}`}
      icon={Radio}
      variant="live"
    >
      <div className="space-y-2">
        {sessions.slice(0, 5).map((s) => {
          const isSelected = s.id === selectedId;
          const startedLabel = formatDateTime(s.startedAt ?? s.scheduledAt);
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                isSelected
                  ? s.status === 'LIVE'
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                    : 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                  : 'border-border'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.title ?? `Session ${s.id.slice(0, 8)}`}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {startedLabel}
                  {s.viewerCount > 0 ? ` • ${s.viewerCount} viewers` : ''}
                </p>
              </div>
              {statusBadge(s.status, isSelected)}
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" disabled className="w-full">
        เลือกรอบไลฟ์ — ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
