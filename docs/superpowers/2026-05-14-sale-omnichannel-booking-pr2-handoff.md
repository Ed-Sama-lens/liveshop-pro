# PR 2 handoff — Omnichannel Booking Migration (local feature branch)

**Status:** PR2_IMPLEMENTATION_READY (local only — NOT pushed to master; NOT deployed)
**Date:** 2026-05-14 (overnight design + implementation session)
**Author:** Claude Opus 4.7
**Branch:** `feat/sale-omnichannel-booking-pr2`
**Predecessor commits (master):**
- `a5d13e8` docs(sale): plan omnichannel booking migration
- `a90494d` docs(sale): audit omnichannel booking schema blockers
- `2ad0761` docs(sale): plan ux ia consolidation for omnichannel booking
- `4aaca6b` test(sale): preserve manual create phase-a smoke harness + docs

---

## 1. Branch + commit list

| Commit | Phase | Title |
|---|---|---|
| `f63a671` | 2 | chore(sale): add omnichannel booking feature flags |
| `0210e48` | 3 | schema(sale): add omnichannel booking compatibility migration |
| `b35703a` | 4 | test(sale): add booking conversion idempotency v2 rules |
| `d012ab2` | 5 | feat(sale): support flagged non-live manual bookings |
| `b50315f` | 6 | feat(sale): add bookingIds-only order conversion path |
| `9af3b17` | 7 | feat(sale): expose flagged omnichannel booking APIs |
| `ac44ea8` | 8 | feat(sale): preserve shop scope for broadcast products |
| `91d89ee` | 9 | test(sale): verify omnichannel booking flows locally |
| (this doc) | 11 | docs(sale): hand off omnichannel booking pr2 |

**9 commits total.** Local branch only. Master HEAD remains `a5d13e8`.

---

## 2. Exact files changed

### Schema + migration
- `prisma/schema.prisma` (M) — BroadcastProduct + Booking + Shop reverse relations
- `prisma/migrations/20260514000000_sale_omnichannel_booking/migration.sql` (A) — full SQL incl. partial unique index

### Feature flags
- `src/lib/env.ts` (M) — 3 new flags with `union(boolean, enum('true','false')).transform()`
- `src/lib/sale/feature-flags.ts` (A) — runtime helpers reading `process.env`
- `tests/unit/lib/sale/feature-flags.test.ts` (A) — 12 tests

### Idempotency
- `src/lib/sale/booking-rules.ts` (M) — `buildConversionIdempotencyKeyV2` helper added
- `tests/unit/lib/sale/booking-rules.test.ts` (M) — +8 v2 unit tests

### Repository
- `src/server/repositories/booking.repository.ts` (M)
  - `CreateManualBookingInput` interface: liveSessionId now optional + source/context optional fields
  - `createManual()`: non-live gate, cross-shop check via `BP.shopId` directly, source enum
  - `ConvertBookingsToOrderInput` interface: liveSessionId + customerId now optional
  - `convertToOrder()`: V2 dispatcher routes to `_convertToOrderV2()` when no liveSessionId+customerId
  - `_convertToOrderV2()`: new private method, full transactional bookingIds-only flow
  - `_generateOrderNumber()`: extracted helper for shop-scoped ORD-NNNNNN sequence

### Routes + Zod
- `src/lib/validation/booking.schemas.ts` (M) — `createBookingBodySchema` liveSessionId optional + source enum
- `src/lib/validation/sale.schemas.ts` (M) — `createOrderFromBookingsBodySchema` refine() for V1 vs V2
- `src/app/api/sale/bookings/route.ts` (M) — pass-through optional fields to repo
- `src/app/api/sale/orders/from-bookings/route.ts` (M) — V1/V2 dispatch + audit metadata
- `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` (M) — BP.shopId filter

### Verifier scripts
- `scripts/verify-booking-flow.ts` (M) — fixture shopId added (2 BP creates)
- `scripts/verify-booking-create.ts` (M) — fixture shopId added (5 BP creates)
- `scripts/verify-booking-conversion.ts` (M) — fixture shopId added (2 BP creates)
- `scripts/verify-order-reservation-cleanup.ts` (M) — fixture shopId added (1 BP create)
- `scripts/verify-omnichannel-booking.ts` (A) — new 5-case verifier

### Docs
- `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md` (A — this doc)

---

## 3. Schema diff summary

