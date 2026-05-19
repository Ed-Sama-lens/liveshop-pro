# Local D4/D6 verifier — runbook

**Filed:** 2026-05-19
**Pairs with:** `scripts/verify-sale-d4-d6-functional-flow.ts`
**Status:** Boss-executable runbook. Do NOT run against production. Docker daemon required.

This runbook walks Boss (or any developer with Docker) through running the local D4/D6 functional flow verifier (9 cases A-I) end-to-end. Until Docker is available on a session machine, the verifier ships with code review + guard-test verification only; full pass requires this runbook.

---

## 1. Prerequisites

| Requirement | Check |
|---|---|
| Docker Desktop installed + running | `docker ps` returns without `cannot find pipe` error |
| Postgres image available | `docker image ls | grep postgres` (or let docker compose pull on first up) |
| Node 22+ | `node --version` |
| Repo at master `079c6a0` or newer | `git log --oneline -1` |
| `npm ci` already run | `node_modules/` exists with `@prisma/client` |
| Prisma client generated | `node_modules/.prisma/client` OR `src/generated/prisma` exists |

If any row blank → STOP and resolve before continuing.

---

## 2. Docker postgres startup

The repo includes `docker-compose.yml`. Bring up only the postgres service (don't bring up redis or other services unless smoke needs them).

### 2.1 Inspect compose

```bash
docker compose config --services
```

Expect to see `postgres` (and possibly `redis`).

### 2.2 Bring postgres up

```bash
docker compose up -d postgres
```

Wait ~5 seconds for postgres health.

### 2.3 Verify

```bash
docker compose ps postgres
```

Expect `STATUS` = `running (healthy)` (or `running` if no healthcheck).

### 2.4 Resolve common issues

| Symptom | Fix |
|---|---|
| `cannot find pipe ... dockerDesktopLinuxEngine` | Docker Desktop not running — open Docker Desktop, wait for whale icon to settle |
| Port 5432 already in use | Stop other postgres: `docker compose down` or kill local postgres service |
| `docker compose: command not found` | Use `docker-compose` instead (older syntax) |
| `pull access denied` | Authenticate Docker Hub OR use a pre-cached image |

---

## 3. Database migration

Apply the schema before running the verifier. The verifier expects the post-D1 omnichannel schema (Booking / BroadcastProduct / StockReservation / etc).

```bash
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
```

Expect:

```
Applying migration `20260514000000_sale_omnichannel_booking`
... (all prior migrations through current head)
Done in X.XXs
```

If migration fails:
- Check `DATABASE_URL` username/password matches `docker-compose.yml`
- Check `docker compose logs postgres` for connection refused

---

## 4. Environment variables

The verifier sets the 3 flags inline at script load. Boss only needs:

```bash
CONFIRM_NON_PROD_DB=true       # explicit safety acknowledgment
DATABASE_URL=postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro
VERIFY_D4_D6_RUN_ID=<optional unique run id>
```

If `VERIFY_D4_D6_RUN_ID` is omitted, the script uses `Date.now()` so each run gets a fresh fixture namespace.

NEVER set these env vars:
- `DATABASE_URL` pointing to Railway / `nazhahatyai` / `rlwy.net` / `junction.proxy.rlwy.net`

Production safety guard exits 2 if any production marker is detected.

---

## 5. Run the verifier

### 5.1 Via npm script (preferred)

```bash
CONFIRM_NON_PROD_DB=true \
  VERIFY_D4_D6_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:sale:d4-d6
```

### 5.2 Direct invocation (equivalent)

```bash
CONFIRM_NON_PROD_DB=true \
  VERIFY_D4_D6_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx -y tsx scripts/verify-sale-d4-d6-functional-flow.ts
```

Both invoke the same script and pass exit codes upward.

---

## 6. Expected output

### 6.1 Happy path

```
Running D4/D6 functional verifier against localhost:5432
Run id: 20260519-193500
Fixtures created (no BP yet — Case A creates it).
[PASS] Case A — create evergreen BroadcastProduct (D6) — displayCode=EVR-D46-XXXXXXXX
[PASS] Case B — create non-live PENDING_REVIEW booking (D4+D6) — bookingId=XXXXXXXX
[PASS] Case C — confirm reserves stock (+1) — reservedQty=1
[PASS] Case D — second booking CONFIRMED then cancel releases — reservedQty 1→3→1
[PASS] Case E — V2 bookingIds-only conversion (D3) — orderId=XXXXXXXX
[PASS] Case F — V2 replay idempotent same orderId — same=XXXXXXXX
[PASS] Case G — no duplicate Order after replay — Order count=1
[PASS] Case H — reservation links booking + order intact — all FKs match
  cleanup OrderItem: 1 row(s) deleted
  cleanup OrderAudit: ... row(s) deleted
  cleanup Order: 1 row(s) deleted
  cleanup BookingHistory: ... row(s) deleted
  cleanup StockReservation: 1 row(s) deleted
  cleanup Booking: 2 row(s) deleted
  cleanup BroadcastProduct: 1 row(s) deleted
  cleanup ProductVariant: 1 row(s) deleted
  cleanup Product: 1 row(s) deleted
  cleanup Customer: 1 row(s) deleted
  cleanup ShopMember: 1 row(s) deleted
  cleanup Shop: 1 row(s) deleted
  cleanup User: 1 row(s) deleted
[PASS] Case I — cleanup — all rows removed

=== Summary ===
PASS: 9  FAIL: 0  TOTAL: 9
```

Exit code: 0.

### 6.2 Production-guard hit

```
[GUARD] Refusing to run: hostname looks like production (junction.proxy.rlwy.net).
```

Exit code: 2.

### 6.3 Missing env

```
[GUARD] Refusing to run: set CONFIRM_NON_PROD_DB=true.
```

Exit code: 2.

### 6.4 One case fails

```
[FAIL] Case G — no duplicate Order after replay — expected exactly 1 Order row for shop, got 2
...
=== Summary ===
PASS: 8  FAIL: 1  TOTAL: 9
```

Exit code: 1. Cleanup STILL runs. Read failing case + escalate.

---

## 7. Cleanup behavior

The verifier cleans up all 13 row types in FK-safe order even when a case fails. After the run, the postgres DB should be back to the state before Step 5.

If cleanup itself fails, the row counts show non-zero deletes for some types and the script still exits 1 with a `[FAIL] Case I` entry.

If postgres restart leaves stale rows (e.g. Boss interrupted Step 5 mid-run):

```bash
# Cleanup manually via Prisma Studio OR by re-running the verifier with same VERIFY_D4_D6_RUN_ID
# (the cleanup query is keyed by runId).
```

---

## 8. What a failure means

| Failing case | Likely root cause |
|---|---|
| A | `prisma migrate deploy` didn't reach D1 omnichannel migration (no evergreen BP support) |
| B | `ALLOW_NON_LIVE_BOOKING` flag not honored at repository layer |
| C | `confirmBookingTx` reservation logic broken or table missing |
| D | Cancel-release reservation logic broken |
| E | V2 conversion path broken (D3 flag not honored or repo path missing) |
| F | Idempotency key mismatch — different orderId returned on replay |
| G | Duplicate Order row created — V2 idempotency table or unique constraint not enforced |
| H | StockReservation FK not set to orderId after conversion |
| I | Cleanup query mismatch with current schema |

Failing case ≥ 1 means D4/D6 production flow has a regression. STOP using flags as production-ready; escalate.

---

## 9. NEVER run against production

The verifier has 6 layers of production-safety guard, but social trust matters more:

- Production DB host (`junction.proxy.rlwy.net` / `rlwy.net`) is in the deny-list
- Production URL marker `'nazhahatyai'` is in the deny-list
- Only `localhost` / `127.0.0.1` hosts are allowed
- Only DB name `liveshop_pro` is allowed (Railway uses different name)
- `CONFIRM_NON_PROD_DB=true` required as explicit acknowledgment
- `DATABASE_URL` must be valid URL with port

If ANY of those checks fails, exit 2 with `[GUARD]` message + zero queries executed.

Even with all guards, **never paste the Railway DATABASE_URL into this command**. The verifier creates + deletes rows; running against Railway would destroy production data even if the guard somehow passed.

---

## 10. How to report result back

### PASS template

```
D4/D6 local verifier PASS at master <SHA>:
- All 9 cases A-I PASS
- Run id: <YYYYMMDD-HHMMSS>
- Docker postgres image: postgres:18-alpine
- Total time: ~N seconds
- Cleanup: all 13 row types deleted, 0 rows left
- Exit code: 0
- Notes: <any observation>
```

### FAIL template

```
D4/D6 local verifier FAIL at master <SHA>:
- Failing case: <A-I>
- Error text exact: <copy from console>
- Cases passed before fail: <list>
- Cleanup ran: yes/no
- Exit code: 1
- Notes: <context, especially environment differences>
```

---

## 11. Cross-references

- Verifier source: `scripts/verify-sale-d4-d6-functional-flow.ts`
- Existing omnichannel verifier: `scripts/verify-omnichannel-booking.ts` (5 cases A-E)
- Phase B dry-run plan: `docs/superpowers/2026-05-18-phase-b-dry-run-test-data-plan.md`
- D4/D6 visual guide (Boss-side UI smoke): `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Smoke harness runbook: `docs/superpowers/2026-05-18-prod-smoke-harness-runbook.md`
- CI quality gates plan (PR-CI-2 will wire this into CI): `docs/superpowers/2026-05-18-ci-quality-gates-plan.md`
