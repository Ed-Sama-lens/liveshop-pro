# ORDER-RESERVATION-CLEANUP — design / dissent

**Status:** DESIGN + verifier scaffolding shipped. Runtime fix (Commit 1) DEFERRED — local Docker daemon offline at implementation time. See § "Implementation status 2026-05-12" below.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7
**Source:** Pre-existing bug flagged in [2026-05-11-sale-create-order-from-bookings-design.md §4](2026-05-11-sale-create-order-from-bookings-design.md) during Commit 2O-c-DESIGN audit.

## Implementation status 2026-05-12

- ✅ Design doc finalized + Boss approved.
- ✅ Verifier script shipped at `scripts/verify-order-reservation-cleanup.ts` (5 test cases — single reservation / already-released idempotency / multiple reservations per order / booking-converted reservation / no-reservations order).
- ✅ npm script `verify:order-reservation-cleanup` registered.
- ⏸ Runtime fix in `orderRepository.transition` **NOT yet shipped**. Local Docker daemon was offline during the implementation window. Per Boss 2026-05-12 PHASE 4 stop condition ("If Docker daemon unavailable: STOP and report"), the runtime change was reverted and only the verifier scaffolding was committed. When Docker is restored, the runtime fix can be re-applied via the design in §"Commit 1 — `fix(order): release StockReservation on RESERVED transition` (R1)" below and verified via the shipped script.

To restore + verify after Docker comes back:
```
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true \
  VERIFY_ORDER_RESERVATION_CLEANUP_RUN_ID=order-cleanup-$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:order-reservation-cleanup
```
Expected: 5/5 PASS after the runtime fix lands.

This doc audits the orphan-`StockReservation` problem that surfaces when `Order.status` transitions from `RESERVED` to `CONFIRMED` and answers Boss's 8 scoping questions. Implementation lands in a SEPARATE commit after Boss + ChatGPT review of this design.

---

## TL;DR

When an Order moves `RESERVED → CONFIRMED` via `orderRepository.transition()`, the variant `quantity` and `reservedQty` are both decremented (correct), but the underlying `StockReservation` row is **never marked `releasedAt`**. Result: rows accumulate with `releasedAt: null` even though their associated stock has been consumed. The bug exists in BOTH storefront-checkout-created reservations (24h expiry) and sale-conversion-created reservations (NO_EXPIRY_SENTINEL). Dashboards or reports filtering by `releasedAt IS NULL` overcount as "currently reserved" when no stock is actually held.

The fix is narrowly scoped: extend `orderRepository.transition('CONFIRMED')` to mark associated `StockReservation` rows released. Storefront flow is the larger consumer; sale conversion adds < 5% volume today. Recommend: future-only fix + optional one-time backfill of historical orphans behind a feature flag.

---

## Problem reconstruction

### Lifecycle of a `StockReservation` row

```
Storefront checkout (src/server/repositories/checkout.repository.ts:129)
   ──> stockReservation.create({ orderId, variantId, quantity, expiresAt: now+24h, releasedAt: null })
   ──> productVariant.reservedQty += quantity
   ──> Order(status='RESERVED') created

Sale conversion (src/server/repositories/booking.repository.ts:738-814)
   ──> existing StockReservation (created at Booking confirm time) is UPDATED:
       { orderId: newOrder.id }  ← gains orderId
       bookingId retained, releasedAt stays null, expiresAt stays at NO_EXPIRY_SENTINEL
   ──> productVariant.reservedQty NOT touched (stock already reserved at booking confirm)
   ──> Order(status='RESERVED') created
```

### Order status transitions (`orderRepository.transition`, src/server/repositories/order.repository.ts:347-411)

```
RESERVED → CANCELLED
   for each OrderItem: productVariant.reservedQty -= quantity
   StockReservation.releasedAt: NOT TOUCHED  ←── BUG
   StockReservation kept with releasedAt:null even though reservedQty decremented

RESERVED → CONFIRMED
   for each OrderItem:
     productVariant.quantity -= quantity      (stock consumed)
     productVariant.reservedQty -= quantity   (reservation accounting balanced)
   StockReservation.releasedAt: NOT TOUCHED  ←── BUG
   StockReservation kept with releasedAt:null forever

CONFIRMED → PACKED → SHIPPED → DELIVERED
   No stock impact. StockReservation already orphaned at CONFIRMED step.
```

### Where `releasedAt` IS correctly set today

