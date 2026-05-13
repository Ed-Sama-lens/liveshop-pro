# Tier 2 — Sale schema / omnichannel booking audit

**Status:** AUDIT ONLY. No code in this commit. No schema change. No migration. No implementation. Implementation gated on Boss + ChatGPT decision after this audit.
**Date:** 2026-05-13
**Author:** Claude Opus 4.7
**Predecessors:**
- `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md` (Tier 1 IA plan — surfaces AR-1/AR-2/AR-3 as architectural blockers)
- `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md` (V Rich research + Boss omnichannel clarification)
- `docs/superpowers/2026-05-13-phase-a-closeout.md` (PHASE_A_PARTIAL_ACCEPTED)

---

## 1. Executive summary

`/sale` MVP is now positioned as the unified omnichannel sales/booking operator workspace per Boss 2026-05-13 clarification. Bookings must work across:
- live streams (LIVE_COMMENT)
- inbox/Messenger DM (MESSENGER_INBOX)
- Facebook Page post comments (PAGE_POST_COMMENT)
- manual admin entry (MANUAL)
- future Telegram (TELEGRAM)
- future WhatsApp (WHATSAPP)

But the current Prisma schema + bookingRepository + sale APIs are still **live-session-bound** at three architectural choke points:

| AR | Field / behavior | Severity |
|---|---|---|
| **AR-1** | `BroadcastProduct.liveSessionId` = required FK + `@@unique([liveSessionId, displayCode])` | HIGH — blocks non-live product codes |
| **AR-2** | `Booking.liveSessionId` = required FK | HIGH — blocks non-live bookings outright |
| **AR-3** | `bookingRepository.convertToOrder` requires explicit `liveSessionId` + idempotency key includes it | MEDIUM — blocks omnichannel booking-to-order conversion |

This audit decides what design work needs to happen **before** Tier 1 UI implementation, Add from Stock runtime, or any non-live booking workflow. No implementation in this task.

### Key finding (positive surprise)

The `Booking` model **already carries** the omnichannel hooks:
- `source: BookingSource` enum (already includes `MANUAL` / `LIVE_COMMENT` / `PAGE_INBOX` / `POST_COMMENT` / `WHATSAPP_CHAT` / `TELEGRAM_CHAT` / `IMPORT` / `SYSTEM`)
- `conversationId: String?` (optional FK to `Conversation`)
- `channelIdentityId: String?` (optional FK to `ChannelIdentity`)
- `sourceMessageId: String?` (optional FK to `Message`)
- 4 indexes on these fields

**The only blocker is the single mandatory `liveSessionId: String`** + the FK to `LiveSession`. Make that nullable and the booking model is omnichannel-ready by schema.

`StockReservation` model has NO `liveSessionId` ✅ — already source-neutral.
`Order` model has NO `liveSessionId` ✅ — already source-neutral.
`OrderItem` / `Payment` / `Shipment` — no `liveSessionId` ✅.

So AR-2 is **smaller in scope** than first assumed. AR-1 is larger because of the `@@unique` composite constraint on `BroadcastProduct`.

---

## 2. AR-1 — `BroadcastProduct.liveSessionId` required FK

### Current schema

```prisma
model BroadcastProduct {
  id            String   @id @default(cuid())
  liveSessionId String   // REQUIRED FK
  productId     String
  variantId     String?
  displayCode   String
  displayOrder  Int      @default(0)
  priceOverride Decimal? @db.Decimal(12, 2)
  isPinned      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  liveSession LiveSession     @relation(fields: [liveSessionId], references: [id], onDelete: Cascade)
  product     Product         @relation(fields: [productId], references: [id])
  variant     ProductVariant? @relation(fields: [variantId], references: [id])

  bookings Booking[]

  @@unique([liveSessionId, displayCode])    // ← uniqueness scoped per session
  @@index([liveSessionId, displayOrder])
  @@index([productId])
  @@index([variantId])
}
```

### Code paths that assume per-session product

| Code path | Assumption |
|---|---|
| `GET /api/sale/live-sessions/[liveSessionId]/broadcast-products` | URL path requires session id; filters by `liveSessionId` |
| `SaleProductGridPlaceholder.tsx` | Receives products via `productState.products`, mounted only after session auto-select |
| `SaleWorkspaceShell.tsx` | Calls broadcast-products endpoint per selected session — no fetch when no session selected |
| `ManualCreateBookingDialog.tsx` | Receives `products` from shell — empty array when no session |
| `bookingRepository.createManual` | Verifies `broadcastProductId` exists and `BroadcastProduct.liveSessionId === input.liveSessionId` (cross-shop defense) |
| `bookingRepository.convertToOrder` | Reads `broadcastProduct.productId/variantId` per booking; session-scoped filter |
| `LiveSessionForm` / `/live-selling/[id]` | Legacy CRUD that creates BroadcastProduct rows for one session |

### Why AR-1 blocks omnichannel

1. **Non-live product codes impossible.** Admin cannot maintain a stable catalog of "T1..T999" codes reusable across sessions. Each LiveSession spawns its own BroadcastProduct row set.
2. **`@@unique([liveSessionId, displayCode])` per-session.** Two sessions can have "T30" pointing to different products. Operators who know "T30 = chili sauce" can't carry that mental model.
3. **No global reusable code pool.** Inbox-time booking ("customer wants 3 of T30") would have to pick a session first.
4. **Add from Stock outside live impossible.** Tier 3 plan requires bulk-adding products; without session context, current code has nowhere to attach them.
5. **`onDelete: Cascade` on LiveSession FK.** Deleting a LiveSession deletes all its BroadcastProducts. Non-live codes would need different lifecycle.

