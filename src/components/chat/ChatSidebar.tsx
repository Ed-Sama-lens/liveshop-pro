'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, ShoppingCart, UserCheck } from 'lucide-react';
import Link from 'next/link';
import type { ChatRow } from '@/server/repositories/chat.repository';
import { toast } from 'sonner';

interface TeamMember {
  readonly id: string;
  readonly name: string | null;
}

interface ChatSidebarProps {
  readonly chat: ChatRow;
  readonly teamMembers: readonly TeamMember[];
  readonly onAssign: (userId: string | null) => void;
}

export function ChatSidebar({ chat, teamMembers, onAssign }: ChatSidebarProps) {
  const t = useTranslations('chat');

  return (
    <div className="space-y-4 p-4">
      {/* Customer Info */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
            {chat.customer?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-medium">{chat.customer?.name ?? 'Unknown'}</p>
            {chat.customer?.facebookId && (
              <p className="text-xs text-muted-foreground">FB: {chat.customer.facebookId}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            render={<Link href={`/customers/${chat.customerId}`} />}
          >
            <User className="size-3.5" />
            {t('viewCustomer')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            render={<Link href={`/orders?customerId=${chat.customerId}`} />}
          >
            <ShoppingCart className="size-3.5" />
            {t('viewOrders')}
          </Button>
        </div>
      </Card>

      {/* Assignment */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <UserCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('assignTo')}</span>
        </div>
        <Select
          value={chat.assignedUserId ?? ''}
          onValueChange={(v) => onAssign((v ?? '') === '' ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('unassigned')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('unassigned')}</SelectItem>
            {teamMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name ?? member.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chat.assignedUser && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('assignedTo')}: {chat.assignedUser.name}
          </p>
        )}
      </Card>

      {/* Unread indicator */}
      {chat.unreadCount > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="destructive">{chat.unreadCount}</Badge>
          <span className="text-muted-foreground">{t('unread')}</span>
        </div>
      )}
    </div>
  );
}
