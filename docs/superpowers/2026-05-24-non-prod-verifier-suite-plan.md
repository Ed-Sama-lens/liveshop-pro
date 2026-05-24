# Non-Prod Verifier Suite — Plan

**Filed:** 2026-05-24 (autonomous docs block Track 3)
**Author:** Claude Sonnet 4.6
**Status:** Suite-level plan. NO new script in this PR. NO production DB use. NO migration. Companion to existing sale-core verifier plan (`2026-05-24-sale-core-verifier-plan.md`) — this doc covers the **full verifier suite** (sale + inventory + future), cross-OS execution paths, cleanup strategy, and possible CI integration.

---

## 0. Scope

Plan a coherent suite covering:

- All 8 existing verifier scripts (catalog + grouping)
- 3 known gaps (`verify-sale-summary-single`, `verify-sale-summary-range`, `verify-sale-add-from-stock`)
- Production-DB hard guard (6 layers, NEVER soften)
- Cross-OS execution: Windows / WSL2 / Linux / macOS
- Docker postgres setup + Windows auth quirk workaround
- Cleanup strategy (atomic per-run + safe-on-fail)
- Possible future CI integration (out of scope to implement now)
- Exact commands per verifier

NO new script in this PR. NO production DB. NO migration. NO env change.

---

## 1. Existing verifier catalog (8 scripts)

| Verifier | npm script | Coverage | Status |
|---|---|---|---|
| `verify-booking-flow.ts` | `verify:booking-flow` | Booking lifecycle (create → confirm → cancel) | ✅ landed |
| `verify-booking-conversion.ts` | `verify:booking-conversion` | Booking → Order conversion + idempotent replay | ✅ landed |
| `verify-booking-create.ts` | `verify:booking-create` | Manual create booking entry path | ✅ landed |
| `verify-order-reservation-cleanup.ts` | `verify:order-reservation-cleanup` | Stock reservation release on cancel/convert | ✅ landed |
| `verify-expire-reservations-cron.ts` | `verify:expire-reservations-cron` | Reservation TTL expiry cron | ✅ landed |
| `verify-sale-d4-d6-functional-flow.ts` | `verify:sale:d4-d6` | Sale D4/D6 functional flow | ✅ landed |
| `verify-sale-quick-bulk-product-codes.ts` | `verify:sale:quick-bulk` | Tier 3.8 sale quick-bulk code create | ✅ landed |
| `verify-inventory-bulk-product-codes.ts` | `verify:inventory:bulk` | Tier 3.9-D2-C inventory bulk product creation | ✅ landed |
| `verify-broadcast-product-crud.ts` | (no npm alias yet) | BroadcastProduct CRUD baseline | ✅ landed |
| `verify-omnichannel-booking.ts` | (no npm alias yet) | Multi-channel booking entry surface | ✅ landed |

10 verifiers on disk; 8 wired to npm scripts.

---

## 2. Known gaps (3 candidates)

Per `2026-05-24-sale-core-verifier-plan.md` §6 — recommended over mega-verifier:

| Gap | Suggested verifier | Effort | Cases covered |
|---|---|---|---|
| Summary single-day | `verify-sale-summary-single.ts` | ~150 LOC | total bookings + per-status counts + broadcastProductCount + idempotent re-call |
| Summary range | `verify-sale-summary-range.ts` | ~200 LOC | days[] in order + top-level totals = sum + empty-day rendering + boundary inclusive |
| AddFromStock batch | `verify-sale-add-from-stock.ts` | ~180 LOC | reuses existing Product+Variant, creates BroadcastProduct rows only, cross-shop reject |

Each gap = independent R2 PR. Each ≤ 200 LOC. Each uses the same 6-layer guard wrapper. Each has its own cleanup.

**Defer reason:** Boss not yet asked. Plan tracks them so they're not forgotten.

---

## 3. Production-DB hard guard (6 layers — NEVER soften)

Source: `scripts/lib/non-prod-db-guard.ts` (pure-function evaluator, unit-testable).

| Layer | Check | Constants |
|---|---|---|
| 1 | `CONFIRM_NON_PROD_DB === 'true'` env flag | `CONFIRM_NON_PROD_DB` |
| 2 | `DATABASE_URL` must be set | (any non-empty) |
| 3 | Hostname must be in `ALLOWED_LOCAL_HOSTS` | `['localhost', '127.0.0.1']` |
| 4 | Hostname must NOT be in `PROD_HOST_DENY_LIST` | `['junction.proxy.rlwy.net', 'rlwy.net']` |
| 5 | URL must NOT contain any `PROD_URL_MARKERS` substring | `['nazhahatyai']` |
| 6 | DB name path must equal `REQUIRED_DB_NAME` | `'liveshop_pro'` |

Exit code `2` on guard failure (vs `1` for case fail).