### BroadcastProduct
| Field | Before | After |
|---|---|---|
| `shopId` | (absent) | `String` NOT NULL + FK to Shop ON DELETE RESTRICT |
| `liveSessionId` | `String` NOT NULL | `String?` nullable |
| `liveSession` relation | required | `LiveSession?` nullable, FK ON DELETE CASCADE preserved for live-bound rows |
| `@@unique([liveSessionId, displayCode])` | unchanged (preserved for live-bound rows) | unchanged |
| Partial unique index (raw SQL) | — | `UNIQUE ("shopId", "displayCode") WHERE "liveSessionId" IS NULL` |
| `@@index([shopId])` | (absent) | new |

### Booking
| Field | Before | After |
|---|---|---|
| `liveSessionId` | `String` NOT NULL | `String?` nullable |
| `liveSession` FK | ON DELETE (default) | ON DELETE SET NULL |
| `@@index([shopId, source, status])` | (absent) | new cross-source index |

### Shop
| Field | Before | After |
|---|---|---|
| `broadcastProducts` reverse relation | (absent) | `BroadcastProduct[]` |

### Unchanged
- `StockReservation`, `Order`, `OrderItem`, `Payment`, `Shipment`, `BookingHistory`, `Customer`, `Conversation`, `Message`, `ChannelIdentity` — all source-neutral, unaffected.

---

## 4. Migration SQL summary

Path: `prisma/migrations/20260514000000_sale_omnichannel_booking/migration.sql`

9 steps with backfill safety guard:

1. ADD COLUMN `BroadcastProduct.shopId` TEXT (nullable initially)
2. UPDATE backfill from `LiveSession.shopId` via JOIN
3. DO $$ ... RAISE EXCEPTION ... $$ guard: abort if any NULL shopId remains post-backfill
4. ALTER COLUMN `shopId` SET NOT NULL
5. ADD CONSTRAINT FK `BroadcastProduct.shopId` → `Shop.id` ON DELETE RESTRICT
6. CREATE INDEX `BroadcastProduct_shopId_idx`
7. ALTER COLUMN `liveSessionId` DROP NOT NULL
8. CREATE UNIQUE INDEX `BroadcastProduct_shop_evergreen_displayCode_key` ... WHERE `liveSessionId` IS NULL (partial unique index — raw SQL)
9. DROP + RE-ADD FK `Booking.liveSessionId` ON DELETE SET NULL + DROP NOT NULL + CREATE INDEX `Booking_shopId_source_status_idx`

---

## 5. Partial unique index details

Postgres-native partial unique index:

```sql
CREATE UNIQUE INDEX "BroadcastProduct_shop_evergreen_displayCode_key"
  ON "BroadcastProduct"("shopId", "displayCode")
  WHERE "liveSessionId" IS NULL;
```

**Behavior:**
- Live-bound rows (`liveSessionId IS NOT NULL`): unaffected by this index. Existing `@@unique([liveSessionId, displayCode])` still enforces per-session uniqueness.
- Evergreen rows (`liveSessionId IS NULL`): enforced per-shop uniqueness on `displayCode`. Two evergreen rows in same shop with same `displayCode` reject.
- Different shops can have same evergreen `displayCode` — each shop's evergreen namespace is independent.

**Confirmed in local Docker `\d "BroadcastProduct"`:**
```
"BroadcastProduct_shop_evergreen_displayCode_key" UNIQUE, btree ("shopId", "displayCode") WHERE "liveSessionId" IS NULL
```

---

## 6. Feature flags + defaults

All default **false**. Boss flips per migration plan D1-D6 stages.

| Flag | Effect when true | Effect when false |
|---|---|---|
| `ALLOW_EVERGREEN_BROADCAST_PRODUCT` | Repository accepts BroadcastProduct with `liveSessionId: null` | Repository rejects evergreen-pointed bookings with ValidationError |
| `ALLOW_NON_LIVE_BOOKING` | Repository accepts `createManual` with `liveSessionId: null` | Repository rejects non-live bookings with ValidationError |
| `ALLOW_BOOKINGIDS_ONLY_CONVERSION` | Repository accepts V2 conversion path | Repository routes only V1 path |

12 unit tests verify flag behavior (default false, strict "true" match, misconfigured values reject, flags independent).

---

## 7. Repository changes

