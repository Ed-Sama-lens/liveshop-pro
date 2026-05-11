# ORDER-RESERVATION-CLEANUP Commit 2 — backfill plan (design only)

**Status:** DESIGN ONLY. No backfill code in this commit. Implementation requires Boss + ChatGPT review of this doc + manual run on staging dry-run before any production write.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7
**Depends on:** ORDER-RESERVATION-CLEANUP Commit 1 (`orderRepository.transition` future-only fix). Backfill should run AFTER Commit 1 is shipped + stable for at least one week so that NO new orphan rows are being created while backfill sweeps existing data.

This doc plans a one-shot backfill of historical `StockReservation` rows that should logically have `releasedAt` set but were orphaned by the bug fixed in Commit 1. Boss owns the production run decision.

---

## Problem recap

Pre-Commit-1 code path: every `Order` that transitioned out of `RESERVED` (to CONFIRMED or CANCELLED via `orderRepository.transition()`) left associated `StockReservation` rows with `releasedAt: null`. Variant `reservedQty` was correctly decremented; only the audit anchor was orphaned.

Result on production today:
- Storefront-checkout orders since project launch: every CONFIRMED/CANCELLED/PACKED/SHIPPED/DELIVERED order has at least one orphan reservation row.
- Sale-conversion orders since Commit 2I: same pattern.
- `prisma.stockReservation.count({where: {releasedAt: null}})` overcounts by N rows where N = sum of OrderItems across all non-RESERVED orders.

After Commit 1 ships: no NEW orphans. Existing orphans persist until backfilled.

---

## Boss Q&A (8 design questions)

### Q1: How to identify old order-side reservations that should have `releasedAt` set?

Read-only query:

```sql
SELECT
  sr.id,
  sr."orderId",
  sr."bookingId",
  sr."variantId",
  sr.quantity,
  sr."releasedAt",
  sr."createdAt",
  o.status AS "orderStatus",
  o."confirmedAt",
  o."cancelledAt",
  o."deliveredAt",
  o."updatedAt" AS "orderUpdatedAt"
FROM "StockReservation" sr
JOIN "Order" o ON o.id = sr."orderId"
WHERE sr."releasedAt" IS NULL
  AND sr."orderId" IS NOT NULL
  AND o.status IN ('CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
```

Prisma equivalent:

```ts
const orphans = await prisma.stockReservation.findMany({
  where: {
    releasedAt: null,
    orderId: { not: null },
    order: {
      status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] },
    },
  },
  include: { order: { select: { status: true, confirmedAt: true, cancelledAt: true, deliveredAt: true, updatedAt: true } } },
});
```

### Q2: Which statuses count as consumed?

| Order status | StockReservation should be released? |
|---|---|
| RESERVED | ❌ NO — order is active; reservation legitimately holds stock |
| CONFIRMED | ✅ YES — stock sold via transition('CONFIRMED'); reservedQty decremented |
| PACKED / SHIPPED / DELIVERED | ✅ YES — downstream of CONFIRMED; reservation should already be marked released by Commit 1 going forward |
| CANCELLED | ✅ YES — reservedQty decremented in cancel path; reservation no longer holds stock |

**Recommendation:** include all 5 non-RESERVED statuses.

### Q3: How to avoid changing active RESERVED orders?

Two-fold protection:
1. `WHERE o.status NOT IN ('RESERVED')` — explicit exclusion in the read query.
2. Dry-run mode prints a "by-status" breakdown before any write. Operator visually verifies no RESERVED rows appear in the candidate set.

### Q4: How to dry-run counts first?

The backfill script supports two modes:

| Flag | Behavior |
|---|---|
| `--dry-run` (default) | Run the query. Print row count by status + first 10 sample rows. NO writes. |
| `--apply` | Same query, then perform `prisma.stockReservation.updateMany` per status bucket inside a transaction. |
| `--limit N` | Cap the number of rows processed (safety net for first run). |

Dry-run output (sample):

```
=== ORDER-RESERVATION-CLEANUP BACKFILL — DRY RUN ===
DB host: junction.proxy.rlwy.net:30000 (production)
Shop scope: ALL SHOPS

Candidate rows (releasedAt IS NULL, orderId NOT NULL, order.status non-RESERVED):
  CONFIRMED:        1,247 rows
  PACKED:           48 rows
  SHIPPED:          12 rows
  DELIVERED:        892 rows
  CANCELLED:        103 rows
  TOTAL:            2,302 rows

Sample (first 10):
  sr_abc... orderId=ord_001 status=CONFIRMED confirmedAt=2026-04-01T10:30:00Z bookingId=null
  sr_def... orderId=ord_002 status=CONFIRMED confirmedAt=2026-04-02T14:00:00Z bookingId=bk_xyz (sale-conversion)
  ...

If --apply is passed, releasedAt will be set to:
  CONFIRMED → order.confirmedAt
  CANCELLED → order.cancelledAt
  PACKED / SHIPPED / DELIVERED → order.confirmedAt (no separate ts; reservation was released at confirm time)

NO WRITES IN DRY-RUN. Re-run with --apply to proceed.
```

### Q5: Should backfill be manual SQL or script?

