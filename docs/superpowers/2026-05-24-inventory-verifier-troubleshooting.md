# Inventory Bulk Verifier — Troubleshooting Guide

**Filed:** 2026-05-24 (autonomous Track 2)
**Author:** Claude Sonnet 4.6
**Companion to:** `scripts/verify-inventory-bulk-product-codes.ts` (Tier 3.9-D2-C)

This doc captures known failure modes encountered when running the
inventory bulk verifier locally, plus safe workarounds. Production
safety is NEVER softened — the 6-layer guard remains the source of
truth. These notes are for local non-prod runs only.

---

## 1. Quick start

```bash
# 1. Boot local non-prod postgres
docker compose up -d postgres

# 2. Migrate (one-time per fresh volume)
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy

# 3. Run preflight (no DB writes; just validates guard)
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-inventory-bulk-product-codes.ts --preflight

# 4. Run verifier (10 cases A-J + cleanup)
CONFIRM_NON_PROD_DB=true \
  VERIFY_T39_D2_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk
```

Exit codes: `0` = all PASS / `1` = case failed / `2` = guard blocked.

`--help` prints full usage. `--preflight` runs the guard + URL sanity
print only (no DB writes, no fixtures).

---

## 2. Known issues

### 2.1 Windows host → Docker postgres auth fails

**Symptom:** From Windows host (PowerShell or Git Bash), `prisma migrate
deploy` and direct `pg` driver connect both fail with:

```
Error: P1000: Authentication failed against database server, the
provided database credentials for `liveshop` are not valid.
```

But:
- `docker exec liveshop-postgres psql -U liveshop -d liveshop_pro` works
- `docker run --rm --network host -e PGPASSWORD=... psql -h 127.0.0.1 ...` works
- Port binding (`docker port liveshop-postgres`) shows `0.0.0.0:5432 + [::]:5432`
- `Test-NetConnection -ComputerName localhost -Port 5432` returns true

**Diagnosis:** Container-internal + container→container TCP work fine
with the same credentials. The auth failure is specific to host →
container TCP on this Windows machine. Likely culprits:

1. Docker Desktop NAT path mangling `pg_hba.conf` IP matching
2. libpq SSL renegotiation interacting badly with Windows network stack
3. Windows hosts file or IPv6 resolution returning unexpected addr
4. Docker Desktop VM clock skew breaking SCRAM-SHA-256 challenge

Volume reset (`docker compose down -v` + `up -d`) did NOT help.

**Workarounds (in order of recommendation):**

1. **Run from WSL2 Ubuntu** — Docker Desktop on Windows supports WSL2
   integration. Open Ubuntu shell, `cd` to project mount, run verifier
   there. WSL2 uses native Linux networking which avoids Windows host
   TCP quirks.

2. **Run from Linux or macOS host** — same verifier script + same
   `docker-compose.yml` works fine on POSIX systems.

3. **Run via `--network host` container** — wrap verifier in a
   `node:20-alpine` container attached to host network:
   ```bash
   docker run --rm \
     --network host \
     -v "$PWD:/app" -w /app \
     -e CONFIRM_NON_PROD_DB=true \
     -e DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
     node:20-alpine \
     npx tsx scripts/verify-inventory-bulk-product-codes.ts
   ```
   This bypasses the host TCP path. **Confirmed working** during the
   2026-05-23 D2-C session via `docker run --network host psql`.

4. **Disable SSL on connection string** — append `?sslmode=disable`
   to `DATABASE_URL`:
   ```
   postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro?sslmode=disable
   ```
   May or may not help depending on which layer is failing.

**NEVER:** softening the 6-layer guard, hardcoding production
credentials, disabling `CONFIRM_NON_PROD_DB` requirement. These are
hard rules.

### 2.2 Existing pgdata volume has stale password

**Symptom:** Even after editing `POSTGRES_PASSWORD` in `docker-compose.yml`,
auth fails with the new password.

**Diagnosis:** Postgres only honors `POSTGRES_PASSWORD` on first
container init (when the data dir is empty). Subsequent restarts read
the existing pgdata volume which carries the OLD password.

