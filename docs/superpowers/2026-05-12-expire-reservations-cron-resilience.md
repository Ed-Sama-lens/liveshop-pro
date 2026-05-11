# ORDER-RESERVATION-CLEANUP Commit 3 — `expireReservations()` cron resilience (design only)

**Status:** DESIGN ONLY. No code change in this commit. Implementation is small (~5-line patch) and gated on Boss + ChatGPT approval.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7
**Depends on:** independent of Commit 1 and Commit 2. Can ship anytime, but most useful AFTER Commit 1 because Commit 1 drastically reduces the orphan reservation pool the cron used to crash on.

This doc audits the `expireReservations()` cron failure mode + designs a resilient `Promise.allSettled` replacement.

---

## Problem

`src/server/repositories/stock.repository.ts` line 176-187:

```ts
export async function expireReservations(): Promise<number> {
  const now = new Date();

  const expired = await prisma.stockReservation.findMany({
    where: { releasedAt: null, expiresAt: { lte: now } },
    select: { id: true },
  });

  await Promise.all(expired.map((r) => release(r.id)));

  return expired.length;
}
```

`release()` (same file, line 149) throws `AppError('ALREADY_RELEASED', 'ALREADY_RELEASED', 409)` when called on a row that already has `releasedAt` set.

### Failure scenario today

1. Cron picks up batch of N expired reservations.
2. Some of them are orphan rows from CONFIRMED orders (pre-Commit-1 bug):
   - `releasedAt: null`
   - `expiresAt: <past>` (e.g. 24h after storefront order creation)
   - But the underlying stock was already decremented at order CONFIRMED time.
3. Cron calls `release()` on each row.
4. First row: `release()` sees `releasedAt: null`, sets it + decrements `reservedQty`. WRONG — `reservedQty` is now double-decremented (once at order CONFIRMED + once here).
5. Concurrent rows that hit `release()` after step 4 finishes succeed similarly, double-decrementing.
6. `Promise.all` aborts on the first rejection — which currently DOESN'T happen because `releasedAt` was null on entry, so no `ALREADY_RELEASED` is thrown. Instead, **silent data corruption** via double-decrement of `reservedQty`.

Wait — re-reading the design dissent for the order cleanup, the more accurate failure shape:

If Commit 1 has shipped: orphan reservations on CONFIRMED orders no longer exist, so cron mostly sweeps actual expired-via-timeout RESERVED-order reservations. Behavior is correct.

If Commit 1 has NOT shipped: orphan reservations DO get released by cron, AND `reservedQty` IS double-decremented. The cron does not crash — it silently corrupts stock counts.

### So which is it — crash or silent corruption?

**Silent corruption** of `reservedQty` (under-counts reserved stock by 2× decrement per orphan row).

The earlier design doc (`2026-05-12-order-reservation-cleanup-dissent.md` §Q6) said "Promise.all aborts on first failure" — that was based on assuming `release()` would throw ALREADY_RELEASED on orphan rows. But orphan rows have `releasedAt: null`, so they pass the `release()` guard and proceed to decrement.

### Corrected impact

Pre-Commit-1: cron silently double-decrements `reservedQty` for every storefront order that has reached CONFIRMED and is still within 24h `expiresAt` window. The bug is bounded (only 24h window matters; rows older than that fall outside the cron's `expiresAt <= now` filter — wait, that's exactly when they DO match). So actually every storefront CONFIRMED order will eventually be double-decremented by cron after its 24h window closes.

Sale-conversion orders are SAFE here because they have `expiresAt: NO_EXPIRY_SENTINEL` (year 2099) — cron's `expiresAt <= now` never matches them.

### Impact severity reassessment

| Scenario | Impact | Severity |
|---|---|---|
| Storefront-checkout CONFIRMED order, 24h+ after creation | `reservedQty` double-decremented by cron | Medium — `reservedQty` can go negative; available-stock calculation overcounts |
| Storefront-checkout CANCELLED order | Same — cron decrements again after the cancel path already did | Medium |
| Sale-conversion CONFIRMED order | Safe — NO_EXPIRY_SENTINEL prevents cron pickup | None |
| Legitimately-expired RESERVED order (admin abandoned cart, 24h timeout) | Correct behavior — cron expires it properly | None |

**`reservedQty` going negative** is bounded by Prisma's `decrement` operation, which has no built-in zero floor in the schema. Could cause:
- Available stock display showing `quantity - reservedQty` > `quantity` (effectively showing more stock than exists physically).
- Stock-reservation atomic SQL guard `WHERE quantity - reservedQty >= ?` passes when it shouldn't (overselling risk).

So this is actually a bigger bug than the design doc initially framed. Commit 1 prevents new orphan creation. Commit 3 should ship to make the cron safe against any orphan rows that exist before Commit 1's effect propagates.

---

## Proposed fix

Replace `Promise.all` with `Promise.allSettled` + per-row resilience. Also add a sanity guard to `release()` itself: refuse to decrement if the row's stock has already been accounted for elsewhere.

### Option A: minimal — `Promise.allSettled` + logging

```ts
export async function expireReservations(): Promise<{
  attempted: number;
  released: number;
  failed: number;
}> {
  const now = new Date();

  const expired = await prisma.stockReservation.findMany({
    where: { releasedAt: null, expiresAt: { lte: now } },
    select: { id: true },
  });

  const results = await Promise.allSettled(expired.map((r) => release(r.id)));

  const released = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) {
    logger.warn('expireReservations: some releases failed', {
      attempted: expired.length,
      released,
      failed,
      // Log first 5 failure messages for diagnostics; avoid leaking IDs
      sampleFailures: results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .slice(0, 5)
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))),
    });
  }

  return { attempted: expired.length, released, failed };
}
```

