# /sale MVP — Dissent Doc

Date: 2026-04-06
Author: Claude (under Boss instruction)
Project: liveshop-pro
Scope: V Rich-style live-selling admin foundation
Status: Approved for Commit 0 (this doc) + Commit 1 (schema additive only). Runtime, webhook, parser, queue, FB API blocked until Commit 1 reviewed.

---

## Goal

Build a Live Commerce admin similar to V Rich App `/sale`. Manual-first reliable MVP. Then parser review queue (Phase 2). Then platform webhooks (Phase 3, FB first; WA + TG later via shared abstraction).

Pipeline target:

```
Live Comment / Inbox Message
  → Product Code Detection
  → Booking
  → Stock Deduction
  → Order Generation
  → Customer Reply
```

Manual fallback must work end-to-end even if every platform integration fails.

---

## Out of scope for Commit 0 + Commit 1

NOT in this commit batch:
- Webhook endpoints
- FB / Messenger / WhatsApp / Telegram API calls
- Comment parser (text extraction logic)
- Auto-booking from comments
- Auto-expire worker
- Bull queue
- UI components, pages, or routes
- Repository or service runtime code
- Modifying existing checkout / payment / order flow
- pak-ta-kra (separate project, zero touch)

Commit 0 = THIS DOC ONLY.
Commit 1 = additive Prisma schema only (after Boss approves this doc).

---

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Manual `/sale` admin: broadcast CRUD, code grid, manual booking, manual order generation, basic reply templates | Schema this commit batch; runtime later |
| 2 | Parser review queue: store messages, parse codes, NEVER auto-book, admin approves to convert | Schema accommodates; runtime deferred |
| 3 | Facebook Page + Messenger webhook ingestion, signature verify, dedupe, identity mapping | Schema accommodates; runtime deferred |
| Future | WhatsApp Cloud API + Telegram Bot API via shared platform abstraction | Schema-ready, no impl |

---

## Boss decisions (locked)

### 1. Product code source

`BroadcastProduct.displayCode` is the live-sale code. NOT `Product.stockCode`, NOT `ProductVariant.sku`.

- `stockCode` and `sku` remain searchable reference fields (Add-from-Stock modal)
- `displayCode` per-broadcast override; same product can be `T1` today, `T31` next week
- Constraint: `@@unique([liveSessionId, displayCode])`
- Normalization for matching: trim + uppercase

### 2. Booking lifecycle

```
PENDING_REVIEW ─► CONFIRMED ─► CONVERTED_TO_ORDER
       │              │
       └─► CANCELLED  ├─► CANCELLED
                      └─► EXPIRED
```

- Parser-created booking: ALWAYS `PENDING_REVIEW` in Phase 1 + Phase 2
- Manual admin booking: MAY start `CONFIRMED` directly (admin already decided)
- No auto-confirm for parser without explicit Boss enable

### 3. Stock decrement / reservation timing

Reservation happens at `CONFIRMED`. Not at `CONVERTED_TO_ORDER`.

Reuse existing fields:
- `ProductVariant.quantity`
- `ProductVariant.reservedQty`
- `available = quantity - reservedQty`

Inspected (read-only) existing patterns:
- `src/server/repositories/stock.repository.ts` — `reserve()` increments `reservedQty`, creates `StockReservation` row
- `src/server/repositories/stock.repository.ts` — release decrements `reservedQty`, marks `releasedAt`
- `src/server/repositories/checkout.repository.ts` — checkout reads `quantity - reservedQty`, increments `reservedQty` per item

Reservation requirements for booking:
- Confirm only inside DB transaction
- Inside transaction: `SELECT ... FOR UPDATE` on variant row, check `available >= requested`, increment `reservedQty`, insert `StockReservation` (or analog), update Booking status, append BookingHistory — all atomic
- Rollback if check fails
- Cancel / expire BEFORE order conversion: decrement `reservedQty`, mark reservation released
- Convert to order: do NOT double-decrement. Existing checkout flow uses `reservedQty` from cart-side reservation; booking-side flow must mirror this. Decision: order conversion transfers existing reservation to order-bound state; final stock fulfillment (PAID → quantity decrement) happens via existing order flow without re-reserving

CRITICAL: before writing runtime code in Commit 2+, AUDIT existing checkout.repository.ts + stock.repository.ts to determine exact transition from reservedQty to permanent quantity decrement. Do NOT create a second independent decrement path.

### 4. Hold timeout / expiry — NO auto-worker in Phase 1

- Schema MAY include nullable fields: `expiresAt`, `releasedAt`, `releaseReason`, `cancellationReason`
- Phase 1 rule: confirmed bookings stay reserved until admin manually cancels / expires / converts
- No 30-min timer. No background worker.
- Future: shop-configurable trigger on broadcast close / order summary sent / payment instruction sent / admin-set duration