- `stock.repository.ts:160` `release(reservationId)`: marks `releasedAt` + decrements `reservedQty` atomically. Used by `expireReservations()` cron.
- `booking.repository.ts:495` `cancel(bookingId)`: explicit reservation release inside the cancel-from-CONFIRMED branch.

These two paths handle their own lifecycle correctly. The bug is **only in `orderRepository.transition`**, which never touches `StockReservation` rows.

### Impact in production today

| Symptom | Severity | Affected query |
|---|---|---|
| Dashboard "open reservations" counter overcounts | Medium — operational confusion; admin sees "X units reserved" when zero stock is held | `prisma.stockReservation.count({ where: { releasedAt: null } })` |
| Per-variant available calc using `quantity - reservedQty` is CORRECT | **No impact** — `reservedQty` IS decremented properly at transition | Available stock display |
| Future audit query "reservations active by variant" via `releasedAt IS NULL` | Bug — would over-report | Historical sweeps, BI exports |
| `expireReservations()` cron behavior on orphaned storefront orders | Cron tries to `release()` an already-balanced reservation → AppError `ALREADY_RELEASED` (409). The `Promise.all` in cron does NOT catch per-row errors, so one bad row aborts the rest of the batch | Cron resilience |

**The available-stock display is CORRECT** because `reservedQty` is the source of truth and `transition()` decrements it properly. The bug only affects the `StockReservation` row state, which is a secondary audit anchor.

---

## Boss Q&A

### Q1: When Order RESERVED → CONFIRMED, should `StockReservation.releasedAt` be set?

**Yes.** The reservation represents "stock committed but not yet sold." At CONFIRMED time, stock is sold (quantity drops). The reservation has fulfilled its purpose and should be marked released.

Equally yes for RESERVED → CANCELLED: the reservation is undone and `reservedQty` is decremented; the row should reflect that with `releasedAt`.

### Q2: Does the current storefront checkout leave orphan reservations?

**Yes.** Same `orderRepository.transition()` is invoked by storefront admin moving orders through statuses. Every storefront order that has ever reached CONFIRMED has at least one orphan `StockReservation` row. Sale conversion (Commit 2H+ onwards) adds the same pattern.

### Q3: How to backfill or ignore old rows?

Three options:

| Option | Risk | Effort |
|---|---|---|
| **A. Future-only** — fix `orderRepository.transition`, leave historical orphans as-is. Documents the orphans as "pre-cleanup data". | Low | XS |
| **B. Backfill via one-shot script** — find all `StockReservation` rows where `releasedAt IS NULL` AND `orderId IS NOT NULL` AND `order.status IN ('CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED')`. Set `releasedAt = order.confirmedAt ?? order.cancelledAt ?? order.updatedAt`. Audit-only; no stock decrement (already done at transition). | Medium | M |
| **C. Lazy backfill on next admin Order view** — when admin opens an Order detail page, check + fix that order's reservations. Spread the cleanup over time. | Medium | M |

**Recommendation:** A (future-only fix) + B (one-shot backfill script behind `CONFIRM_NON_PROD_DB=true` guard mirroring existing verifier pattern) as a SEPARATE commit. Boss can opt to run backfill on production after one week of future-only running on prod to validate the fix is safe.

### Q4: Future orders only vs full sweep?

Recommend **future-only fix in commit 1**, then **optional one-shot backfill in commit 2**, both behind explicit opt-in. Reasons:

- Future-only is R1 — single repo method change. Production safe.
- Backfill touches historical rows. Even though it only flips `releasedAt`, mass-writes carry incident risk. Opt-in run with `CONFIRM_NON_PROD_DB=true` first.
- Splitting the commits lets Boss roll back the fix without rolling back the backfill (and vice versa).

### Q5: What does `releasedAt` mean?

**"This reservation no longer claims stock."** Two non-mutually-exclusive paths set it today:
1. Explicit release: stock returns to available pool. `stock.repository.release()` does this atomically alongside `reservedQty` decrement.
2. Cron expire: same path as (1), via `expireReservations()`.

The proposed cleanup adds a third path:
3. Order transition consumed the reserved stock — `releasedAt` marks "this reservation's stock was sold, not returned."