**HARD RULES (every verifier):**
- ❌ NEVER soften the guard
- ❌ NEVER add a Railway / production host to `ALLOWED_LOCAL_HOSTS`
- ❌ NEVER remove the `CONFIRM_NON_PROD_DB` gate
- ❌ NEVER hardcode the prod URL anywhere in `scripts/`
- ❌ NEVER use prod credentials in any verifier
- ✅ ALWAYS print sanitized URL (password masked) on start
- ✅ ALWAYS expose `--preflight` flag (guard-only check, no DB writes)
- ✅ ALWAYS expose `--help` flag with usage block

---

## 4. Cross-OS execution paths

### 4.1 Linux / macOS (preferred)

```bash
# 1. Boot local non-prod postgres
docker compose up -d postgres

# 2. Migrate (one-time per fresh volume)
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy

# 3. Run preflight (no DB writes; just validates guard)
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk -- --preflight

# 4. Run verifier
CONFIRM_NON_PROD_DB=true \
  VERIFY_T39_D2_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk
```

Native Linux networking → no Windows TCP quirk. Cleanest path.

### 4.2 WSL2 Ubuntu (Windows users — recommended)

Same commands as Linux. Open WSL2 Ubuntu shell, `cd /mnt/c/Users/.../liveshop-pro`, run.

Docker Desktop on Windows supports WSL2 integration. WSL2 uses native Linux networking → bypasses Windows host → Docker postgres auth failure.

### 4.3 Windows host (PowerShell / Git Bash) — KNOWN BROKEN

**Symptom:** P1000 authentication failed despite correct credentials.

**Diagnosis:** Container-internal + container→container TCP work; host→container TCP fails. Likely Docker Desktop NAT, libpq SSL renegotiation, IPv6 resolution, or Docker Desktop VM clock skew. Volume reset does not help.

**Workarounds (in order of recommendation):**

1. **Use WSL2** (§4.2)
2. **Run verifier inside a `--network host` node container:**
   ```bash
   docker run --rm \
     --network host \
     -v "$PWD:/app" -w /app \
     -e CONFIRM_NON_PROD_DB=true \
     -e DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
     node:20-alpine \
     npx tsx scripts/verify-inventory-bulk-product-codes.ts
   ```
3. **Disable SSL** — append `?sslmode=disable` to `DATABASE_URL`
4. **Bypass to Linux/macOS host**

Full troubleshooting: `docs/superpowers/2026-05-24-inventory-verifier-troubleshooting.md`.

### 4.4 No-Docker fallback (any OS)

If Docker unavailable but a local postgres instance is running (e.g. native install via Homebrew / apt), point `DATABASE_URL` at it:

```bash
DATABASE_URL='postgresql://<youruser>:<yourpass>@localhost:5432/liveshop_pro'
```

DB name must still equal `liveshop_pro` (guard layer 6). Migrate first via `npx prisma migrate deploy`.

---

## 5. Cleanup strategy

### 5.1 Per-run RunId pattern (already used)

Every verifier accepts a `RUN_ID` env var (or generates one from timestamp). Fixtures (Shop, User, ShopMember, Category, Product, Variant, BroadcastProduct, Booking, Order) all get suffixed with the RunId so multiple concurrent runs don't collide and cleanup can target exactly its own rows.

Pattern from `verify-inventory-bulk-product-codes.ts`:
- `VERIFY_T39_D2_RUN_ID` env
- All fixture names contain RunId
- Cleanup step deletes WHERE name/code/email matches RunId pattern

### 5.2 Cleanup on fail

Each verifier must:
- Wrap fixture creation in `try { ... } finally { cleanup() }`
- Cleanup must be idempotent (re-run safe)
- Cleanup must succeed even when prior step partially completed
- Cleanup step counted as separate case (e.g. `J` in inventory verifier)
- Exit code stays `1` if any case failed, BUT cleanup STILL runs

### 5.3 Cross-run cleanup

If a previous run crashed and left fixtures, manual cleanup:

```sql
-- Inspect orphaned RunIds
SELECT DISTINCT regexp_replace(name, '.*verify-(\d+-\d+).*', '\1') AS run_id
FROM "Product" WHERE name LIKE '%verify-%';

-- Manual cleanup per RunId (CAUTION — local only)
DELETE FROM "BroadcastProduct" WHERE "saleCode" LIKE '%-RUN-ID-%';
DELETE FROM "Booking" WHERE notes LIKE '%verify-RUN-ID%';
DELETE FROM "ProductVariant" WHERE sku LIKE '%-RUN-ID-%';
DELETE FROM "Product" WHERE "stockCode" LIKE '%-RUN-ID-%';
-- etc per fixture pattern
```

NEVER run cleanup against production. Guard layer 6 (`DB name = liveshop_pro`) prevents accidental prod cleanup but admin must still be paranoid.

---

## 6. Suite organization by domain

