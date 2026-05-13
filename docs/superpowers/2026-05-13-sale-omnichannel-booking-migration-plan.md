# Sale omnichannel booking migration plan (PR-ready design)

**Status:** DESIGN ONLY. No code/schema/migration in this commit. Tomorrow Boss/ChatGPT decides whether to approve implementation PR.
**Date:** 2026-05-13 (10-hour overnight design session)
**Author:** Claude Opus 4.7
**Predecessors:**
- `docs/superpowers/2026-05-13-sale-schema-omnichannel-booking-audit.md` (Tier 2 audit, committed `a90494d`)
- `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md` (Tier 1 IA plan, committed `2ad0761`)
- `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md` (Boss omnichannel clarification)
- `docs/superpowers/2026-05-13-phase-a-closeout.md` (`PHASE_A_PARTIAL_ACCEPTED`)

---

## 0. Executive summary

This doc translates the Tier 2 audit recommendations (Option A across AR-1 / AR-2 / AR-3) into a **PR-ready implementation plan**: exact file impact list, migration SQL sketch, repository diff sketch, API + zod schema diff sketch, UI sequencing, test matrix, rollback recipe, deploy phasing.

### Final recommended direction (per Boss/ChatGPT Q-1 through Q-10)

| AR | Option | Approach |
|---|---|---|
| **AR-1** | A | Nullable `BroadcastProduct.liveSessionId` + **add `shopId` column** + partial unique index. **Critical revision:** current schema has NO `shopId` on BroadcastProduct — only liveSessionId provides shop scoping. Migration must add `shopId` first. |
| **AR-2** | A | Nullable `Booking.liveSessionId` + lean on existing `source` enum + `conversationId?` / `channelIdentityId?` / `sourceMessageId?` fields |
| **AR-3** | A | `bookingIds[]`-only conversion + idempotency key v2 namespace `sale-conv:v2:{shopId}:{customerId}:{hash}` coexists with v1 |

### Headline scope

- 1 Prisma schema migration (2 ALTER COLUMN nullable + 1 ADD COLUMN shopId + 1 partial unique index via raw SQL)
- 1 idempotency builder + 1 conversion route relaxation
- 3 zod schema relaxations (POST /api/sale/bookings, GET /api/sale/bookings, POST /api/sale/orders/from-bookings)
- 4 bookingRepository method signature changes
- 1 booking-rules helper update (`buildConversionIdempotencyKey` → add `buildConversionIdempotencyKeyV2`)
- 14 files touched by AR-1 surface (route + repo + 3 UI + schema + 6 tests + 4 verifier scripts)
- 4 files touched by AR-2 conversion surface
- 0 production data backfill required for primary path
- 0 customer-facing behavior change
- 0 mutation surface count change (4 POSTs remain)

### What stays blocked even after this lands

- **Phase B** authenticated production mutation smoke — Boss D-6
- **Add from Stock runtime** — needs Tier 3 PR after this migration ships
- **Parser/comment-to-booking** — needs Tier 4 + Tier 5 PRs
- **Tier 1 UI/IA consolidation** — can ship layout-only in parallel; non-live wiring waits

---

## 1. Full code inventory (AR-1 / AR-2 / AR-3)

### AR-1 — BroadcastProduct.liveSessionId

| # | File | Purpose | Current liveSession assumption | Required future change | Test coverage | Risk |
|---|---|---|---|---|---|---|
| 1 | `prisma/schema.prisma` BroadcastProduct lines 897-919 | model definition | required FK + `@@unique([liveSessionId, displayCode])` + Cascade onDelete + missing `shopId` field | nullable + add `shopId String` + partial unique index | n/a | HIGH |
| 2 | `src/server/repositories/booking.repository.ts` | `createManual` reads BP, cross-shop check | reads BP via `liveSessionId` filter | accept BP rows where `liveSessionId IS NULL` (evergreen) + cross-shop check via new `BP.shopId` | route tests | HIGH |
| 3 | `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` | GET BP rows for session | path param required | leave as live-only view (no change) | `tests/unit/app/api/sale/broadcast-products.route.test.ts` | LOW |
| 4 | `src/app/api/sale/bookings/route.ts` POST handler | manual create | requires `liveSessionId` in body | allow optional `liveSessionId`; if null, require non-live BP | `tests/unit/app/api/sale/bookings.route.test.ts` | MEDIUM |
| 5 | `src/lib/validation/booking.schemas.ts` `createBookingBodySchema` | zod schema | requires `liveSessionId` min 1 | make optional | unit tests | LOW |
| 6 | `src/components/sale/ManualCreateBookingDialog.tsx` | modal UI | passes `liveSessionId` always | allow no-session mode for non-live BP | `tests/unit/components/sale/manual-create-helpers.test.ts` | MEDIUM |
| 7 | `src/components/sale/SaleProductGridPlaceholder.tsx` | product grid | rendered only when session selected | future: 2 modes (live + non-live) | none | LOW |
| 8 | `src/components/sale/SaleBookingQueuePlaceholder.tsx` | booking queue | passes products from shell | pass evergreen products too | helper tests | LOW |
| 9 | `tests/unit/app/api/sale/bookings.route.test.ts` | route tests | live-only cases | add non-live POST/GET cases | n/a (is test) | MEDIUM |
| 10 | `tests/unit/app/api/sale/broadcast-products.route.test.ts` | BP GET tests | live-only | no change (route stays live-only) | n/a | LOW |
| 11 | `tests/unit/components/sale/manual-create-helpers.test.ts` | helper tests | filterProducts pure helper | no change | n/a | LOW |
| 12 | `scripts/verify-booking-create.ts` | Docker E2E 13/13 | live cases | add non-live BP cases (~3 new) | n/a | MEDIUM |
| 13 | `scripts/verify-booking-flow.ts` | Docker E2E 9/9 | live cases | leave as-is (live-specific) | n/a | LOW |
| 14 | `scripts/verify-booking-conversion.ts` | Docker E2E 8/8 | live cases | tied to AR-3 — add bookingIds-only cases | n/a | MEDIUM |

**174 grep hits on `broadcastProduct`** across src/ + tests/ + scripts/. Most are dialog refs and route comments. Real touch points listed above.

### AR-2 — Booking.liveSessionId

