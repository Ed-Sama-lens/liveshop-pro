'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatList } from '@/components/chat/ChatList';
import { MessageThread } from '@/components/chat/MessageThread';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { useDebounce } from '@/hooks/useDebounce';
import { useChatStream } from '@/hooks/useChatStream';
import { Search, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatRow, ChatMessageRow } from '@/server/repositories/chat.repository';
import type { PaginationMeta } from '@/lib/api/response';

interface TeamMember {
  readonly id: string;
  readonly name: string | null;
}

export default function ChatPage() {
  const t = useTranslations('chat');

  // Chat list state
  const [chats, setChats] = useState<readonly ChatRow[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  // Selected chat state
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<ChatRow | null>(null);

  // Messages state
  const [messages, setMessages] = useState<readonly ChatMessageRow[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageMeta, setMessageMeta] = useState<PaginationMeta | undefined>();
  const [messagePage, setMessagePage] = useState(1);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(true);
  const [teamMembers, setTeamMembers] = useState<readonly TeamMember[]>([]);

  // Fetch chat list
  const fetchChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (unreadOnly) params.set('unreadOnly', 'true');

      const res = await fetch(`/api/chats?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        setChats(body.data ?? []);
      }
    } catch {
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingChats(false);
    }
  }, [debouncedSearch, unreadOnly]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Fetch messages for a chat
  const fetchMessages = useCallback(async (chatId: string, page: number, silent = false) => {
    if (!silent) setIsLoadingMessages(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`/api/chats/${chatId}/messages?${params.toString()}`);
      const body = await res.json();
      if (body.success) {
        if (page === 1) {
          setMessages(body.data ?? []);
        } else {
          // Append older messages
          setMessages((prev) => [...prev, ...(body.data ?? [])]);
        }
        setMessageMeta(body.meta);
      }
    } catch {
      if (!silent) toast.error('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Real-time updates via SSE (falls back to polling if SSE unavailable)
  const selectedChatIdRef = useRef(selectedChatId);
  selectedChatIdRef.current = selectedChatId;

  useChatStream(useCallback(() => {
    fetchChats();
    if (selectedChatIdRef.current) {
      fetchMessages(selectedChatIdRef.current, 1, true);
    }
  }, [fetchChats, fetchMessages]));

  // Select a chat
  async function handleSelectChat(chatId: string) {
    setSelectedChatId(chatId);
    setMessagePage(1);
    setMessages([]);

    // Fetch chat details
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const body = await res.json();
      if (body.success) {
        setSelectedChat(body.data);
      }
    } catch {
      // Non-critical
    }

    // Fetch messages
    fetchMessages(chatId, 1);

    // Mark as read
    try {
      await fetch(`/api/chats/${chatId}/read`, { method: 'POST' });
      fetchChats();
    } catch {
      // Non-critical
    }
  }

  function handleLoadMore() {
    if (!selectedChatId || !messageMeta) return;
    const nextPage = messagePage + 1;
    if (nextPage > messageMeta.totalPages) return;
    setMessagePage(nextPage);
    fetchMessages(selectedChatId, nextPage);
  }

  function handleMessageSent() {
    if (selectedChatId) {
      fetchMessages(selectedChatId, 1);
      fetchChats();
    }
  }

  async function handleAssign(userId: string | null) {
    if (!selectedChatId) return;
    try {
      const res = await fetch(`/api/chats/${selectedChatId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json();
      if (body.success) {
        setSelectedChat(body.data);
        toast.success(userId ? t('assignSuccess') : t('unassignSuccess'));
        fetchChats();
      } else {
        toast.error(body.error ?? 'Assignment failed');
      }
    } catch {
      toast.error('Assignment failed');
    }
  }

  const hasMoreMessages = messageMeta ? messagePage < messageMeta.totalPages : false;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border">
      {/* Left panel — Chat list */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        {/* Search & Filter */}
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={!unreadOnly ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setUnreadOnly(false)}
            >
              {t('allChats')}
            </Button>
            <Button
              variant={unreadOnly ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setUnreadOnly(true)}
            >
              {t('unreadOnly')}
            </Button>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          <ChatList
            chats={chats}
            selectedId={selectedChatId}
            onSelect={handleSelectChat}
            isLoading={isLoadingChats}
          />
        </div>
      </div>

      {/* Center panel — Messages */}
      <div className="flex flex-1 flex-col">
        {selectedChatId && selectedChat ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {selectedChat.customer?.name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <span className="font-medium">{selectedChat.customer?.name ?? 'Unknown'}</span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowSidebar(!showSidebar)}
              >
                {showSidebar ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            </div>

            {/* Message thread */}
            <MessageThread
              chatId={selectedChatId}
              messages={messages}
              isLoading={isLoadingMessages}
              hasMore={hasMoreMessages}
              onLoadMore={handleLoadMore}
              onMessageSent={handleMessageSent}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{t('noConversations')}</p>
          </div>
        )}
      </div>

      {/* Right panel — Sidebar */}
      {showSidebar && selectedChat && (
        <div className="w-64 shrink-0 border-l overflow-y-auto">
          <ChatSidebar
            chat={selectedChat}
            teamMembers={teamMembers}
            onAssign={handleAssign}
          />
        </div>
      )}
    </div>
  );
}
