# Tier 3.9-B — Migration Safety Audit

**Filed:** 2026-05-21
**Migration:** `prisma/migrations/20260521000000_sale_date_grouping/migration.sql`
**Status:** Audit complete. PR opened for review. **NOT MERGED OR DEPLOYED.**
**Master HEAD at audit time:** `bb05097` (PR #46 merged)
**Per D-Date-10 verdict:** Boss + ChatGPT must approve migration deploy plan before PR merges.

---

## 1. Migration execution path audit

### 1.1 Vercel build configuration

`package.json`:
```json
"build": "prisma generate && next build"
```

**Vercel does NOT run `prisma migrate deploy`.** Confirmed:
- Build command runs `prisma generate` only (regenerates client).
- `postinstall: "prisma generate"` ensures client regen on install.
- No migration step in deploy pipeline.

### 1.2 CI workflow audit

`.github/workflows/ci.yml`:
- `test` job runs `npx prisma migrate deploy` against ephemeral CI Postgres (`postgresql://postgres:postgres@localhost:5432/liveshop_test`) — **NOT production**.
- `build` job uses placeholder `DATABASE_URL` and runs `prisma generate` only — no migration.
- `docker` job builds image — no migration.

### 1.3 Official deploy path (per `docs/CODEMAP/10-ops-deploy.md`)

```
DATABASE_URL=postgresql://...railway... npx prisma migrate deploy
```

**Manual command, executed by Boss (or operator) against Railway PostgreSQL after PR merges to master.** Codemap line 69.

### 1.4 Rollback

- Vercel app: rollback via Deployments → Promote previous Ready deployment (line 93-94).
- Database: **manual** via raw SQL or Railway snapshot restore (line 95). No automated DB rollback.

### 1.5 Backup

- Railway snapshots (managed) — line 119.
- No custom backup script.
- **Boss must verify Railway snapshot exists before running production migration.**

---

## 2. Migration SQL audit

### 2.1 Operations classified

| Step | Operation | Type | Cost | Lock risk |
|---|---|---|---|---|
| 1 | `ALTER TABLE Shop ADD COLUMN timezone TEXT NOT NULL DEFAULT '...'` | Postgres metadata + table rewrite (Postgres 11+ does **not** rewrite for `ADD COLUMN ... DEFAULT` if default is constant) | O(1) metadata for PG ≥ 11 | AccessExclusiveLock on Shop briefly |
| 2 | `ALTER TABLE BroadcastProduct ADD COLUMN saleDate DATE` | Postgres metadata only (NULL default) | O(1) | AccessExclusiveLock on BP briefly |
| 3 | `CREATE INDEX ... ON BroadcastProduct(shopId, saleDate)` | Index build | O(N log N) | ShareLock — blocks writes; can use CONCURRENTLY if needed |
| 4 | Backfill live-bound BPs from LiveSession dates | UPDATE with JOIN | O(N) full scan of BP | RowExclusiveLock on BP rows |
| 5 | Backfill non-live BPs from createdAt | UPDATE with JOIN to Shop | O(N) full scan of BP | RowExclusiveLock on BP rows |
| 6 | `DROP INDEX IF EXISTS BroadcastProduct_shop_evergreen_displayCode_key` | Drop index | O(1) | ShareLock |
| 7 | `CREATE UNIQUE INDEX ... WHERE saleDate IS NOT NULL` | Partial unique index build | O(N log N) | ShareLock — blocks writes |

### 2.2 Production row count estimate

Production BroadcastProduct row count is small (Tier 3.8 deployed 2026-05-20, Boss has CM1-CM10 + some BD codes = **<50 rows**). Each UPDATE + index build is sub-second.

### 2.3 Concurrency concerns

- Migration window: **expected <5 seconds total** at current data volume.
- Vercel app may have in-flight requests during migration.
- Step 1+2 (ADD COLUMN) require brief AccessExclusiveLock — concurrent SELECTs queue ~ms.
- Step 7 (CREATE UNIQUE INDEX) blocks INSERTs during build. At <50 rows, build is instant.
- **Risk:** very low. Production traffic on `/api/sale/broadcast-products` is admin-only and rare.

### 2.4 Uniqueness conflict detection

Before applying the new unique constraint (Step 7), need to verify no row groups (shopId, saleDate, displayCode) collide after backfill.

**Pre-migration check query (run against Railway before `migrate deploy`):**

```sql
-- Conflict detection — runs in dry-run mode to find any duplicates
-- that would violate the new constraint. Returns 0 rows = safe.
SELECT
  bp."shopId",
  DATE(
    COALESCE(ls."startedAt", ls."scheduledAt", bp."createdAt")
      AT TIME ZONE COALESCE(s."timezone", 'Asia/Kuala_Lumpur')
  ) AS computed_saleDate,
  bp."displayCode",
  COUNT(*) AS conflict_count
FROM "BroadcastProduct" bp
LEFT JOIN "LiveSession" ls ON bp."liveSessionId" = ls."id"
JOIN "Shop" s ON bp."shopId" = s."id"
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;
```

If this returns >0 rows, **STOP** — backfill will create duplicate-key violations on the new unique index. Boss must resolve before migration runs.

### 2.5 Down-migration sketch (rollback)

If migration causes prod issue, rollback SQL:

```sql
-- Restore previous state (run against Railway)
DROP INDEX IF EXISTS "BroadcastProduct_shop_saleDate_displayCode_key";
DROP INDEX IF EXISTS "BroadcastProduct_shopId_saleDate_idx";

ALTER TABLE "BroadcastProduct" DROP COLUMN IF EXISTS "saleDate";
ALTER TABLE "Shop" DROP COLUMN IF EXISTS "timezone";

-- Restore old evergreen partial unique
CREATE UNIQUE INDEX "BroadcastProduct_shop_evergreen_displayCode_key"
  ON "BroadcastProduct"("shopId", "displayCode")
  WHERE "liveSessionId" IS NULL;
```

App code that depends on `saleDate` must also be reverted (revert PR 3.9-B merge). Order:
1. Revert Vercel app to pre-PR-3.9-B deployment (Vercel Promote previous Ready).
2. Run rollback SQL above.
3. Verify smoke.

---

## 3. Deploy sequence (proposed)

Per D-Date-10 verdict, Boss + ChatGPT to approve.

### 3.1 Required gates BEFORE merge

- [x] PR 3.9-B opened with migration + app changes.
- [x] CI green: lint / typecheck / tests / build / docker (where applicable).
- [x] Migration safety audit (this doc) attached to PR.
- [ ] Boss + ChatGPT approve PR 3.9-B code.
- [ ] Boss confirms Railway snapshot exists.
- [ ] Boss runs conflict detection query (§2.4) — returns 0 rows.

### 3.2 Deploy sequence

```
Step A — Snapshot Railway DB (Boss)
  → Railway Dashboard → DB → Backups → Create snapshot
  → Verify snapshot timestamp + size > 0

Step B — Merge PR 3.9-B to master
  → Vercel auto-deploys app code (does NOT run migration)
  → App is briefly inconsistent: new code expects saleDate column
    but DB doesn't have it yet → 500s on /api/sale/broadcast-products

Step C — Run migration against Railway (Boss)
  → DATABASE_URL=<railway-url> npx prisma migrate deploy
  → Wait for "X migrations applied" output
  → Verify column exists: psql -c "\d BroadcastProduct"

Step D — Verify production smoke
  → npm run smoke:prod:unauth
  → Manual check: load /sale, see date picker, see codes for today

Step E — Boss sign-off
  → Boss confirms /sale works
  → Boss confirms quick-create writes today's date
```

### 3.3 Alternative — safer deploy (if window B → C concerns)

Run migration FIRST, then merge app code:

```
Step A — Snapshot Railway DB
Step B — Run migration against Railway (Boss)
  → New column added; old code still works (saleDate stays NULL on writes)
Step C — Merge PR 3.9-B
  → Vercel deploys new app code; reads/writes saleDate
Step D — Verify smoke
Step E — Boss sign-off
```

**Recommended: Alternative sequence (Step B before merge).** Migration is additive (new column, new index, no destructive change beyond drop of partial unique that pre-3.9 code doesn't use post-merge). Pre-applying migration eliminates the brief inconsistency window.

To support Alternative, Boss must run migration against Railway from a working tree that has the migration file. Two options:

**Option B1 — Boss checks out PR branch locally before merge:**
```
git fetch origin
git checkout feat/tier-3-9-b-sale-date-grouping
DATABASE_URL=<railway> npx prisma migrate deploy
git checkout master
# Then approve + merge PR via GitHub
```

**Option B2 — Boss runs migration from master AFTER merge (Alternative becomes equivalent to §3.2):**
- Same as primary sequence.

Pick B1 for safer window.

---

## 4. Rollback drills

### 4.1 If migration runs but app deploy fails

- DB has new columns. App is on old deploy (pre-PR-3.9-B).
- Old code does NOT reference saleDate → ignores it.
- Old partial unique is dropped → new partial unique enforces (shopId, saleDate, displayCode) — old code writes with NULL saleDate which is NOT enforced.
- **Result: safe interim state.** Old code keeps working; just doesn't populate saleDate. Roll forward by retrying app deploy.

### 4.2 If app deploys but migration fails

- App has new code. DB has old schema.
- New code references `saleDate` column → Prisma throws on every read of BroadcastProduct.
- `/sale` page breaks.
- **Recovery:** Vercel Promote previous Ready deployment → app rolls back to pre-3.9-B → DB is in sync with old code.

### 4.3 If both succeed but Boss reports critical bug

- Run §2.5 down-migration SQL.
- Vercel Promote previous Ready deployment.

---

## 5. Verification commands

### 5.1 Local migration test (mandatory before PR merge)

```
# Test against local Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/liveshop_test \
  npx prisma migrate deploy

# Verify
psql $DATABASE_URL -c "\d \"BroadcastProduct\"" | grep saleDate
psql $DATABASE_URL -c "\d \"Shop\"" | grep timezone
```

### 5.2 Conflict detection (pre-production)

Run §2.4 query against Railway DATABASE_URL. Returns 0 rows = safe to deploy.

### 5.3 Post-deploy smoke

```
npm run smoke:prod:unauth
```

Plus manual:
- Load `/sale` → date picker visible
- Switch date → URL/state updates
- Quick-create → success → new code appears in panel
- Refresh page → code persists under correct date

---

## 6. Remaining blockers before merge

| Item | Status |
|---|---|
| PR 3.9-B code complete | will be true at time of PR open |
| Migration SQL written | ✅ (this commit) |
| Migration safety audit doc | ✅ (this doc) |
| Local migration test pass | pending PR test run |
| Conflict detection query result | pending Boss run against Railway |
| Boss + ChatGPT verdict on §3.2 vs §3.3 deploy sequence | pending |
| Railway snapshot created | pending Boss action |
| Repo + route + UI tests pass | pending PR test run |
| `npx tsc --noEmit` EXIT=0 | pending PR verify |
| `npm run lint` 0 errors | pending PR verify |
| Production smoke green at master | pending PR verify |

---

## 7. Sign-off requirements

Boss approval required for:

1. **D-Deploy-1:** §3.2 (merge then migrate) vs §3.3 (migrate then merge). Recommend §3.3 / Option B1.
2. **D-Deploy-2:** Railway snapshot created — Boss confirms timestamp.
3. **D-Deploy-3:** Conflict detection query result — Boss runs against Railway, confirms 0 rows.
4. **D-Deploy-4:** Approve PR 3.9-B merge.

After Boss + ChatGPT sign all 4, deploy can proceed.

---

## 8. What this audit does NOT do

- Does NOT run migration against any database.
- Does NOT mutate production data.
- Does NOT change Vercel / Railway env vars.
- Does NOT modify CI workflow.
- Does NOT touch pak-ta-kra.

---

## 9. Cross-references

- `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` — D-Date-1 through D-Date-10 verdicts
- `docs/CODEMAP/10-ops-deploy.md` — official deploy path
- `prisma/migrations/20260521000000_sale_date_grouping/migration.sql` — migration file
- `.github/workflows/ci.yml` — CI workflow audit
- `package.json` — build script audit