### Option A — Nullable `liveSessionId` + source/context fields on BroadcastProduct

Make `liveSessionId` nullable. Add an `isEvergreen: Boolean` flag or just `liveSessionId IS NULL` to indicate non-live code. Modify uniqueness to `(shopId, displayCode) WHERE liveSessionId IS NULL` (partial unique index, supported by Postgres) + keep `(liveSessionId, displayCode)` for in-session codes.

**Dissent 4-bullet:**
- **Benefit:** smallest schema delta; reuses BroadcastProduct model directly; preserves session-bound semantics for live products while adding evergreen codes; partial unique index is Postgres-native.
- **Risk:** uniqueness model becomes two-headed (per-session OR per-shop) — harder to reason about + harder to enforce in app code. Code review burden permanent. Some Prisma migrations don't generate partial unique indexes cleanly — may need raw SQL migration.
- **Migration cost:** Prisma migration with manual `CREATE UNIQUE INDEX ... WHERE liveSessionId IS NULL` SQL. ALTER TABLE to make column nullable. Existing rows keep their liveSessionId. ~1 migration. Low/Medium downtime risk (alter column nullable is fast).
- **Rollback/safety:** rollback = revert nullable + drop partial index. Existing data unaffected unless new evergreen rows were created — those would need backfill to a session. Need feature flag to gate evergreen-row creation during early rollout.

### Option B — Introduce neutral `SaleContext` model

New model `SaleContext` representing the abstract "where this product/booking lives": `LiveSession` / `Conversation` / `Page Post` / `Manual workspace`. Each is one row in `SaleContext`. `BroadcastProduct.saleContextId` (required FK) replaces `liveSessionId`.

```prisma
// proposed (NOT applied yet)
model SaleContext {
  id             String           @id @default(cuid())
  shopId         String
  type           SaleContextType  // LIVE / CONVERSATION / POST / EVERGREEN / MANUAL
  liveSessionId  String?  @unique // 1:1 when type=LIVE
  conversationId String?  @unique // 1:1 when type=CONVERSATION
  pagePostId     String?  @unique // future
  // ... discriminated by `type`
  createdAt      DateTime @default(now())

  broadcastProducts BroadcastProduct[]
  bookings          Booking[]
  // ...
}
```

**Dissent 4-bullet:**
- **Benefit:** cleanest mental model. One concept ("context") spans all sources. Future Telegram/WhatsApp just add `SaleContextType` enum values. Conversion/booking/product code unification possible.
- **Risk:** much larger schema change. Adds a layer of indirection on every query path. Existing routes/repos need to learn about SaleContext. High blast radius. Probably needs major refactor of bookingRepository.
- **Migration cost:** new table + backfill 1 SaleContext row per existing LiveSession; ALTER BroadcastProduct + Booking to point at SaleContext; drop old `liveSessionId` columns. ~3-4 migration steps. Higher downtime risk. Dual-write transition period likely needed.
- **Rollback/safety:** harder to roll back if any consumer code already updated. Recommend feature flag + dual-FK transition: keep `liveSessionId` column alongside `saleContextId` for one release cycle, then drop. Requires ChatGPT-level dissent before commit.

### Option C — Introduce separate `SaleProduct` / `ProductCode` model distinct from BroadcastProduct

Keep `BroadcastProduct` as the live-only join. Introduce new `ProductCode` model for evergreen non-live codes:

```prisma
// proposed (NOT applied yet)
model ProductCode {
  id            String   @id @default(cuid())
  shopId        String
  productId     String
  variantId     String?
  displayCode   String
  priceOverride Decimal? @db.Decimal(12, 2)
  // no liveSessionId
  createdAt     DateTime @default(now())

  shop    Shop            @relation(fields: [shopId], references: [id])
  product Product         @relation(fields: [productId], references: [id])
  variant ProductVariant? @relation(fields: [variantId], references: [id])

  @@unique([shopId, displayCode])  // shop-scoped uniqueness
  @@index([productId])
  @@index([variantId])
}
```

Booking would then carry `productCodeId | broadcastProductId` (one required, the other null).

**Dissent 4-bullet:**
- **Benefit:** clear separation of concerns — live codes ephemeral, evergreen codes persistent. Each model has a single uniqueness rule. No partial indexes.
- **Risk:** Booking schema gets harder — needs discriminated `broadcastProductId? | productCodeId?` union. Pricing/stock logic forks per branch. Bigger code surface than Option A.
- **Migration cost:** new table + new optional FK on Booking. No existing data migration (live bookings keep BroadcastProduct). Lower data risk than Option B. ~2 migrations.
- **Rollback/safety:** rollback drops the new model + nullable FK. Existing live bookings unaffected. Only risk is non-live bookings created during rollout — small population during early rollout, easy to clean up. Lower-risk than Option B.

### Option D — Evergreen / system live session workaround

Per shop, auto-create one "evergreen" LiveSession with status `EVERGREEN` (new enum value) or `SYSTEM`. All non-live BroadcastProducts attach to it. No schema change beyond adding enum value.

