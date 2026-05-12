'use client';

import { useEffect, useState } from 'react';
import { User2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SalePanelCard } from './SalePanelCard';

/**
 * Customer panel — wired to existing `GET /api/customers/[id]` (Commit
 * Phase 4 of 2026-05-12 10-hour plan).
 *
 * Reuses the admin /customers route instead of introducing a new sale-
 * namespaced API. CHAT_SUPPORT can read the existing route (requireAuth
 * + shopId, no role gate). Cross-shop returns 404 via repo.
 *
 * PII safeguards:
 * - shown:  name, phone, email, shippingType, isBanned + bannedReason,
 *           lifetimeValue, order count
 * - hidden: address, district/province/postalCode, labels, notes,
 *           channel, createdAt, raw FB identifiers
 *
 * Selection state lives in SaleWorkspaceShell. This component receives
 * the chosen customerId as a prop. Renders empty-state when null.
 */
export interface SaleCustomerSummary {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly shippingType: string | null;
  readonly lifetimeValue: string;
  readonly isBanned: boolean;
  readonly bannedReason: string | null;
  readonly orderCount: number;
}

export interface SaleCustomerPanelProps {
  /** Selected customer id from booking-row click, or null when no row selected. */
  readonly selectedCustomerId: string | null;
  /** Optional name hint from the selected booking row for instant display while fetching. */
  readonly customerNameHint: string | null;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; customer: SaleCustomerSummary };

export function SaleCustomerPanelPlaceholder({
  selectedCustomerId,
  customerNameHint,
}: SaleCustomerPanelProps) {
  const [state, setState] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (!selectedCustomerId) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(selectedCustomerId)}`, {
          method: 'GET',
          credentials: 'same-origin',
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setState({
            kind: 'error',
            message: body?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        const raw = body.data ?? {};
        const customer: SaleCustomerSummary = {
          id: raw.id ?? selectedCustomerId,
          name: raw.name ?? '—',
          phone: raw.phone ?? null,
          email: raw.email ?? null,
          shippingType: raw.shippingType ?? null,
          lifetimeValue: String(raw.lifetimeValue ?? '0'),
          isBanned: raw.isBanned === true,
          bannedReason: raw.bannedReason ?? null,
          orderCount:
            typeof raw._count?.orders === 'number' ? raw._count.orders : 0,
        };
        setState({ kind: 'ready', customer });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  // ── No selection: render empty-state hint
  if (!selectedCustomerId) {
    return (
      <SalePanelCard
        title="Customer Panel / ข้อมูลลูกค้า"
        subtitle="คลิกชื่อลูกค้าในรายการจองเพื่อดูข้อมูล"
        icon={User2}
        variant="placeholder"
      >
        <p className="text-sm text-muted-foreground">
          ยังไม่ได้เลือก — คลิกชื่อลูกค้าในแถวรายการจอง
        </p>
      </SalePanelCard>
    );
  }

  // ── Loading
  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <SalePanelCard
        title="Customer Panel / ข้อมูลลูกค้า"
        subtitle={customerNameHint ? `กำลังโหลด: ${customerNameHint}` : 'กำลังโหลด…'}
        icon={User2}
        variant="live"
      >
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </SalePanelCard>
    );
  }

  // ── Error
  if (state.kind === 'error') {
    return (
      <SalePanelCard
        title="Customer Panel / ข้อมูลลูกค้า"
        subtitle="โหลดข้อมูลไม่สำเร็จ"
        icon={User2}
        variant="live"
      >
        <p className="text-sm text-destructive">{state.message}</p>
      </SalePanelCard>
    );
  }

  // ── Ready
  const c = state.customer;
  return (
    <SalePanelCard
      title="Customer Panel / ข้อมูลลูกค้า"
      subtitle={`ดูข้อมูลลูกค้าจากรายการจองที่เลือก`}
      icon={User2}
      variant="live"
    >
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{c.name}</p>
            {c.phone ? (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.phone}</p>
            ) : null}
          </div>
          {c.isBanned ? (
            <Badge variant="destructive">BANNED</Badge>
          ) : (
            <Badge variant="secondary">ACTIVE</Badge>
          )}
        </div>
        {c.isBanned && c.bannedReason ? (
          <p className="mt-2 text-[11px] text-destructive">
            เหตุผล: {c.bannedReason}
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
          {c.email ? (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right truncate">{c.email}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-right font-mono">{c.shippingType ?? '—'}</dd>
          <dt className="text-muted-foreground">Order count</dt>
          <dd className="text-right font-mono">{c.orderCount}</dd>
          <dt className="text-muted-foreground">Lifetime value</dt>
          <dd className="text-right font-mono">RM{c.lifetimeValue}</dd>
        </dl>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Address / labels / notes — ดูใน /customers
      </p>
      <Button variant="outline" size="sm" disabled className="w-full">
        แก้ไขข้อมูลลูกค้า — ยังไม่เปิดใช้งาน
      </Button>
    </SalePanelCard>
  );
}