**Open ambiguity:** does future analytics need to distinguish path 1/2 (released back to pool) from path 3 (consumed by order)? Currently no field differentiates. Options:
- Keep using `releasedAt` for all 3 paths (simple — current schema).
- Add `StockReservation.releaseReason` text/enum: `'EXPIRED' | 'CANCELLED_BOOKING' | 'CANCELLED_ORDER' | 'CONSUMED_BY_ORDER'`. SCHEMA CHANGE → requires migration → R1 with downtime risk. Defer.

**Recommendation:** keep using `releasedAt` only in commit 1. If analytics need the breakdown later, add a column in a separate schema migration.

### Q6: Reports/jobs relying on `releasedAt IS NULL`?

Grep results:

- `src/server/repositories/stock.repository.ts:180` `expireReservations()`: `where: { releasedAt: null, expiresAt: { lte: now } }`. Today this filters by expiresAt anyway, so orphan storefront rows (expiresAt = 24h from order creation) WILL be picked up by cron AFTER 24h, even though the order itself has been CONFIRMED. Cron then tries to `release()` the orphan, which crashes the loop on `ALREADY_RELEASED` (409) because `reservedQty` is already balanced.

  **This is a real cron failure mode.** Currently mitigated by the fact that storefront orders move quickly to CONFIRMED within 24h, so the cron only sees a few orphan rows. Once the future-only fix lands, the cron stops seeing orphans entirely.

- `src/server/repositories/booking.repository.ts:170,214,407,576` — booking flow uses `releasedAt: null` filter to find ACTIVE reservations on a booking, before confirm/cancel/convert. Booking-side rows are correctly maintained by booking repo (`releasedAt` is set on cancel-from-CONFIRMED). No bug here.

- No other grep hits for `releasedAt` in `src/`.

So the only currently-broken consumer is `expireReservations()` cron, and the impact is bounded (it errors on one orphan per cron tick but the loop continues partially — actually no, `Promise.all` will reject on first failure and skip the rest of the batch).

### Q7: Test strategy without production mutation?

**Local Docker only.** Pattern matches existing verifiers:

1. New `scripts/verify-order-reservation-cleanup.ts`:
   - Guards: `CONFIRM_NON_PROD_DB=true` + local host check (mirrors `verify-booking-flow.ts:46-153`)
   - Setup: create shop + variant + customer + order + StockReservation
   - Test cases:
     a. RESERVED → CONFIRMED: assert `StockReservation.releasedAt !== null` after transition
     b. RESERVED → CANCELLED: same assertion
     c. CONFIRMED → PACKED (no stock impact): assert reservation state unchanged
     d. RESERVED → CONFIRMED where reservation already released externally: assert NO double-release (idempotent guard)
     e. Multiple OrderItems per order: assert ALL associated reservations released
     f. Storefront-style reservation (`bookingId: null`): assert released
     g. Sale-conversion-style reservation (`bookingId` set): assert released BUT `bookingId` preserved (audit trail)

2. Cleanup mirror: tight `startsWith: runId--` row deletion.

3. Unit tests if pure helpers added: full vitest, no DB.

No authenticated production mutation. Boss may run on staging if added later.

### Q8: R1 or R2?

**R1.** Reasons:
- Public repo method (`orderRepository.transition`) gains new side effect (StockReservation update). Other code paths consume this method (admin order page transitions, storefront flow).
- Side effect is database write — needs migration-aware deploy ordering (no schema change here, but production rollout still needs Vercel deploy + smoke).
- Rollback cost: revert commit + redeploy. Existing orphan rows persist; no data corruption introduced.

Not R0 because:
- Schema unchanged
- No data destruction
- No secret rotation
- Idempotent: adding `releasedAt` to a row that already has it = no-op (guard required in implementation)

Not R2 because:
- Cross-cutting behavior change to mutation path
- Production-data implications

---

## Recommended implementation split

### Commit 1 — `fix(order): release StockReservation on RESERVED transition` (R1)

**Scope:**
- Modify `orderRepository.transition()` to set `StockReservation.releasedAt` when transitioning out of `RESERVED` (to CONFIRMED or CANCELLED).
- Guard: only update reservations where `releasedAt === null` (idempotency).
- Find reservations by joining `Order → items[].variantId` + matching `StockReservation.orderId`.
- Wrap in same `prisma.$transaction` as existing stock decrement so any failure rolls back atomically.
- Do NOT touch `reservedQty` decrement (already correct).
- Do NOT touch sale-conversion `convertToOrder` path — reservation transition there is separate.