**Dissent 4-bullet:**
- **Benefit:** zero structural schema change. Today's code "just works" if it treats evergreen session like any other LIVE/SCHEDULED session.
- **Risk:** session list pollution — operator sees "Evergreen Session 2026" appearing in dropdowns + counts toward analytics. Long-term: every operator workflow has to learn "the magic evergreen session" — mental-model cost compounds. Per-session uniqueness `(liveSessionId, displayCode)` still scopes codes per shop's evergreen session, which is fine, but `displayOrder` semantics become weird (do evergreen codes have order? when do they show in the grid?).
- **Migration cost:** enum value addition + seed evergreen session per shop. ~1 small migration + 1 backfill seed script.
- **Rollback/safety:** rollback drops enum value + deletes evergreen sessions; cascade deletes attached BroadcastProducts → potentially destroys non-live product catalog. Need to migrate non-live BroadcastProducts to a real solution before removing evergreen. Forward dependency makes Option D a one-way door if production data accumulates.

### AR-1 recommendation

**Primary:** **Option A (nullable + partial unique index)** — smallest schema delta, lowest blast radius, idiomatic Postgres pattern. Acceptable two-headed uniqueness for the value of small migration.

**Fallback:** **Option C (separate ProductCode model)** if uniqueness two-headedness becomes painful in code review or future complications surface (e.g. different pricing rules between live and evergreen).

**Reject:** Option B (SaleContext) — overkill for the current need; revisit only if we discover 4+ context types with significantly different invariants. Option D — temporary only; not a long-term architecture.

---

## 3. AR-2 — `Booking.liveSessionId` required FK

### Current schema (relevant excerpt)

```prisma
model Booking {
  id                 String        @id @default(cuid())
  shopId             String
  liveSessionId      String        // ← REQUIRED FK, only blocker
  broadcastProductId String
  customerId         String
  conversationId     String?       // ← already optional
  channelIdentityId  String?       // ← already optional
  sourceMessageId    String?       // ← already optional
  ...
  source             BookingSource @default(MANUAL)
  ...
  @@unique([shopId, idempotencyKey])
  @@index([liveSessionId, status])
}

enum BookingSource {
  MANUAL
  LIVE_COMMENT
  PAGE_INBOX
  POST_COMMENT
  WHATSAPP_CHAT
  TELEGRAM_CHAT
  IMPORT
  SYSTEM
}
```

### Code paths affected

| Path | Touches `liveSessionId`? | How |
|---|---|---|
| `bookingRepository.createManual` | yes | explicit param + writes `liveSessionId` on insert + cross-shop check on BroadcastProduct |
| `bookingRepository.confirm` | implicit | reads booking row (which has FK); no direct param |
| `bookingRepository.cancel` | implicit | reads booking row; no direct param |
| `bookingRepository.convertToOrder` | yes | explicit param + filter `where: { shopId, liveSessionId, customerId }` + idempotency key composition (AR-3) |
| `POST /api/sale/bookings` | yes | required in `createBookingBodySchema` |
| `GET /api/sale/bookings` | yes | required `liveSessionId` query param (Boss spec — prevents broad shop-wide booking dump) |
| `POST /api/sale/orders/from-bookings` | yes | required in body |
| `BookingHistory` | none direct | only references `bookingId` + status transitions |
| `StockReservation` | none | links to `bookingId`/`orderId`/`variantId` only |
| Reservation integrity badge | none direct | derived from `StockReservation` count + `Booking.status` only |
| Customer Panel | none | reads `/api/customers/[id]` — neutral |
| ManualCreateBookingDialog | yes | sends `liveSessionId` in POST body |

### Why AR-2 blocks omnichannel

1. **Manual booking outside live impossible at API level.** `createBookingBodySchema` requires `liveSessionId`.
2. **Messenger inbox booking impossible.** Future parser would receive a message → resolve customer → want to create booking with `source=MESSENGER_INBOX, conversationId=...` but cannot — `liveSessionId` mandatory.
3. **Facebook Page post comment booking impossible.** Same blocker.
4. **Telegram / WhatsApp future booking impossible.** Same.
5. **`GET /api/sale/bookings` requires `liveSessionId` filter.** Operator can't ask "show me ALL bookings by source today across all sessions and channels".

### Option A — Nullable `liveSessionId` + lean on existing `source` enum + context fields

Make `Booking.liveSessionId` nullable. Bookings record source via existing `source: BookingSource` + appropriate context FK (`conversationId` for inbox / `sourceMessageId` for live comment or post comment / `channelIdentityId` for Telegram/WhatsApp / none for MANUAL).

For `GET /api/sale/bookings`, replace `liveSessionId required` with `liveSessionId? OR source? OR conversationId?` — at least one filter required.

For `POST /api/sale/bookings`, change `liveSessionId` to optional, require BroadcastProduct's `liveSessionId === input.liveSessionId` only when both present. If `liveSessionId` null, accept ProductCode-pointed booking (depends on AR-1 outcome).

**Dissent 4-bullet:**
- **Benefit:** smallest delta. All omnichannel fields already exist on schema. Source enum already accommodates all 6 sources. ~1 migration to make column nullable + relax route validation. Cleanest path forward.
- **Risk:** all consumers of `Booking.liveSessionId` must handle `null`. Existing UI auto-select / Live Sessions panel / SaleWorkspaceShell currently dead-end without session — needs Tier 1 IA fix to show non-live bookings somewhere visible. Reservation integrity discriminator logic untouched (already only uses `status` + reservation count).
- **Migration cost:** `ALTER COLUMN liveSessionId DROP NOT NULL`. ALTER FK to allow null (Postgres allows null FKs naturally; no change). Drop `@@index([liveSessionId, status])` and replace with looser `@@index([shopId, status, createdAt])` or keep current with nullable values. ~1 migration. ALTER column nullable is fast in Postgres.
- **Rollback/safety:** rollback = re-add NOT NULL. Possible only if no existing rows are null. During transition, can use feature flag `ALLOW_NON_LIVE_BOOKING=false` that keeps API validation strict. Once enabled, rollback requires data cleanup (delete or migrate null-session bookings).