| # | File | Purpose | Current liveSession assumption | Required future change | Test coverage | Risk |
|---|---|---|---|---|---|---|
| 1 | `prisma/schema.prisma` Booking lines 921-969 | model definition | required FK | nullable | n/a | HIGH |
| 2 | `src/server/repositories/booking.repository.ts` `createManual` | explicit `liveSessionId` param | accept nullable | route tests | HIGH |
| 3 | `src/server/repositories/booking.repository.ts` `confirm` | reads booking row (implicit FK) | no change ✅ | route tests | LOW |
| 4 | `src/server/repositories/booking.repository.ts` `cancel` | reads booking row | no change ✅ | route tests | LOW |
| 5 | `src/server/repositories/booking.repository.ts` `convertToOrder` | requires `liveSessionId` | see AR-3 | route tests | HIGH |
| 6 | `src/lib/validation/booking.schemas.ts` `createBookingBodySchema` | requires `liveSessionId` | make optional | unit tests | LOW |
| 7 | `src/lib/validation/sale.schemas.ts` `saleBookingsQuerySchema` | requires `liveSessionId` query param | relax: require ≥1 filter (liveSessionId OR source OR customerId OR conversationId) | unit tests | MEDIUM |
| 8 | `src/app/api/sale/bookings/route.ts` GET handler | filters by liveSessionId | relax filter | route tests | MEDIUM |
| 9 | `src/app/api/sale/bookings/route.ts` POST handler | passes through to repo | follow repo signature | route tests | MEDIUM |
| 10 | `src/components/sale/SaleWorkspaceShell.tsx` | auto-selects session | future: allow no-session mode | none | MEDIUM |
| 11 | `src/components/sale/SaleBookingQueuePlaceholder.tsx` | renders queue | display source badge per row | helper tests | LOW |
| 12 | reservation integrity discriminator (in route file) | uses `status` + reservation count only | no change ✅ | route tests | LOW |

### AR-3 — convertToOrder

| # | File | Purpose | Current liveSession assumption | Required future change | Test coverage | Risk |
|---|---|---|---|---|---|---|
| 1 | `src/server/repositories/booking.repository.ts` `convertToOrder` lines 561+ | signature `(shopId, liveSessionId, customerId, changedById, bookingIds?)` | new path: `(shopId, customerId, changedById, bookingIds[])`; legacy path coexists | n/a | HIGH |
| 2 | `src/lib/sale/booking-rules.ts` `buildConversionIdempotencyKey` line 532 | v1 key includes liveSessionId | add `buildConversionIdempotencyKeyV2` (no liveSessionId) | unit tests | MEDIUM |
| 3 | `src/lib/validation/sale.schemas.ts` `createOrderFromBookingsBodySchema` | requires `liveSessionId` + `customerId` + `bookingIds` | new v2 schema: `bookingIds` only; `liveSessionId` + `customerId` optional | unit tests | MEDIUM |
| 4 | `src/app/api/sale/orders/from-bookings/route.ts` POST | calls repo with current signature | dispatch v1 vs v2 path based on body shape | route tests | MEDIUM |
| 5 | `src/components/sale/CreateOrderDialog.tsx` | sends `{liveSessionId, customerId, bookingIds}` | future: send `bookingIds` only (v2) | none | LOW |
| 6 | `scripts/verify-booking-conversion.ts` | 8/8 verifier | tests v1 conversion | add 2-3 v2 cases | n/a | MEDIUM |

### Shared assumptions not changing

| Component | Change? |
|---|---|
| `StockReservation` | NONE — schema neutral; logic neutral |
| `Order` / `OrderItem` / `Payment` / `Shipment` | NONE |
| `BookingHistory` | NONE — `bookingId` FK + status enum only |
| Reservation integrity badge (`OK/MISSING/MULTIPLE/NOT_APPLICABLE`) | NONE — derived from booking status + reservation count |
| Customer Panel `/api/customers/[id]` | NONE — neutral |
| `/api/sale/customers/search` | NONE — PII whitelist enforced; live-neutral |
| Idempotency `Booking.@@unique([shopId, idempotencyKey])` | NONE — shop-scoped already |
| Cross-shop defense | needs minor revision: where check formerly used `BP.variant.product.shopId === user.shopId`, now should also accept `BP.shopId === user.shopId` directly once column added |

---

## 2. AR-1 implementation recipe

### 2.1 Proposed Prisma model shape

```prisma
// proposed (NOT applied yet)
model BroadcastProduct {
  id            String   @id @default(cuid())
  shopId        String                                   // ← NEW (required, indexed)
  liveSessionId String?                                  // ← was required → nullable
  productId     String
  variantId     String?
  displayCode   String
  displayOrder  Int      @default(0)
  priceOverride Decimal? @db.Decimal(12, 2)
  isPinned      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  shop        Shop            @relation(fields: [shopId], references: [id])
  liveSession LiveSession?    @relation(fields: [liveSessionId], references: [id], onDelete: Cascade)  // ← nullable; SetNull onDelete may be safer for non-live
  product     Product         @relation(fields: [productId], references: [id])
  variant     ProductVariant? @relation(fields: [variantId], references: [id])

  bookings Booking[]

  @@unique([liveSessionId, displayCode])                 // ← keep live-bound uniqueness
  // Partial unique index for evergreen rows must be created via raw SQL
  // because Prisma does not generate WHERE clauses on unique indexes:
  //   CREATE UNIQUE INDEX "BroadcastProduct_shop_evergreen_displayCode_key"
  //     ON "BroadcastProduct" ("shopId", "displayCode")
  //     WHERE "liveSessionId" IS NULL;
  @@index([shopId])                                      // ← NEW
  @@index([liveSessionId, displayOrder])
  @@index([productId])
  @@index([variantId])
}
```

### 2.2 Uniqueness model

| Row class | Uniqueness rule |
|---|---|
| **Live-bound** (`liveSessionId IS NOT NULL`) | `(liveSessionId, displayCode)` — current rule preserved |
| **Evergreen** (`liveSessionId IS NULL`) | `(shopId, displayCode)` — enforced via Postgres partial unique index |

Why per-shop for evergreen, not global: each shop maintains its own product code namespace. Operator at shop X uses "T30" for chili sauce; operator at shop Y uses "T30" for shirt M. Must not collide.

Why per-(liveSession, displayCode) for live-bound stays the same: live operators frequently reuse codes across sessions ("T1..T200" per session). Per-session scope preserves that workflow.

### 2.3 Cascade behavior

Current: `onDelete: Cascade` on LiveSession FK → deleting LiveSession deletes all BroadcastProduct rows.

