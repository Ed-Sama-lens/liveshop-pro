# 13 — Unified Commerce Inbox & /sale MVP

Architecture note covering the platform-agnostic inbox + live-sale booking foundation landed in Commits 1, 2A, 2B (April-May 2026).

---

## TL;DR

LiveShop Pro started as a 1-shop e-commerce app with an FB-only `Chat`/`ChatMessage` table. Phase 1 (this batch) adds a **platform-agnostic** layer alongside it: `Conversation`, `ChannelIdentity`, `Message` — designed to hold Messenger inbox, Facebook live/post comments, WhatsApp, Telegram, and manual notes under one model.

A new `/sale` namespace will eventually mirror V Rich App's live-selling workspace: code-grid (`T1`, `T31`...) → manual or parsed bookings → confirmed bookings → orders → fulfillment.

Schema is in. Booking confirm/cancel runtime is in. UI, parser, webhooks, and platform integrations are all deferred to later phases.

---

## What's actually shipped

| Commit | Date | Status | Description |
|---|---|---|---|
| 0 (`a1c9a86`) | 2026-04-06 | ✅ | Dissent doc capturing 18 Boss-locked design decisions |
| 1 (`bb8b973`) | 2026-04-06 | ✅ | Schema additive — 7 tables, 9 enums, 1 enum value, 1 nullable column. Migrated to Railway prod. |
| 1.1 (`67415d5`) | 2026-05-09 | ✅ | Codemap host/port redaction post DB credential rotation |
| 2A (`7b7f7b6`) | 2026-05-09 | ✅ | Booking runtime design doc |
| 2B (`689a83a`) | 2026-05-09 | ✅ | `bookingRepository.confirm()` + `cancel()` runtime, 55 pure tests |

## What's deferred (NOT shipped)

- `/sale` API routes — Commit 2C
- Booking → Order conversion — Commit 3 (separate dissent required)
- `/sale` admin UI — Commit 4+
- Comment parser engine — Phase 2
- Parser review queue UI — Phase 2
- Facebook webhook (Page comments, live comments, Messenger) — Phase 3
- Webhook signature verification (HMAC SHA256, raw body) — Phase 3
- WhatsApp Cloud API integration — Phase 5
- Telegram Bot API integration — Phase 6
- Bull queue for webhook processing — Phase 3
- Auto-expire worker — deferred indefinitely; admins control manually in Phase 1
- Test DB harness (real Postgres for repository tests) — separate prep commit

---

## Schema map

### Inbox layer (platform-agnostic)

```
Conversation ──┬── Customer (optional)
               ├── User (assignedTo, optional)
               ├── LiveSession (optional, for live-comment threads)
               └── Message[] ─── ChannelIdentity (optional, sender)
                                 │
                                 └── CommentParseLog[] (parser audit per message)

ChannelIdentity ── Customer (optional, for unified customer record)
```

- **`Conversation`** (`shopId`, `source`, `status`, `assignedToId?`, `liveSessionId?`) is the thread.
- **`ChannelIdentity`** (`shopId`, `platform`, `platformUserId`) is one platform identity per shop. NO floating `conversationId` pointer — same identity participates in many conversations over time. Event-level link via `Message.conversationId + Message.channelIdentityId`.
- **`Message`** (`shopId`, `platform`, `source`, `direction`, `type`, `externalMessageId`, `rawPayload`, `retentionUntil`) is the event. `@@unique([shopId, platform, externalMessageId])` is the idempotency guard for webhook retries.
- **`CommentParseLog`** records what the parser thought a message meant (matched code, qty, action, confidence). FK named `messageId` (NOT `platformMessageId`) to avoid ambiguity with `Message.externalMessageId`.

### Sale layer (built on inbox)

```
LiveSession ── BroadcastProduct[] ── Product / ProductVariant
                                     │
                                     └── Booking[] ─── Customer
                                                       │
                                                       ├── ChannelIdentity (optional)
                                                       ├── Conversation (optional)
                                                       ├── Message (sourceMessage, optional)
                                                       ├── Order (convertedOrder, optional, Phase 3)
                                                       ├── BookingHistory[] ─── User (changedBy)
                                                       └── StockReservation[] ─── ProductVariant
```

- **`BroadcastProduct`** (`liveSessionId`, `productId`, `variantId?`, `displayCode`, `displayOrder`, `priceOverride?`) — V Rich-style code grid. `@@unique([liveSessionId, displayCode])` so `T1`/`T31` codes are unique per broadcast. Same physical product can carry different codes in different sessions.
- **`Booking`** (`shopId`, `liveSessionId`, `broadcastProductId`, `customerId`, `quantity`, `unitPrice`, `status`, `source`, `idempotencyKey?`) — the unit of sale intent. Five lifecycle states: `PENDING_REVIEW → CONFIRMED → CONVERTED_TO_ORDER` with `CANCELLED` and `EXPIRED` branches.
- **`BookingHistory`** — append-only audit per status transition.
- **`StockReservation.bookingId`** (added in Commit 1) — same table as cart/order reservations, distinguishes via `bookingId` vs `orderId` field.

