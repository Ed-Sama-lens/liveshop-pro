# Facebook / Oho — Local Webhook Test Plan + Message-to-Order Mapping

**Filed:** 2026-05-23 (Track T7 — daytime autonomous continuation)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `c500fcd`
**Status:** Plan refinement. No runtime code. Builds on PR #57 / #64 / #65 / #74.

This doc tightens the local development experience for the Tier 4.1
inbound webhook flow + concrete message → customer → booking → order
mapping. Both items are gaps the existing 4 docs flag but don't enumerate.

---

## 1. Local webhook test plan

### 1.1 Goal

Boss needs to develop + verify `/api/meta/webhook` locally before
flipping the production webhook subscription. Meta's webhook delivery
requires a public HTTPS endpoint — local dev must expose the dev
server somehow.

### 1.2 Recommended tool: `ngrok` (or equivalent)

| Tool | Pros | Cons |
|---|---|---|
| **ngrok** (free tier) | Simple `ngrok http 3000` → instant HTTPS URL | URL changes per session unless paid |
| Cloudflare Tunnel | Free + stable URL | Requires Cloudflare account config |
| localtunnel | npm-based | Less reliable; certs occasionally drop |
| Tailscale Funnel | Stable URL on Tailscale net | Requires Tailscale account |

Boss's recommended setup: **ngrok** for first-test, **Cloudflare
Tunnel** for repeatable dev (Cloudflare account already used for R2 +
Email Routing).

### 1.3 Local dev sequence

```
1. Local: npm run dev (Next.js on http://localhost:3000)
2. Local: ngrok http 3000 → https://<random>.ngrok.app
3. Meta App Dashboard → Webhooks → Edit callback URL
   → https://<random>.ngrok.app/api/meta/webhook
   → verify_token = META_WEBHOOK_VERIFY_TOKEN (from local .env)
4. Meta sends GET hub.challenge → route returns challenge → green ✓
5. Trigger inbound event:
   - Post a comment on the linked Page (or reply to a Live)
   - Send a Messenger message
6. Local terminal: route logs the parsed payload
7. Local DB: verify Conversation / Message / ChannelIdentity rows
```

### 1.4 Local DB safety

- **Use Railway dev branch** OR a local Postgres instance — NEVER
  point local dev at production Railway DB
- `.env.local` overrides production `DATABASE_URL`
- If unsure: `prisma migrate status` against local DB; production
  remains untouched

### 1.5 Test payload fixtures

Canned fixtures (stored under `tests/integration/meta/webhook-fixtures/`
when Tier 4.1-F lands):

| Fixture | Event | Use case |
|---|---|---|
| `messages-text.json` | Inbound text message | Happy path |
| `messages-image.json` | Inbound image attachment | Media handling |
| `messages-postback.json` | Quick reply postback | Postback type |
| `feed-comment.json` | Post comment | Post engagement |
| `live-video-comment.json` | Live comment (push) | Live event (primary path is polling) |
| `messages-attachment-multi.json` | Multiple attachments | Edge case |
| `messages-no-text.json` | Empty text payload | Defensive parsing |

Replay locally via `curl`:

```
curl -X POST https://<random>.ngrok.app/api/meta/webhook \
  -H 'content-type: application/json' \
  -H 'x-hub-signature-256: sha256=<computed>' \
  -d @tests/integration/meta/webhook-fixtures/messages-text.json
```

HMAC computation must match the helper from Tier 4.1-B
(`src/lib/meta/webhook-signature.ts`).

### 1.6 Signature verification locally

`.env.local` carries `META_APP_SECRET` (different value from prod —
Boss generates dev-only secret). Local route uses local secret;
production uses prod secret. Tests verify both pass.

### 1.7 Stop conditions

- ngrok URL changes mid-test → re-edit Meta App Dashboard webhook URL
- Local DB unreachable → fix `.env.local` `DATABASE_URL` before retest
- HMAC verification fails on canned fixture → helper bug
- 5s response deadline exceeded → route too slow; profile

---

## 2. Message → Customer → Booking → Order mapping

Builds on PR #65 §3 (Oho inbox arch read paths). This section is the
concrete column-level wiring per message type.

### 2.1 Inbound message → ChannelIdentity

