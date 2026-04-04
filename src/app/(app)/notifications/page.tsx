'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ShoppingCart, Package, MessageSquare, Truck, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { toast } from 'sonner';
import Link from 'next/link';
import type { PaginationMeta } from '@/lib/api/response';

interface Notification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly link: string | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  NEW_ORDER: ShoppingCart,
  LOW_STOCK: Package,
  NEW_CHAT: MessageSquare,
  SHIPMENT_UPDATE: Truck,
  PAYMENT_RECEIVED: CreditCard,
  SYSTEM: Info,
};

const TYPE_COLORS: Record<string, string> = {
  NEW_ORDER: 'text-blue-500',
  LOW_STOCK: 'text-amber-500',
  NEW_CHAT: 'text-green-500',
  SHIPMENT_UPDATE: 'text-purple-500',
  PAYMENT_RECEIVED: 'text-emerald-500',
  SYSTEM: 'text-muted-foreground',
};

const TYPE_BG: Record<string, string> = {
  NEW_ORDER: 'bg-blue-500/10',
  LOW_STOCK: 'bg-amber-500/10',
  NEW_CHAT: 'bg-green-500/10',
  SHIPMENT_UPDATE: 'bg-purple-500/10',
  PAYMENT_RECEIVED: 'bg-emerald-500/10',
  SYSTEM: 'bg-muted',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function NotificationsPage() {
  const { unreadCount, refresh } = useNotificationStream();
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (filter === 'unread') params.set('unreadOnly', 'true');

      const res = await fetch(`/api/notifications?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setNotifications(body.data ?? []);
        setMeta(body.meta);
      }
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications/read', { method: 'DELETE' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refresh();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      refresh();
    } catch {
      // Silent
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setFilter('all');
                setPage(1);
              }}
            >
              All
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setFilter('unread');
                setPage(1);
              }}
            >
              Unread
            </Button>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-1 h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        {isLoading && notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              const color = TYPE_COLORS[n.type] ?? 'text-muted-foreground';
              const bg = TYPE_BG[n.type] ?? 'bg-muted';

              const inner = (
                <div
                  className={`flex items-start gap-4 p-4 transition-colors hover:bg-accent/50 ${
                    !n.isRead ? 'bg-accent/10' : ''
                  }`}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead(n.id);
                  }}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!n.isRead ? 'font-semibold' : ''}`}>{n.title}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(n.createdAt)}
                        </span>
                        {!n.isRead && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  </div>
                </div>
              );

              if (n.link) {
                return (
                  <Link key={n.id} href={n.link} className="block">
                    {inner}
                  </Link>
                );
              }

              return <div key={n.id}>{inner}</div>;
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
