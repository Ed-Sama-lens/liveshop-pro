# /sale Booking Runtime Design (Commit 2A)

Date: 2026-05-09
Author: Claude (under Boss instruction)
Project: liveshop-pro
Phase: Phase 1 manual /sale MVP — runtime design only
Status: DOC ONLY. No code, no schema, no tests.

Companion to: `docs/superpowers/2026-04-06-sale-mvp-dissent.md`
Schema reference: Commit 1 (`bb8b973`) + migration `20260508171617_add_unified_inbox_and_sale_mvp`

---

## 1. Scope

### In scope (Commit 2B implementation, after this design approved)

- Booking confirm service — pending → confirmed with stock reservation
- Booking cancel/release service — release reservation if confirmed; status-only update if pending
- StockReservation reuse via new `bookingId` column (Commit 1 added)
- BookingHistory write on every status transition
- Idempotency guard on booking confirm (handle double-click, retry)
- Targeted vitest tests for service behavior

### Out of scope (NOT in Commit 2)

- UI / pages / components
- Webhook endpoint (FB / Messenger / WhatsApp / Telegram)
- Comment parser
- Bull queue
- Auto-expire worker (cron, scheduled task, on-deploy hook)
- Convert-to-order — DEFERRED to Commit 3 separate design + dissent
- Manual booking creation flow — DEFERRED to Commit 2C or merged into Commit 3 if simple
- Existing checkout / cart / order / payment behavior — NO modifications
- Legacy Chat / ChatMessage migration
- pak-ta-kra (different project)
- Pre-existing untracked files (`ErrorBoundary*`, `providers/`, `lib/logger/`, `tests/unit/hooks/`)

---

## 2. Existing code inspection (read-only)

Files inspected:

| File | Findings |
|---|---|
| `prisma/schema.prisma` lines 181-201 | `ProductVariant.quantity` Int, `reservedQty` Int @default(0). `available = quantity - reservedQty` computed in app, not DB. |
| `prisma/schema.prisma` lines 203-216 | `StockReservation`: `variantId` required, `orderId String?` nullable, `bookingId String?` nullable (added in Commit 1), `quantity` Int required, `expiresAt DateTime` REQUIRED (NOT nullable), `releasedAt DateTime?` nullable. |
| `src/server/repositories/stock.repository.ts:103-142` | `reserve(variantId, quantity, orderId?)`: read-then-update inside `prisma.$transaction`. Throws `AppError('INSUFFICIENT_STOCK', 409)` if `available < quantity`. Hardcoded 15-min `expiresAt`. NOT atomic — race condition window between read and update. |
| `src/server/repositories/stock.repository.ts:149-174` | `release(reservationId)`: idempotency-guarded — throws `'ALREADY_RELEASED'` if `releasedAt !== null`. Decrements `reservedQty`. |
| `src/server/repositories/checkout.repository.ts:97-153` | Storefront checkout reserves stock at order creation (`status='RESERVED'`). Increments `reservedQty`, creates `StockReservation` with `orderId` + 24h `expiresAt`. |
| `src/server/repositories/order.repository.ts:347-397` | `transition()` for orders. `RESERVED → CONFIRMED` decrements BOTH `quantity` and `reservedQty` (sold). `* → CANCELLED` decrements `reservedQty` only (release). |
| `src/server/services/activity.service.ts` | Service layer convention: plain exported functions; calls repository; non-blocking. `logActivity()` fire-and-forget. |
| `src/server/repositories/order.repository.ts` (broader) | `Object.freeze({ ... })` repository pattern. Methods named `findMany`, `findById`, `create`, `update`, `transition`, `remove`. |
| `src/lib/errors/index.ts` (referenced) | Custom errors: `AppError` (with code + status), `NotFoundError`, `ValidationError`, `ConflictError`. |
| `tests/setup.ts` | Single line: `import '@testing-library/jest-dom/vitest';`. No DB mocking infra. |
| `tests/unit/server/repositories/webhook.signPayload.test.ts` | Existing test pattern: pure-function unit tests against extracted helpers. No Prisma calls. |
| `tests/unit/lib/auth/permissions.test.ts` (sampled) | Pure-function tests on `canAccess`, `getAllowedRoles`. |