**Files allowed:**
- `src/server/repositories/order.repository.ts`
- `tests/unit/server/repositories/order.repository.test.ts` (new) — pure unit test mocking prisma
- `scripts/verify-order-reservation-cleanup.ts` (new) — local Docker E2E

**Stop conditions:**
- Migration appears necessary (e.g. to add `releaseReason` column)
- `transition()` body becomes complex enough to risk regression on storefront flow
- Reservation row count per order > 1 (multi-OrderItem case requires care)
- Sale-conversion `convertToOrder` needs co-ordination — STOP, separate dissent

### Commit 2 — `chore(order): backfill orphan StockReservation rows` (R1, optional)

**Scope:**
- `scripts/backfill-stock-reservation-released-at.ts`
- Production safety guards: `CONFIRM_NON_PROD_DB=true` mandatory; `--dry-run` flag default true; `--apply` flag explicit.
- Find rows: `StockReservation.releasedAt IS NULL AND orderId IS NOT NULL AND order.status IN ('CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED')`.
- For each row, set `releasedAt = order.confirmedAt ?? order.cancelledAt ?? order.deliveredAt ?? order.updatedAt` (best-effort timestamp).
- Audit log to `OrderAudit` for each touched row: `action: 'BACKFILL_RESERVATION_RELEASE'`.
- `reservedQty` UNCHANGED (already balanced).
- Boss runs manually on production via Railway shell + dotenv after staging dry-run.

**Stop conditions:**
- Backfill discovers anomalies (e.g. row count divergence per order) → STOP, surface for inspection
- Audit row volume exceeds 10,000 — STOP, paginate

### Commit 3 — `fix(stock): make expireReservations resilient to ALREADY_RELEASED` (R2, optional cleanup)

**Scope:**
- Change `Promise.all` in `expireReservations()` to `Promise.allSettled` so one ALREADY_RELEASED error doesn't abort the batch.
- Log failed rows for audit.

This is independent of Commits 1 + 2. Could ship anytime.

---

## What this dissent does NOT propose

- Schema change (no new column, no new index).
- Migration of `StockReservation` past 24h expiry semantics.
- Changes to `bookingRepository.convertToOrder` — sale-conversion StockReservation transition is correct as-is.
- Changes to `stock.repository.release` — works correctly.
- Changes to checkout repository — only the transition is broken.
- Customer-facing changes.
- New API routes.
- Performance optimization of `expireReservations()` cron.

---

## Open questions for Boss + ChatGPT

**O1 — Order of commits:** ship Commit 1 (future-only fix) and Commit 3 (cron resilience) together? Or separately? Cron resilience is small and orthogonal — could combine. Recommend: ship Commit 1 standalone for clearest review; ship Commit 3 immediately after.

**O2 — Backfill priority:** is Commit 2 (backfill) worth shipping? If "open reservations" dashboard is never built or admin doesn't query historical StockReservation directly, backfill is pure data hygiene. Defer until a real consumer needs it. Recommend: defer Commit 2 until Boss explicitly asks.

**O3 — `releaseReason` enum:** worth adding now to disambiguate consumed-by-order vs released-to-pool? Requires schema migration. Recommend: defer. Add a string column later only if analytics need it.

**O4 — Sale-conversion path:** `convertToOrder` does NOT mark `releasedAt` on the existing reservation (it sets `orderId` instead). That row will then be released by Commit 1 when the order transitions to CONFIRMED. Correct lifecycle. No additional change needed in conversion path.

**O5 — Test data risk:** verifier script creates real Order + StockReservation in local Docker DB. Cleanup deletes via runId prefix. Safe. Production database NEVER touched by the verifier.

---

## Refs

- Repo: [src/server/repositories/order.repository.ts](../../src/server/repositories/order.repository.ts) `transition`
- Stock: [src/server/repositories/stock.repository.ts](../../src/server/repositories/stock.repository.ts) `release` + `expireReservations`
- Checkout: [src/server/repositories/checkout.repository.ts](../../src/server/repositories/checkout.repository.ts) StockReservation create
- Sale conversion: [src/server/repositories/booking.repository.ts](../../src/server/repositories/booking.repository.ts) `convertToOrder`
- 2O-c design: [docs/superpowers/2026-05-11-sale-create-order-from-bookings-design.md](2026-05-11-sale-create-order-from-bookings-design.md) §4
- Schema: [prisma/schema.prisma](../../prisma/schema.prisma) `StockReservation` model
