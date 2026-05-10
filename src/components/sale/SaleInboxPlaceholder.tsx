import { MessageSquare, MessageCircle, Send, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SalePanelCard } from './SalePanelCard';

/**
 * Future omnichannel inbox placeholder. Highlights the four platforms
 * the schema is already set up for (Phase 1 schema landed in Commit 1
 * via Conversation + ChannelIdentity + Message), but the parser /
 * webhook / send-out runtime is intentionally NOT in scope for the
 * /sale MVP. Pure visual hint.
 *
 * Icons are intentionally generic since lucide-react removed brand
 * marks; future hardening can swap to brand SVG assets if Boss approves.
 */
const DEMO_CHANNELS: ReadonlyArray<{
  readonly label: string;
  readonly icon: typeof MessageSquare;
  readonly status: 'live' | 'planned';
}> = [
  { label: 'Facebook Live Comments', icon: Radio, status: 'planned' },
  { label: 'Messenger Page Inbox',   icon: MessageCircle, status: 'planned' },
  { label: 'WhatsApp Cloud API',     icon: MessageSquare, status: 'planned' },
  { label: 'Telegram Bot',           icon: Send, status: 'planned' },
];

export function SaleInboxPlaceholder() {
  return (
    <SalePanelCard
      title="Unified Inbox (Coming Soon)"
      subtitle="Messenger / WhatsApp / Telegram / Live comments — เฟสถัดไป"
      icon={MessageSquare}
      variant="coming-soon"
    >
      <ul className="space-y-1.5">
        {DEMO_CHANNELS.map((c) => {
          const Icon = c.icon;
          return (
            <li
              key={c.label}
              className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                {c.label}
              </span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {c.status}
              </Badge>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Schema พร้อมแล้ว (Conversation/ChannelIdentity/Message) — รอ webhook + parser
      </p>
      <Button variant="outline" size="sm" disabled className="w-full">
        Coming soon
      </Button>
    </SalePanelCard>
  );
}