Decision needed: with nullable FK, should `onDelete` be `SetNull` instead? That way deleting a LiveSession converts its BroadcastProducts to evergreen automatically.

**Recommendation:** keep `Cascade` for now. SetNull risks accidental shop-level catalog pollution if admin deletes a session not realizing it converts orphan products. Operator should explicitly promote-to-evergreen if needed (future Tier 3 UI).

### 2.4 Migration SQL sketch

Two-stage migration. First stage = additive only; second stage = enable evergreen creation via feature flag.

**Stage 1 — additive, deploy-safe:**

```sql
-- Step 1: Add shopId column to BroadcastProduct (nullable initially to allow backfill)
ALTER TABLE "BroadcastProduct" ADD COLUMN "shopId" TEXT;

-- Step 2: Backfill from LiveSession.shopId (single UPDATE, runs in ms even on large tables)
UPDATE "BroadcastProduct" bp
SET "shopId" = ls."shopId"
FROM "LiveSession" ls
WHERE bp."liveSessionId" = ls."id";

-- Step 3: Verify zero NULL shopId rows
-- (manual check: SELECT count(*) FROM "BroadcastProduct" WHERE "shopId" IS NULL; expect 0)

-- Step 4: Enforce NOT NULL on shopId
ALTER TABLE "BroadcastProduct" ALTER COLUMN "shopId" SET NOT NULL;

-- Step 5: Add FK constraint
ALTER TABLE "BroadcastProduct"
  ADD CONSTRAINT "BroadcastProduct_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id");

-- Step 6: Add shopId index
CREATE INDEX "BroadcastProduct_shopId_idx" ON "BroadcastProduct" ("shopId");

-- Step 7: Relax liveSessionId NOT NULL
ALTER TABLE "BroadcastProduct" ALTER COLUMN "liveSessionId" DROP NOT NULL;

-- Step 8: Create partial unique index for evergreen rows (CONCURRENTLY = no table lock)
CREATE UNIQUE INDEX CONCURRENTLY "BroadcastProduct_shop_evergreen_displayCode_key"
  ON "BroadcastProduct" ("shopId", "displayCode")
  WHERE "liveSessionId" IS NULL;
```

**Stage 2 — feature flag enables evergreen row creation in app code:**

Application-level `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false` (default) gates the new code path. Boss flips after smoke verifies live behavior unaffected.

### 2.5 Test additions (AR-1)

- New unit test in `tests/unit/app/api/sale/bookings.route.test.ts`: POST with `liveSessionId: null` + valid `broadcastProductId` whose BP row is evergreen → 200 PENDING_REVIEW
- New unit test: POST with `liveSessionId: null` + BP from different shop → 403/409
- New unit test: POST with `liveSessionId: "X"` + BP whose `liveSessionId !== "X"` → 409 (cross-session)
- New unit test: zod schema accepts missing `liveSessionId`
- Updated `tests/unit/lib/sale/booking-rules.test.ts`: cross-shop defense includes `BP.shopId` check
- `scripts/verify-booking-create.ts`: add 3 evergreen cases (16/16 target)

### 2.6 Rollback plan (AR-1)

If issues found post-deploy:

1. App-level: flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false`. New POSTs cannot create evergreen rows. Existing evergreen rows (if any) become read-only — but DB still accepts them.
2. Schema-level rollback (only if no evergreen rows exist yet):
   ```sql
   ALTER TABLE "BroadcastProduct" ALTER COLUMN "liveSessionId" SET NOT NULL;
   DROP INDEX "BroadcastProduct_shop_evergreen_displayCode_key";
   -- shopId column can stay — backfilled values from LiveSession are accurate.
   ```
3. Schema-level rollback if evergreen rows exist: must migrate or delete those rows first.

---

## 3. AR-2 implementation recipe

### 3.1 Proposed Prisma model shape

```prisma
// proposed (NOT applied yet)
model Booking {
  id                 String        @id @default(cuid())
  shopId             String
  liveSessionId      String?       // ← was required → nullable
  broadcastProductId String
  customerId         String
  conversationId     String?       // already optional ✅
  channelIdentityId  String?       // already optional ✅
  sourceMessageId    String?       // already optional ✅
  quantity           Int
  unitPrice          Decimal       @db.Decimal(12, 2)
  status             BookingStatus @default(PENDING_REVIEW)
  source             BookingSource @default(MANUAL)
  // ... rest unchanged
  liveSession      LiveSession?     @relation(fields: [liveSessionId], references: [id])  // ← nullable relation
  // ... rest unchanged

  @@unique([shopId, idempotencyKey])
  @@index([shopId, status])
  @@index([liveSessionId, status])
  @@index([broadcastProductId, status])
  @@index([customerId, status])
  @@index([sourceMessageId])
  @@index([conversationId])
  @@index([channelIdentityId])
  @@index([convertedOrderId])
  @@index([shopId, source, status])   // ← NEW: support cross-source queries
}
```

### 3.2 Migration SQL sketch

```sql
-- Step 1: Relax NOT NULL
ALTER TABLE "Booking" ALTER COLUMN "liveSessionId" DROP NOT NULL;

-- Step 2: Add cross-source index
CREATE INDEX CONCURRENTLY "Booking_shopId_source_status_idx"
  ON "Booking" ("shopId", "source", "status");
```

Both operations are fast metadata ops in Postgres. `CONCURRENTLY` avoids table lock.

### 3.3 Repository diff sketch (`createManual`)

```ts
// Before
async createManual(input: {
  shopId: string;
  liveSessionId: string;   // ← required
  customerId: string;
  broadcastProductId: string;
  quantity: number;
  status: 'PENDING_REVIEW' | 'CONFIRMED';
  idempotencyKey?: string;
  changedById: string;
}): Promise<...> { ... }

