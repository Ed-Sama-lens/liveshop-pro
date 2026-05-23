# Oho Chat-Style Unified Inbox — Architecture Design

**Filed:** 2026-05-23 (overnight Track 7)
**Author:** Claude Sonnet 4.6 (autonomous overnight block)
**Master baseline:** `a1aef83` (post PR #59 merge)
**Status:** Design only. No runtime code in this doc.
**Audience:** Boss + ChatGPT

This doc captures the long-term architecture for an Oho Chat-style
unified inbox module so the Tier 4.x rollout (Facebook → Telegram →
WhatsApp → LINE OA?) stays coherent.

The sibling docs split the work:

- `2026-05-23-tier-4-1-fb-receive-only-pr-plan.md` — concrete Tier 4.1
  ship plan (single-channel)
- `2026-05-23-tier-3-10-a-vrich-board-design-audit.md` — V Rich slot
  board consumes inbox stream

This doc explains how all channels eventually plug into the same store.

---

## 1. Goal

Single admin screen at `/inbox` that aggregates conversations from:

- Facebook Page Messenger
- Facebook Live Comment
- Facebook Post Comment
- Telegram (Tier 4.3)
- WhatsApp Business (Tier 4.4)
- LINE OA (Tier 4.5? — optional, defer until Boss has LINE OA)
- Future custom chat aggregator (Tier 5+)
- Storefront contact form (already exists — wire as a synthetic channel)

Each conversation row shows:

| Element | Source |
|---|---|
| Customer name + avatar | `ChannelIdentity` + linked `Customer` |
| Channel icon | Conversation.platform enum |
| Last message preview | most recent `Message.body` (truncated) |
| Unread count | `Message.readAt IS NULL AND direction = INBOUND` |
| Priority chip | `Customer.priorityFlag` (manual tag) |
| Owner avatar | `Conversation.assignedUserId` |
| Status chip | new / open / pending / resolved |
| Booking/order link | `Booking` rows referencing the conversation |

Click a conversation → full message thread on the right, channel-aware
quick-reply (Tier 4.5 outbound), notes, customer profile sidebar.

---

## 2. What already exists in schema

Per `prisma/schema.prisma` audit (PR #57 §1.3):

- `Conversation` — unified conversation thread; `platform` enum already
  covers FB / IG / LINE / TIKTOK / MANUAL / STOREFRONT
- `ChannelIdentity` — customer-platform identity mapping with
  `[shopId, platform, platformUserId]` unique
- `Message` — direction (INBOUND / OUTBOUND), type (text / image /
  video / audio / location / postback / system), `externalMessageId`
  dedup, `rawPayload` + retention
- `Customer` — central record; multiple `ChannelIdentity` rows can link
  to one `Customer`
- `Booking.conversationId?` + `channelIdentityId?` + `sourceMessageId?`
  — link booking back to source message

**Nothing new in this design requires a schema migration.** All needed
columns already exist.

---

## 3. Layered architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin UI: /inbox                                               │
│  ┌─────────────────────┬───────────────────────┬──────────────┐ │
│  │ ConversationList    │ MessageThread         │ CustomerCard │ │
│  │ - filters           │ - history             │ - profile    │ │
│  │ - search            │ - send (Tier 4.5)     │ - bookings   │ │
│  │ - assignment        │ - typing indicator    │ - tags/notes │ │
│  └─────────────────────┴───────────────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Inbox API (channel-agnostic from caller's view)                │
│  - GET    /api/inbox/conversations?...&channels=...             │
│  - GET    /api/inbox/conversations/[id]/messages                │
│  - PATCH  /api/inbox/conversations/[id]  (assign / status / tag) │
│  - POST   /api/inbox/conversations/[id]/messages  (Tier 4.5)    │
│  - GET    /api/inbox/customers/[id]                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ChannelAdapter interface                                       │
│  - listMessages(ConversationId): Promise<UnifiedMessage[]>     │
│  - sendMessage(args): Promise<MetaMessageId> (Tier 4.5)        │
│  - markRead(externalMessageId): Promise<void>                  │
│  - on inbound (push or poll) → ingestion path                  │
└─────────────────────────────────────────────────────────────────┘
                  │              │              │
        ┌─────────┘              │              └─────────────┐
        ▼                        ▼                            ▼
┌──────────────┐         ┌──────────────┐            ┌──────────────┐
│ FacebookAdapter│        │TelegramAdapter│           │WhatsAppAdapter│
│ - webhook push│         │- webhook push │           │- Cloud API   │
│ - LiveComment │         │- bot polling  │           │  webhook     │
│   polling     │         │  fallback     │           │              │
└──────────────┘         └──────────────┘            └──────────────┘
                  │              │              │
                  └──────┬───────┴──────┬──────┘
                         ▼              ▼
                  ┌──────────────────────────────┐
                  │  Persisted store              │
                  │  - Conversation               │
                  │  - Message                    │
                  │  - ChannelIdentity            │
                  │  - Customer                   │
                  └──────────────────────────────┘
```

### Adapter contract (TypeScript sketch)

```ts
export interface ChannelAdapter {
  readonly platform: ChannelPlatform; // 'FACEBOOK' | 'TELEGRAM' | ...
  readonly displayName: string;
  ingestInbound(payload: unknown): Promise<IngestResult>;
  pollInbound?(filter: PollFilter): Promise<IngestResult>; // optional
  sendOutbound?(args: SendArgs): Promise<{ externalMessageId: string }>; // Tier 4.5
  markRead?(externalMessageId: string): Promise<void>;
}
```

`IngestResult` always shape:

```ts
interface IngestResult {
  channelIdentityId: string;
  conversationId: string;
  messageId: string;
  isNewConversation: boolean;
  isNewIdentity: boolean;
  isDuplicate: boolean;
}
```

The adapter NEVER touches `Booking` / `Order`. Slot-fill logic lives in
`/sale` (Tier 3.10-E), reading from inbox via the same store.

---

## 4. Relationship to existing modules

| Existing module | Role under unified inbox |
|---|---|
| `src/lib/facebook/live-comments.ts` | Becomes the polling source for `FacebookAdapter` (Live Comment branch) |
| `src/components/sale/SaleInboxPlaceholder.tsx` | Becomes a `/sale`-scoped projection of the same inbox store (filtered by `saleDate`) |
| `prisma/Conversation` / `Message` / `ChannelIdentity` | Persistence store, unchanged |
| `Booking.conversationId` / `sourceMessageId` | Source-of-booking link, already wired |
| `src/proxy.ts` middleware | Adds rate-limit + auth for `/api/inbox/*` |
| `Customer.priorityFlag` (new optional field?) | If added, R1 migration — flag in §7 |

`/inbox` and `/sale` see the SAME `Message` rows. `/sale` filters by
`saleDate`; `/inbox` shows all open conversations regardless of date.

---

## 5. Conversation status state machine

```
   ┌───────┐    new inbound      ┌──────┐   admin opens   ┌──────┐
   │ none  │ ───────────────────▶│ new  │ ───────────────▶│ open │
   └───────┘                     └──────┘                 └──────┘
                                                              │
                                  set status = pending        │
                                  (waiting on customer)       ▼
                                                          ┌─────────┐
                                                          │ pending │
                                                          └─────────┘
                                                              │
                                                              │ customer replies
                                                              ▼
                                                          ┌──────┐
                                                          │ open │
                                                          └──────┘
                                                              │
                                                              │ admin marks resolved
                                                              ▼
                                                         ┌──────────┐
                                                         │ resolved │
                                                         └──────────┘
                                                              │
                                                              │ new inbound
                                                              ▼
                                                         ┌──────┐
                                                         │ open │
                                                         └──────┘
```

Statuses stored as `Conversation.status` (existing enum can be extended;
flag if migration needed). Auto-transition rules:

- `none → new` — first inbound message
- `new → open` — first time admin opens the thread
- `open → resolved` — admin clicks "Mark resolved"
- `resolved → open` — new inbound from same customer auto-reopens
- `*  → pending` — admin clicks "Waiting on customer"
- `pending → open` — customer replies → auto-promote

---

## 6. UX features (Oho Chat-inspired)

### 6.1 Conversation list

- Filters: channel, status, owner, has-booking?, unread, priority
- Search by customer name / phone / message body
- Sort: most recent / oldest unread / priority
- Bulk operations: assign to user, change status, tag

### 6.2 Message thread

- Channel-aware bubble styling
- Image / video / audio inline preview
- Translate button per message (LLM call, opt-in; deferred to Tier 5)
- Internal note (admin-only, NOT sent to customer)
- Quick replies (saved templates; Tier 4.5 outbound)
- Send (Tier 4.5 — gated; until then, "Send" greyed with tooltip)

### 6.3 Customer card

- Profile: name, channel identities (linked), phone, email
- Conversation count, booking count, order count, lifetime RM total
- Tags (admin-curated, multi)
- Notes (free-text, internal)
- Booking timeline link

### 6.4 Assignment + workload

- Conversation can be assigned to an admin user
- Round-robin auto-assign on `new` status (Tier 5+, opt-in)
- "My open" filter for each admin

### 6.5 Analytics (Tier 5+)

- Per-admin avg response time
- Per-channel volume
- Conversion rate (conversation → booking → order)
- Stale conversation count

---

## 7. Schema additions (gated)

Anything that needs a new column gets called out here. **Tier 4.1 → Tier
4.4 do not need any of these.** They land later when their feature
unlocks.

| Field | When | Risk |
|---|---|---|
| `Conversation.status` enum extension to include `pending` / `resolved` if not already there | Tier 4.5 (status state machine) | R1 |
| `Conversation.assignedUserId?` if not already there | Tier 4.5 (assignment) | R1 |
| `Conversation.tags String[]` | Tier 5 (analytics) | R1 |
| `Customer.priorityFlag Boolean default false` | Tier 5 | R1 |
| `Message.readAt DateTime?` | Tier 4.5 (unread) | R1 |
| `ConversationNote` new table for internal notes | Tier 4.5+ | R1 |
| `MessageTemplate` new table for quick replies | Tier 4.5 (outbound) | R1 |

Verify these against current schema before Tier 4.5 implementation.
Some may already exist.

---

## 8. Linking to /sale board (Tier 3.10-E)

`/sale` is a saleDate-anchored projection of the same store:

- `/sale` reads `Conversation + Message` where:
  - `broadcastProduct.saleDate = selectedSaleDate`, OR
  - `Conversation.liveSessionId = currentLiveSession`
- `/sale` inbox panel shares filters with `/inbox` but adds saleDate
- Drag-drop from `/sale` inbox panel → slot in V Rich board creates
  `Booking` row with `sourceMessageId` + `conversationId` populated

`/sale` and `/inbox` are two lenses on one store. Adding a new channel
means: implement adapter → ingest path writes Conversation+Message
rows → both lenses see the new channel automatically.

---

## 9. Rollout sequence

Lined up with Tier 4.x:

| Tier | Lands | Inbox impact |
|---|---|---|
| 4.1 | FB Page Inbox + Live Comment receive-only | Inbox shows FB conversations |
| 4.2 | FB Post Comment + threaded reply view (still receive-only) | Inbox shows FB post engagement |
| 4.3 | Telegram Bot receive-only | Inbox shows TG conversations |
| 4.4 | WhatsApp Business Cloud API receive-only | Inbox shows WA conversations |
| 4.5 | Outbound message send (per-channel feature-flagged) | Send button enabled; quick replies |
| 4.6 | Assignment + status state machine + notes | Multi-admin workflow |
| 5.0 | Translation + analytics + auto-assign | Advanced features |

Each tier reviewed independently. No tier auto-fires the next.

---

## 10. Hard no-go (architectural-level)

- ❌ NO outbound message send in any 4.1 / 4.2 / 4.3 / 4.4 PR
- ❌ NO auto-booking from message parser
- ❌ NO customer PII surfaced beyond name + channel handle
- ❌ NO cross-shop data
- ❌ NO Boss-only Meta / Telegram / WhatsApp credentials touched by Claude
- ❌ NO env / flag flip by Claude
- ❌ pak-ta-kra untouched

---

## 11. Open questions for Boss + ChatGPT

1. Does the existing `Conversation.status` enum already include `pending` / `resolved`? If not, Tier 4.5 needs an R1 migration.
2. Does `Conversation.assignedUserId` exist yet? If not, Tier 4.5 migration.
3. Is the `/inbox` route name OK, or prefer `/messages` / `/conversations`?
4. CHAT_SUPPORT role boundary — read-only inbox or full read+reply?
5. Tag taxonomy — admin-managed labels vs preset list?
6. Translation provider for Tier 5 — Anthropic / Google / DeepL?
7. Customer merge — when two `ChannelIdentity` rows belong to one human, who triggers the merge?

These can be answered later; defaults proposed in §5-§7.

---

## 12. Cross-references

- `prisma/schema.prisma` — Conversation / Message / ChannelIdentity / Customer
- `docs/CODEMAP/13-unified-commerce-inbox.md` — earlier sketch
- `docs/superpowers/2026-05-22-facebook-receive-only-readiness-audit.md` (PR #57)
- `docs/superpowers/2026-05-23-tier-4-1-fb-receive-only-pr-plan.md` (Track 6)
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` (Track 5)

---

## 13. Decision

This doc lands as `docs(inbox): design Oho-style unified inbox architecture`.
Zero runtime change. Sets the long-term boundary so Tier 4.x slices
land coherently. Boss + ChatGPT verdict on §1 + §3 unlocks Tier 4.x
sequencing.