Webhook payload contains `from.id` (Meta's per-Page user ID).

```ts
ChannelIdentity upsert key: (shopId, platform, platformUserId)
  shopId = resolved via Page→Shop lookup (Shop.facebookPageId)
  platform = 'FACEBOOK'
  platformUserId = payload.from.id
  displayName = payload.from.name (best-effort)
  customerId = optional (linked later when admin attaches)
```

Page→Shop resolution: `prisma.shop.findFirst({ where: { facebookPageId: pageIdFromPayload } })`.

### 2.2 ChannelIdentity → Conversation

```ts
Conversation upsert key: (shopId, channelIdentityId, platform)
  liveSessionId = nullable; populated when event is from a Live
  status = 'new' (first inbound) or stays at current
  lastMessageAt = now
```

One Conversation per (channelIdentity, platform). Reusing across events.

### 2.3 Conversation → Message

```ts
Message insert (no upsert; deduplicated by externalMessageId UNIQUE):
  conversationId
  direction = 'INBOUND'
  type = 'text' | 'image' | 'video' | 'audio' | 'postback' | 'system'
  body = parsed text (or null for media)
  externalMessageId = payload.message.mid (UNIQUE constraint dedup)
  rawPayload = jsonb (audit + GDPR retention)
  rawPayloadRedactedAt = null
  retentionUntil = now + 30 days
  receivedAt = now
```

Schema already in place per PR #57 §1.3 audit. No migration.

### 2.4 Message → Customer (admin-driven)

The admin DOES NOT auto-link `ChannelIdentity` to `Customer` on first
message. Reason: PII safety — anonymous commenters should not
automatically become Customer rows.

Admin flow:
1. Inbox shows ChannelIdentity with display name (no Customer link yet)
2. Admin clicks "Link to customer" → searches existing Customers OR creates new
3. `PATCH /api/inbox/identities/[id]` sets `customerId`
4. Future bookings from this identity inherit the linked Customer

### 2.5 Message → Booking (Tier 3.10-E + Phase 1.5)

Two paths in Tier 3.10-E (drag-drop from inbox to slot):

**Path A — Identity already linked to Customer:**
```
POST /api/sale/bookings {
  broadcastProductId: <from slot>,
  customerId: <ChannelIdentity.customerId>,
  channelIdentityId: <ChannelIdentity.id>,
  conversationId: <Conversation.id>,
  sourceMessageId: <Message.id>,
  source: 'PAGE_INBOX' | 'LIVE_COMMENT' | 'POST_COMMENT',
  quantity: 1,
}
```

**Path B — Identity not linked yet:**
- Drop triggers prompt: "Link this customer first" → admin selects/creates Customer
- Then Path A runs

### 2.6 Booking → Order (existing Tier 3.9 flow)

Unchanged from current implementation. Phase 1.5 will add auto-append
to existing Order (per T6 refinement decision packet §3).

### 2.7 Outbound (Tier 4.5+)

After Tier 4.5 lands:

```
Booking.status → CONFIRMED triggers outbound:
  outboundService.send({
    channelIdentityId: Booking.channelIdentityId,
    template: 'BOOKING_CONFIRMATION',
    bookingId: Booking.id,
  })
  → ChannelAdapter[FACEBOOK].sendOutbound(...)
  → Message {
       direction: 'OUTBOUND',
       externalMessageId: <Meta response>,
       body: rendered confirmation,
     }
  → Activity log
```

Idempotency: `(bookingId, channelIdentityId, 'BOOKING_CONFIRMATION')`.

Hard-gated by `ALLOW_OUTBOUND_CUSTOMER_MESSAGES` env (default false).

---

## 3. Page→Shop resolution (Tier 4.1 prerequisite)

Webhook payload identifies the Page by `entry[].id`. We must resolve
that to a `Shop` row.

### 3.1 Current state

`Shop.facebookPageId` already exists per PR #57 §1.3 audit. Used today
for storefront FB Login linkage.

### 3.2 Lookup query

```ts
const shop = await prisma.shop.findFirst({
  where: { facebookPageId: entry.id },
  select: { id: true, timezone: true },
});
if (!shop) {
  // Log + skip (unknown page) — return 200 to Meta
  return new NextResponse(JSON.stringify({ ok: true }), { status: 200 });
}
```

### 3.3 Race condition: multiple shops one page

DB constraint: `Shop.facebookPageId` should be UNIQUE (verify schema).
If not, add migration:

```sql
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_facebookPageId_unique"
  UNIQUE ("facebookPageId");
```

Defer until needed; current data is single-shop.

---

## 4. Telegram / WhatsApp prerequisites (preview, not Tier 4.1)

Same `ChannelAdapter` interface from PR #65 §3.

| Channel | Identifier | Webhook | Status |
|---|---|---|---|
| Facebook Page (Tier 4.1) | `Shop.facebookPageId` | `/api/meta/webhook` | this doc |
| Telegram (Tier 4.3) | `Shop.telegramBotId` (NEW column) | `/api/telegram/webhook` | future |
| WhatsApp (Tier 4.4) | `Shop.whatsappBusinessId` (NEW column) | `/api/whatsapp/webhook` | future |
| LINE OA (Tier 4.5?) | `Shop.lineChannelId` (NEW column) | `/api/line/webhook` | future / optional |

Each adapter resolves Shop via its platform identifier column. Same
upsert path. Same hard gates.

---

## 5. Hard no-go

- ❌ No Meta App Dashboard touch by Claude (Boss-only)
- ❌ No production webhook subscription by Claude
- ❌ No outbound implementation in Tier 4.1
- ❌ No parser auto-booking in Tier 4.1
- ❌ No customer PII auto-linking
- ❌ No env / secret request
- ❌ No schema migration in this PR (T7 is docs only)
- ❌ pak-ta-kra untouched

---

## 6. Cross-references

- PR #57 — Facebook receive-only readiness audit
- PR #64 — Tier 4.1 PR plan
- PR #65 — Oho unified inbox architecture
- PR #74 — Meta App Review checklist
- PR #81 — Phase 1.5 decision packet refinement
- `prisma/schema.prisma` — Conversation / Message / ChannelIdentity / Shop

---

## 7. Decision

This doc lands as `docs(meta): local webhook test plan + message→order mapping`.
Zero runtime. Boss + ChatGPT verdict on §3.3 (UNIQUE constraint on
`Shop.facebookPageId`) needed before Tier 4.1-C migration safety check.
