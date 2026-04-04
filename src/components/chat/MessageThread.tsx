'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatMessageRow } from '@/server/repositories/chat.repository';

interface MessageThreadProps {
  readonly chatId: string;
  readonly messages: readonly ChatMessageRow[];
  readonly isLoading?: boolean;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
  readonly onMessageSent: () => void;
}

function formatMessageTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageThread({
  chatId,
  messages,
  isLoading = false,
  hasMore,
  onLoadMore,
  onMessageSent,
}: MessageThreadProps) {
  const t = useTranslations('chat');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const body = await res.json();
      if (body.success) {
        setContent('');
        onMessageSent();
      } else {
        toast.error(body.error ?? 'Failed to send message');
      }
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  // Messages come in desc order from API, reverse for display
  const sortedMessages = [...messages].reverse();

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMore && (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={isLoading}
            >
              {isLoading ? '...' : 'Load more'}
            </Button>
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className="h-10 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t('noMessages')}</p>
          </div>
        ) : (
          sortedMessages.map((msg) => {
            const isOutbound = msg.direction === 'OUTBOUND';
            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-3 py-2 ${
                    isOutbound
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  {msg.mediaUrl && (
                    <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
                      <ImageIcon className="size-3" />
                      {t('mediaAttached')}
                    </div>
                  )}
                  <p className={`mt-1 text-[10px] ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {formatMessageTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="border-t p-3">
        <div className="flex gap-2">
          <Input
            placeholder={t('typePlaceholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSending}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isSending || !content.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