| Domain | Verifiers | npm group (proposed) |
|---|---|---|
| Inventory | `verify-inventory-bulk-product-codes` | `verify:inventory:*` |
| Sale (quick create) | `verify-sale-quick-bulk-product-codes` + `verify-sale-d4-d6` | `verify:sale:*` |
| Sale (summary, GAP) | `verify-sale-summary-single` + `verify-sale-summary-range` (FUTURE) | `verify:sale:summary:*` |
| Sale (AddFromStock, GAP) | `verify-sale-add-from-stock` (FUTURE) | `verify:sale:add-from-stock` |
| Booking | `verify-booking-flow` + `verify-booking-create` + `verify-booking-conversion` + `verify-omnichannel-booking` | `verify:booking:*` |
| Stock / cron | `verify-order-reservation-cleanup` + `verify-expire-reservations-cron` | `verify:stock:*` + `verify:cron:*` |
| BroadcastProduct | `verify-broadcast-product-crud` | `verify:bp:crud` |

Proposed npm aliases (optional R2 follow-up, not in this PR):
- `verify:all` — runs every script in sequence (currently no aggregator)
- `verify:sale:all` — every sale verifier
- `verify:booking:all` — every booking verifier
- `verify:inventory:all` — every inventory verifier

Aggregator would tolerate non-zero exit from any individual script and print summary at end. Out of scope for this PR.

---

## 7. Possible future CI integration

**NOT for now.** GitHub Actions on this repo does not provision a postgres service container. Adding one would:

- Slow CI by ~30-60s per workflow
- Require postgres image cache
- Require migration step before verifier subset
- Require deterministic cleanup-safe verifier subset (< 30s each)

**Conditions to revisit:**
- Postgres service container added to CI workflow
- Verifier subset deterministic + ≤ 30s
- Cleanup must succeed even if test suite fails
- Guard layer 1 (`CONFIRM_NON_PROD_DB`) must still hold (CI sets it explicitly)

Candidate first verifier for CI: `verify-inventory-bulk-product-codes.ts` (10 cases, ~5-10s typical, well-isolated, no booking state machine dependency).

---

## 8. Exact commands per existing verifier (Linux/macOS/WSL2)

```bash
# Booking flow
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:booking-flow

# Booking → Order conversion
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:booking-conversion

# Manual create booking
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:booking-create

# Stock cleanup
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:order-reservation-cleanup

# Reservation TTL cron
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:expire-reservations-cron

# Sale D4/D6 functional flow
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:sale:d4-d6

# Sale quick bulk product codes (Tier 3.8)
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:sale:quick-bulk

# Inventory bulk product codes (Tier 3.9-D2-C)
CONFIRM_NON_PROD_DB=true \
  VERIFY_T39_D2_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk

# Preflight for any verifier (no DB writes)
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run <verifier> -- --preflight
```

For Windows host: use WSL2 (§4.2) or `--network host` container (§4.3 workaround 2).

---

## 9. Hard rules (suite-wide)

- ❌ NEVER soften the 6-layer guard in any verifier
- ❌ NEVER use production credentials
- ❌ NEVER skip cleanup on FAIL (leaked fixtures break next run)
- ❌ NEVER assert positive cases without negative-case coverage
- ❌ NEVER hardcode date strings — derive from runId for determinism
- ❌ NEVER hardcode prod URL (`nazhahatyai`) anywhere in `scripts/`
- ❌ NEVER allow `--force-prod` / `--skip-guard` flag (does not exist; never add)
- ✅ ALWAYS print sanitized URL (password masked) on start
- ✅ ALWAYS support `--preflight` for guard-only check
- ✅ ALWAYS bound runtime (target ≤ 60s per verifier)
- ✅ ALWAYS use RunId pattern for cleanup safety
- ✅ ALWAYS exit `2` on guard failure (distinguish from case fail `1`)

---

## 10. Cross-references

- `scripts/lib/non-prod-db-guard.ts` (pure evaluator, NEVER soften)
- `scripts/verify-*.ts` (10 existing verifiers)
- `docs/superpowers/2026-05-24-inventory-verifier-troubleshooting.md` (Windows quirk + workarounds)
- `docs/superpowers/2026-05-24-sale-core-verifier-plan.md` (sale-core mega vs gap-fill alternative)
- `docs/superpowers/2026-05-23-stock-booking-state-machine-matrix.md` (semantic contract)
- `docs/superpowers/2026-05-24-sale-data-fetch-audit.md` (sale workspace fetch model)
- `docker-compose.yml` (postgres service definition)

---

## 11. Status

- Suite-level plan only (R2 docs)
- No script created
- No production DB used
- No migration generated
- No env / flag change
- 3 gap candidates listed (Boss verdict needed before implementing any)
- 4 cross-OS execution paths documented
- 6-layer guard catalog confirmed
- CI integration deferred (conditions listed)
- pak-ta-kra untouched
