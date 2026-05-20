# Tier 3.9 — Sale Date Context Addendum (Phase 0 update)

**Filed:** 2026-05-21
**Author:** Claude (Sonnet) under Boss + ChatGPT supervision
**Supersedes:** Tier 3.9 Phase 0 audit Q3 / Q5 verdicts; new Q-Date-1 through Q-Date-10 added
**Status:** Audit only — no runtime changes
**Master HEAD at audit time:** `9657be9` (PR #45 merged)
**Baseline:** `npx tsc --noEmit` EXIT=0, `npm run lint` 0 errors / 58 warnings

This addendum reframes the Tier 3.9 product-code model from
`liveSession-bound vs evergreen` to **Sale Date / วันที่ขาย** as primary
context, per Boss + ChatGPT review of the V Rich App date-based sale page
(reference video: `sale tab example/date/date system.mp4`).

LiveSession becomes an **optional event channel** inside a selling day,
not the parent of product codes. Inbox / Post Comment / Manual /
Messenger / Telegram / WhatsApp / future unified chat all attach to the
**selected sale date**, not to a liveSession.

---

## 1. Decision restatement

**Primary context model (target):**

```
SaleDate (วันที่ขาย, e.g. 2026-05-21)
├── ProductCode pills (BD3, BD4, CM1, CM2...)
│   ├── linked Product/Variant
│   ├── stock + price
│   └── slots = stock qty
└── Channels (filters/feeds under that date)
    ├── LiveSession[] (optional, 0..N)
    ├── Inbox messages
    ├── Post comments
    ├── Manual bookings
    ├── Telegram chat (future)
    ├── WhatsApp chat (future)
    └── Unified chat (future)
```

**Why this beats the previous model:**
- A single product code (e.g. CM1) can be used across multiple channels in one selling day, without owning a liveSession.
- Boss reuses code series (CM1-CM100) on different sale dates, expected behavior.
- Inbox/Post/Manual bookings on a non-live day still group under a date.
- V Rich App matches this pattern.

---

## 2. Q-Date-1 — Existing date fields for grouping Product Codes

**Existing date columns audited:**

| Model | Field | Type | Purpose | Date-grouping fit |
|---|---|---|---|---|
| `LiveSession` | `scheduledAt`, `startedAt`, `endedAt` | DateTime? | Live event start/end | ❌ Live-only. No non-live day. |
| `BroadcastProduct` | `createdAt`, `updatedAt` | DateTime | Row provenance | ⚠️ Could derive day via `date_trunc('day', createdAt)` — ambiguous and tied to admin creation timing, not selling day. |
| `Booking` | `createdAt`, `confirmedAt`, `cancelledAt`, `expiresAt`, `releasedAt` | DateTime | Booking lifecycle | ❌ Booking-level, not code-level. |
| `Order` | `reservedAt`, `confirmedAt`, `packedAt`, `shippedAt`, `deliveredAt` | DateTime | Order lifecycle | ❌ Order-level. |

**Verdict Q-Date-1:** **No existing field maps cleanly to "selling day".** Closest is `BroadcastProduct.createdAt` which is admin creation time, not Boss-curated selling day. LiveSession dates are live-only.

---

## 3. Q-Date-2 — Can quick-created evergreen codes be given/derived saleDate today without schema migration?

**Current Tier 3.8 quick-create writes:**
```ts
{
  liveSessionId: null,
  createdAt: <now()>,
  ...
}
```

**Without schema migration, options:**

- **Derive from `createdAt`:** treat `date_trunc('day', createdAt, 'Asia/Kuala_Lumpur')` as the saleDate. **Ambiguous** — admin can create a code at 23:55 intended for tomorrow's sale and the timezone-floored `createdAt` puts it on today; admin can also create on Monday for Tuesday's sale.
- **Force admin to set saleDate at creation:** requires a new column to store it or repurpose another field.
- **Use LiveSession.scheduledAt:** requires every code to attach to a LiveSession, which is exactly the model Boss rejected.

**Verdict Q-Date-2:** **No safe non-migration path.** A `createdAt`-based interim grouping works for read-only listings but breaks if admin pre-creates codes for tomorrow. Recommendation: stop and propose schema option BEFORE PR 3.9-B.

---

## 4. Q-Date-3 — Timezone for saleDate

**Existing app timezone handling audited:**

- `Shop` model: **no `timezone` field.** Currency is `defaultCurrency` (default `"THB"`, overridden to `"MYR"` at branding API).
- `package.json`: no `date-fns` / `dayjs` / `luxon` / `moment` installed.
- Date rendering: app uses browser-local `new Date(x).toLocaleDateString()` (7 files, e.g. `src/components/orders/OrderTable.tsx:97`).
- Server-side: no timezone normalization anywhere.

**Risk:** Two admins in different timezones see different "today" boundaries.

**Recommendation:**
- Add `timezone` column to Shop (default `"Asia/Kuala_Lumpur"` for Nazha Hatyai based on FB Page locale).
- All saleDate calculations server-side using shop timezone.
- Client passes ISO `YYYY-MM-DD` string; server interprets in shop timezone.

**Verdict Q-Date-3:** **Shop timezone needed.** Default `Asia/Kuala_Lumpur` per Boss being MY-based. Requires a new Shop column → **schema migration**.

---

## 5. Q-Date-4 — Should product-code uniqueness become `shop + saleDate + displayCode`?

**Current uniqueness constraints:**

```
@@unique([liveSessionId, displayCode])                              -- live-bound
@@unique([shopId, displayCode]) WHERE liveSessionId IS NULL         -- evergreen (partial SQL)
```

**If saleDate becomes primary context, the target uniqueness is:**

```
@@unique([shopId, saleDate, displayCode])                           -- code unique per shop+day
```

This allows:
- CM1 on 2026-05-21 ≠ CM1 on 2026-05-22 (Boss's V Rich workflow)
- Same CM1 can be used Mon for Mon's customers, then Tue for fresh Tue customers

**Verdict Q-Date-4:** **Yes**, target uniqueness should be `(shopId, saleDate, displayCode)`. **Requires schema migration** to drop the partial index + add new column + new unique index. Existing rows need a backfill strategy.

---

## 6. Q-Date-5 — Should CM1 today and CM1 tomorrow be allowed?

**Direct consequence of Q-Date-4 verdict.**

**Verdict Q-Date-5:** **Yes**, allowed. Boss's workflow reuses code series. Matches V Rich App behavior. **Requires `(shopId, saleDate, displayCode)` unique index per Q-Date-4.**

---

## 7. Q-Date-6 — Stock ProductVariant reuse across multiple sale dates

**Current model:** BroadcastProduct.variantId is FK to ProductVariant. Variant carries stock (`quantity` + `reservedQty`).

**Scenario:** Same variant (e.g. SKU `BD-001-V1`) used as BD4 on Monday and as BD4 on Tuesday.

**Options:**

- **Option a — Multiple BroadcastProduct rows pointing to same variant.** Stock is shared (sum of qty across days = total variant qty). Admin sees per-day code; reservations decrement variant.quantity globally. Simplest, current Variant model holds.
- **Option b — Per-day stock allocation.** Each BroadcastProduct row carries its own `allocatedQuantity` separate from variant.quantity. Decrements happen at BP level, not variant. Variant becomes pure catalog data.

**Verdict Q-Date-6:** **Option a (multiple BP rows, shared variant stock)** is simpler and matches existing model. Bookings reserve via variant.reservedQty as today; saleDate-grouping doesn't change stock semantics. Recommendation: keep variant as stock-of-record, add saleDate to BP.

---

## 8. Q-Date-7 — Existing quick-created rows with `liveSessionId = null` and no saleDate

**Existing data:** Boss has already quick-created CM1-CM10 in production via Tier 3.8 evergreen path. These have `liveSessionId = null` and no saleDate field.

**Backfill strategy options:**

- **Backfill from `createdAt`:** SQL `UPDATE BroadcastProduct SET "saleDate" = DATE("createdAt" AT TIME ZONE 'Asia/Kuala_Lumpur') WHERE "saleDate" IS NULL AND "liveSessionId" IS NULL`. Works but ties row to admin clock; if admin created tomorrow's codes today, it's wrong.
- **Backfill to "today" at migration time:** Treat the migration moment as the canonical sale date for all evergreen orphans. Boss-controllable via SQL constant.
- **Leave nullable + UI default to today:** Existing rows show under "Untagged" or "Today" until Boss assigns a real saleDate via inline edit.

**Verdict Q-Date-7:** Add `saleDate Date?` nullable; UI defaults to today in shop timezone for new creates; existing orphans shown under "Untagged" with one-shot bulk-assign action. **Migration ships with safe NULL backfill.**

---

## 9. Q-Date-8 — Model options

### Option A — Use existing LiveSession date temporarily
- Product codes still attach to LiveSession internally; UI shows date selector.
- Lower migration cost.
- ❌ **Rejected.** Forces every code to a liveSession even when no live exists. Inbox/Post/Manual become hacks. Boss explicitly rejected this UX.

### Option B — Add `saleDate Date?` column to BroadcastProduct
- Direct field on BroadcastProduct. Cheap migration (one column + partial unique index drop + new unique index).
- ✅ **Recommended.** Date-first, simplest model that lands the feature.
- Bookings/orders still reference BP via FK; saleDate is implicit through BP join.
- Drawback: every BP row carries the date redundantly when grouped UI fetches.

### Option C — New `SaleDay` / `SaleContext` table
- One row per (shopId, saleDate). BroadcastProduct + LiveSession + Booking all FK to SaleContext.
- Future-proof for multi-channel attribution.
- ❌ **Higher migration cost.** Adds 2-3 layers of JOIN. Requires backfill creating SaleContext rows for every distinct (shopId, day) combo found in existing rows.
- Risk: over-engineering for current need.

### Option D — Keep evergreen + filter by createdAt date
- No migration.
- ❌ **Rejected per Q-Date-2.** Ambiguous, forces admin clock = selling day equality.

### Hybrid option (E) — Option B now + Option C later
- Ship Option B (BroadcastProduct.saleDate column) for PR 3.9-B-onwards.
- Defer SaleContext table to Tier 4+ when Inbox/Post parsers need first-class day attribution for analytics.

**Verdict Q-Date-8:** **Option B + future hybrid E.** Cheap migration now; door open for SaleContext table later if multi-channel analytics demand it.

---

## 10. Q-Date-9 — Interim UI defaulting to today, no migration blocker

**Goal:** Can the `/sale` page UI introduce date picker + default-to-today read flow WITHOUT migrating schema yet?

**Answer:** Partially. UI can render a date picker locally. The fetch endpoint can accept `?saleDate=YYYY-MM-DD`. But the **backend must have a real date column to filter against**, otherwise the date picker is decorative.

**Interim option (decorative, deferrable to Boss):**
- UI shows date picker; defaults to today (Asia/Kuala_Lumpur).
- Backend ignores `saleDate` param for evergreen rows (returns all evergreen for shop).
- Tier 3.10 board UI built date-first; backend filtering activates after migration.

**Verdict Q-Date-9:** **Interim is possible but misleading.** Recommend NOT shipping a date picker until backend filtering is real. Adds confusion to "why did the filter not work?" debugging.

---

## 11. Q-Date-10 — Effect on Booking, StockReservation, Order, slot board

- **Booking:** unchanged structurally. Booking → BroadcastProduct (FK). saleDate is implicit via BP.saleDate. May want `Booking.saleDate` denormalized for fast queries (NOT in PR 3.9-B).
- **StockReservation:** unchanged. Variant-level reservation is timezone-agnostic.
- **Order:** unchanged. Order.reservedAt is the legal record. saleDate of related BPs is for sale-board UI grouping.
- **Slot board (Tier 3.10):** lives under date picker. Pill row = `BroadcastProduct[]` filtered by `saleDate = picker.value`. Slot expansion = `Booking[]` joined via BP.id.

**Verdict Q-Date-10:** **No downstream model breaks.** saleDate is additive on BroadcastProduct only. Bookings/Orders/Reservations carry no new fields in PR 3.9-B.

---

## 12. Migration sketch (if Option B approved)

```sql
-- Migration: 20260521_add_sale_date_to_broadcast_product

-- Step 1: Add Shop.timezone column.
ALTER TABLE "Shop"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

-- Step 2: Add BroadcastProduct.saleDate (nullable).
ALTER TABLE "BroadcastProduct"
  ADD COLUMN "saleDate" DATE;

-- Step 3: Backfill existing rows from createdAt in shop timezone.
-- Safe NULL fallback: orphans show under "Untagged" in UI.
UPDATE "BroadcastProduct" bp
SET "saleDate" = DATE(bp."createdAt" AT TIME ZONE COALESCE(
  (SELECT "timezone" FROM "Shop" WHERE "id" = bp."shopId"),
  'Asia/Kuala_Lumpur'
))
WHERE bp."saleDate" IS NULL;

-- Step 4: Drop old partial unique index for evergreen.
DROP INDEX IF EXISTS "BroadcastProduct_shop_evergreen_displayCode_key";

-- Step 5: New unique index on (shopId, saleDate, displayCode).
-- Partial: only enforced when saleDate IS NOT NULL.
-- Untagged rows (saleDate NULL) are NOT uniqueness-enforced — admin
-- must bulk-assign before relying on uniqueness.
CREATE UNIQUE INDEX "BroadcastProduct_shop_saleDate_displayCode_key"
  ON "BroadcastProduct"("shopId", "saleDate", "displayCode")
  WHERE "saleDate" IS NOT NULL;

-- Step 6: Keep existing live-bound unique: (liveSessionId, displayCode).
-- Live-bound codes still unique within a session — independent of saleDate.

-- Step 7: Index for date-filtered queries.
CREATE INDEX "BroadcastProduct_shopId_saleDate_idx"
  ON "BroadcastProduct"("shopId", "saleDate");
```

**Migration footprint:** 2 new columns, 1 partial unique index drop, 1 new partial unique index, 1 new btree index, 1 UPDATE for backfill. Postgres handles this as ALTER COLUMN + ADD COLUMN metadata operations (fast for the column adds; the backfill UPDATE is full-table scan and may be slow on production volumes).

**Verdict on migration safety:**
- R1 — costly. Schema change. Must dissent + Boss verdict before applying.
- Backfill is a single UPDATE that scales linearly with BroadcastProduct row count. Production volume currently small (<1000 rows). Safe.
- Backfill timing-sensitive: admin's pre-created codes for tomorrow get tagged with today's date. Boss may need to manually re-assign — non-destructive (saleDate is just a label).

---

## 13. Updated PR 3.9-B scope (if Option B approved)

**PR 3.9-B becomes:**

```
feat(sale): add saleDate-based product code grouping (PR-B / Tier 3.9)
```

Scope:
1. Migration `20260521_add_sale_date_to_broadcast_product` (Shop.timezone + BroadcastProduct.saleDate + new unique + backfill).
2. Update `broadcastProductRepository.list` to accept `saleDate` filter param.
3. Update `quickProductCodesRepository.createBulk` to write `saleDate` (default to today in shop timezone if not provided).
4. New `GET /api/sale/broadcast-products?saleDate=YYYY-MM-DD&liveSessionId=[optional]` (saleDate-first filter).
5. UI changes:
   - `SaleWorkspaceShell` adds date picker; defaults to today (shop timezone).
   - Product Codes panel fetches by saleDate, not liveSessionId.
   - LiveSession picker becomes optional channel filter under selected date.
   - On quick-create success → refetch by date.
6. Tests for date filter + backfill correctness.
7. Schema test for new unique constraint.

**Estimated LOC:** ~500 (was ~120 for liveSession-only approach).
**Risk level:** R1 (schema migration).
**Schema migration:** YES — requires Boss verdict before code starts.

---

## 14. Stop conditions

Per work order step 5:

> If migration is required: Do not implement PR 3.9-B yet. Instead report migration choices and wait for Boss/ChatGPT approval.

**Migration IS required** per Q-Date-2 + Q-Date-4 verdicts. **STOPPING after this addendum** per directive. Reporting migration options to Boss + ChatGPT for verdict.

---

## 15. Boss / ChatGPT decisions needed before PR 3.9-B code starts

| Decision | Options | Recommendation |
|---|---|---|
| D-Date-1 | Migration approach: Option A / B / C / D / E hybrid | **Option B** (add `saleDate` to BroadcastProduct + Shop.timezone) |
| D-Date-2 | Timezone default for Shop.timezone column | `Asia/Kuala_Lumpur` (Nazha Hatyai, MY-based) |
| D-Date-3 | Backfill strategy for existing evergreen rows | Backfill from `createdAt` AT TIME ZONE shop.timezone (with NULL fallback) |
| D-Date-4 | UI behavior for `saleDate IS NULL` rows | Show under "Untagged" group with bulk-assign action |
| D-Date-5 | Quick-create default saleDate | Today in shop timezone; admin can override via date picker |
| D-Date-6 | Existing live-bound BPs (have liveSessionId) — assign saleDate? | Yes, backfill from `LiveSession.startedAt ?? scheduledAt ?? createdAt` AT TIME ZONE shop.timezone |
| D-Date-7 | Should AddFromStock multi-add (PR 3.9-C) take saleDate from picker? | Yes, inherits from UI date picker context |
| D-Date-8 | Should `/inventory/new` (PR 3.9-D) also expose saleDate? | No — inventory creates Product+Variant (stock catalog), not BroadcastProduct (sale codes). Defer. |
| D-Date-9 | Tier 3.10 board strictly gated on PR 3.9-B migration | Yes per work order |
| D-Date-10 | If Boss approves Option B, can backfill happen automatically on Vercel deploy? | Yes — Prisma migrate is auto on deploy. Backfill UPDATE is part of migration SQL. Boss must approve before merge. |

---

## 16. What this addendum does NOT do

- Does NOT modify schema (audit-only).
- Does NOT implement date picker UI.
- Does NOT migrate any data.
- Does NOT change Vercel/Railway env.
- Does NOT change feature flags.
- Does NOT touch pak-ta-kra.
- Does NOT propose Tier 3.10 implementation (still gated on PR 3.9-B + Boss verdict).

---

## 17. Verification baseline

```
$ npx tsc --noEmit
EXIT=0 (silent)

$ npm run lint
0 errors / 58 warnings (pre-existing, no regression)

$ git log --oneline -3
9657be9 docs(sale): Tier 3.9 Phase 0 audit + 3.9/3.10 backlogs (PR-A) (#45)
0124caf docs(sale): Tier 3.8 backlogs + implementation handoff (PR-D)
d4e9006 feat(sale): quick bulk product code creation (PR-B + verifier / Tier 3.8)

$ git status --short
?? docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md
?? sale tab example/
?? test note/
```

No production mutation. No env change. No flag flip. No code edits. Pak-ta-kra untouched.

---

## 18. Sign-off

Addendum ready for Boss + ChatGPT review.

**Recommendation: APPROVE Option B + D-Date-1 through D-Date-10 defaults.**

**Migration WILL be required** for PR 3.9-B. Awaiting Boss + ChatGPT verdict before opening PR 3.9-B implementation branch.

If Boss + ChatGPT reject Option B and want Option C (new SaleContext table) instead, the migration footprint grows ~3× and PR 3.9-B becomes much larger — possibly should split into 3.9-B (migration only) + 3.9-B2 (UI rewire).

If Boss rejects all migration paths, **the date-first UX cannot ship safely** and Tier 3.9 stays at the liveSession/evergreen UI it was before. This is the fallback if migration is not approved.