### Key inferences

1. **No DB-mock harness exists.** All current "service-level" tests are on pure helpers. Booking service that hits DB will require either:
   - (a) extracting pure helpers and testing them only (status transition rules, available-check math)
   - (b) introducing a real test DB (heavier, out of Phase 1 scope)
   - (c) using `vi.mock('@/lib/db/prisma')` to mock the Prisma client

   **Recommendation**: option (a) for Phase 1. Extract pure helpers; integration tests against real DB deferred.

2. **Existing reserve() race condition** — the read-then-update pattern in `stock.repository.ts:108-133` is NOT atomic. Two concurrent reserves can both pass the `available >= quantity` check before either increments `reservedQty`. Production has lived with this bug because cart contention is rare. Booking confirm WILL hit higher concurrency (live-sell mass-comment scenarios) and needs the atomic conditional update pattern from Boss decision §5.

3. **`StockReservation.expiresAt` is NOT nullable** in current schema. Even though Phase 1 has no auto-expire, every reservation row needs a value. **Decision needed**: use a far-future sentinel (e.g. `new Date('2099-01-01')`) for booking reservations? Or accept Phase 1 leaving expiresAt = far-future and document?

   **Recommendation**: far-future sentinel (`new Date('2099-12-31T23:59:59Z')`). Documents intent as "no auto-expire" while satisfying NOT NULL. Existing `expireReservations()` cron scans `expiresAt <= now` so far-future is safe.

4. **Order's existing transition `RESERVED → CONFIRMED` decrements both `quantity` and `reservedQty`.** This is the "stock-actually-sold" path. Booking → Order conversion (Commit 3) must:
   - NOT re-increment `reservedQty` when Order is created (booking already incremented it)
   - Transfer the `StockReservation.bookingId` row to also have `orderId` set (or create new tracking)
   - When Order moves `RESERVED → CONFIRMED`, the existing decrement of `reservedQty` is correct ONCE only

   This is a Commit 3 problem. Flagged here to constrain Commit 2 design.

---

## 3. Proposed file layout

Following existing repo convention (`src/server/repositories/*.repository.ts` + `src/server/services/*.service.ts`):

| Layer | File | Purpose |
|---|---|---|
| Repository | `src/server/repositories/booking.repository.ts` | DB CRUD + transaction-safe confirm/release. Object.freeze pattern. Multi-tenant by shopId. |
| Service (optional thin layer) | `src/server/services/booking.service.ts` | Orchestrate audit logging (`logActivity`) + future notifications. Phase 1 may skip if repo handles BookingHistory directly. |
| Pure helpers | `src/lib/sale/booking-rules.ts` | Pure functions: `canTransitionBookingStatus`, `computeAvailable`, `validateBookingForConfirm`. Testable in isolation. |
| Errors | reuse `src/lib/errors/index.ts` | Add new error codes only if missing. |

Decision: **start with `booking.repository.ts` only**, defer `booking.service.ts` until a clear orchestration need (notification on confirm, etc.) emerges. Repo writes BookingHistory directly in same transaction. Audit log goes via existing `logActivity()` (fire-and-forget after txn commit).

---

## 4. Confirm booking transaction

### Public method signature

```ts
// src/server/repositories/booking.repository.ts (proposed)

export interface ConfirmBookingInput {
  readonly bookingId: string;
  readonly shopId: string;       // RBAC scoping
  readonly userId: string;        // who confirmed (admin)
}

export interface ConfirmBookingResult {
  readonly bookingId: string;
  readonly status: 'CONFIRMED';
  readonly reservationId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly idempotent: boolean;   // true if already-confirmed no-op
}

export const bookingRepository = Object.freeze({
  async confirm(input: ConfirmBookingInput): Promise<ConfirmBookingResult> { ... },
  async cancel(input: CancelBookingInput): Promise<CancelBookingResult> { ... },
  // ...
});
```