| Method | Change |
|---|---|
| `createManual` | Accepts optional `liveSessionId`, `source`, `conversationId`, `channelIdentityId`, `sourceMessageId`. Cross-shop check via `BP.shopId` (not `BP.liveSession.shopId`). Non-live path gated by flag. |
| `confirm` | Unchanged. Reads booking row which has nullable `liveSessionId` — works regardless. |
| `cancel` | Unchanged. Same reason. |
| `convertToOrder` | Dispatcher: routes to V1 legacy or V2 based on presence of `liveSessionId`+`customerId`. Throws ValidationError if neither path applies. |
| `_convertToOrderV2` | NEW private method. Fetches bookings by id within shop, validates same customer, builds V2 idempotency key, full transactional Order creation. Mirrors V1 invariants (reservation transfer, BookingHistory, OrderAudit). |
| `_generateOrderNumber` | NEW private helper. Shop-scoped ORD-NNNNNN sequence. Used by V2; V1 keeps inline logic until further refactor. |

---

## 8. API / Zod changes

### createBookingBodySchema
- `liveSessionId`: required → optional
- `source`: new optional, restricted to `['MANUAL']` (per Q-17, only MANUAL accepted from client; future inbound runtimes set source internally)

### createOrderFromBookingsBodySchema
- `liveSessionId` + `customerId`: required → optional
- `refine()`: enforces either (V1: both provided) OR (V2: both omitted). Schema readable + testable.

### POST /api/sale/bookings
- Pass-through optional liveSessionId + source to repository.
- Response `liveSessionId` coalesces `undefined → null` for stable JSON shape.

### POST /api/sale/orders/from-bookings
- Pass-through liveSessionId + customerId only when defined; repository dispatches V1 vs V2.
- ActivityLog metadata gains `conversionPath: 'v1' | 'v2'`.

### GET /api/sale/live-sessions/[id]/broadcast-products
- Added `BP.shopId` filter as defense-in-depth.

### Unchanged
- GET /api/sale/live-sessions — no change required
- GET /api/sale/bookings — Phase 7 deferred (would relax `liveSessionId` query param; out of PR 2 minimal scope)
- POST /api/sale/bookings/[id]/confirm — no change
- POST /api/sale/bookings/[id]/cancel — no change
- GET /api/sale/customers/search — no change

---

## 9. Tests added

| File | Cases | Coverage |
|---|---|---|
| `tests/unit/lib/sale/feature-flags.test.ts` | 12 | All 3 flags: default false, true on "true", false on "false", reject misconfig, flags independent |
| `tests/unit/lib/sale/booking-rules.test.ts` | +8 (v2 section) | v2 idempotency key: deterministic, sorted, shop/customer/booking-set discrimination, v1+v2 no-collide |

Existing tests (booking rules / sale routes / manual-create helpers) unchanged. PR 2 changes are backward-compatible at the API + helper layer.

---

## 10. Verifiers added/updated

| Script | Before PR 2 | After PR 2 |
|---|---|---|
| `verify-booking-flow.ts` | 9/9 | 9/9 (fixture shopId added) |
| `verify-booking-create.ts` | 13/13 | 13/13 (fixture shopId added) |
| `verify-booking-conversion.ts` | 8/8 | 8/8 (fixture shopId added) |
| `verify-order-reservation-cleanup.ts` | 5/5 | 5/5 (fixture shopId added) |
| `verify-expire-reservations-cron.ts` | 1/1 | 1/1 (unchanged) |
| `verify-omnichannel-booking.ts` | (absent) | **NEW** 5/5 (A: non-live create, B: confirm reserves, C: cancel releases, D: V2 convert, E: V2 replay idempotent) |
| **TOTAL Docker E2E** | 36/36 | **41/41** |

---

## 11. Local Docker migration result

```
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy

Applying migration `20260514000000_sale_omnichannel_booking`

The following migration(s) have been applied:

migrations/
  └─ 20260514000000_sale_omnichannel_booking/
    └─ migration.sql

All migrations have been successfully applied.
```

Schema verified via `\d "BroadcastProduct"` and `\d "Booking"` — all expected indexes + constraints present.

---

## 12. Local verifier result

All 5 verifiers + cron + new omnichannel verifier pass against local Docker DB:

```
verify-booking-flow:               9/9 PASS
verify-booking-create:            13/13 PASS
verify-booking-conversion:         8/8 PASS
verify-order-reservation-cleanup:  5/5 PASS
verify-expire-reservations-cron:   1/1 PASS
verify-omnichannel-booking:        5/5 PASS
                              ─────────────
                              41/41 TOTAL PASS
```

---

## 13. Full test result

```
npx vitest run

Test Files  41 passed (41)
Tests       821 passed (821)
Duration    44.65s
```

