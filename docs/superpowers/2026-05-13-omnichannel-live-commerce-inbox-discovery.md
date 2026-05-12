# Omnichannel Live Commerce Inbox — discovery (Phase 6, docs-only)

**Status:** DOCS ONLY. No code. No schema work. No platform integration. Spawned by Boss 2026-05-13 work plan Phase 6 after Manual Create Phases 1-5 shipped.
**Date:** 2026-05-13
**Author:** Claude Opus 4.7
**Audience:** Boss + ChatGPT — review for runtime roadmap decisions.

---

## Why now

`/sale` MVP now reaches a useful state: 4 mutations wired (Confirm + Cancel + CreateOrder + ManualCreate) on top of read-only Live Sessions / Product Codes / Booking Queue / Customer Panel. Admin can run a live sale end-to-end provided bookings arrive via Manual Create.

Production scope ahead is to replace Manual Create as the dominant booking path with **inbox-driven** bookings parsed from real platform messages — Messenger DM, Facebook Live comments, WhatsApp, Telegram. Before any runtime work, ground the discovery in what the repo actually contains today and where the gaps are.

---

## Repo capability inventory (today)

### Schema (Prisma) — already migrated

Migration `20260508171617_add_unified_inbox_and_sale_mvp` introduced the omnichannel scaffolding. The models exist; no code uses them yet for inbound platform traffic.

Models grounding the future inbox:

| Model | Role | Fields of interest |
|---|---|---|
| `Conversation` | One thread per (shop, customer | channel identity). | `source: ConversationSource` (LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / MANUAL), `status`, `liveSessionId?`, `lastMessageAt` |
| `ChannelIdentity` | Mapping of (shop, platform, platformUserId) → optional customer. | `platform: Platform` (FACEBOOK / MESSENGER / WHATSAPP / TELEGRAM / MANUAL), `platformUserId`, `platformThreadId?`, `displayName`, `metadata` JSON, unique `(shopId, platform, platformUserId)` |
| `Message` | Each inbound or outbound platform message. | `platform`, `source`, `direction`, `type` (TEXT / IMAGE / VIDEO / AUDIO / FILE / PRODUCT_CARD / ORDER_SUMMARY / PAYMENT_PROOF / TEMPLATE / SYSTEM), `text`, `mediaUrls`, **`rawPayload: Json`**, **`rawPayloadRedactedAt?`**, **`retentionUntil?`**, `parseStatus`, `externalMessageId` (unique per `(shopId, platform, externalMessageId)`) |
| `CommentParseLog` | Audit of parser attempts on a message. | `parserVersion`, `matchedCode?`, `matchedVariantId?`, `parsedQuantity?`, `parsedAction?`, `confidence?` |
| `Booking.source` | Existing `BookingSource` enum already includes MANUAL / LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / IMPORT / SYSTEM. |
| `Booking.sourceMessage` | Optional relation to `Message` so a parsed booking knows its origin comment/DM. |

**Conclusion:** the schema is platform-agnostic and parser-aware by design. No new model needed for receive-only Phase 1. Send-message side has no abstraction yet — see Gap 3.

### Existing routes related to platforms

| Path | Purpose | Status |
|---|---|---|
| `POST /api/facebook/exchange-token` | Trade short-lived FB access token for long-lived 60-day token. OWNER/MANAGER only. | Shipped. Used during page-connection setup. |
| `GET /api/live/[id]/comments` | Local API for live-session comment list (read-only admin view). | Shipped. Reads from local DB, NOT from Meta Graph API. |
| `POST /api/webhooks` + helpers | Admin-defined **outbound** webhook subscriptions (the shop notifies external systems on order/payment events). | Shipped. **NOT** an inbound Meta receiver. |
| `dispatchWebhook` service | Outbound delivery of order/payment/shipment events via signed POST. | Shipped. |

There is **no inbound webhook receiver** today. No `/api/webhooks/facebook/messages`, no `/api/webhooks/whatsapp`, no `/api/webhooks/telegram`. Nothing parses live comments from Meta in real time.

### Env vars already present