**Fix:**
```bash
docker compose down -v   # -v drops the volume
docker compose up -d postgres
# Wait for ready, then re-migrate
```

This is the same pitfall documented for Railway postgres password
rotation in MEMORY.md (2026-05-09).

### 2.3 Migration drift between branch and Docker volume

**Symptom:** Verifier crashes with Prisma error about missing column /
table.

**Diagnosis:** Local docker volume has older schema than current
branch. `prisma migrate deploy` applies pending migrations in order;
if you switched branches mid-flight, the volume may be out of sync.

**Fix:**
```bash
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
```

If migrations have been edited (not just added), drop the volume +
re-migrate.

### 2.4 Port 5432 already in use

**Symptom:** `docker compose up -d postgres` fails with "port already
allocated".

**Diagnosis:** Another postgres instance (system service, another
docker container, IDE-managed DB) is on 5432.

**Fix:** Stop the conflicting service OR change the host port mapping
in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # bind to 5433 on host
```

Then update `DATABASE_URL` to use `:5433`.

---

## 3. Verifier output guide

### 3.1 Normal output (all green)

```
Running Tier 3.9-D2 inventory bulk verifier against localhost:5432
Run id: 20260524-031200
Fixtures created.
[PASS] Case A — single create + no BroadcastProduct — productId=...
[PASS] Case B — bulk 1..5 + no BroadcastProduct — 5 products + 5 variants, 0 BP
[PASS] Case C — quantity 0 — variant.quantity=0
[PASS] Case D — price 0 — variant.price=0
[PASS] Case E — no category — product.categoryId=null
[PASS] Case F — reuse-or-create Product — Tier 3.9-B-Fix-1 semantics preserved
[PASS] Case G — bad code shape rejected + rollback — transaction integrity preserved
[PASS] Case H — invalid range reject — ValidationError thrown
[PASS] Case I — max batch reject — ValidationError thrown
  cleanup BroadcastProduct: 0 row(s) deleted
  cleanup ProductVariant: 9 row(s) deleted
  cleanup Product: 9 row(s) deleted
  cleanup ProductCategory: 1 row(s) deleted
  cleanup ShopMember: 1 row(s) deleted
  cleanup Shop: 1 row(s) deleted
  cleanup User: 1 row(s) deleted
[PASS] Case J — cleanup — all rows removed

=== Summary ===
PASS: 10  FAIL: 0  TOTAL: 10
```

### 3.2 Guard-blocked output

```
[GUARD] Refusing to run: CONFIRM_NON_PROD_DB must equal "true"

Production-safety guard blocked execution. Diagnostics:
[PREFLIGHT] Inventory bulk verifier production-safety guard
  CONFIRM_NON_PROD_DB     = (unset) (must equal "true")
  DATABASE_URL            = ...

Run with --help for full setup instructions.
Run with --preflight to test the guard without DB writes.
```

Exit code: `2`. No DB writes attempted.

### 3.3 Case failure output

```
[FAIL] Case F — reuse-or-create Product — expected reuse Product
...
=== Summary ===
PASS: 9  FAIL: 1  TOTAL: 10
```

Exit code: `1`. Cleanup still attempted; check container logs for
the failing case's error.

---

## 4. CI considerations

The verifier is **NOT** run in GitHub Actions CI because:
1. Standard CI runners don't have a postgres service attached
2. CI runtime budget is bounded; full verifier ≈ 30s on warm DB
3. Verifier semantics mirror existing unit tests (88 inventory-side
   unit tests cover the same code paths)

If future CI adds a postgres service container, the verifier could be
adapted with `CI=true` short-circuit guards. Not planned for this
iteration.

---

## 5. Cross-references

- `scripts/verify-inventory-bulk-product-codes.ts` (the verifier)
- `scripts/lib/non-prod-db-guard.ts` (6-layer guard, never soften)
- `docs/superpowers/2026-05-23-inventory-api-reference.md` (API ref)
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` (UI smoke)
- `docs/superpowers/2026-05-23-inventory-bulk-d2-final-handoff.md` (final handoff §6.3 verifier local run note)
- `MEMORY.md` (2026-05-09 Railway postgres password rotation note — same pitfall pattern as §2.2)