### Transaction body

Pseudocode (NOT implementation):

```
prisma.$transaction(async tx => {
  // 1. Read booking + broadcast product (single query with include)
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, shopId },
    include: { broadcastProduct: { include: { variant: true, product: true } }, stockReservations: { where: { releasedAt: null } } }
  });
  if (!booking) throw new NotFoundError('BOOKING_NOT_FOUND');

  // 2. Idempotency check — already CONFIRMED with active reservation matching this booking
  if (booking.status === 'CONFIRMED') {
    const matching = booking.stockReservations.find(r => r.quantity === booking.quantity);
    if (matching) {
      return { bookingId, status: 'CONFIRMED', reservationId: matching.id, variantId: matching.variantId, quantity: matching.quantity, idempotent: true };
    }
    throw new AppError('RESERVATION_INTEGRITY_ERROR', 'Booking is CONFIRMED but no matching active StockReservation', 500);
  }

  // 3. Status transition guard (use pure helper)
  if (booking.status !== 'PENDING_REVIEW') {
    throw new AppError('BOOKING_INVALID_STATUS', `Cannot confirm from status=${booking.status}`, 409);
  }

  // 4. Resolve variantId
  const variantId = booking.broadcastProduct.variantId
    ?? throwAppError('VARIANT_REQUIRED', 'BroadcastProduct has no variantId; whole-product bookings not yet supported');

  // 5. Atomic conditional reserve (CONCURRENCY-SAFE)
  //    Use updateMany with a guard predicate so only one transaction wins.
  //    Prisma updateMany allows where filters but not arithmetic in WHERE.
  //    Two-step:
  //      a. raw SQL: UPDATE "ProductVariant" SET "reservedQty"="reservedQty"+$qty WHERE id=$id AND quantity-"reservedQty">=$qty
  //      b. check rowCount === 1
  //    OR: select with `FOR UPDATE`, then update — needs raw SQL since Prisma client doesn't expose row locking directly.
  //
  //    Decision (proposed): use `tx.$executeRaw` with the conditional update pattern. Simpler and proven.

  const updatedRows: number = await tx.$executeRaw`
    UPDATE "ProductVariant"
    SET "reservedQty" = "reservedQty" + ${booking.quantity}
    WHERE id = ${variantId}
      AND quantity - "reservedQty" >= ${booking.quantity}
  `;
  if (updatedRows !== 1) {
    throw new AppError('INSUFFICIENT_STOCK', `Cannot reserve ${booking.quantity} for variant ${variantId}`, 409);
  }

  // 6. Create StockReservation row
  const FAR_FUTURE = new Date('2099-12-31T23:59:59Z');
  const reservation = await tx.stockReservation.create({
    data: {
      variantId,
      bookingId: booking.id,
      orderId: null,
      quantity: booking.quantity,
      expiresAt: FAR_FUTURE,  // sentinel: no auto-expire in Phase 1
    },
  });

  // 7. Update Booking
  const now = new Date();
  await tx.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED', confirmedAt: now },
  });

  // 8. Write BookingHistory
  await tx.bookingHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'CONFIRMED',
      changedById: userId,
      reason: null,
    },
  });

  return {
    bookingId: booking.id,
    status: 'CONFIRMED',
    reservationId: reservation.id,
    variantId,
    quantity: booking.quantity,
    idempotent: false,
  };
});

// 9. After commit (NOT in transaction): fire-and-forget audit log
logActivity({
  shopId, userId, userName: null,
  action: 'BOOKING_CONFIRM',
  entity: 'booking',
  entityId: bookingId,
  description: `Booking ${bookingId} confirmed for variant ${variantId} qty ${quantity}`,
  metadata: { reservationId, variantId, quantity },
}).catch(() => {});
```

