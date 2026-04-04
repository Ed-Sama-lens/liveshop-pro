'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, ShoppingCart, Package, MessageSquare, Truck, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { toast } from 'sonner';
import Link from 'next/link';

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

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { unreadCount, refresh } = useNotificationStream();
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=10');
      const body = await res.json();
      if (body.success) {
        setNotifications(body.data ?? []);
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  async function handleMarkRead(ids: readonly string[]) {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...ids] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
      refresh();
    } catch {
      toast.error('Failed to mark as read');
    }
  }

  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications/read', { method: 'DELETE' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refresh();
    } catch {
      toast.error('Failed to mark all as read');
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" />
        }
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {isLoading && notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              const color = TYPE_COLORS[n.type] ?? 'text-muted-foreground';

              const content = (
                <div
                  className={`flex gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer ${
                    !n.isRead ? 'bg-accent/20' : ''
                  }`}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead([n.id]);
                  }}
                >
                  <div className={`mt-0.5 shrink-0 ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </div>
              );

              if (n.link) {
                return (
                  <Link key={n.id} href={n.link} onClick={() => setIsOpen(false)}>
                    {content}
                  </Link>
                );
              }

              return <div key={n.id}>{content}</div>;
            })
          )}
        </div>
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <Link
              href="/notifications"
              className="block px-3 py-2 text-center text-xs text-primary hover:underline"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