### Option B — Neutral `SaleContext` model on Booking

Same as AR-1 Option B but on Booking. `Booking.saleContextId` (required FK to SaleContext) replaces `liveSessionId`.

**Dissent 4-bullet:**
- **Benefit:** truly source-agnostic at schema level. Future sources require zero schema change to Booking.
- **Risk:** AR-1 Option B's risks carry over. Higher refactor surface. Existing 4 indexes need rethink. Conversion repository needs major refactor.
- **Migration cost:** higher than AR-2 Option A. Need SaleContext table + backfill + ALTER Booking. ~3-4 migrations.
- **Rollback/safety:** complex. Same dual-FK transition pattern as AR-1 Option B.

### Option C — Separate `BookingSourceContext` child table

Booking stays as-is, but `Booking.liveSessionId` becomes nullable. Each Booking has 0 or 1 row in a new `BookingSourceContext` table with discriminated fields per source.

```prisma
// proposed (NOT applied yet)
model BookingSourceContext {
  id                String  @id @default(cuid())
  bookingId         String  @unique
  liveSessionId     String?
  conversationId    String?
  channelIdentityId String?
  pagePostId        String?
  platformCommentId String?
  // ...
  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
}
```

**Dissent 4-bullet:**
- **Benefit:** keeps Booking row lean; allows source-specific fields without polluting main model.
- **Risk:** but Booking already has `conversationId/channelIdentityId/sourceMessageId` for this exact purpose. Adding a child table duplicates that work without benefit. Probably anti-pattern given current schema.
- **Migration cost:** new table. ~1 migration.
- **Rollback/safety:** new table = drop on rollback. Safe.

**Verdict on C:** redundant — Booking already has the optional context FKs that Option C would create.

### Option D — Evergreen session workaround for Booking

Same as AR-1 Option D. Non-live bookings attach to evergreen session.

**Dissent 4-bullet:**
- **Benefit:** zero schema change.
- **Risk:** session list pollution; reservation/order grouping queries assume `liveSessionId` is meaningful but evergreen would lump all non-live bookings together. Customer-level grouping via `convertToOrder` would group across all non-live sources into one "evergreen" basket — semantically wrong.
- **Migration cost:** zero schema; backfill all existing non-live bookings (none yet — pre-launch) to evergreen session.
- **Rollback/safety:** one-way door risk same as AR-1 Option D.

### AR-2 recommendation

**Primary:** **Option A (nullable `liveSessionId` + lean on existing source/context fields)** — minimum delta. Schema already has the slots; only blocker is the NOT NULL constraint.

**Fallback:** **Option B (SaleContext)** if AR-1 also chooses Option B (consistency); otherwise stay with A.

**Reject:** Option C (redundant), Option D (one-way door + grouping ambiguity).

### Effect on each booking-flow component (assuming AR-2 Option A)

| Component | Change required |
|---|---|
| `bookingRepository.createManual` | accept `liveSessionId?` (optional). When null, skip cross-shop check on BroadcastProduct.liveSessionId (or check against ProductCode per AR-1 outcome). Persist `source` enum based on input. |
| `bookingRepository.confirm` | no change — already reads from row |
| `bookingRepository.cancel` | no change |
| `bookingRepository.convertToOrder` | AR-3 — see §4 |
| `BookingHistory` | no change |
| `StockReservation` | no change (already source-neutral) |
| Reservation integrity discriminator (`OK / MISSING / MULTIPLE / NOT_APPLICABLE`) | no change — derived from `status` + reservation count |
| `POST /api/sale/bookings` | relax `liveSessionId` to optional; require at minimum `customerId` + product (BroadcastProduct OR ProductCode) + `quantity` + `source` |
| `GET /api/sale/bookings` | relax `liveSessionId` to optional but require at least one of `liveSessionId | source | conversationId | customerId` to prevent shop-wide dumps |
| Customer Panel | no change — already neutral |
| `ManualCreateBookingDialog` | accept "no live session" mode; product picker switches to ProductCode (AR-1 dependent) |
| Idempotency `@@unique([shopId, idempotencyKey])` | no change — already shop-scoped, not session-scoped |

---

## 4. AR-3 — `bookingRepository.convertToOrder` requires `liveSessionId`

### Current behavior

[booking.repository.ts:561-700+](../../src/server/repositories/booking.repository.ts):

```ts
async convertToOrder(input: ConvertBookingsToOrderInput): Promise<ConvertBookingsToOrderResult> {
  const { shopId, liveSessionId, customerId, changedById, bookingIds } = input;

  return prisma.$transaction(async (tx) => {
    // Fetch bookings filtered by (shopId, liveSessionId, customerId)
    const allBookings = await tx.booking.findMany({
      where: { shopId, liveSessionId, customerId },
      ...
    });
    ...
  });
}
```

Idempotency key composition ([booking-rules.ts:540](../../src/lib/sale/booking-rules.ts)):

```ts
return `sale-conv:${input.shopId}:${input.liveSessionId}:${input.customerId}:${hash}`;
```

### Why AR-3 blocks omnichannel