---

## 5. Concurrency strategy

**Per Boss decision §5, use atomic conditional update via raw SQL inside the transaction.**

The chosen pattern:

```sql
UPDATE "ProductVariant"
SET "reservedQty" = "reservedQty" + $qty
WHERE id = $variantId
  AND quantity - "reservedQty" >= $qty
```

`$executeRaw` returns row count. If `count === 1`, increment succeeded atomically. If `count === 0`, available was insufficient — throw `INSUFFICIENT_STOCK`.

### Why this works

- Postgres takes a row lock during UPDATE.
- The `WHERE quantity - reservedQty >= $qty` predicate is evaluated at lock-acquisition time inside the same statement.
- Two concurrent transactions cannot both pass the predicate — the second sees the already-incremented `reservedQty` after the first commits (or blocks until the first completes if same row).
- Within `prisma.$transaction`, all subsequent operations use the same DB connection, so the row-level lock from the UPDATE persists until commit.

### Why NOT use existing `stock.reserve()` from `stock.repository.ts`

That function uses read-then-update — vulnerable to race. Booking confirm in live-sell context (mass concurrent comments → mass admin-confirms) is HIGHER concurrency than checkout (one customer per cart). New atomic path is correct.

### Caveat

The existing checkout flow STILL has the read-then-update race. NOT in Commit 2 scope to fix. Documented for future hardening (Commit 4+ candidate).

---

## 6. Idempotency / duplicate confirm

Per Boss decision §6:

| Current state | Action | Behavior |
|---|---|---|
| `PENDING_REVIEW` | First confirm | Reserve + transition + history. Returns `idempotent: false`. |
| `CONFIRMED` + matching active StockReservation (same `bookingId`, `releasedAt=null`, `quantity` matches) | Repeat confirm | No-op success. Returns `idempotent: true`, same reservationId. |
| `CONFIRMED` + NO matching active StockReservation | Repeat confirm | `RESERVATION_INTEGRITY_ERROR` 500 — data corruption requires manual intervention. |
| `CONFIRMED` + reservation mismatch (different qty) | Repeat confirm | Same `RESERVATION_INTEGRITY_ERROR`. |
| `CONVERTED_TO_ORDER` | Confirm | `BOOKING_INVALID_STATUS` 409. |
| `CANCELLED` / `EXPIRED` | Confirm | `BOOKING_INVALID_STATUS` 409. |

### Helper proposal

```ts
// src/lib/sale/booking-rules.ts (pure)

export function isAlreadyConfirmedIdempotent(
  status: BookingStatus,
  matchingActiveReservation: StockReservation | null,
  expectedQuantity: number,
): { idempotent: boolean; integrityError: boolean } {
  if (status !== 'CONFIRMED') return { idempotent: false, integrityError: false };
  if (matchingActiveReservation && matchingActiveReservation.quantity === expectedQuantity) {
    return { idempotent: true, integrityError: false };
  }
  return { idempotent: false, integrityError: true };
}
```

Pure function = unit-testable without DB.

### `idempotencyKey` field — optional Phase 1

Schema has `Booking.idempotencyKey String?` with `@@unique([shopId, idempotencyKey])`. NOT used in Commit 2. Reserved for parser-driven booking creation in Phase 2.

---

## 7. Cancel / release transaction

### Public method signature

```ts
export interface CancelBookingInput {
  readonly bookingId: string;
  readonly shopId: string;
  readonly userId: string;
  readonly reason?: string;
  readonly toStatus: 'CANCELLED' | 'EXPIRED';
}

export interface CancelBookingResult {
  readonly bookingId: string;
  readonly status: 'CANCELLED' | 'EXPIRED';
  readonly stockReleased: boolean;
  readonly releasedQuantity: number;
}
```

### Transaction body (pseudocode)