// After
async createManual(input: {
  shopId: string;
  liveSessionId?: string | null;          // ← optional
  customerId: string;
  broadcastProductId: string;
  quantity: number;
  status: 'PENDING_REVIEW' | 'CONFIRMED';
  source?: BookingSource;                 // ← default MANUAL; explicit override allowed
  conversationId?: string;                // ← optional source context
  channelIdentityId?: string;             // ← optional source context
  sourceMessageId?: string;               // ← optional source context
  idempotencyKey?: string;
  changedById: string;
}): Promise<...> {
  // Cross-shop check (revised):
  //   1. BP exists + belongs to shopId (via new BP.shopId column)
  //   2. If input.liveSessionId is set, BP.liveSessionId must match
  //   3. If input.liveSessionId is null, BP.liveSessionId may be null (evergreen) OR fail
  //   4. Variant required (unchanged)
  // ... rest unchanged
}
```

### 3.4 Source policy per route

| Source enum | When createManual is called | Required context fields |
|---|---|---|
| `MANUAL` | admin Manual Create modal | none |
| `LIVE_COMMENT` | future Tier 5 parser (live) | `liveSessionId`, `sourceMessageId`, `conversationId` |
| `MESSENGER_INBOX` | future parser | `conversationId`, `channelIdentityId`, `sourceMessageId` |
| `PAGE_POST_COMMENT` | future parser | `conversationId`, `sourceMessageId` |
| `TELEGRAM` (future) | future Tier 4+ | `conversationId`, `channelIdentityId` |
| `WHATSAPP` (future) | future Tier 4+ | `conversationId`, `channelIdentityId` |

Validation: route schema accepts source + optional context fields; repository validates the combination is internally consistent.

### 3.5 Route schema changes

#### `POST /api/sale/bookings` — `createBookingBodySchema`

```ts
// Before
{
  liveSessionId: z.string().min(1).max(128),  // required
  customerId: z.string().min(1).max(128),
  broadcastProductId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
  status: z.enum(['PENDING_REVIEW', 'CONFIRMED']),
  idempotencyKey: z.string().regex(...).optional(),
}