1. **Customer + session filter** — when converting bookings from inbox/post/manual context, `liveSessionId` would be null → filter `{liveSessionId: null}` returns only non-live bookings, but the route validation requires `liveSessionId` non-empty. Catch-22.
2. **Idempotency key includes `liveSessionId`** — non-live conversions would key on `sale-conv:{shopId}::{customerId}:{hash}`. Empty middle field accepted by string interpolation but breaks key uniqueness model (`null` + `null` collisions possible for same customer + same booking hash across different non-live contexts).
3. **Grouping mental model** — currently "convert all CONFIRMED bookings for this customer in this live session". Non-live equivalent: "convert all CONFIRMED bookings for this customer regardless of source"? Or "convert these explicit bookingIds only"?

### Existing idempotency-first lookup (good news)

Repository already has an "early bookingIds-only" path at lines 634-675 — if caller passes explicit `bookingIds` AND the idempotency key matches an existing Order, return that Order without re-filtering by session. This path **could** be the omnichannel fast path if extended.

### Option A — bookingIds-only conversion

Drop `liveSessionId` and `customerId` from conversion input. Caller passes `bookingIds: string[]` (required, ≥1). Repository:
1. Fetches all bookings by id (validates `shopId` from each)
2. Enforces all bookings are same `customerId` (else 409 — multi-customer conversion not supported)
3. All bookings must be CONFIRMED
4. Composes idempotency key from `(shopId, customerId, sortedBookingIdsHash)`
5. Creates Order with sum of qty/price; transfers StockReservation rows

**Dissent 4-bullet:**
- **Benefit:** cleanest. Caller specifies exactly which bookings. No grouping ambiguity. Idempotency key no longer mentions `liveSessionId`. Works for any source. Order remains source-neutral.
- **Risk:** UI must always pass `bookingIds[]`. Cannot say "convert all CONFIRMED for customer X" without first listing them. Slight UX regression for live "convert all" workflows — but current UI already requires multi-select.
- **Migration cost:** route + repo signature change. Idempotency key shape change — invalidates any in-flight idempotency replays during deploy window. Acceptable if deploy during low-traffic window + smoke verifies no in-flight retries. ~1 small migration.
- **Idempotency impact:** new key shape `sale-conv:v2:{shopId}:{customerId}:{hash}` (add `v2` namespace) so old + new keys can coexist. Old retries hit old key, new requests hit new.
- **Duplicate-reservation risk:** existing safety stays — `Order.idempotencyKey @unique` + transactional reservation transfer. No new risk.
- **Rollback/safety:** rollback restores old shape. Existing Orders unaffected. Recommend keep both v1 + v2 paths in code for 1 release cycle.

### Option B — customer + context conversion

Caller passes `customerId` + a context discriminator (`{ kind: 'live', liveSessionId } | { kind: 'conversation', conversationId } | { kind: 'all_confirmed' }`). Repository filters by context.

**Dissent 4-bullet:**
- **Benefit:** flexible — supports "convert all live bookings" + "convert all inbox bookings" + "convert all confirmed".
- **Risk:** ambiguous when customer has bookings across multiple contexts simultaneously. "All confirmed" feels dangerous — operator might double-convert. Idempotency key per context type — three key shapes to maintain.
- **Migration cost:** larger refactor.
- **Idempotency impact:** key shape per context. More edge cases.
- **Rollback/safety:** medium.

### Option C — source-aware conversion

Same as B but discriminator is `source: BookingSource[]` filter array. "Convert all CONFIRMED bookings whose source is in [LIVE_COMMENT, MANUAL] for this customer."