### Legacy chat (preserved)

- **`Chat` + `ChatMessage`** — FB-only, predates the platform abstraction. Boss decision: keep intact in Commit 1; do NOT migrate or delete. Future Phase decides whether to fold into `Conversation`/`Message` or keep as legacy bucket.
- **`MessageDirection`** enum extended with `SYSTEM` value (was `INBOUND` | `OUTBOUND`). Existing rows unaffected.

---

## Booking lifecycle

```
PENDING_REVIEW ─┬─► CONFIRMED ─┬─► CONVERTED_TO_ORDER  (Commit 3 work)
                │              ├─► CANCELLED
                │              └─► EXPIRED
                └─► CANCELLED
```

Rules:
- Manual admin booking MAY start at `CONFIRMED` directly (admin already decided).
- Parser-created booking ALWAYS starts at `PENDING_REVIEW` (Phase 2; parser will populate `Booking.sourceMessageId` + `Booking.source`).
- Stock reservation happens at `CONFIRMED` transition, NOT at order creation. Prevents oversell during payment-waiting window.
- No auto-expire in Phase 1. Admin manually calls cancel/expire to release.

---

## Stock reservation

The same `StockReservation` table backs both:
- **Cart/Order side** — `orderId` set, `bookingId` null. Created at storefront checkout, 24h `expiresAt`. Existing `expireReservations()` cron releases on timeout.
- **Booking side** — `bookingId` set, `orderId` null. Created on `bookingRepository.confirm()`. `expiresAt = NO_EXPIRY_SENTINEL` (`2099-12-31T23:59:59.000Z`) so the cron never auto-releases.

Both paths increment `ProductVariant.reservedQty`. `available = quantity - reservedQty` is computed in app, not stored.

### Concurrency-safe stock reserve (booking flow)

`bookingRepository.confirm()` uses an atomic conditional UPDATE inside the Prisma transaction:

```sql
UPDATE "ProductVariant"
SET "reservedQty" = "reservedQty" + $qty
WHERE "id" = $variantId
  AND "quantity" - "reservedQty" >= $qty
```

`$executeRaw` returns the row count. `count === 1` = reserve succeeded; `count === 0` = `INSUFFICIENT_STOCK`.

This pattern beats the existing `stock.repository.reserve()` read-then-update path which has a race window between the availability read and the increment. Booking-confirm operates under higher concurrency (mass live-sell comments → mass admin-confirms) and needs the predicate inside the UPDATE statement.

The existing checkout/cart `reserve()` was NOT updated to match — out of Commit 2 scope. Tracked as future tech-debt cleanup.

### Cancel/release (booking flow)

`bookingRepository.cancel()` mirrors confirm in reverse for `CONFIRMED → CANCELLED|EXPIRED`:

```sql
UPDATE "ProductVariant"
SET "reservedQty" = "reservedQty" - $qty
WHERE "id" = $variantId
  AND "reservedQty" >= $qty
```

Negative-stock guard prevents `reservedQty` from underflowing. `PENDING_REVIEW → CANCELLED` is a status update only; no stock touch.

### Convert-to-order (Commit 3, NOT YET)

Open design questions:
- Does the existing `StockReservation.bookingId` row pick up an `orderId` value (single row, two FKs), OR does conversion close the booking-side row (`releasedAt = now`) and create a new order-side row (no net change to `reservedQty`)?
- Order's existing `RESERVED → CONFIRMED` transition decrements both `quantity` and `reservedQty`. Conversion path must NOT cause double-decrement.

Boss decides at Commit 3 dissent.

---

## Idempotency

Two layers:

### Booking-level (Phase 2 parser)

`Booking.idempotencyKey String?` with `@@unique([shopId, idempotencyKey])`. Reserved for parser-driven creates so a duplicate FB comment (webhook retry) does not produce two booking rows. NOT used in Commit 2B.

### Operation-level (Commit 2B)

`bookingRepository.confirm()` is idempotent against double-clicks/retries:
- `CONFIRMED` + matching active `StockReservation` (same `bookingId`, `releasedAt = null`, same `quantity`) → no-op success.
- `CONFIRMED` + missing/mismatched reservation → `RESERVATION_INTEGRITY_ERROR` 500.
- `CONFIRMED` reached this state via a previous successful call; no duplicate stock increment possible.

