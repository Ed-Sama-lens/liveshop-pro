# Tier 4 — Omnichannel inbound receive-only plan

**Filed:** 2026-05-14
**Status:** Planning only. No runtime work. Implementation requires explicit Boss + ChatGPT approval.

---

## 1. Why receive-only first

Current state:

- Schema is ready (`Conversation`, `ChannelIdentity`, `Message`, `CommentParseLog` exist post-Phase-1 migration in master).
- Routes for inbound webhooks / API ingestion do NOT exist.
- Send / outbound runtime explicitly out of scope per Boss policy (no customer-facing message generation).

Tier 4 v1 = **receive-only**. Admin can observe incoming messages from supported channels via /sale Inbox panel + admin-driven manual reply via existing platform UI (Facebook page Inbox, etc). System does NOT auto-reply, does NOT auto-book, does NOT auto-parse into bookings.

This satisfies the "complete omnichannel admin workspace" goal while keeping customer-facing risk at zero.

## 2. Supported channels (Tier 4 scope)

Sorted by Boss prior interest + schema readiness:

| # | Channel | Mechanism | Schema enum | Tier 4 sub-PR |
|---|---|---|---|---|
| 1 | Facebook page Inbox (Messenger) | Facebook Webhook v18 messages event | Platform.MESSENGER | Tier 4.1 |
| 2 | Facebook page post comments | Facebook Webhook v18 feed event | Platform.FACEBOOK | Tier 4.2 |
| 3 | Facebook Live comments | Live API v18 video comments event | Platform.FACEBOOK | Tier 4.3 |
| 4 | Telegram bot | Telegram Bot API webhook | (extend `Platform` enum: TELEGRAM) | Tier 4.4 |
| 5 | WhatsApp Cloud API | Meta WhatsApp Webhook | (extend `Platform` enum: WHATSAPP) | Tier 4.5 |

Sequence proposed: 4.1 → 4.2 → 4.3 then 4.4 + 4.5 paired (both Meta-platform, similar webhook patterns).

## 3. What this is NOT

- No outbound messages.
- No auto-reply.
- No auto-booking from parsed comment text (Tier 5 — separate plan).
- No customer-facing summary / notification generation.
- No phone number capture flow.
- No KYC / identity-verification flow.
- No bulk import of historical messages (only forward-receive from webhook).

## 4. Common architecture pattern (applies to 4.1-4.5)

### 4.1 Inbound webhook route

`POST /api/webhooks/<platform>` — receives webhook payload.

**Common contract:**

1. Verify webhook signature / HMAC. Reject 401 if invalid.
2. Verify `X-Shop-Id` mapping OR derive shopId from `pageId` / `botToken` lookup via Webhook table.
3. Parse + validate payload via platform-specific zod.
4. For each entry/event:
   a. Upsert `ChannelIdentity` from sender identity.
   b. Upsert `Conversation` keyed by `(shopId, platform, platformThreadId)`.
   c. Insert `Message` row with `direction=INBOUND`, `status=RECEIVED`, `parseStatus=UNPARSED`.
   d. Store `rawPayload` for debugging; `rawPayloadRedactedAt` set later by retention cron.
5. Return 200 immediately (webhook ack timeout < 5s on most platforms).
6. Async followups (parse / notification / etc) NOT in Tier 4 — leave `parseStatus=UNPARSED`.

### 4.2 PII safety

- Never log raw `platformUserId` outside of `ChannelIdentity` table.
- Mask phone / email in any admin log.
- Set `rawPayload` retention to 30 days; cron sweeps + sets `rawPayloadRedactedAt`.
- `senderName` truncated to 100 chars max + sanitized (strip control chars, HTML escape on render).
- Encrypt `facebookToken` at rest (already done — Shop.facebookToken AES-256-GCM).

### 4.3 Rate limiting

- Webhook routes get higher rate limit than admin routes (platforms can burst).
- Use IP-based + signature-based dedup (Message `@@unique([shopId, platform, externalMessageId])` already enforces idempotency at DB level).

### 4.4 Operational monitoring

