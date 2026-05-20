-- ═══════════════════════════════════════════════════════════════════════
-- Tier 3.9 — Sale Date Grouping Migration
-- ═══════════════════════════════════════════════════════════════════════
--
-- Adds Sale Date (วันที่ขาย) as the primary grouping context for
-- product codes. Replaces the previous liveSession-bound vs evergreen
-- split with a date-first model that matches V Rich App's calendar
-- selling-day UX.
--
-- Design contract documented in:
--   docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md
--
-- This migration is APPROVED per Boss + ChatGPT verdict on D-Date-1
-- through D-Date-10 (review session 2026-05-21).
--
-- Deploy path: NOT auto-applied by Vercel. Boss must run
--   `DATABASE_URL=<railway-url> npx prisma migrate deploy`
-- manually after PR merges to master. See migration safety audit doc.
--
-- Steps:
--   1. Add Shop.timezone (default Asia/Kuala_Lumpur)
--   2. Add BroadcastProduct.saleDate (nullable DATE)
--   3. Add index (shopId, saleDate) for filtered queries
--   4. Backfill live-bound rows from LiveSession dates
--   5. Backfill non-live rows from BroadcastProduct.createdAt
--   6. Drop legacy evergreen partial unique
--   7. Add new partial unique (shopId, saleDate, displayCode)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- Step 1: Add Shop.timezone (default Asia/Kuala_Lumpur per D-Date-2).
-- Fast Postgres metadata + default-fill operation.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Shop"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

-- ─────────────────────────────────────────────────────────────────────
-- Step 2: Add BroadcastProduct.saleDate (nullable DATE).
-- Nullable for safe backfill; Untagged rows render as fallback UI group
-- per D-Date-4. Quick-create writes today (shop timezone) per D-Date-5.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "BroadcastProduct"
  ADD COLUMN "saleDate" DATE;

-- ─────────────────────────────────────────────────────────────────────
-- Step 3: Index for date-filtered queries before backfill so UPDATE
-- can use it. shopId is partition key; saleDate is filter axis.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX "BroadcastProduct_shopId_saleDate_idx"
  ON "BroadcastProduct"("shopId", "saleDate");

-- ─────────────────────────────────────────────────────────────────────
-- Step 4: Backfill live-bound BroadcastProducts (liveSessionId IS NOT
-- NULL) using LiveSession.startedAt ?? scheduledAt ?? bp.createdAt,
-- normalized to shop timezone. Per D-Date-6 verdict.
-- ─────────────────────────────────────────────────────────────────────
UPDATE "BroadcastProduct" bp
SET "saleDate" = DATE(
  COALESCE(ls."startedAt", ls."scheduledAt", bp."createdAt")
    AT TIME ZONE COALESCE(s."timezone", 'Asia/Kuala_Lumpur')
)
FROM "LiveSession" ls, "Shop" s
WHERE bp."liveSessionId" = ls."id"
  AND bp."shopId" = s."id"
  AND bp."saleDate" IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 5: Backfill non-live BroadcastProducts (liveSessionId IS NULL)
-- using bp.createdAt normalized to shop timezone. Per D-Date-3.
-- ─────────────────────────────────────────────────────────────────────
UPDATE "BroadcastProduct" bp
SET "saleDate" = DATE(
  bp."createdAt" AT TIME ZONE COALESCE(s."timezone", 'Asia/Kuala_Lumpur')
)
FROM "Shop" s
WHERE bp."liveSessionId" IS NULL
  AND bp."shopId" = s."id"
  AND bp."saleDate" IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 6: Drop legacy evergreen partial unique index. saleDate now
-- replaces "evergreen" as primary grouping; the old WHERE liveSessionId
-- IS NULL constraint no longer matches the new model.
-- ─────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "BroadcastProduct_shop_evergreen_displayCode_key";

-- ─────────────────────────────────────────────────────────────────────
-- Step 7: New partial unique index (shopId, saleDate, displayCode)
-- WHERE saleDate IS NOT NULL. Per D-Date-4:
--   - Same code reusable across different sale dates (CM1 today,
--     CM1 tomorrow — allowed).
--   - Within (shop, saleDate), displayCode must be unique.
--   - Untagged (saleDate IS NULL) rows are NOT uniqueness-enforced —
--     admin bulk-assigns saleDate before relying on uniqueness.
-- ─────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "BroadcastProduct_shop_saleDate_displayCode_key"
  ON "BroadcastProduct"("shopId", "saleDate", "displayCode")
  WHERE "saleDate" IS NOT NULL;