`.env.example` declares:
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_WEBHOOK_VERIFY_TOKEN`

These are sufficient for the Messenger / Facebook page webhook handshake. No WhatsApp Cloud API or Telegram Bot tokens declared yet.

### Customer linkage

`Customer.channel: SaleChannel` records the customer's primary channel (FACEBOOK / INSTAGRAM / LINE / TIKTOK / MANUAL / STOREFRONT). `Customer.facebookId` exists as a legacy single-platform identifier. The longer-term path uses `ChannelIdentity` rows (1 customer → N platform identities). The dual paths coexist today; new omnichannel work must converge on `ChannelIdentity`.

### Live comments local code

`src/lib/facebook/live-comments.ts` (referenced by exchange-token route) holds the Graph API integration helper. Not used for streaming today — read-only token exchange.

---

## Real-world constraints (research-grounded)

| Constraint | Source | Implication |
|---|---|---|
| Meta webhook signature verification requires **raw body** + `X-Hub-Signature-256` HMAC check against app secret. | Meta Webhooks docs (Graph API v18+). | Next.js App Router needs `request.text()` (not `request.json()`) before parsing — body must remain unmodified for HMAC. Existing `validateBody` middleware reads JSON; new receiver routes need a separate raw-body path. |
| WhatsApp Cloud API enforces **24-hour customer-service window** for free-form replies. Outside the window, only approved Template messages allowed. | WhatsApp Cloud API messaging policy. | Send-message abstraction must know the window state per recipient or risk failed sends. |
| Telegram Bot API requires choosing between **getUpdates polling** OR webhook — never both. | Telegram Bot API docs. | Pick webhook (consistent with Meta) for prod; polling is for dev/local only. |
| Meta webhook delivery is **at-least-once**. Replays carry the same `messaging.message.mid` (Messenger) or `entry.changes.value.message_id` (page comments). | Meta Webhooks reliability docs. | `Message.externalMessageId` unique constraint already in schema. Idempotent upsert on receive is mandatory. |
| Raw webhook payloads contain PII (customer name, phone numbers, profile pic URLs, message text). | GDPR / PDPA / Meta Platform Terms. | Existing `Message.rawPayloadRedactedAt` + `retentionUntil` fields exist for this — but nothing populates them yet. Retention policy is undecided. |

---

## Gap analysis

### Gap 1 — Inbound receiver routes

No `/api/webhooks/meta/messages` (Messenger), `/api/webhooks/meta/comments` (Facebook page comments), `/api/webhooks/whatsapp`, or `/api/webhooks/telegram` exists.

Each requires:
1. **GET handler** for the verification challenge (Meta `hub.challenge`, Telegram `setWebhook` ack).
2. **POST handler** that:
   - Reads raw body.
   - Verifies HMAC signature (Meta) or shared secret token in URL path (Telegram).
   - Parses JSON only after signature check.
   - Upserts `ChannelIdentity` + `Message` rows idempotently.
   - Returns 200 fast (Meta retries on 5xx or >20s).
3. Background processing to run parsers + classifiers — not inside the receiver request.

### Gap 2 — Parser runtime

`CommentParseLog` exists but no parser code. Phase 2 work would introduce:
- A pure parser library that accepts `{text, displayCodeRegistry, defaults}` and returns `{action, displayCode, quantity, confidence}` or `{action: 'no-match'}`.
- A worker invocation point (likely inside the webhook receiver after persistence, or a background job) that creates either `Booking` (PENDING_REVIEW) on confident parse or leaves the message unparsed.

Out of Phase 6 scope. Even thinking about it here only to surface the boundary.

### Gap 3 — Outbound send abstraction

No `messageSenderRepository` or `platforms/*.send.ts`. Messenger / WhatsApp / Telegram replies all need:
- Common interface `sendMessage({channelIdentityId, type, text|template, mediaUrl?})`.
- Per-platform adapter that maps to Graph API / WA Cloud API / Telegram Bot API.
- Idempotency key passthrough so retries on 429 / 5xx don't duplicate.
- Customer-service window check before sending free-form WhatsApp text.

**Boss hard rule:** "Do not generate customer-facing messages." This abstraction stays gated until Boss explicitly approves messaging policy + template approvals + opt-in audit trail. Discovery only.

### Gap 4 — Channel identity ↔ customer resolution

`ChannelIdentity` can exist without `customerId` (NULLABLE). On first inbound message, the receiver creates the identity, the customer may or may not exist yet. Reconciliation rule needed:
- Same phone → existing customer.
- Same FB user id (legacy `Customer.facebookId`) → existing customer.
- Otherwise → leave `customerId = null` + surface in admin Inbox panel for manual binding.

No code does this today.

### Gap 5 — Raw payload retention policy

`Message.rawPayloadRedactedAt` + `retentionUntil` fields exist but unused. Need:
- Retention window decision (e.g. 30 / 90 / 180 days for raw payload?).
- Background job that, when `retentionUntil <= now`, nulls `rawPayload` + stamps `rawPayloadRedactedAt`.
- Documentation of what data leaves the system vs is redacted in place (rawPayload field set to `{redacted: true}` while keeping shape).

Out of Phase 6 scope to implement; in scope to flag.

### Gap 6 — Inbox panel UI

`/sale` workspace shell already mounts `SaleInboxPlaceholder` ("Coming Soon"). No fetch wired. Phase 2+ would add `GET /api/sale/conversations?liveSessionId=...&status=PENDING_REVIEW` returning recent threads + last message + parse confidence + suggested booking action.

### Gap 7 — Per-platform connect flow

Admin connects:
- Facebook page → existing token exchange path (manual copy-paste; admin pastes long-lived token into .env). **Not** a hosted OAuth flow.
- WhatsApp → no flow today.
- Telegram → no flow today.

A future `ShopChannelAccount` model (or extension of `ShopBranding`) would store per-shop platform credentials. Currently Boss-managed env vars are the only path.

---

## Recommended phase roadmap (NOT a plan to ship — just a sequence)

Each phase needs separate Boss approval + dissent doc + 4-bullet risk audit before any code. Order optimized for risk: receive-only first, parser/send later, multi-platform after one channel stable.

### Phase O-1 — Messenger receive-only (first channel)

**Goal:** persist inbound Messenger DMs into `Message` + `ChannelIdentity` without any reply behavior, without parser, without inbox UI fetch.

**Allowed work:**
- New `GET /api/webhooks/meta/messages` — verification challenge.
- New `POST /api/webhooks/meta/messages` — raw body + HMAC verify + idempotent upsert.
- New `metaWebhookSecret` env var per shop OR re-use `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
- New `messageRepository.upsertFromMeta(...)` runtime + 5+ verifier tests.
- New `channelIdentityRepository.upsertFromMeta(...)` runtime.
- Unit test on signature verification with fixture payload + known signature.
- Smoke probe: send Meta test event via Graph API explorer; observe 200 + row in DB.
- NO admin UI work.

**Stop:**
- Need shop-level webhook subscription (Meta App Review for page-messages permission).
- Raw payload too large (>16KB JSON column ceiling — Postgres handles, but slow).

**R-class:** R1 (new public route + raw body handler + new env semantics).

### Phase O-2 — Facebook Live comments receive-only

**Goal:** same as O-1 but `source = LIVE_COMMENT`. Tie `Message.liveSessionId` so the Booking Queue + Inbox panel can later filter live-only comments.

**Allowed work:** parallel to O-1 but on the `feed` subscription with `verb=add` filter. Persistence into `Message` reuses O-1 repo.

**Stop:** live comment volume during a live can be hundreds/sec — receiver must be fast or fall behind. Capacity test needed.

### Phase O-3 — Inbox panel read-only fetch

**Goal:** wire `SaleInboxPlaceholder` to a new `GET /api/sale/conversations?liveSessionId=...` (or platform-filtered). Shows admin recent threads + last message + status + customer hint. **No reply ability.** Click → opens detail modal (future).

**Allowed work:**
- `GET /api/sale/conversations` route + zod query schema.
- `conversationRepository.findForSale(...)` runtime.
- UI fetch in `SaleInboxPlaceholder` + state model + empty/loading/error/ready.
- Mutation grep stays at 4 POSTs.

**Stop:** PII surface concerns (showing customer profile pictures, names from unconfirmed identities) need a policy decision.

### Phase O-4 — Parser POC for live comments

**Goal:** introduce a confidence-scored parser that matches `displayCode + quantity` patterns and, on high confidence, creates a PENDING_REVIEW booking auto-linked to the source message. **NEVER auto-confirm. NEVER auto-charge.** Admin still confirms via existing Confirm flow.

**Allowed work:**
- Pure parser lib `src/lib/inbox/parsers/v1.ts` with table-driven tests.
- Worker invocation after `Message` insert in webhook receiver.
- `CommentParseLog` write.
- New `BookingSource.LIVE_COMMENT` is already in schema enum — no schema change.

**Stop:** confidence threshold tuning takes real data. Capture real comments via O-2 first.

### Phase O-5 — WhatsApp Cloud API receive-only

**Goal:** mirror O-1 for WhatsApp. New env var set, new HMAC scheme, separate verify token.

**Stop:** WA template approval is a Meta product process — admin needs templates approved BEFORE outbound use.

### Phase O-6 — Telegram Bot receive-only

**Goal:** mirror O-1 for Telegram. Webhook URL contains bot token (Telegram's auth model).

**Stop:** Telegram does NOT enforce 24-hour windows; outbound is free. Boss policy on auto-replies still applies.

### Phase O-7 — Outbound abstraction (deferred, NOT in this discovery)

`sendMessage` interface + per-platform adapter + opt-in audit + template management. **DEFER** until Boss explicit go-ahead on customer-facing messages.

### Phase O-8 — Channel identity ↔ customer reconciliation

Background job + admin UI for merge/split of identities under one customer. Cleanup-style work.

---

## First implementation proposal (when Boss approves)

**Recommended first commit:** Phase O-1 Messenger receive-only.

**Reasoning:**
- Smallest scope, single platform, single direction, no parser, no UI.
- Validates raw-body + HMAC pattern that all future platform receivers will inherit.
- Persists data into existing schema — no migration.
- Failure mode is graceful (drops events on signature mismatch; Meta retries).
- Admin Inbox panel remains "Coming Soon" until O-3.

**Boss decisions needed before code:**

1. Webhook URL: `/api/webhooks/meta/messages` or `/api/inbox/meta/messages` or `/api/v1/webhooks/meta` ?
2. Per-shop secret model: single env var across all shops (simpler) vs per-shop credential row (multi-tenant ready)?
3. Raw payload retention default: 30/90/180 days?
4. App Review status: is the FB App in **Live** mode with `pages_messaging` + `pages_messaging_subscriptions` permissions? Or still **Development**? Receive-only needs Live mode for non-admin sender messages.
5. Acceptance criteria for the smoke probe: send Meta test event via Graph API explorer → expect 200 + `Message` row + `ChannelIdentity` row. Verify on production or dev?

---

## What this discovery does NOT propose

- ❌ Any code changes this commit.
- ❌ Schema migration (none needed for Phase O-1).
- ❌ Outbound messaging.
- ❌ Auto-confirmation of parsed bookings.
- ❌ Payment / shipment / order flow changes.
- ❌ Customer-facing message generation.
- ❌ Schema changes for the `ShopChannelAccount` model.
- ❌ Modifying existing `/api/webhooks/*` outbound routes.
- ❌ Modifying `/api/facebook/exchange-token`.
- ❌ Vercel env changes.
- ❌ pak-ta-kra touch.

---

## CD / CC / CN consultation items for Boss → ChatGPT

- **CD-1** Receive-only first channel choice: Messenger (audit pick — quietest, lowest volume) vs Facebook Live comments (more useful during sales but higher volume + capacity risk) vs WhatsApp (template constraints) vs Telegram (no API gate but smaller audience). ChatGPT verdict?
- **CD-2** Single-tenant secret (env var) vs per-shop secret (DB column on a new `ShopChannelAccount` model) — when do we cross the line?
- **CD-3** Raw payload retention window default. 30 / 90 / 180 days?
- **CC-1** Receiver runtime location: Next.js Route Handler vs dedicated worker (e.g. Vercel edge function vs separate service). Audit notes Vercel Route Handler is fine for Phase O-1 traffic levels; live comments at O-2 may need re-evaluation.
- **CC-2** Idempotency model: rely on `Message.@@unique([shopId, platform, externalMessageId])` Postgres constraint + upsert vs explicit lookup-then-insert vs Redis dedup window.
- **CN-1** Parser confidence threshold for auto-creating PENDING_REVIEW: 0.85? 0.90? Manual review queue for everything below threshold.
- **CN-2** Out-of-window WhatsApp DM behavior: silent fail vs admin notification vs queue + auto-retry inside next window.

---

## Refs (read-only)

- Schema models: [prisma/schema.prisma](../../prisma/schema.prisma) lines 699-895 (Conversation / ChannelIdentity / Message / CommentParseLog + enums)
- Migration: `prisma/migrations/20260508171617_add_unified_inbox_and_sale_mvp/`
- Existing FB token exchange: [src/app/api/facebook/exchange-token/route.ts](../../src/app/api/facebook/exchange-token/route.ts)
- Existing outbound webhook routes: `src/app/api/webhooks/route.ts` + `[id]/route.ts` + `[id]/logs/route.ts` (NOT inbound)
- Live comments helper: `src/lib/facebook/live-comments.ts` (token exchange only today)
- Manual smoke checklist: [2026-05-11-sale-read-only-manual-smoke.md](2026-05-11-sale-read-only-manual-smoke.md)
- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Manual Create Phase 1 audit (precedent doc shape): [2026-05-13-sale-manual-create-booking-readiness.md](2026-05-13-sale-manual-create-booking-readiness.md)