```
prisma.$transaction(async tx => {
  const booking = await tx.booking.findFirst({
    where: { id, shopId },
    include: { stockReservations: { where: { releasedAt: null } } },
  });
  if (!booking) throw NotFoundError('BOOKING_NOT_FOUND');

  // Block invalid transitions
  if (booking.status === 'CONVERTED_TO_ORDER') {
    throw AppError('BOOKING_INVALID_STATUS', 'Use order cancel/refund flow', 409);
  }
  if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
    // Idempotent: already cancelled/expired, return no-op
    return { bookingId: booking.id, status: booking.status, stockReleased: false, releasedQuantity: 0 };
  }

  let stockReleased = false;
  let releasedQuantity = 0;

  if (booking.status === 'CONFIRMED') {
    // Find active reservation owned by this booking
    const reservation = booking.stockReservations[0];  // expect exactly 1 active per booking
    if (!reservation) {
      throw AppError('RESERVATION_INTEGRITY_ERROR', 'Confirmed booking has no active StockReservation', 500);
    }

    // Atomic decrement of reservedQty (concurrency-safe)
    const updatedRows = await tx.$executeRaw`
      UPDATE "ProductVariant"
      SET "reservedQty" = "reservedQty" - ${reservation.quantity}
      WHERE id = ${reservation.variantId}
        AND "reservedQty" >= ${reservation.quantity}
    `;
    if (updatedRows !== 1) {
      throw AppError('RESERVATION_INTEGRITY_ERROR', 'reservedQty would go negative', 500);
    }

    // Mark reservation released
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: new Date() },
    });

    stockReleased = true;
    releasedQuantity = reservation.quantity;
  }
  // PENDING_REVIEW → no stock to release; just status update

  const now = new Date();
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: toStatus,
      cancelledAt: toStatus === 'CANCELLED' ? now : null,
      releasedAt: stockReleased ? now : null,
      cancellationReason: toStatus === 'CANCELLED' ? (reason ?? null) : null,
      releaseReason: toStatus === 'EXPIRED' ? (reason ?? null) : null,
    },
  });

  await tx.bookingHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus,
      changedById: userId,
      reason: reason ?? null,
    },
  });

  return { bookingId: booking.id, status: toStatus, stockReleased, releasedQuantity };
});
```

### Negative-stock guard

The atomic `WHERE "reservedQty" >= $qty` predicate prevents `reservedQty` from going below zero. If the predicate fails, throw `RESERVATION_INTEGRITY_ERROR` 500. Should never happen in correct flow but protects against data corruption.

---

## 8. Convert-to-order — DEFERRED to Commit 3

Per Boss decision §8.

Commit 3 separate dissent + design needed. Constraints from this design:

- `StockReservation.bookingId` rows from Commit 2 must be reusable when converting to Order (e.g. by setting `orderId` on the same row OR creating an explicit transition record)
- `reservedQty` was incremented at booking confirm; conversion MUST NOT re-increment
- Order status `RESERVED → CONFIRMED` decrements both `quantity` and `reservedQty` (existing logic). Path from booking confirm to that exact state must avoid double-counting

Open questions for Commit 3:
- (a) Same `StockReservation` row gets `orderId` set in addition to `bookingId`?
- (b) Or close booking-side reservation (`releasedAt` set) and create a new order-side reservation for the same variant + quantity in one transaction (no `reservedQty` net change)?

Option (a) is simpler (one row, two FKs). Option (b) cleaner audit but risks transient race. Boss decides at Commit 3.

---

## 9. Manual booking creation — DEFERRED

Per Boss decision §9.

Commit 2 = confirm + cancel of EXISTING Booking rows only.

If tests need a Booking row, they create it via direct Prisma call in test setup, NOT via a service method. This keeps service surface minimal.

If a manual-create method is required later, it MUST:
- Create with `source = MANUAL`
- Allow direct `CONFIRMED` only by calling the same `confirm()` transaction (no inline reservation logic)

