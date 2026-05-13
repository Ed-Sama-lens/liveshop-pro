-- Omnichannel booking compatibility migration (PR 2 / AR-1 + AR-2)
--
-- This migration:
--   AR-1: Add BroadcastProduct.shopId + backfill from LiveSession.shopId
--         + relax BroadcastProduct.liveSessionId to nullable + add
--         partial unique index for evergreen codes.
--   AR-2: Relax Booking.liveSessionId to nullable + add cross-source
--         index (shopId, source, status).
--
-- Production rollout (per migration plan D1-D6):
--   D1 ships this migration. All feature flags default false so
--   nullable columns stay populated by existing code paths. Behavior
--   change only activates when flags flip.
--
-- Rollback safety:
--   - Adding nullable column + backfill + SET NOT NULL is reversible
--     before any evergreen row is inserted.
--   - DROP NOT NULL on existing required column is reversible only
--     if no NULL rows exist (use ALTER COLUMN SET NOT NULL).
--   - Partial unique index is droppable independently.

-- ─────────────────────────────────────────────────────────────────────
-- Step 1: AR-1 prep — add BroadcastProduct.shopId as nullable
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "BroadcastProduct" ADD COLUMN "shopId" TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- Step 2: Backfill BroadcastProduct.shopId from LiveSession.shopId
-- All existing rows have non-null liveSessionId, so this UPDATE
-- populates every row in a single statement. Sub-second on realistic
-- catalog sizes.
-- ─────────────────────────────────────────────────────────────────────
UPDATE "BroadcastProduct" bp
SET "shopId" = ls."shopId"
FROM "LiveSession" ls
WHERE bp."liveSessionId" = ls."id";

-- ─────────────────────────────────────────────────────────────────────
-- Step 3: Enforce NOT NULL on shopId (verify zero null rows first via
-- a guard clause — if backfill missed anything, abort).
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "BroadcastProduct" WHERE "shopId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'BroadcastProduct backfill incomplete: % rows have NULL shopId', null_count;
  END IF;
END $$;

ALTER TABLE "BroadcastProduct" ALTER COLUMN "shopId" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 4: Add FK constraint BroadcastProduct.shopId → Shop.id
-- Matches Prisma-generated FK behavior (RESTRICT on delete; CASCADE on
-- update).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "BroadcastProduct"
  ADD CONSTRAINT "BroadcastProduct_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Step 5: Index BroadcastProduct.shopId for shop-scoped queries.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX "BroadcastProduct_shopId_idx" ON "BroadcastProduct"("shopId");

-- ─────────────────────────────────────────────────────────────────────
-- Step 6: Relax BroadcastProduct.liveSessionId NOT NULL.
-- Fast Postgres metadata operation. No table rewrite.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "BroadcastProduct" ALTER COLUMN "liveSessionId" DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 7: Partial unique index for evergreen (non-live) product codes.
-- Prisma does NOT generate WHERE clauses on unique indexes; this must
-- live as raw SQL inside the migration. Enforces per-shop uniqueness
-- of displayCode when liveSessionId IS NULL while preserving the
-- existing (liveSessionId, displayCode) unique for live-bound rows.
-- ─────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "BroadcastProduct_shop_evergreen_displayCode_key"
  ON "BroadcastProduct"("shopId", "displayCode")
  WHERE "liveSessionId" IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Step 8: AR-2 — relax Booking.liveSessionId NOT NULL.
-- Drop existing FK first (which was defined with NOT NULL semantics),
-- then re-add as nullable with SET NULL on delete (so deleting a
-- LiveSession orphans its bookings instead of cascading deletes —
-- behavior preserved for live-bound rows since LiveSession deletion
-- is rare admin action).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_liveSessionId_fkey";
ALTER TABLE "Booking" ALTER COLUMN "liveSessionId" DROP NOT NULL;
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_liveSessionId_fkey"
  FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Step 9: Cross-source index on Booking for omnichannel queries.
-- Enables efficient "all bookings for shop where source IN (...) AND
-- status IN (...)" lookups once GET /api/sale/bookings relaxes its
-- liveSessionId requirement.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX "Booking_shopId_source_status_idx" ON "Booking"("shopId", "source", "status");