// After
{
  liveSessionId: z.string().min(1).max(128).optional(),  // ← optional
  customerId: z.string().min(1).max(128),
  broadcastProductId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
  status: z.enum(['PENDING_REVIEW', 'CONFIRMED']),
  source: z.enum(BOOKING_SOURCES).default('MANUAL').optional(),  // ← new optional
  conversationId: z.string().min(1).max(128).optional(),         // ← new optional
  channelIdentityId: z.string().min(1).max(128).optional(),      // ← new optional
  sourceMessageId: z.string().min(1).max(128).optional(),        // ← new optional
  idempotencyKey: z.string().regex(...).optional(),
}
```

#### `GET /api/sale/bookings` — `saleBookingsQuerySchema`

```ts
// After (with refinement: at least one of [liveSessionId, source, customerId, conversationId] required)
z.object({
  liveSessionId: z.string().min(1).max(128).optional(),
  status: z.enum(SALE_BOOKING_STATUSES).optional(),
  customerId: z.string().min(1).max(128).optional(),
  source: z.enum(BOOKING_SOURCES).optional(),
  conversationId: z.string().min(1).max(128).optional(),
  channelIdentityId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).refine(
  (data) =>
    data.liveSessionId !== undefined ||
    data.source !== undefined ||
    data.customerId !== undefined ||
    data.conversationId !== undefined ||
    data.channelIdentityId !== undefined,
  { message: 'At least one filter (liveSessionId / source / customerId / conversationId / channelIdentityId) is required' }
);
```

Prevents shop-wide dumps. Server still applies `shopId` from session.

### 3.6 Reservation integrity & BookingHistory

NO change. Both already work on `status` + reservation count or `bookingId` FK alone. AR-2 nullable column is invisible to these paths.

### 3.7 Test additions (AR-2)

- Repository test: `createManual({liveSessionId: null, source: 'MANUAL', ...})` → 200 PENDING_REVIEW
- Repository test: `createManual({liveSessionId: null, source: 'MESSENGER_INBOX', conversationId: "C1", sourceMessageId: "M1", ...})` → 200
- Repository test: `confirm()` on null-liveSession booking → 200, reserves stock atomically
- Repository test: `cancel()` on null-liveSession booking → 200, releases stock
- Route test: POST without liveSessionId + valid source → 200
- Route test: GET with `source=MANUAL` + no liveSessionId → returns shop-wide MANUAL bookings
- Route test: GET without any filter → 400
- Route test: GET with `liveSessionId=X` (legacy) → unchanged behavior

### 3.8 Rollback plan (AR-2)

App-level: flip `ALLOW_NON_LIVE_BOOKING=false`. POST validation requires `liveSessionId` again. Existing null-liveSession rows become read-only but stay in DB.

Schema-level rollback (only if no null rows): `SET NOT NULL`.

---

## 4. AR-3 implementation recipe

### 4.1 New idempotency key builder

```ts
// src/lib/sale/booking-rules.ts — proposed (NOT applied)

/**
 * v2 idempotency key for omnichannel booking conversion.
 * No liveSessionId in composition. Customer + sorted bookingIds only.
 *
 * Format: `sale-conv:v2:{shopId}:{customerId}:{sha256-16(sortedBookingIds.join(','))}`
 *
 * Coexists with v1 (sale-conv:{shopId}:{liveSessionId}:{customerId}:{hash})
 * so in-flight retries against an existing Order do not duplicate.
 */
export function buildConversionIdempotencyKeyV2(input: {
  shopId: string;
  customerId: string;
  bookingIds: ReadonlyArray<string>;
}): string {
  const sorted = [...input.bookingIds].sort();
  const hash = sha256(sorted.join(',')).slice(0, 16);
  return `sale-conv:v2:${input.shopId}:${input.customerId}:${hash}`;
}

// v1 stays as-is for backward compatibility:
export function buildConversionIdempotencyKey(input: ...) { ... }
```

### 4.2 Repository signature change

```ts
// Before
interface ConvertBookingsToOrderInput {
  shopId: string;
  liveSessionId: string;            // ← required
  customerId: string;
  changedById: string;
  bookingIds?: ReadonlyArray<string>;
}

// After (additive — no breaking change to existing callers)
interface ConvertBookingsToOrderInput {
  shopId: string;
  liveSessionId?: string | null;    // ← optional
  customerId?: string;              // ← optional when bookingIds provided
  changedById: string;
  bookingIds?: ReadonlyArray<string>;   // ← REQUIRED if liveSessionId null
}

async convertToOrder(input: ConvertBookingsToOrderInput): Promise<ConvertBookingsToOrderResult> {
  const { shopId, liveSessionId, changedById } = input;
  let { customerId, bookingIds } = input;

  // V2 fast path: bookingIds-only conversion (no liveSessionId)
  if (!liveSessionId && bookingIds && bookingIds.length > 0) {
    // 1. Fetch all bookings by id (within shopId)
    const allBookings = await tx.booking.findMany({
      where: { id: { in: [...bookingIds] }, shopId },
      include: { ... }
    });

    // 2. Validate same customer
    const distinctCustomers = new Set(allBookings.map(b => b.customerId));
    if (distinctCustomers.size !== 1) {
      throw new AppError(
        'All bookings must belong to the same customer',
        BOOKING_ERROR_CODES.MULTI_CUSTOMER_CONVERSION,
        409
      );
    }
    customerId = [...distinctCustomers][0];

    // 3. Validate all CONFIRMED + not already converted
    // ... (same as v1 validateBookingsConvertible)

    // 4. Build v2 idempotency key
    const idempotencyKey = buildConversionIdempotencyKeyV2({
      shopId, customerId, bookingIds: allBookings.map(b => b.id)
    });

    // 5. Idempotency check against existing Order
    // ... (same flow as v1)

    // 6. Create Order + transfer reservations
    // ... (same flow as v1)
  }

  // V1 legacy path: requires liveSessionId + customerId
  if (liveSessionId && customerId) {
    // ... existing v1 implementation unchanged
  }

  throw new ValidationError(
    'convertToOrder requires either (liveSessionId + customerId) or bookingIds[]'
  );
}
```

### 4.3 Route schema change

```ts
// src/lib/validation/sale.schemas.ts — proposed
export const createOrderFromBookingsBodySchemaV2 = z.discriminatedUnion('kind', [
  // V1 legacy
  z.object({
    kind: z.literal('legacy'),
    liveSessionId: z.string().min(1),
    customerId: z.string().min(1),
    bookingIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  // V2 omnichannel
  z.object({
    kind: z.literal('v2').optional().default('v2'),
    bookingIds: z.array(z.string().min(1)).min(1).max(100),
  }),
]);
```

Or simpler: single schema where `liveSessionId` + `customerId` are both optional, and route handler dispatches based on presence:

```ts
export const createOrderFromBookingsBodySchema = z.object({
  liveSessionId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  bookingIds: z.array(z.string().min(1)).min(1).max(100),
}).refine(
  (data) =>
    (data.liveSessionId && data.customerId) || (!data.liveSessionId && data.bookingIds.length > 0),
  { message: 'Provide either (liveSessionId + customerId) for legacy live conversion or bookingIds-only for omnichannel' }
);
```

Recommend the simpler single-schema approach for less code churn.

### 4.4 What happens if bookingIds include mixed source types

- All bookings must belong to same shop (enforced)
- All bookings must belong to same customer (enforced — error 409 MULTI_CUSTOMER_CONVERSION)
- Source mix is **allowed** — Order doesn't carry source per booking. Order.channel stays `MANUAL` (per existing Phase 1 boundary).
- The converted Order's `OrderItem` rows preserve the BP/variant linkage; OrderItem doesn't need source.

### 4.5 What if mixed liveSessionId (some null + some set)

Two bookings from same customer, one from LIVE_COMMENT (has liveSessionId), one from MESSENGER_INBOX (null liveSessionId). Should v2 path accept?

**Decision:** YES. v2 path doesn't filter by liveSessionId. Mixed-context conversion is the whole point of omnichannel.

### 4.6 Duplicate reservation risk

Unchanged from v1. `Order.idempotencyKey @unique` + atomic StockReservation transfer in transaction.

V1 + V2 keys CAN collide on the same set of bookingIds (extremely rare edge case where someone passes v1 path then v2 path for same bookingIds). Solution: at insert time, also check existing Order for v1 key shape `sale-conv:{shopId}:{liveSessionId}:{customerId}:{hash}` where `{liveSessionId}` is the booking row's actual liveSessionId. If found, return that Order (idempotent replay).

### 4.7 Test additions (AR-3)

- Unit test `buildConversionIdempotencyKeyV2`: deterministic + sorted bookingIds
- Unit test `buildConversionIdempotencyKeyV2`: shopId case-sensitive
- Repository test: convertToOrder with bookingIds-only → 200
- Repository test: convertToOrder with mixed-source bookings same customer → 200
- Repository test: convertToOrder with multi-customer bookings → 409
- Repository test: legacy path (liveSessionId + customerId) → unchanged
- Repository test: replay v1 then v2 with same bookingIds → second call returns idempotent
- Route test: POST without liveSessionId + bookingIds → 200
- Route test: POST with only customerId (no liveSessionId, no bookingIds) → 400
- Updated `scripts/verify-booking-conversion.ts`: add 3 v2 cases (target 11/11)

### 4.8 Rollback plan (AR-3)

App-level: flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION=false`. Route rejects v2 calls. Existing v1 keys + Orders unaffected.

Code-level rollback: revert repository + route. v1 idempotency keys stay valid on existing Orders. v2 keys (if any Order created) become orphan keys but the Orders themselves are valid.

---

## 5. API + validation plan

### 5.1 API change table

| Route | Method | Before | After | Risk |
|---|---|---|---|---|
| `/api/sale/bookings` | POST | requires liveSessionId | accepts optional liveSessionId + source/context fields | MEDIUM |
| `/api/sale/bookings` | GET | requires liveSessionId | requires ≥1 of (liveSessionId, source, customerId, conversationId, channelIdentityId) | MEDIUM |
| `/api/sale/bookings/[id]/confirm` | POST | no change | no change | LOW |
| `/api/sale/bookings/[id]/cancel` | POST | no change | no change | LOW |
| `/api/sale/orders/from-bookings` | POST | requires (liveSessionId, customerId, bookingIds) | accepts (bookingIds only) OR (liveSessionId + customerId) | MEDIUM |
| `/api/sale/live-sessions` | GET | no change | no change | LOW |
| `/api/sale/live-sessions/[id]/broadcast-products` | GET | no change | no change (live-only view) | LOW |
| `/api/sale/customers/search` | GET | no change | no change | LOW |
| `/api/customers/[id]` | GET | no change | no change | LOW |

### 5.2 Zod schema change table

| Schema | Field changes |
|---|---|
| `createBookingBodySchema` | `liveSessionId` required → optional; add optional `source`, `conversationId`, `channelIdentityId`, `sourceMessageId` |
| `saleBookingsQuerySchema` | `liveSessionId` required → optional; add optional `source`, `conversationId`, `channelIdentityId`; refine: ≥1 filter required |
| `createOrderFromBookingsBodySchema` | `liveSessionId` + `customerId` required → optional; refine: either (live+cust) or bookingIds-only |
| `confirmBookingBodySchema` | unchanged |
| `cancelBookingBodySchema` | unchanged |
| `saleCustomerSearchQuerySchema` | unchanged |

### 5.3 Access-control matrix

Unchanged from current. RBAC stays:

| Action | OWNER | MANAGER | CHAT_SUPPORT | WAREHOUSE | CUSTOMER |
|---|---|---|---|---|---|
| GET /sale routes | ✅ | ✅ | ✅ | ❌ | ❌ |
| POST /sale mutations | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET customers/search | ✅ | ✅ | ✅ | ❌ | ❌ |

Non-live booking creation does NOT change role gating. CHAT_SUPPORT still read-only.

### 5.4 Rate limiting

No change. POST mutations share existing IP bucket (`RATE_LIMIT_MAX=60` env override active in production). New non-live POSTs count toward same bucket.

### 5.5 Error message policy

- Cross-shop probe → 404 (existing) or 409 (cross-shop BroadcastProduct) — no shop existence leak
- Cross-session product → 409 with generic "Product does not belong to session"
- Multi-customer conversion → 409 MULTI_CUSTOMER_CONVERSION
- Missing required filter on GET → 400 with descriptive field error
- Idempotency conflict → 409 with no internal id detail

---

## 6. UI impact plan (sequencing only — no implementation tonight)

### 6.1 Manual Create dialog

**Phase A (immediate after schema lands):** keep existing UI. Continue passing `liveSessionId`. No new UI for non-live.

**Phase B (Tier 1 UI/IA PR):** add a "Source" picker in modal (defaults to MANUAL when no session selected; LIVE_COMMENT when session selected). Source picker conditional on whether session is selected in workspace.

**Phase C (Tier 3 Add from Stock):** product picker switches between live-session products and evergreen products based on workspace mode.

### 6.2 `/sale` workspace (Tier 1)

- Add Source filter chip group in toolbar (per UX consolidation plan)
- Add Context filter dropdown (LiveSession picker when source=LIVE)
- Workspace works without selecting a LiveSession when source≠LIVE
- Empty-state copy updated to reflect omnichannel availability

### 6.3 Booking Queue panel

- Add Source badge per row (`MANUAL` / `LIVE_COMMENT` / etc) — Tier 1 UI
- Display LiveSession id only when row has one (no `(no session)` placeholder text)
- Booking row click still loads Customer Panel via existing path

### 6.4 Create Order dialog

- Phase A: keep existing UI. Continue passing `liveSessionId + customerId + bookingIds[]`.
- Phase B (after AR-3 lands): switch to bookingIds-only request body. Server accepts both.
- Phase C (Tier 1 UI): allow multi-source selection within same customer in the queue.

### 6.5 Product Codes panel

- Phase A: stays live-only (current behavior).
- Phase C (Tier 3 Add from Stock + AR-1 evergreen rows): switch to dual-mode:
  - When LiveSession selected → show session's BroadcastProducts
  - When no LiveSession selected → show shop's evergreen products

### 6.6 Empty states

| Panel | Live selected | No live selected |
|---|---|---|
| Live Sessions | session details + status badges | "ยังไม่มีรอบไลฟ์ — สร้างรอบในแท็บ 'รอบไลฟ์' หรือทำงานต่อจากแหล่งอื่นได้เลย" |
| Product Codes | session's BPs | future: shop's evergreen codes (Tier 3); current: explanatory placeholder |
| Customer Bookings | session bookings | shop bookings filtered by Source (after AR-2) |
| Customer Panel | selected customer | "คลิกชื่อลูกค้าในรายการจอง" |

### 6.7 Customer Panel

No change required. Already source-neutral.

### 6.8 i18n / copy impact

- `messages/{en,th,zh}.json`: add new keys `sale.heading`, `sale.subtitle`, `sale.source.*` (per Tier 1 plan)
- `liveSale` key value updates per D-1/D-2 (`Live Commerce` / `ขายของไลฟ์สด` / `直播销售工作台`)
- `liveSelling` key removed AFTER `/live-selling` redirect lands (deferred per D-3)

---

## 7. Test + verifier plan

### 7.1 Unit tests to add

| File | Test | Reason |
|---|---|---|
| `tests/unit/lib/sale/booking-rules.test.ts` | `buildConversionIdempotencyKeyV2` deterministic + sorted | new function |
| `tests/unit/lib/validation/booking.schemas.test.ts` | `createBookingBodySchema` accepts missing `liveSessionId` | zod relaxation |
| `tests/unit/lib/validation/booking.schemas.test.ts` | rejects unknown `source` enum value | safety |
| `tests/unit/lib/validation/sale.schemas.test.ts` | `saleBookingsQuerySchema` requires ≥1 filter | refine() coverage |
| `tests/unit/lib/validation/sale.schemas.test.ts` | `createOrderFromBookingsBodySchema` accepts bookingIds-only | v2 path |
| `tests/unit/components/sale/manual-create-helpers.test.ts` | no change (pure helpers unaffected) | — |

### 7.2 Repository tests to add (booking.repository.test.ts — likely new file)

| Test | Coverage |
|---|---|
| `createManual` non-live MANUAL → 200 PENDING_REVIEW | AR-2 happy path |
| `createManual` non-live with conversationId + sourceMessageId → 200 | AR-2 source context |
| `createManual` live → 200 (unchanged) | regression |
| `confirm` non-live booking → reserves stock atomically | AR-2 confirm path |
| `cancel` non-live CONFIRMED booking → releases stock | AR-2 cancel path |
| `convertToOrder` v2 bookingIds-only same customer → 200 | AR-3 happy path |
| `convertToOrder` v2 mixed-source bookings same customer → 200 | AR-3 cross-source |
| `convertToOrder` v2 multi-customer → 409 | safety |
| `convertToOrder` v1 legacy (live + customer) → 200 unchanged | regression |
| `convertToOrder` replay v1 then v2 same bookingIds → idempotent | edge case |

### 7.3 Route tests to add

| File | Test |
|---|---|
| `tests/unit/app/api/sale/bookings.route.test.ts` | POST without `liveSessionId` + valid evergreen BP → 200 |
| `tests/unit/app/api/sale/bookings.route.test.ts` | POST with source=MESSENGER_INBOX + conversationId + sourceMessageId → 200 |
| `tests/unit/app/api/sale/bookings.route.test.ts` | GET with `source=MANUAL` only → returns shop-wide MANUAL bookings |
| `tests/unit/app/api/sale/bookings.route.test.ts` | GET without any filter → 400 |
| `tests/unit/app/api/sale/orders/from-bookings.route.test.ts` | POST with bookingIds-only → 200 |
| `tests/unit/app/api/sale/orders/from-bookings.route.test.ts` | POST with multi-customer bookingIds → 409 |
| `tests/unit/app/api/sale/orders/from-bookings.route.test.ts` | POST with neither → 400 |

### 7.4 Verifier script updates

| Script | Current | After |
|---|---|---|
| `verify-booking-create.ts` | 13/13 | 16/16 (+3 non-live BP cases) |
| `verify-booking-flow.ts` | 9/9 | unchanged (live-specific) |
| `verify-booking-conversion.ts` | 8/8 | 11/11 (+3 v2 conversion cases) |
| `verify-order-reservation-cleanup.ts` | 5/5 | unchanged |
| `verify-expire-reservations-cron.ts` | 1/1 | unchanged |
| **NEW** `verify-omnichannel-booking.ts` | n/a | optional 5-case verifier covering: evergreen BP create → non-live booking → confirm → cancel → v2 convert |

Total verifier coverage post-migration: 9 + 16 + 11 + 5 + 1 + 5 = **47 cases** (was 36).

### 7.5 Stop conditions for CI failures

- Any v1 legacy path test fails → STOP. v1 backward compat is non-negotiable.
- Any reservation integrity test fails → STOP. Stock invariant.
- Any cross-shop test fails → STOP. Security.
- New non-live tests fail → diagnose; may indicate design flaw before deploy.

---

## 8. Migration safety + rollout plan

### 8.1 Pre-migration checklist

1. **Railway snapshot** of production Postgres via dashboard → Backups → take manual snapshot. Record snapshot id + timestamp.
2. **Local Docker dry-run**:
   ```bash
   docker compose up -d postgres
   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
     npx prisma migrate dev --create-only --name omnichannel_booking_v1
   # Inspect generated SQL + add raw SQL for partial unique index
   npx prisma migrate dev
   ```
3. **Local Docker smoke**: run all Docker verifiers including new omnichannel verifier.
4. **Staging Railway Postgres** (if available): apply migration + run smoke.
5. **Boss + ChatGPT review of exact SQL** before production deploy.

### 8.2 Prisma migration strategy

- Use `prisma migrate dev` to generate base migration (ADD COLUMN shopId, ALTER COLUMN nullable).
- Manually inject raw SQL for partial unique index (Prisma doesn't generate `WHERE` clauses).
- Migration becomes hybrid: Prisma-generated DDL + manual partial index SQL inside the migration's `migration.sql` file.

### 8.3 Backfill requirements

For primary path (Option A everywhere): **NONE**.

- Existing `BroadcastProduct` rows: all have non-null `liveSessionId`. Adding nullable column doesn't affect them.
- Existing `Booking` rows: all have non-null `liveSessionId`. Same.
- New `BroadcastProduct.shopId` column: backfill via UPDATE from `LiveSession.shopId` (single query, sub-second on realistic shop sizes).

### 8.4 Feature flag strategy

App-level gates control behavior independent of schema:

| Flag | Default | Effect |
|---|---|---|
| `ALLOW_EVERGREEN_BROADCAST_PRODUCT` | `false` | When false, POST routes reject creation of evergreen BroadcastProducts even if schema allows |
| `ALLOW_NON_LIVE_BOOKING` | `false` | When false, POST `/api/sale/bookings` requires `liveSessionId` even after schema relaxation |
| `ALLOW_BOOKINGIDS_ONLY_CONVERSION` | `false` | When false, POST `/api/sale/orders/from-bookings` rejects bookingIds-only path |

Flags flip in stages:
1. Deploy schema migration (all flags false) → no behavior change → smoke verifies regression-free
2. Flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true` → enable v2 path → smoke
3. Flip `ALLOW_NON_LIVE_BOOKING=true` → enable non-live POST → smoke
4. Flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` → enable Tier 3 Add from Stock (after that UI lands)

### 8.5 Rollback recipe

#### Stage rollback (any flag → false):
1. Flip Vercel env var to `false`
2. Trigger Vercel redeploy
3. New behavior gated off; existing data unaffected

#### Schema rollback (only if no null/evergreen rows exist):
```sql
-- Verify: SELECT count(*) FROM "Booking" WHERE "liveSessionId" IS NULL; -- expect 0
ALTER TABLE "Booking" ALTER COLUMN "liveSessionId" SET NOT NULL;

-- Verify: SELECT count(*) FROM "BroadcastProduct" WHERE "liveSessionId" IS NULL; -- expect 0
DROP INDEX "BroadcastProduct_shop_evergreen_displayCode_key";
ALTER TABLE "BroadcastProduct" ALTER COLUMN "liveSessionId" SET NOT NULL;

-- shopId column stays (correct values). Drop only if absolutely necessary.
```

#### Worst case (rows exist + can't be cleaned up):
- Restore from Railway snapshot. Last-resort option.
- Acceptable downtime window required.

### 8.6 Deploy phasing

| Phase | What ships | Verify |
|---|---|---|
| D1 | Schema migration only (flags all false) | Production smoke 15/15 pass; tsc clean; vitest pass |
| D2 | Repository compatibility code (handles nullable but flags reject) | Same smoke + targeted route tests |
| D3 | Flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION` true | Smoke + manual Phase B legacy + manual Phase B v2 |
| D4 | Flip `ALLOW_NON_LIVE_BOOKING` true | Smoke + manual non-live MANUAL creation |
| D5 | Tier 1 UI ships | Phase A spec rerun against new IA |
| D6 | Flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT` true | Tier 3 Add from Stock smoke |

Each phase = separate PR with explicit Boss GO.

### 8.7 Observability

- Vercel runtime logs filter for `convertToOrder` calls — capture v1 vs v2 dispatch (add log line)
- Vercel runtime logs filter for `createManual` calls — capture source enum
- `ActivityLog` model already records BOOKING_CREATED_MANUAL + BOOKING_CREATED_AND_CONFIRMED — verify these capture non-live runs too
- New log line on schema migration deploy: `[migration] omnichannel_booking_v1 applied at <timestamp>`

### 8.8 Data safety guarantees

- Storefront checkout: unaffected (no schema touches Order/OrderItem/Payment/Shipment)
- Payment / slip: unaffected
- ORDER-RESERVATION-CLEANUP backfill: unaffected (StockReservation untouched)
- Historical confirmed/cancelled bookings: unaffected (existing rows keep liveSessionId)
- Customer Panel: unaffected
- Inbox panel: still "Coming Soon" — no runtime change

### 8.9 Production smoke post-migration

Existing 15-probe set + add new probes:

| # | Probe | Expected |
|---|---|---|
| 16 | `GET /api/sale/bookings` (unauth, no params) | 401 |
| 17 | `GET /api/sale/bookings?source=MANUAL` (unauth) | 401 |
| 18 | `POST /api/sale/bookings` (unauth, no liveSessionId) | 401 |
| 19 | `POST /api/sale/orders/from-bookings` (unauth, bookingIds-only) | 401 |

Total 19-probe smoke after migration.

---

## 9. Final recommended implementation roadmap (PR sequence)

### Tonight's deliverable

- ✅ **Audit doc commit `a90494d`** (already committed in Phase 0 of this session)
- ✅ **Migration plan commit** (this doc, to be committed in Phase 10)

### Recommended PR sequence after Boss GO

| PR | Title | Type | Depends on |
|---|---|---|---|
| **PR 1** | (this) — migration plan doc commit | docs only | nothing |
| **PR 2** | `schema(sale): omnichannel booking migration (AR-1 + AR-2 + AR-3)` | schema + repo + route | Boss explicit GO |
| **PR 3** | `feat(sale): tier 1 ui/ia consolidation (layout + source filter + sub-tabs)` | UI only | PR 2 optional (can ship parallel as layout-only) |
| **PR 4** | `feat(sale): add from stock + evergreen product code management` | new route + UI | PR 2 + PR 3 |
| **PR 5** | `feat(inbox): messenger receive-only (Phase O-1)` | new receiver route | PR 2 ideally |
| **PR 6** | `feat(inbox): facebook live comments receive-only (Phase O-2)` | new receiver route | PR 5 |
| **PR 7** | `feat(parser): comment-to-booking 1-click conversion` | parser + UI | PR 5 + PR 6 + PR 2 |
| **PR 8** | `test(e2e): phase B mutation smoke harness` | Playwright spec + test data setup script | PR 2 + safe test data |

### Parallel vs serial

| Parallel | Serial |
|---|---|
| PR 2 + PR 3 (UI layout doesn't need schema) | PR 4 must follow PR 2 |
| PR 5 + PR 6 (different platforms) | PR 7 follows PR 5/6/2 |
| PR 8 follows PR 2 |

### Blockers tracker

| Item | Blocked on |
|---|---|
| Phase B mutation smoke | Boss explicit GO + safe test data + PR 2 ships |
| Add from Stock runtime | PR 2 + PR 3 ship |
| Parser comment-to-booking | PR 5 + PR 6 + PR 2 ship + parser policy approved |
| Outbound Messenger/WhatsApp/Telegram | Boss explicit GO on customer-facing message policy + PR 5/6 |
| Sidebar `/live-selling` redirect | After PR 3 + internal link audit + Boss approval per D-3 |

### Recommended next immediate action

After Boss/ChatGPT reviews this plan tomorrow:

1. If approved → start PR 2 implementation (separate task; this session is design only).
2. If revisions needed → revise this doc, recommit.
3. Either way: Phase B stays blocked.

---

## 10. Open decisions for Boss / ChatGPT

| ID | Decision | Default recommendation |
|---|---|---|
| **Q-11** | Add `BroadcastProduct.shopId` column at same time as nullable `liveSessionId`? Required because current model has no `shopId`. | YES — included in primary recipe |
| **Q-12** | `BroadcastProduct.liveSession` FK `onDelete` policy — keep `Cascade` or change to `SetNull`? | Keep `Cascade` for now; document risk |
| **Q-13** | Feature flag approach — 3 separate flags (recommended) vs 1 global flag? | 3 flags allow staged rollout |
| **Q-14** | Tier 1 UI ships before PR 2 (layout-only) or after PR 2? | Either OK; recommend ship PR 2 first to avoid placeholder copy churn |
| **Q-15** | `convertToOrder` zod schema — single schema with refine() vs discriminated union? | Single schema with refine() — less code churn |
| **Q-16** | New `verify-omnichannel-booking.ts` script — add now in PR 2 or later? | Add in PR 2 — better CI coverage from day one |
| **Q-17** | Source enum default for non-live POST when admin doesn't specify? | `MANUAL` (matches Boss intent for manual override) |
| **Q-18** | Multi-customer conversion (different customers in one bookingIds list) — hard reject 409 vs split into N orders? | Hard reject 409 (simpler; admin can pick one customer at a time) |
| **Q-19** | v1 + v2 key replay — when same bookingIds hit both paths, which Order is canonical? | First-write-wins; second call returns idempotent reference to first |
| **Q-20** | Production deploy phasing — all flags on at once or staged? | Staged per §8.6 |

---

## 11. Stop conditions check

Per Boss spec:

- ✅ Audit revealed schema/code can support Boss's non-live booking requirement via Option A primary path — no architectural blocker
- ✅ One concrete schema gap identified (`BroadcastProduct` missing `shopId`) — documented + recipe revised to add it
- ✅ No production data inspection requiring mutation or raw SQL
- ✅ No implementation code touched
- ⏸ Tier 1 UI implementation NOT started per D-7
- ⏸ Phase B NOT started per D-6
- ⏸ Add from Stock NOT started per D-5

---

## 12. Cross-references

- Tier 2 audit (committed `a90494d`): `docs/superpowers/2026-05-13-sale-schema-omnichannel-booking-audit.md`
- Tier 1 UX/IA plan (committed `2ad0761`): `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`
- V Rich gap analysis (committed `4aaca6b`): `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`
- Phase A closeout (committed `4aaca6b`): `docs/superpowers/2026-05-13-phase-a-closeout.md`
- Omnichannel inbound roadmap (committed earlier): `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md`
- Empty-queue bug followup (committed `4aaca6b`): `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md`

Code surface refs:
- BroadcastProduct schema: `prisma/schema.prisma` lines 897-919
- Booking schema: `prisma/schema.prisma` lines 921-986
- StockReservation: `prisma/schema.prisma` lines 213-229 (source-neutral ✅)
- Order: `prisma/schema.prisma` lines 286-322 (source-neutral ✅)
- bookingRepository: `src/server/repositories/booking.repository.ts`
- booking-rules helpers: `src/lib/sale/booking-rules.ts`
- sale schemas: `src/lib/validation/sale.schemas.ts`
- booking schemas: `src/lib/validation/booking.schemas.ts`
- Sale API map: `docs/sale-api-map.md`