Pre-PR-2 master: 801/801 across 40 files.
Post-PR-2 branch: **821/821 across 41 files** (+20 net: +12 flag tests + +8 v2 idempotency tests).

`npx tsc --noEmit`: clean (only 2 pre-existing socket errors at `tests/unit/server/socket/index.test.ts:112` — out of PR 2 scope).

Mutation grep: 4 POSTs unchanged (Confirm + Cancel + CreateOrder + ManualCreate).

---

## 14. Known unresolved items

| Item | Notes |
|---|---|
| GET `/api/sale/bookings` cross-source filter | Not yet relaxed. Currently still requires `liveSessionId` query param. Optional Phase 7+ work — small. Defer to PR 3 UI or follow-up. |
| Tier 1 UI consolidation (sidebar / sub-tabs / source filter chips) | Not in PR 2 scope. See `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`. Can ship in PR 3 in parallel with PR 2 deploy. |
| Add from Stock route (POST evergreen BP) | Tier 3 (separate PR after PR 2 deploys). |
| Inbound webhook receivers (Messenger / FB Live / Post comment / Telegram / WhatsApp) | Tier 4 (Phase O-1..O-6). |
| Parser + 1-click comment-to-booking | Tier 5 (after Tier 4). |
| `/live-selling` 308 redirect | Tier 1 UI work; blocked on internal-link audit per D-3. |
| Pre-existing socket test TS errors | Out of PR 2 scope (Boss confirmed earlier). |
| V1 inline `_generateOrderNumber` cleanup | V1 still has its own inline logic; not unified with new `_generateOrderNumber` helper. Cosmetic cleanup deferred. |

---

## 15. Production deployment plan (D1-D6)

Per Boss/ChatGPT Q-20.

### D1 — schema migration only
- Railway snapshot taken + recorded
- Push branch → merge PR → Vercel auto-deploy
- All 3 flags default false on Vercel (no env var change required since defaults to false)
- Verify Railway DB applied migration:
  - Railway dashboard → Postgres → query: `SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5`
  - Verify `20260514000000_sale_omnichannel_booking` present
- Run 15-probe production smoke
- Expect: 15/15 pass, no behavior change