### 5. Order generation trigger — manual only

Admin-only button: "Create order from confirmed bookings"

Scope: per-customer × per-broadcast.

Behavior:
- Group confirmed bookings for `(customerId, liveSessionId)` into one Order
- Compute subtotal / shipping / discount / total
- `payment_status` follows existing convention; `fulfillment_status` = pending
- Mark each booking `CONVERTED_TO_ORDER`, set `convertedOrderId`
- Append `BookingHistory` entries
- Idempotent: repeated clicks must NOT create duplicate orders
- Use transaction + idempotency key

NO auto-order on booking-count threshold. NO auto-order on payment received.

### 6. /sale route group

New route at `/sale`. Separate from existing `/live-selling`. Do NOT remove or alter `/live-selling`.

Phase 1 routes:
- `/sale` — sessions list / date selector
- `/sale/[sessionId]` — main workspace: code grid + booking list panel + comm panel placeholder
- `/sale/[sessionId]/bookings` — optional detailed view (build later if needed)
- `/sale/[sessionId]/parser-queue` — Phase 2 only
- `/sale/settings` — later: parser rules, templates, retention, platform config

Comm panel = manual notes / templates only in Phase 1. No FB connection.

### 7. PII retention / raw payload

`PlatformMessage.rawPayload` stores raw webhook body for debugging.

Policy (documented, not enforced in Phase 1):
- `rawPayload` retention: 90 days target
- Message `content` may persist longer if linked to order / support history
- Order / payment / audit follow business retention needs
- Shop-level retention config: future TODO

Schema accommodates retention metadata:
- `rawPayload Json?` (nullable, can be redacted later)
- `rawPayloadRedactedAt DateTime?`
- `retentionUntil DateTime?`

Rationale: Malaysia PDPA Storage Principle — do not store personal data longer than necessary. Phase 1 = no automation, but design for future redaction without schema break.

### 8. Existing LiveSession.fbLiveId

Reuse. No duplicate FB Live ID columns.

Verified existing fields:
- `LiveSession.fbLiveId String? @unique`
- `ChatMessage.fbMessageId String? @unique`

No collision in proposed schema.

### 9. RBAC for /sale

| Role | /sale access |
|---|---|
| OWNER | Full |
| MANAGER | Full live-sale ops |
| CHAT_SUPPORT | Read /sale + comments + bookings; use reply templates; CANNOT confirm/cancel/convert bookings in Phase 1 |
| WAREHOUSE | NO /sale access in Phase 1 (later: fulfillment views only) |

Write actions (sessions, products, booking confirm/cancel/convert, order generation): `OWNER, MANAGER` only in Phase 1.

### 10. Schema naming correction (CommentParseLog)

Rename to avoid ambiguity:

```prisma
model CommentParseLog {
  id        String          @id @default(cuid())
  messageId String                        // FK to PlatformMessage.id
  message   PlatformMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  ...
  @@index([messageId])
}
```

NOT `platformMessageId` (collides semantically with `PlatformMessage.platformMessageId` = external platform ID).

### 11. PlatformMessage idempotency

Use shop-scoped uniqueness:

```prisma
@@unique([shopId, platform, platformMessageId])
```

Safer for multi-shop SaaS + future imports + manual-source messages.

Indexes:
- `@@index([shopId, receivedAt])`
- `@@index([liveSessionId])`
- `@@index([customerIdentityId])`
- `@@index([parseStatus])`

### 12. CustomerIdentity uniqueness

```prisma
@@unique([shopId, platform, platformUserId])
```

Same FB user maps to ONE identity per shop. Cross-shop = different rows. No auto-merge across platforms in Phase 1; manual merge later.

### 13. Platform enum simplified

```prisma
enum Platform {
  FACEBOOK
  MESSENGER
  WHATSAPP
  TELEGRAM
  MANUAL
}

enum PlatformMessageType {
  LIVE_COMMENT
  INBOX_MESSAGE
  POST_COMMENT
  STORY_REPLY
  MANUAL_NOTE
}
```

Provider (`Platform`) and source (`PlatformMessageType`) separated. Avoids FACEBOOK_LIVE / FACEBOOK_PAGE / FACEBOOK_MESSENGER mixing.

### 14. Webhook security (Phase 3 — documented, not built)

Hard requirements when Phase 3 lands:

Meta family (Facebook Page, Messenger, WhatsApp Cloud):
- Verify `X-Hub-Signature-256` HMAC SHA256 with App Secret on EVERY POST
- Use RAW request body for signature (not JSON.parse output)
- Reject invalid signatures BEFORE parsing
- Use `platformMessageId` for idempotency
- Webhook handler returns fast (200 within seconds); offload heavy work to queue
- NEVER auto-create CONFIRMED booking from webhook in first webhook release

