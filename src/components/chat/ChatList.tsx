'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatRow } from '@/server/repositories/chat.repository';

interface ChatListProps {
  readonly chats: readonly ChatRow[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly isLoading?: boolean;
}

function ChatListSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </>
  );
}

function formatTime(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ChatList({ chats, selectedId, onSelect, isLoading = false }: ChatListProps) {
  const t = useTranslations('chat');

  if (!isLoading && chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('noConversations')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y overflow-y-auto">
      {isLoading ? (
        <ChatListSkeleton />
      ) : (
        chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => onSelect(chat.id)}
            className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent ${
              selectedId === chat.id ? 'bg-accent' : ''
            }`}
          >
            {/* Avatar placeholder */}
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {chat.customer?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">
                  {chat.customer?.name ?? 'Unknown'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(chat.lastMessageAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="truncate text-xs text-muted-foreground">
                  {chat.lastMessage?.content ?? t('noMessages')}
                </p>
                {chat.unreadCount > 0 && (
                  <Badge className="ml-1 size-5 shrink-0 justify-center rounded-full p-0 text-[10px]">
                    {chat.unreadCount}
                  </Badge>
                )}
              </div>
              {chat.assignedUser && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  → {chat.assignedUser.name}
                </p>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