### D2 — wait + observe (24h minimum)
- Watch Vercel error logs for unexpected 500s on /api/sale/* routes
- Verify no production data corruption signals (Booking row count stable, no spike in reservation integrity badges)

### D3 — flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`
- Vercel env: add new env var, redeploy
- Manual smoke: ChatGPT-supplied script POSTs to staging-equivalent test data with bookingIds-only body; assert Order created with v2 idempotency key
- Replay test: 2nd POST same bookingIds → assert idempotent

### D4 — flip `ALLOW_NON_LIVE_BOOKING=true`
- Vercel env: add new env var, redeploy
- Manual smoke: POST /api/sale/bookings without liveSessionId (Boss test customer + Boss test evergreen BP — but evergreen still blocked by D6 flag, so no path yet)
- Actually deferred until D6 below, since non-live booking requires evergreen BP

### D5 — Tier 1 UI ships (parallel work, optional)
- PR 3 UI/IA consolidation — layout-only refresh, source-filter chips, source-aware empty states
- Production smoke 15/15

### D6 — flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`
- Vercel env: add new env var, redeploy
- Tier 3 PR adds Add from Stock route + UI
- Manual smoke: create evergreen BP via new route, then POST non-live booking against it, then V2 convert

Each stage independent + reversible via flag flip-off + Vercel redeploy.

---

## 16. Rollback plan

### Stage rollback (flag false)
Any time after D3-D6: flip flag false in Vercel env, redeploy. New behavior gated off; existing data unaffected.

### Schema rollback (only if no null/evergreen rows)
```sql
-- Verify no production rows would violate
SELECT count(*) FROM "Booking" WHERE "liveSessionId" IS NULL; -- must be 0
SELECT count(*) FROM "BroadcastProduct" WHERE "liveSessionId" IS NULL; -- must be 0

-- Rollback
ALTER TABLE "Booking" ALTER COLUMN "liveSessionId" SET NOT NULL;
DROP INDEX "BroadcastProduct_shop_evergreen_displayCode_key";
ALTER TABLE "BroadcastProduct" ALTER COLUMN "liveSessionId" SET NOT NULL;

-- shopId column kept (backfilled values still accurate)
```

### Worst case
Restore from Railway snapshot. Last-resort option, requires acceptable downtime window.

---

## 17. Data safety review

### Backfill safety
- `BroadcastProduct.shopId` populated from `LiveSession.shopId` via single UPDATE before NOT NULL constraint applied
- DO $$ ... RAISE EXCEPTION ... $$ guard aborts migration if any row remains NULL
- Local Docker dry-run succeeded with `migration applied successfully`
- No existing row has `liveSessionId IS NULL` (all created under pre-PR-2 schema), so partial unique index immediately satisfied
- No existing Booking row has `liveSessionId IS NULL`, so nullable change is invisible to existing data

### Order safety
- Order schema unchanged
- StockReservation schema unchanged
- BookingHistory schema unchanged
- Reservation integrity badge (`OK/MISSING/MULTIPLE/NOT_APPLICABLE`) logic unchanged
- Storefront checkout — untouched
- Payment / slip / shipment — untouched

### Idempotency safety
- V1 keys remain valid on existing Orders (`sale-conv:{shopId}:{liveSessionId}:{customerId}:{hash}`)
- V2 keys cannot collide (different prefix `sale-conv:v2:...`)
- `Order.idempotencyKey @unique` constraint preserves duplicate-Order protection within each namespace
- Repository first-write-wins on rare v1+v2 race against same bookingIds

---

## 18. PII safety review

- No change to customer search response shape (`GET /api/sale/customers/search` still returns whitelist: customerId, name, phone, email, isBanned, orderCount)
- No new fields exposed in booking response
- Raw FB IDs / platform identifiers never surfaced in any new code path
- New `Booking.source` enum value stays internal except in admin-facing response (`MANUAL` only acceptable from client; LIVE_COMMENT / MESSENGER_INBOX / etc reserved for future trusted internal runtimes per Q-17)

---

## 19. What remains blocked

| Item | Reason |
|---|---|
| **Phase B** mutation smoke | Boss D-6 reaffirmed. Requires explicit Boss GO + safe test data IDs + separate spec with `PHASE_B_APPROVED=yes` gate. |
| **Add from Stock runtime** | Tier 3 PR depends on PR 2 deploy + D6 flag flip. |
| **Parser / comment-to-booking** | Tier 5 PR depends on Tier 4 inbound runtime (Phase O-1..O-6) + Tier 2 schema (this PR). |
| **Messenger / WhatsApp / Telegram inbound** | Tier 4 PRs. |
| **Outbound customer-facing messages** | Boss explicit policy approval required. |
| `/live-selling` 308 redirect | Tier 1 UI; depends on internal-link audit per D-3. |

---

## 20. Boss/ChatGPT decisions needed before merge/deploy

| ID | Question |
|---|---|
| **M-1** | Approve branch push to GitHub? (no production impact — feature branch only) |
| **M-2** | Approve merge of `feat/sale-omnichannel-booking-pr2` into `master` after PR review? |
| **M-3** | Approve production deploy (D1: schema migration only, flags all false)? |
| **M-4** | Approve D3 flag flip (`ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`)? Requires safe test data IDs for v2 conversion smoke. |
| **M-5** | Approve D6 flag flip (`ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`)? Requires Tier 3 Add from Stock PR shipping first. |
| **M-6** | Approve Tier 1 UI consolidation PR (parallel with PR 2)? |
| **M-7** | Approve Phase B unblock after D3 flag stable? Requires safe test data IDs. |

---

## 21. Production safety recap

- ❌ No production DB mutation
- ❌ No Railway migration (only local Docker)
- ❌ No authenticated production POST
- ❌ No production booking / Confirm / Cancel / Create Order
- ❌ No Vercel env modification
- ❌ No master push (feature branch only)
- ❌ No emergency scripts committed (3 remain local-only)
- ❌ No storageState / screenshots / test artifacts / secrets committed
- ❌ No pak-ta-kra touched

---

## 22. Cross-references

- Tier 2 audit (committed master `a90494d`): `docs/superpowers/2026-05-13-sale-schema-omnichannel-booking-audit.md`
- PR 2 design plan (committed master `a5d13e8`): `docs/superpowers/2026-05-13-sale-omnichannel-booking-migration-plan.md`
- Tier 1 IA plan (committed master `2ad0761`): `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`
- V Rich gap analysis (committed master `4aaca6b`): `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`
- Phase A closeout (committed master `4aaca6b`): `docs/superpowers/2026-05-13-phase-a-closeout.md`
- Empty-queue bug followup (committed master `4aaca6b`): `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md`
- Omnichannel inbound roadmap (committed earlier): `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md`