`bookingRepository.cancel()` is similarly idempotent — re-cancelling an already-`CANCELLED`/`EXPIRED` booking with the same target returns success without DB writes.

### Webhook-level (Phase 3)

`Message.@@unique([shopId, platform, externalMessageId])`. Provides idempotency for inbound webhook events:
- FB comment: `comment_id`
- Messenger: `mid` or `event_id`
- WhatsApp: `wamid`
- Telegram: `update_id` or `chat_id + message_id`

Phase 3 webhook handler MUST set `externalMessageId` on every inbound row.

---

## PII retention (PDPA Storage Principle)

`Message.rawPayload` stores the raw provider payload. Phase 1 schema accommodates retention without enforcing it:

- `rawPayload Json?` — full payload, sensitive
- `rawPayloadRedactedAt DateTime?` — set when payload field has been nulled/redacted
- `retentionUntil DateTime?` — target expiry timestamp

Phase 1 has NO enforcement. Phase 2+ adds:
- Shop-configurable retention policy (default 90 days for `rawPayload`)
- Cron task to set `rawPayloadRedactedAt` and null the JSON
- Audit log when redaction happens

`Message.text` and `Message.mediaUrls` may persist longer if linked to active orders/support cases. Order/payment/audit follow business-record retention needs.

---

## Webhook security (Phase 3, NOT YET)

Hard requirements when Phase 3 lands:

### Meta family (Facebook Page, Messenger, WhatsApp Cloud)

- Verify `X-Hub-Signature-256` HMAC SHA256 with App Secret on every POST.
- Use **raw request body** for signature (NOT `JSON.parse` output).
- Reject invalid signatures BEFORE parsing.
- Webhook handler returns 200 within seconds; offload work to Bull queue.
- NEVER auto-create `CONFIRMED` booking from a webhook in v1. Parser → `PENDING_REVIEW` only.

### Telegram

- Use `update_id` or `chat_id + message_id` as idempotency key.
- Webhook: use `secret_token` parameter; verify `X-Telegram-Bot-Api-Secret-Token` header.
- NEVER mix `getUpdates` polling and webhook simultaneously.

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 — Schema foundation | Conversation/ChannelIdentity/Message, BroadcastProduct/Booking/BookingHistory, retention fields, idempotency keys | ✅ Commit 1 |
| 1 — `/sale` Manual MVP | Broadcast/session list, Add from stock, code grid, manual booking, booking list per product, manual confirm/cancel/expire, manual order generation, reply template copy/manual send | 🟡 runtime in 2B; UI + routes deferred |
| 2 — Manual Inbox Core | `/inbox` UI, conversation list, message timeline, customer panel, manual notes, link conversation→customer, booking/order from inbox | ⏸ |
| 3 — Messenger first | Meta webhook verify endpoint, store inbound, dedupe, manual reply if policy allows, NO auto-book | ⏸ |
| 4 — FB Live/Post comments | Ingest live/post comments, link to LiveSession, parser review queue, parser → `PENDING_REVIEW` booking, admin approves | ⏸ |
| 5 — WhatsApp Cloud API | Receive messages/statuses, service-window-aware send (free-form vs approved template), payment proof attachment | ⏸ |
| 6 — Telegram Bot | Webhook in production, getUpdates only for local, secret_token verify, dedupe by update_id | ⏸ |

---

## Cross-references

- `docs/superpowers/2026-04-06-sale-mvp-dissent.md` — full Boss-locked decisions (18 areas, 4-bullet dissent)
- `docs/superpowers/2026-05-09-sale-booking-runtime-design.md` — Commit 2A runtime design (concurrency strategy, idempotency rules, error codes)
- `prisma/schema.prisma` — schema source of truth
- `src/lib/sale/booking-rules.ts` — pure helpers (no I/O, fully testable)
- `src/server/repositories/booking.repository.ts` — `confirm()` + `cancel()` transaction logic
- `tests/unit/lib/sale/booking-rules.test.ts` — 55 passing pure-fn tests
- `docs/CODEMAP/04-database.md` — full Prisma model index
- `docs/CODEMAP/05-auth-rbac.md` — RBAC (OWNER/MANAGER write `/sale`; CHAT_SUPPORT read-only; WAREHOUSE no `/sale`)
- `docs/CODEMAP/07-storage-r2.md` — R2 + CSP for image attachments (when message media lands)

---

## What this doc is NOT

- Not a runtime contract — see `2026-05-09-sale-booking-runtime-design.md`
- Not an API reference — `/sale` API routes do not exist yet (Commit 2C+)
- Not a test plan — see `tests/unit/lib/sale/booking-rules.test.ts` for current coverage
- Not a webhook spec — see Phase 3 dissent (TBD) when work begins