- Log webhook receive count + delivery latency.
- Alert on signature failure > 5/min (likely attack).
- Alert on parse failure rate > 10% (likely platform breaking change).
- Surface Inbox unread count in /sale workspace (separate UI PR).

### 4.5 App review implications

- Meta Messenger requires App Review for `pages_messaging` permission → already done per Boss prior work.
- WhatsApp Cloud API requires phone number registration + Business Verification → blocker for Tier 4.5.
- Telegram = no review (open API with bot token).

## 5. Per-sub-PR plan

### Tier 4.1 — Messenger receive

**Files:**

- `src/app/api/webhooks/facebook/messenger/route.ts` — webhook receive
- `src/server/services/messenger-inbound.service.ts` — payload parser + idempotent upsert
- `src/lib/validation/messenger-webhook.schemas.ts` — zod
- `src/components/sale/SaleInboxPlaceholder.tsx` — replace placeholder with live message list (read-only)
- `scripts/verify-messenger-inbound.ts` — Docker verifier with mock payload
- tests + docs

**Acceptance:**

- Webhook receives Messenger `messages` event → Message row inserted in DB.
- Inbox panel displays new messages in real time (poll or SSE).
- Duplicate webhook delivery (Meta retries) deduplicates via Message unique key.
- Cross-shop probe denied via shop mapping.

### Tier 4.2 — Page post comments

Similar pattern to 4.1, swap webhook event type to `feed`. Same Conversation source `POST_COMMENT`.

### Tier 4.3 — Live comments

Similar pattern. Source `LIVE_COMMENT`. Bind to active LiveSession via post → live mapping table.

### Tier 4.4 — Telegram receive

- Add `TELEGRAM` to `Platform` enum (schema migration).
- New webhook route `/api/webhooks/telegram`.
- Bot token storage in Shop or new TelegramBot table.
- Message rows with source `TELEGRAM_CHAT`.

### Tier 4.5 — WhatsApp receive

- Add `WHATSAPP` to `Platform` enum.
- New webhook route `/api/webhooks/whatsapp`.
- Requires Boss to complete WhatsApp Business API setup first.
- Message rows with source `WHATSAPP_CHAT`.

## 6. Security / hardening checklist

| Item | Owner | Status |
|---|---|---|
| HMAC verification on every webhook | route handler | Tier 4.x |
| CSP allows webhook origins | already includes graph.facebook.com etc | DONE |
| Rate limit per shop per channel | middleware | Tier 4.x |
| `rawPayload` retention sweep | cron | Tier 4.x |
| PII redaction in logs | service helper | Tier 4.x |
| Cross-shop probe denied | route handler | Tier 4.x |
| Failed signature alert | observability | Tier 4.x |

## 7. UI changes (per Tier 4.x)

- `SaleInboxPlaceholder` → `SaleInboxLive` with real message list.
- Filter chips from Tier 1 (`Inbox` / `Post Comment` / `Telegram` / `WhatsApp`) become available when each sub-PR ships.
- Booking creation from Inbox message (Tier 5 — parser) is OUT of scope for Tier 4.

## 8. Rollout sequencing

| Stage | Action | Risk |
|---|---|---|
| T4.0 | Schema migration for new Platform enum values (Telegram + WhatsApp) | R1 (additive) |
| T4.1 | Messenger receive PR | R1 (new route) |
| T4.1 deploy | smoke + observation 24h | R1 |
| T4.2 | Page post comments PR | R1 |
| T4.3 | Live comments PR | R1 |
| T4.4 | Telegram receive PR | R1 (requires bot setup) |
| T4.5 | WhatsApp receive PR | R1 (requires BSP setup) |

No flag flips during Tier 4 — runtime is always-on per channel once webhook URL registered with the platform.

## 9. Cross-references

- Tier 1 UI plan: `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md`
- Tier 3 plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- Tier 3.5 plan: `docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md`
- D4 / D6 runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- Inbound schema: `prisma/schema.prisma` § 784-895 (Conversation / ChannelIdentity / Message / CommentParseLog)
- Boss Facebook token storage: `Shop.facebookToken @db.Text` (AES-256-GCM)