---

## 10. Error types

Reuse existing `AppError` with code + status. New codes (proposed):

| Code | HTTP | When |
|---|---|---|
| `BOOKING_NOT_FOUND` | 404 | Booking doesn't exist or wrong shop |
| `BOOKING_INVALID_STATUS` | 409 | Cannot transition from current status |
| `BROADCAST_PRODUCT_NOT_FOUND` | 404 | Booking's BroadcastProduct missing |
| `VARIANT_REQUIRED` | 422 | BroadcastProduct.variantId is null (whole-product not supported in Phase 1) |
| `VARIANT_NOT_FOUND` | 404 | ProductVariant deleted underneath |
| `INSUFFICIENT_STOCK` | 409 | Atomic update returned 0 rows |
| `RESERVATION_INTEGRITY_ERROR` | 500 | CONFIRMED booking missing active reservation, or reservedQty would go negative |
| `RESERVATION_ALREADY_RELEASED` | 409 | Defensive — should not occur via service flow |

UNAUTHORIZED stays at API route layer via `requireAuth()` + role check (existing pattern). NOT a service-level error.

---

## 11. Test plan for Commit 2B

Following existing test convention (pure-function tests, no DB mock harness yet):

### Pure-function tests (`src/lib/sale/booking-rules.ts`)

| Test | Target |
|---|---|
| `canTransitionBookingStatus(PENDING_REVIEW, CONFIRMED) === true` | status state machine |
| `canTransitionBookingStatus(CONFIRMED, CANCELLED) === true` | |
| `canTransitionBookingStatus(CONVERTED_TO_ORDER, CANCELLED) === false` | |
| `canTransitionBookingStatus(CANCELLED, CONFIRMED) === false` | |
| `computeAvailable({ quantity: 10, reservedQty: 3 }) === 7` | math |
| `isAlreadyConfirmedIdempotent('CONFIRMED', matchingReservation, 5) === { idempotent: true }` | idempotency |
| `isAlreadyConfirmedIdempotent('CONFIRMED', null, 5) === { integrityError: true }` | |
| `isAlreadyConfirmedIdempotent('PENDING_REVIEW', _, _) === { idempotent: false }` | |
| `isAlreadyConfirmedIdempotent('CONFIRMED', { quantity: 3 }, 5) === { integrityError: true }` | qty mismatch |

### Repository tests — DB-touching, deferred unless test DB harness lands

| Test | Status |
|---|---|
| Confirm pending booking reserves stock and writes history | DEFERRED (needs test DB or Prisma mock) |
| Confirm fails when insufficient available stock | DEFERRED |
| Double confirm does not double-reserve (idempotent path) | DEFERRED |
| Confirmed booking without reservation raises `RESERVATION_INTEGRITY_ERROR` | DEFERRED |
| Cancel pending booking changes status, no reservedQty change | DEFERRED |
| Cancel confirmed booking releases reservation, decrements reservedQty | DEFERRED |
| Cancel already-cancelled booking is no-op | DEFERRED |
| Cannot cancel CONVERTED_TO_ORDER via this service | DEFERRED |
| Concurrent confirm — only one wins, other gets `INSUFFICIENT_STOCK` | DEFERRED — requires real Postgres + parallel transactions |

**Recommendation**: ship Commit 2B with pure-helper tests only. Mark DB-touching tests as TODO with `it.skip(...)` and a clear `// requires test DB harness — Phase 2 backlog` comment. Do NOT claim "tests pass" for skipped tests. Report explicit pass/skip counts.

If Boss wants real DB-touching tests in Commit 2B, separate sub-task to set up test DB harness (likely uses Railway dev DB or Docker Postgres + `prisma migrate deploy` in CI). That is a multi-file infra change deserving its own dissent.

### Pre-existing socket tests (NOT touched)