**Script.** TypeScript via `tsx` matching existing verifier pattern. Reasons:
- Prisma client gives type-safe access.
- Same production-safety guard pattern as `verify-booking-flow` (CONFIRM_NON_PROD_DB by default; bypass requires `ALLOW_PRODUCTION_BACKFILL=true` env).
- Script can iterate per-status to keep updateMany batches small.
- Easier to add reporting + audit log than raw SQL.

Raw SQL alternative would work but loses the safety harness.

### Q6: Production backup/snapshot needed?

**Yes — Railway PostgreSQL automatic backup.** Before any `--apply` run on production:
1. Confirm latest Railway daily snapshot exists (visible in Railway dashboard).
2. Optional: trigger manual snapshot via Railway dashboard → "Backup now" if available on plan tier.
3. Record snapshot timestamp in Boss memory.

Recovery if needed: Railway restore from snapshot. RPO ≈ 24h depending on plan.

Risk vs benefit: backfill only flips `releasedAt`. No row deletion. No quantity change. Worst case scenario: rollback by setting `releasedAt = null` again for rows touched by this script (script logs every row id touched, so reverse is deterministic).

### Q7: What rollback is possible?

Two layers:

**Layer A (preferred): script reverse mode.** Script logs every `sr.id` touched to `backfill-{timestamp}.log`. Reverse run reads the log + sets `releasedAt = null` for each logged row. Deterministic, fast.

**Layer B (last resort): Railway snapshot restore.** Affects entire DB, not just StockReservation. Higher operational cost; only used if Layer A log is lost.

The script should always write its log file to a non-source-controlled directory (e.g. `/tmp` or current working dir) and include in the dry-run output where the log will go.

### Q8: What report before any write?

Dry-run mandatory before `--apply`. Report includes:

```
1. DB target (sanitized host + db name)
2. Candidate row count by status
3. First 10 sample rows
4. releasedAt timestamp mapping (which order field maps to which status)
5. Estimated write count
6. Audit log destination
7. Reverse command syntax
8. Confirmation prompt before --apply (interactive or env-flag confirmation)
```

If the dry-run report and the actual `--apply` row count diverge by >5%, the apply phase should abort and require operator re-confirmation. This catches mid-run data drift (new orders converted between dry-run and apply).

---

## Backfill timestamp selection

Per status, set `releasedAt` to:

| Order status | releasedAt source |
|---|---|
| CONFIRMED | `order.confirmedAt` |
| CANCELLED | `order.cancelledAt` |
| PACKED | `order.confirmedAt` (reservation was released at confirm time, not at pack time) |
| SHIPPED | `order.confirmedAt` |
| DELIVERED | `order.confirmedAt` |

Fallback if any timestamp is null (defensive): use `order.updatedAt`. Log as a warning in the report.

Sale-conversion edge case: reservation may have `expiresAt = NO_EXPIRY_SENTINEL` (year 2099). Backfill does NOT change `expiresAt`. Only `releasedAt` flips.

---

## Script shape (proposed — NOT implemented)

```
scripts/backfill-stock-reservation-released-at.ts

Required env:
  CONFIRM_NON_PROD_DB=true (default; fails on production unless override)
  ALLOW_PRODUCTION_BACKFILL=true (explicit production override)
  DATABASE_URL=...

Flags:
  --dry-run (default; no writes)
  --apply (perform writes)
  --limit N (optional cap; default no cap)
  --since YYYY-MM-DD (optional date filter — only orders confirmed/cancelled after this date)
  --log-file PATH (optional; default ./backfill-{timestamp}.log)
  --reverse PATH (reverse run from a prior log file)

Exit codes:
  0  dry-run successful OR apply successful
  1  DB error / partial failure
  2  safety guard triggered
  3  reverse mode reverted N rows successfully
```

---

## Stop conditions for backfill script implementation

- Backfill query returns 0 rows on production → STOP, report. Either Commit 1 retroactively covered them or the bug never manifested in practice.
- Backfill row count exceeds 10,000 → STOP, paginate per-status with explicit batch flag.
- Any row has `releasedAt` already set (race with concurrent Commit-1 transition) → SKIP, log, continue.
- Any row has `orderId` set but the linked order doesn't exist (FK violation in data) → STOP, report. Should never happen given FK constraints.
- DB error mid-batch → roll back the transaction, abort, report which rows were touched.

---

## When to implement Commit 2

Only after ALL of:
- Commit 1 runtime fix is shipped + Vercel deploy green + production smoke 13/13 PASS for ≥1 week.
- Boss + ChatGPT approve this backfill plan.
- Railway snapshot confirmed within last 24h on production.
- Staging dry-run executed (if staging exists) showing expected candidate counts.

Implementation is small (~150 LOC TypeScript). Verification is a local Docker dry-run + production dry-run + production --apply.

---

## Refs

- ORDER-RESERVATION-CLEANUP design doc:
  [docs/superpowers/2026-05-12-order-reservation-cleanup-dissent.md](2026-05-12-order-reservation-cleanup-dissent.md)
- Verifier script (Commit 1):
  `scripts/verify-order-reservation-cleanup.ts`
- Stock repo: `src/server/repositories/stock.repository.ts`
- Order repo: `src/server/repositories/order.repository.ts` `transition`
- Existing verifier pattern: `scripts/verify-booking-flow.ts` (production-safety guard)