Telegram (later):
- Use `update_id` as idempotency key (or `message_id + chat_id` combo)
- If webhook: use `secret_token` parameter
- Do NOT mix `getUpdates` polling and webhook simultaneously

### 15. Parser rules (Phase 2 — documented, not built)

Parser must support:
- `T31`
- `T31 2`
- `T31 +1`
- `T31x2`
- `T31×2`
- `cancel T31`
- Thai/English spacing + punctuation normalization

Parser default behavior:
- Match → `PENDING_REVIEW`
- No match → `PARSED_NO_MATCH`
- Duplicate (same `idempotencyKey`) → IGNORED, never double-book
- Low confidence → review queue
- NO auto-confirm without explicit Boss enable

### 16. Audit / history

`BookingHistory` REQUIRED. Records:
- create pending
- confirm
- cancel
- expire / release
- convert to order
- quantity change
- previous status / new status
- `changedById` (User)
- reason
- timestamp

Existing `ActivityLog` should ALSO log major booking events (entity = "Booking") for shop-wide audit trail consistency.

### 17. Booking schema additions

Additive nullable fields:
- `expiresAt DateTime?`
- `releasedAt DateTime?`
- `releaseReason String?`
- `idempotencyKey String?`

For manual booking: `idempotencyKey` nullable.
For parser/message booking: derived from `sourceMessageId + broadcastProductId + customerId/action`.

Uniqueness option: `@@unique([shopId, idempotencyKey])` if Postgres + Prisma handle nullable uniqueness correctly (verify in Commit 1; Postgres treats NULL as distinct in unique by default which is fine).

Do NOT use `@@unique([sourceMessageId, broadcastProductId])` — one comment may reference multiple products in future.

### 18. BookingSource enum

```prisma
enum BookingSource {
  MANUAL
  LIVE_COMMENT
  INBOX_MESSAGE
  POST_COMMENT
  IMPORT
  SYSTEM
}

model Booking {
  source BookingSource @default(MANUAL)
  ...
}
```

Helps reporting + debugging.

---

## 4-Bullet Dissent (per Boss rule 3)

### Blast radius

- New tables only → existing reads/writes unaffected at insert
- BUT bookings ↔ `ProductVariant.reservedQty` decrement is NEW path. Wrong impl = oversell real customers
- `platform_messages.rawPayload` stores raw FB/WA webhook bodies → PII on disk; leak risk if DB exfiltrated
- `customer_identities` joins multi-platform users to one `Customer` → wrong join leaks data across customers
- New `/sale` route group expands admin attack surface; RBAC must match existing `ROUTE_PERMISSIONS` pattern
- Migration runs on Railway prod DB. Forward = `migrate deploy`. Rollback = manual SQL drop. R1.

### Assumptions

- Booking lifecycle locked above; admin always reviews parser results in Phase 1 + 2
- Stock model stays at `ProductVariant` level; product codes (`T1`/`T31`) map to `BroadcastProduct.displayCode`, NOT to `stockCode` or `sku`
- One `Customer` per shop; cross-shop FB profiles = different customer rows; multi-tenant boundary intact
- `PlatformMessage.platformMessageId` is unique per `(shop, platform)` combination — safer than global
- `BroadcastProduct` is junction (LiveSession × Product) with per-broadcast pricing override + display order
- Existing `LiveSession.fbLiveId` reused; no duplicate column
- Existing `StockReservation` table reused for booking-confirm reservation (avoid second decrement path) — verify in Commit 1 schema relations
- Postgres treats NULL as distinct in unique constraints (allows nullable `idempotencyKey` with unique)

### Reversibility (R0/R1/R2)

- R1 — Prisma migration: forward via `migrate deploy`. Backward = manual `DROP TABLE` SQL. No data loss IF rolled back BEFORE first webhook lands. Once production data exists, R0.
- R0 — Stock decrement transaction (Commit 2+, NOT this batch): irreversible side effect on `reservedQty`. Mitigation: `BEGIN; SELECT ... FOR UPDATE; CHECK; UPDATE; INSERT; COMMIT;` with explicit qty guard inside transaction.
- R2 — UI/admin pages (Commit 3+): reversible. Don't link from sidebar until ready; remove via component delete.

### Blind spots