`tests/unit/server/socket/index.test.ts` has 2 pre-existing TS errors from commit `62b2824`. Not from this work. Will report separately and not fix in Commit 2B.

---

## 12. Verification protocol for Commit 2A (this commit)

```
git status --short                         # confirm only this doc staged
git remote -v                              # liveshop-pro
git branch --show-current                  # master
git log -1 --oneline                       # 67415d5 doc cleanup
# no code changes
# no schema changes
# no migration changes
# no pak-ta-kra changes
# tsc not required (doc only)
```

After commit:
```
git log -1 --oneline                       # new commit hash
ls "C:/Users/Asus/COWORK/code/pak-ta-kra/" # untouched
```

Report back to Boss:
- Files inspected list (above)
- Proposed file paths for Commit 2B
- Atomic stock update SQL pattern
- Idempotency rules
- Error codes
- Test scope (pure-helpers in Commit 2B, DB-touching deferred)
- Pre-existing untracked files NOT committed
- Commit hash

---

## 13. After Commit 2A

Boss reviews this design. After approval:

### Commit 2B implementation scope

1. `src/lib/sale/booking-rules.ts` — pure helpers (status state machine, computeAvailable, isAlreadyConfirmedIdempotent)
2. `src/server/repositories/booking.repository.ts` — `confirm()`, `cancel()` methods using `Object.freeze` repo pattern
3. `tests/unit/lib/sale/booking-rules.test.ts` — ~9 pure-function tests
4. (Optional, if added) `src/server/services/booking.service.ts` — orchestration layer with `logActivity` calls

5. `npx prisma generate` — verify Prisma types pick up new repo
6. `npx tsc --noEmit` — clean (pre-existing socket test errors expected; report separately)
7. `npm run test -- tests/unit/lib/sale/` — targeted pass count
8. NO Vercel deploy verification (this is internal repo code only; no breaking change to existing routes)

### Commit 2B explicit no-go (re-stated)

- No UI
- No `/sale/...` API routes (Commit 2C separate)
- No webhook
- No parser
- No queue
- No auto-expire worker
- No checkout/payment alteration
- No Chat/ChatMessage migration
- No `ErrorBoundary*`/`providers/`/`lib/logger/`/`tests/unit/hooks/` commit
- No pak-ta-kra changes

### Beyond Commit 2B

- Commit 2C: API routes for `/api/sale/bookings/:id/confirm` + `/api/sale/bookings/:id/cancel` (route layer only, calls repo). RBAC: OWNER, MANAGER write per Boss decision §9.
- Commit 3: Convert-to-order design + dissent + implementation
- Commit 4+: UI, webhook, parser, FB integration

---

## 14. Open questions for Boss

1. **Service layer**: skip `booking.service.ts` in Commit 2B (repo writes BookingHistory directly, audit log called by route layer)? Or include thin service layer for symmetry with `activity.service`?
2. **`expiresAt` sentinel**: confirm `new Date('2099-12-31T23:59:59Z')` for booking reservations is acceptable? Or prefer schema change to make `expiresAt` nullable? (Schema change = more migration; sentinel = no change.)
3. **Atomic update via `$executeRaw`**: confirm raw SQL is acceptable? Alternative: use Prisma `updateMany` with `where: { quantity: { gte: ... } }` — but Prisma `updateMany` cannot express `quantity - reservedQty >= ?` natively. Raw SQL is the clean path.
4. **Test DB harness**: confirm DEFERRED for Commit 2B; pure-helper tests only? Boss may prefer to spin up a test DB harness as a separate prep commit. State preference.
5. **Error codes**: any naming preferences before I add them to `lib/errors/index.ts` in Commit 2B?
6. **idempotencyKey field**: leave unused in Commit 2B (Phase 2 will use it for parser-driven creates)?
7. **`booking.repository.ts` placement**: confirm `src/server/repositories/` (consistent with existing repos)?

---

End of Commit 2A design doc. Awaiting Boss approval to proceed to Commit 2B implementation.