**Dissent 4-bullet:**
- **Benefit:** semantic — operator picks "which sources to include in this order".
- **Risk:** complex; rare use case in practice. Most carts mix sources naturally (customer commented on live + DM'd later — both belong to same eventual order).
- **Migration cost:** medium.
- **Idempotency impact:** source list included in key — harder to hash deterministically.
- **Rollback/safety:** medium.

### Option D — Hybrid

`bookingIds[]` required when no `liveSessionId`. Legacy live-only callers can still pass `liveSessionId + customerId` without bookingIds (existing behavior preserved).

**Dissent 4-bullet:**
- **Benefit:** backward compatible. Live workflow keeps current behavior; non-live gets explicit bookingIds path.
- **Risk:** two code paths in conversion forever. Idempotency key shape branches.
- **Migration cost:** lowest — additive only.
- **Idempotency impact:** legacy keys keep `liveSessionId`; new keys without. Two-headed.
- **Rollback/safety:** safest — opt-in path.

### AR-3 recommendation

**Primary:** **Option A (bookingIds-only)** with key versioning (`sale-conv:v2:...`). Cleanest long-term; current UI already collects explicit bookingIds via multi-select; minor change.

**Fallback:** **Option D (hybrid)** if backward compat is a hard requirement for early rollout — gives a safer transition window.

**Reject:** Option B + C — too complex for marginal benefit.

---

## 5. Repository/API assumption matrix

Compact view per Boss spec:

| Component | Currently requires liveSessionId? | Can support non-live today? | Needs schema change? | Needs API change? | Risk | Recommended action |
|---|---|---|---|---|---|---|
| `BroadcastProduct` model | **yes (NOT NULL FK)** | no | **AR-1** | n/a | HIGH | Option A nullable + partial unique index |
| `Booking` model | **yes (NOT NULL FK)** | no | **AR-2** | n/a | HIGH | Option A nullable |
| `BookingHistory` | no | yes | no | no | low | none |
| `StockReservation` | no | yes ✅ | no | no | low | none |
| `Order` | no | yes ✅ | no | no | low | none |
| `bookingRepository.createManual` | yes (explicit param) | no | follow AR-2 | yes (relax param) | HIGH | accept nullable |
| `bookingRepository.confirm` | implicit (via row) | yes (no change) | no | no | low | none |
| `bookingRepository.cancel` | implicit | yes | no | no | low | none |
| `bookingRepository.convertToOrder` | yes (explicit) | no | follow AR-2 | yes | MEDIUM | Option A bookingIds-only + key v2 |
| `POST /api/sale/bookings` | yes (zod) | no | n/a | yes | HIGH | relax liveSessionId optional |
| `GET /api/sale/bookings` | yes (zod) | no | n/a | yes | MEDIUM | relax liveSessionId; require ≥1 filter |
| `POST /api/sale/orders/from-bookings` | yes (zod) | no | n/a | yes | MEDIUM | bookingIds-only |
| `GET /api/sale/live-sessions/[id]/broadcast-products` | yes (path) | n/a | n/a | n/a | low | leave (live-specific by design) |
| `GET /api/sale/customers/search` | no | yes ✅ | no | no | low | none |
| `GET /api/customers/[id]` | no | yes ✅ | no | no | low | none |
| `ManualCreateBookingDialog` | yes (sends in body) | no | n/a | UI dep on API | MEDIUM | accept "no session" mode after API relaxed |
| `SaleWorkspaceShell` auto-select | yes (current UX) | partial (Manual Create button shows after `2f52e01`) | n/a | n/a | MEDIUM | Tier 1 IA work |
| Reservation integrity badge | no | yes ✅ | no | no | low | none |
| Customer Panel | no | yes ✅ | no | no | low | none |
| Unified inbox (future) | n/a | yes (by design) | no | no | low | will write to Conversation/Message (already neutral) |

---

## 6. Source model proposal

For future source types + their context field needs:

| Source enum | liveSessionId | conversationId | sourceMessageId | channelIdentityId | pagePostId | platformCommentId | platformThreadId | sourceLabel example | rawPayload | PII rule |
|---|---|---|---|---|---|---|---|---|---|---|
| `MANUAL` | null | null | null | null | null | null | null | "สร้างเอง" | none | name only; no platform id |
| `LIVE_COMMENT` | **set** | null | **set** (Message id) | optional | null | optional (Message.externalMessageId) | null | "Live: {LiveSession.title}" | retained per retention policy | ChannelIdentity resolved; raw FB id masked |
| `MESSENGER_INBOX` | null | **set** (Conversation) | **set** | **set** (ChannelIdentity) | null | null | optional (Message.externalThreadId) | "Inbox: {ChannelIdentity.displayName}" | retained per policy | masked |
| `PAGE_POST_COMMENT` | null | null (or post-conversation if reified) | **set** (Message) | **set** | future column | optional | null | "Post comment: {pagePostId}" | retained per policy | masked |
| `TELEGRAM` (future) | null | **set** | **set** | **set** | n/a | null | optional | "Telegram: {ChannelIdentity.displayName}" | retained per policy | masked |
| `WHATSAPP` (future) | null | **set** | **set** | **set** | n/a | null | optional | "WhatsApp: {ChannelIdentity.displayName}" | retained per policy | masked |

### Schema fields already supporting this

Already on `Booking`:
- `conversationId: String?` ✅
- `channelIdentityId: String?` ✅
- `sourceMessageId: String?` ✅
- `source: BookingSource` ✅ (enum already lists all needed values)

Missing on `Booking` for future expansion:
- `pagePostId: String?` — future, only if `Conversation` is not reified per post
- `platformCommentId: String?` — could derive from `Message.externalMessageId`; probably redundant
- `platformThreadId: String?` — same; via `Message.externalThreadId`

**Recommendation:** Booking schema is **sufficient as-is** for the 6 sources, once `liveSessionId` is nullable. No new columns needed. Use existing optional FKs to Conversation/Message/ChannelIdentity for context.

### PII rules per source (anti-pattern protection)

- **Never expose raw `platformUserId`** (FB user ID like `2446689545757837`). Always resolve to Customer via ChannelIdentity first.
- **`rawPayload`** stored on `Message` only; never exposed via `/api/customers/*` or `/api/sale/*` GET routes.
- **`bannedReason` / `notes` / `address` / `labels`** never in `/api/sale/customers/search` (already enforced).
- **`Message.text` in source context display** — admin-only; show in operator workspace but mark "from inbox" / "from comment" — never echo back to customer.
- **PII whitelist on customer search response** (already enforced in `/api/sale/customers/search`).

---

## 7. Migration safety / rollout

### Production data assumptions

- Existing `BroadcastProduct` rows: all have non-null `liveSessionId`. Making column nullable is safe (no existing rows violate constraint).
- Existing `Booking` rows: all have non-null `liveSessionId`. Same.
- Existing `Order` rows: do NOT carry `liveSessionId` directly. No backfill needed at order layer.
- Existing `StockReservation` rows: source-neutral. No backfill.

### Backfill needs per option

| Option | Backfill required? |
|---|---|
| AR-1 Option A (nullable + partial index) | NONE — existing rows keep `liveSessionId`, new evergreen rows insert null |
| AR-1 Option B (SaleContext) | YES — create 1 SaleContext row per existing LiveSession, ALTER FK pointers |
| AR-1 Option C (separate ProductCode) | NONE — additive new table only |
| AR-2 Option A (nullable) | NONE |
| AR-3 Option A (bookingIds-only) | NONE — idempotency key shape change is forward-only; old keys remain on existing Orders |

### Unique constraint migration

`BroadcastProduct.@@unique([liveSessionId, displayCode])` becomes problematic if `liveSessionId` is nullable:
- Postgres treats NULL as "not equal to anything" in unique constraints → two rows with `(NULL, 'T30')` ARE allowed.
- For evergreen codes per shop, need partial unique index: `CREATE UNIQUE INDEX broadcastproduct_evergreen_unique ON "BroadcastProduct" ("shopId", "displayCode") WHERE "liveSessionId" IS NULL;`.
- Prisma 7 supports partial indexes via `@@index([...], where: ...)` per docs check.

### Prisma migration risk

- ALTER COLUMN nullable in Postgres = **fast metadata change**. No table rewrite. Safe under load.
- DROP/CREATE unique index on large tables = potentially slow on `BroadcastProduct` if catalog scales. For shop with ~1000s of broadcast products → milliseconds. For 14,000+ (V Rich scale) → still well under 1s.
- CREATE INDEX CONCURRENTLY supported in Postgres → no table lock.

### Railway snapshot requirement

Before any migration:
1. Railway → Postgres → Backups → take manual snapshot
2. Note snapshot ID + timestamp
3. Verify snapshot via Railway dashboard `Restore` UI (read-only check; don't actually restore)

### Dry-run requirement

1. Boss creates separate Railway Postgres **staging** instance (clone of production schema, optional small data subset)
2. Run Prisma migration on staging
3. Verify schema diff matches expected change
4. Run smoke + integration tests against staging
5. Only then deploy to production

### Rollback approach

Per option:
- **AR-1/2 Option A:** rollback = `ALTER COLUMN SET NOT NULL` (only safe if no existing null rows). Feature flag gates new null-insertion until ChatGPT-confirmed.
- **AR-1 Option B:** rollback = restore from snapshot. Cannot reverse SaleContext migration cleanly.
- **AR-1 Option C:** rollback = drop new ProductCode table. Safe.
- **AR-3 Option A:** rollback = revert repo code; old idempotency keys still resolve.

### Dual-write or compatibility layer

For Option B (SaleContext) — yes, needs dual-write transition.
For Option A on AR-1/2 — no, additive nullable is forward-compatible.

### Old live-only routes during migration

- `/live-selling` route (legacy CRUD) — keep accessible during Tier 1 + Tier 2 rollout. Redirect only after non-live workflows shipped.
- `GET /api/sale/live-sessions/[id]/broadcast-products` — keep; remains the per-session view even when non-live products exist via ProductCode/nullable rows.
- `POST /api/live` etc — keep; live session creation still required.

### Existing confirmed/cancelled bookings

Must remain stable. ALTER COLUMN nullable does NOT change existing rows. `BookingHistory` references stay intact. `StockReservation` links stay intact. `Order.convertedFromBookings` back-relation stays intact.

---

## 8. Recommended option + fallback

### Primary path

| AR | Primary | Reason |
|---|---|---|
| AR-1 | **Option A** — nullable `BroadcastProduct.liveSessionId` + partial unique index `WHERE liveSessionId IS NULL` for evergreen per `(shopId, displayCode)` | smallest schema delta, idiomatic Postgres, low blast radius, additive |
| AR-2 | **Option A** — nullable `Booking.liveSessionId` + lean on existing `source/conversationId/channelIdentityId/sourceMessageId` | schema already has the slots; only NOT NULL constraint blocks |
| AR-3 | **Option A** — `bookingIds[]`-only conversion + idempotency key `sale-conv:v2:{shopId}:{customerId}:{hash}` | cleanest semantics; current UI already passes bookingIds via multi-select |

### Fallback path

| AR | Fallback | When to use |
|---|---|---|
| AR-1 | **Option C** — separate `ProductCode` model | if Option A's two-headed uniqueness becomes painful in code review or pricing semantics fork |
| AR-2 | **Option B** — `SaleContext` | only if AR-1 also picks B (consistency) |
| AR-3 | **Option D** — hybrid (bookingIds-only for non-live, legacy live-only path preserved) | if backward compat critical for early rollout window |

### Hard rejects

- **Option D (evergreen session workaround) on AR-1 / AR-2** — temporary at best; pollutes session lists; one-way door once non-live products accumulate.
- **AR-2 Option C (BookingSourceContext child table)** — redundant; Booking schema already has those optional FKs.

---

## 9. Impact on roadmap

| Tier | Impact |
|---|---|
| **Tier 1 — UI/IA consolidation** | Per Boss D-4: Tier 2 audit FIRST, then Tier 1 implementation. Tier 1 UI can proceed as **layout-only refresh** + placeholder copy (no functional non-live promise) BEFORE schema migration. Final non-live UX wiring waits for schema. |
| **Tier 3 — Add from Stock** | BLOCKED until AR-1 decision lands + migration ships. Cannot add non-live product codes without schema support. |
| **Tier 4 — Receive-only inbound stream** | UNBLOCKED at schema level — `Conversation` + `Message` + `ChannelIdentity` are already source-neutral. But to convert inbound message → booking, AR-2 must land first. |
| **Tier 5 — Parser + comment-to-booking** | BLOCKED until AR-2 lands. Parser output = new Booking row, which today requires `liveSessionId`. |
| **Phase B — manual mutation smoke** | Stays BLOCKED. Boss D-6 reaffirmed. Even after Tier 1 ships, Phase B needs explicit Boss GO + safe test data IDs. |
| **Historical StockReservation backfill (ORDER-RESERVATION-CLEANUP Commit 2)** | UNAFFECTED — backfill scope is `Order.RESERVED → CONFIRMED` transitions, source-neutral. Schema migration in Tier 2 does not touch StockReservation. |
| **Storefront checkout/orderNumber race debt** | UNAFFECTED — separate workspace. |

---

## 10. Open decisions for Boss / ChatGPT

| ID | Question | Options | Claude rec |
|---|---|---|---|
| **Q-1** | Which schema direction for AR-1/AR-2? | (a) Option A both (nullable additive) <br/> (b) Option B both (SaleContext) <br/> (c) Mixed (A on AR-2, C on AR-1) | **(a) — nullable additive on both** |
| **Q-2** | Should `Booking.liveSessionId` become nullable? | (a) yes (Q-1 follows) <br/> (b) no — keep live-only, separate model for non-live | **(a) yes** |
| **Q-3** | Should `BroadcastProduct` be generalized (nullable FK) OR new `SaleProduct/ProductCode` model? | (a) generalize via nullable (Option A) <br/> (b) new ProductCode model (Option C) <br/> (c) SaleContext (Option B) | **(a)**; fallback (b) |
| **Q-4** | Should `SaleContext` be introduced now or later? | (a) never — Option A is sufficient <br/> (b) later — revisit if Option A complexity grows <br/> (c) now — long-term architecture | **(b) later — defer** |
| **Q-5** | Should `convertToOrder` become `bookingIds`-only? | (a) yes — Option A with key v2 versioning <br/> (b) hybrid Option D <br/> (c) keep current (block non-live conversion) | **(a)** |
| **Q-6** | Should Phase B stay blocked until schema direction is chosen? | (a) yes (Boss D-6) <br/> (b) no — Phase B is independent | **(a) yes — confirmed** |
| **Q-7** | Should Tier 1 UI implementation proceed before schema migration? | (a) yes — layout-only refresh + placeholder copy <br/> (b) no — wait for schema first <br/> (c) parallel | **(a) layout-only refresh allowed; non-live wiring waits** |
| **Q-8** | Is evergreen / system live session acceptable as temporary only? | (a) forbidden — design proper schema <br/> (b) acceptable for 1 release cycle as bridge <br/> (c) acceptable permanently | **(a) forbidden** — one-way door risk |
| **Q-9** | Idempotency key version migration strategy for AR-3? | (a) `sale-conv:v2:` prefix; both v1 + v2 paths coexist for 1 cycle <br/> (b) hard cutover at deploy <br/> (c) per-call versioning flag | **(a) v2 prefix with coexistence** |
| **Q-10** | Sequencing: AR-1 + AR-2 + AR-3 land in **one migration / one PR** or **split**? | (a) one PR (all 3 nullable + bookingIds-only) <br/> (b) split: AR-1 PR → AR-2 PR → AR-3 PR | **(a) one PR** — they are tightly coupled; partial rollout (e.g. AR-2 nullable but AR-1 still required) makes no sense |

---

## 11. Cross-references

- Booking schema: [prisma/schema.prisma](../../prisma/schema.prisma) lines 783-986 (Conversation / ChannelIdentity / Message / BroadcastProduct / Booking / BookingHistory)
- StockReservation: schema lines 213-229
- Order: schema lines 286-322
- bookingRepository: [src/server/repositories/booking.repository.ts](../../src/server/repositories/booking.repository.ts)
  - `createManual` (lines ~895+)
  - `confirm` / `cancel` / `convertToOrder` (lines ~540+)
- Conversion idempotency key: [src/lib/sale/booking-rules.ts:540](../../src/lib/sale/booking-rules.ts)
- API routes: `src/app/api/sale/*`
- ManualCreateBookingDialog: [src/components/sale/ManualCreateBookingDialog.tsx](../../src/components/sale/ManualCreateBookingDialog.tsx)
- Tier 1 IA plan: `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`
- V Rich + omnichannel framing: `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`
- Omnichannel inbound roadmap: `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md`

---

## 12. Next step (NOT started)

After Boss/ChatGPT decides Q-1 through Q-10:

1. **Schema migration design PR** — dissent-4-bullet doc covering exact ALTER TABLE statements + partial index SQL + idempotency key v2 namespace, plus Tier 1 + Tier 3 + Tier 5 unblock impact. Still docs-only.
2. **Tier 1 UI/IA layout refresh** — can ship in parallel (per Q-7 recommendation a) as long as no non-live promise made beyond placeholders.
3. **Schema migration PR** — implements decided options + Prisma migration + bookingRepository changes + 4 API relaxations + tests + Docker E2E verifiers (booking-flow + booking-create + booking-conversion + customer-search expanded to non-live cases).
4. **Post-migration UI wiring** — Add from Stock + non-live booking creation + non-live conversion + Inbox panel reads (Tier 3 + Tier 4 + Tier 5 unlock).

**Phase B** stays blocked throughout.

---

## 13. Stop conditions encountered (NONE)

Audit completed without hitting stop conditions:
- ✅ No schema modification needed in audit
- ✅ No implementation code touched
- ✅ No production data inspection (read schema files only)
- ✅ Route/API behavior changes documented as proposals, not applied
- ✅ Boss's non-live requirement is **achievable** via the recommended primary path (Option A across all 3 ARs) — no architectural blocker