**Pros:** small, focused, no schema change, no `release()` change. Catches the Promise.all abort behavior change.

**Cons:** does NOT fix the underlying double-decrement on orphan rows. Cron will still silently corrupt `reservedQty` on pre-Commit-1 storefront orphans. Only protects against future ALREADY_RELEASED errors (which were unlikely to fire pre-Commit-1).

### Option B: A + orphan detection in `release()`

```ts
export async function release(reservationId: string): Promise<ReleaseResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: {
        id: true,
        variantId: true,
        quantity: true,
        releasedAt: true,
        orderId: true,
        order: { select: { status: true } },
      },
    });

    if (reservation.releasedAt !== null) {
      throw new AppError('Reservation already released', 'ALREADY_RELEASED', 409);
    }

    // ORPHAN GUARD: if this reservation belongs to an Order that has
    // already moved past RESERVED, the stock was already decremented
    // by orderRepository.transition. Do NOT decrement again.
    const isOrphanOrderReservation =
      reservation.orderId !== null &&
      reservation.order !== null &&
      ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(
        reservation.order.status
      );

    const releasedAt = new Date();

    await tx.stockReservation.update({
      where: { id: reservationId },
      data: { releasedAt },
    });

    if (!isOrphanOrderReservation) {
      // Normal release path — return stock to pool.
      await tx.productVariant.update({
        where: { id: reservation.variantId },
        data: { reservedQty: { decrement: reservation.quantity } },
      });
    }

    return Object.freeze({ reservationId, releasedAt });
  });
}
```

**Pros:** fixes the silent double-decrement for any orphan rows that exist BEFORE Commit 1 effect or Commit 2 backfill completes.

**Cons:** changes `release()` semantics. Callers that rely on `reservedQty` always decrementing on release would break — but in practice no callers do (only the cron + booking cancel; booking cancel path doesn't go through `release()`).

### Recommendation

**Ship A first as Commit 3.** It's a 5-line change with clear test coverage path. Defer B until after Commit 1 + Commit 2 backfill complete, because:
- Once Commit 1 ships, no new orphans are created.
- Once Commit 2 backfill runs, no historical orphans remain.
- At that point, B is unnecessary defensive code — `release()` only encounters legitimate RESERVED-order timeouts.

If Boss prefers belt-and-suspenders, ship B together with A. Same commit boundary.

---

## Implementation

### Files allowed
- `src/server/repositories/stock.repository.ts` — modify `expireReservations()` (Option A) + optionally `release()` (Option B).
- `tests/unit/server/repositories/stock.repository.test.ts` (NEW) — unit tests mocking Prisma.

### Verification plan
- `npx tsc --noEmit` clean.
- `npx vitest run` full suite + new stock-repo tests.
- Local Docker E2E: create 3 reservations — 1 expirable + 1 already-released + 1 fictional "throw on release" mock — confirm cron attempts all 3 + logs the failure + returns aggregated counts. Reuse `verify-order-reservation-cleanup` script pattern.
- No production smoke change (cron runs server-side; no Vercel route affected).
- Mutation grep stays at 3 POSTs.

### Stop conditions
- `release()` is consumed by callers other than `expireReservations` + `booking.repository.cancel` (rare path). Grep verifies before edit.
- Option B's orphan-detection logic requires a join — verify Prisma generates the include correctly + that the transaction client supports it.
- Logger import doesn't exist in stock.repository today. Boss spec says: do NOT touch unrelated logger files. So Option A's logging step should either reuse an existing logger import OR use `console.warn` (acceptable for server-side cron).

---

## Open questions

**P1 — Logging mechanism:** project uses `pino` per package.json. Stock repo currently does NOT import any logger. Options:
- Reuse `logger` from `src/lib/logging/logger.ts` (if exists) — small import.
- Use `console.warn` — matches project's existing pattern for server-side library code (no app instrumentation).

Recommend: import existing project logger if present; fall back to `console.warn`.

**P2 — Should `expireReservations()` return shape change be backward-compatible?**

Current: `Promise<number>` (count of expired rows).
Proposed: `Promise<{attempted, released, failed}>`.

If any caller exists for `expireReservations()` other than the cron itself, the return-shape change is breaking. Recommend grep + fix consumers in the same commit, OR keep returning `number` and emit counts via logger only.

**P3 — Cron invocation frequency:**

Where is `expireReservations()` invoked? Need to grep for callers. If it's invoked from a Bull queue worker or a separate cron route, that caller must be updated to match the new return shape (or not, if we keep P2 backward-compatible).

**P4 — Race with Commit 1:**

If Commit 1 ships first and runs in production for a week before Commit 3, the cron has already double-decremented an unknown number of `reservedQty` values during that week. Commit 3 doesn't retroactively repair `reservedQty`. Boss should run a separate one-shot sanity check after Commit 3 ships to surface variants with `reservedQty > 0` that have no active StockReservation — those are candidates for manual `reservedQty` reset. Out of Commit 3 scope.

---

## Refs

- ORDER-RESERVATION-CLEANUP design: `2026-05-12-order-reservation-cleanup-dissent.md`
- Backfill plan: `2026-05-12-order-reservation-backfill-plan.md`
- Cron source: `src/server/repositories/stock.repository.ts` lines 149-187
- Existing verifier pattern: `scripts/verify-booking-flow.ts`