- **FB webhook signature verification** — wrong impl = attacker injects fake comments → fake bookings → real stock loss. Phase 3 only, but flagged now.
- **Race conditions on stock** — concurrent admins booking same variant. Need DB-level constraint inside transaction (`reservedQty + qty <= quantity`), not application-layer check.
- **Idempotency on webhook retry** — Meta retries failed webhooks. Without `@@unique([shopId, platform, platformMessageId])`, dupe books happen. Already designed-in.
- **Order conversion double-decrement** — booking confirm reserves, order conversion must NOT re-reserve. Audit existing checkout flow before Commit 2 runtime.
- **Comment parser ambiguity (Phase 2)** — `T31 2` vs `T312` vs `T31x2`. Misparsed qty = oversell or undercount.
- **PII retention** — FB messages contain personal info. Default infinite retention = PDPA risk. Designed-in via `retentionUntil` + `rawPayloadRedactedAt`, enforcement deferred.
- **Vercel function timeout** — webhook handler must finish < 10s on hobby tier, < 60s on pro. Heavy work → queue (Phase 3).
- **Existing schema field collisions** — `LiveSession.fbLiveId` exists, `ChatMessage.fbMessageId` exists. Verified no collision with proposed names.
- **Soft vs hard delete** — Phase 1 booking cancel = status change, not row delete. History rows preserved for audit. OK.

---

## Verification before Commit 1 ask

To run before requesting Boss approval for Commit 1:

```
git status --short
pwd
git remote -v
git branch --show-current
npx prisma format
npx prisma generate
npx prisma migrate dev --name <descriptive>     # creates migration locally
inspect generated SQL manually                  # read prisma/migrations/<ts>_<name>/migration.sql
npx tsc --noEmit
# targeted vitest only if tests exist for touched paths; otherwise no fake "tests pass"
ls "C:/Users/Asus/COWORK/code/pak-ta-kra/" | head  # confirm pak-ta-kra untouched
```

Report:
- files changed
- migration name
- SQL summary (tables created, columns, indexes, constraints, FKs)
- relation + back-relation fields added to existing models
- tsc result
- remaining risks
- exact next recommended commit

---

## Explicit no-go list

DO NOT in this commit batch (or until Boss explicitly approves later):
- Connect Facebook webhook
- Request FB API permissions / live-mode toggle
- Add Bull queue
- Add auto parser
- Add auto booking
- Add auto expiry worker
- Alter existing checkout / cart stock decrement
- Alter existing payment verification
- Alter existing `/live-selling` behavior
- Modify pak-ta-kra
- Commit pre-existing unrelated `ErrorBoundary` / `providers/` / `lib/logger/` / `tests/unit/hooks/` files (separate investigation needed)

---

## Commit sequence

| # | Title | Status |
|---|---|---|
| 0 | Dissent doc (THIS FILE) | Approved, executing now |
| 1 | Prisma schema additive only | Approved pending Boss review of Commit 0 result |
| 2 | Repos + transaction-safe booking confirm + stock service | BLOCKED, requires Commit 1 review |
| 3 | `/sale` UI: sessions list + workspace + code grid + manual booking | BLOCKED |
| 4 | Booking → order conversion + reply templates | BLOCKED |
| 5 | Phase 2 parser engine + review queue | BLOCKED |
| 6 | Phase 3 FB webhook endpoint + signature verify + dedupe | BLOCKED |
| 7 | Phase 3 platform abstraction polish | BLOCKED |

Each commit: `tsc clean` + targeted vitest (only where tests exist; no fake claims) + manual probe. Boss reviews before next commit.

---

## Cross-references

- `liveshop-pro/CLAUDE.md` — engineering rules (NO MAGIC / VERIFY / DISSENT / SCOPE / R0-R1-R2)
- `docs/CODEMAP/04-database.md` — existing 29 Prisma models
- `docs/CODEMAP/05-auth-rbac.md` — RBAC pattern + ROUTE_PERMISSIONS
- `docs/CODEMAP/06-storefront-checkout.md` — existing checkout / stock decrement reference
- Existing `src/server/repositories/stock.repository.ts` — reserve/release pattern reference
- Existing `src/server/repositories/checkout.repository.ts` — order-side decrement reference

---

## Open questions for Boss (no blockers; defer answers if unclear)

These are Phase 2+ concerns flagged now to avoid schema-break later:

1. Booking quantity edits AFTER confirm (admin corrects "T31 2" → "T31 3"): allowed? requires re-reserving delta?
2. Same customer × same product × different broadcast: separate booking rows? answer = yes (broadcast-scoped)
3. Refund flow: `CONVERTED_TO_ORDER → ORDER_REFUNDED → restore stock`? Or follow existing order refund path only?
4. Customer identity merge (admin says "this FB user A and WhatsApp user B = same human"): manual merge UI in Phase 4? schema accommodates via `Customer.id` join, no merge tracking model needed yet
5. Multi-tenant: when 2nd shop signs up, slug uniqueness still works? FB App ID is per-app — multi-shop sharing one FB App = each shop connects own Page; verify Phase 3
6. Vercel hobby-tier function limits: webhook + parser must respect; document in Phase 3 dissent

---

End of dissent doc. Awaiting Boss approval to write Commit 1 (Prisma schema additive only).
