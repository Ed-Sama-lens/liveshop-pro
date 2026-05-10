# Manual Booking Create (Phase 1B) — Dissent Doc

Date: 2026-05-09 (filed under prior date for sequence consistency with sibling dissent docs)
Author: Claude (under Boss instruction)
Project: liveshop-pro
Phase: Phase 1B — manual booking creation runtime + route
Status: **DOC ONLY**. No code, no schema, no migration, no API, no UI, no platform integration, no checkout/payment behavior change. Pak-ta-kra zero-touch.

Companion to:
- `docs/superpowers/2026-04-06-sale-mvp-dissent.md` (initial /sale dissent + 18 Boss decisions)
- `docs/superpowers/2026-05-09-sale-booking-runtime-design.md` (Commit 2A confirm/cancel design)
- `docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md` (Commit 2G conversion design)
- Schema: `bb8b973` + migration `20260508171617_add_unified_inbox_and_sale_mvp`
- Booking confirm/cancel runtime: `689a83a` + `552562a` + `6681e0d`
- Booking confirm/cancel API: `90ff382`
- /sale RBAC: `c707391`
- Conversion runtime: `afdd41d`
- Conversion API: `3e72e30`

---

## Goal

Phase 1B unblocks Boss CC10 — manual booking creation. Without it, admins cannot create live-sale bookings from a UI; bookings exist only via test fixtures. After 2K dissent + 2M runtime ship, the full Phase 1 flow is finally exercisable end-to-end:

```
admin types name+phone+code+qty in UI
   →  POST /api/sale/bookings (this dissent's eventual route)
   →  bookingRepository.createManual()
   →  optional inline confirm via existing bookingRepository.confirm()
   →  admin clicks "Create order from N confirmed bookings"
   →  POST /api/sale/orders/from-bookings  (Commit 2I, already shipped)
   →  bookingRepository.convertToOrder()
   →  Order RESERVED → admin payment-verify flow → CONFIRMED → ...
```

---

## Out of scope for this dissent + future Commit 2M

NOT in this commit batch:
- UI / pages / components
- Webhook / Messenger / FB / WhatsApp / Telegram
- Comment parser
- Bull queue / auto-expire worker
- Customer quick-create flow (admin must select existing `Customer.id`)
- Customer merge / dedup
- Multi-language order summary or customer-facing message
- Schema / migration changes
- Modifications to checkout / payment / order transition
- Modifications to existing `bookingRepository.confirm()` / `cancel()` / `convertToOrder()`
- pak-ta-kra
- pre-existing untracked files (`ErrorBoundary*`, `providers/`, `lib/logger/`, `tests/unit/hooks/`, modified `dashboard/page.tsx` + `layout.tsx`)

---

## Boss CC10–CC13 + 15 Q&A items

### Q1. Create booking sources

**Decision**: Phase 1 = `MANUAL` only. Parser/platform sources arrive later (Phase 4+).

`Booking.source BookingSource @default(MANUAL)` already supports the enum (Commit 1 schema). Manual create writes `source: 'MANUAL'`, `createdById: user.id`. Parser/webhook flows will write `source: 'LIVE_COMMENT'` etc. at their commit. Phase 1 API does NOT accept a `source` parameter — admin creates always = MANUAL.

### Q2. Status choice on create

**Decision**: API accepts a `status` parameter with two allowed values:
- `'PENDING_REVIEW'` (default) — pure row insert, no stock touch
- `'CONFIRMED'` — create + immediately call existing `bookingRepository.confirm()` flow inline

Per Boss's previous direction (dissent §16 in 2026-04-06): "Manual admin booking: MAY start at `CONFIRMED` directly (admin already decided)."

**Implementation rule (R0-grade)**: when client requests `status='CONFIRMED'`, the route layer or service MUST NOT inline-write `Booking.status='CONFIRMED'` and inline-increment `reservedQty`. It MUST call the existing `bookingRepository.confirm()` AFTER the booking row is inserted, sharing the same atomic SQL guard, idempotency check, and StockReservation creation. Duplicating stock reservation logic = HARD STOP.

Two implementation patterns considered:

#### Option A — Two-phase inside one method
```ts
// Inside bookingRepository.createManual()
return prisma.$transaction(async (tx) => {
  // 1. Insert booking row at PENDING_REVIEW
  const booking = await tx.booking.create({ ...input, status: 'PENDING_REVIEW' });

  // 2. If status=CONFIRMED requested, call the SAME confirm logic
  //    inside the SAME transaction, NOT as a separate prisma.$transaction
  //    (would deadlock or fail).
  if (statusOnCreate === 'CONFIRMED') {
    // Inline-call shared internal helper used by bookingRepository.confirm()
    await _confirmInsideTx(tx, booking.id, ...);
  }

  return { ... };
});
```

This requires extracting `bookingRepository.confirm()`'s inner transaction body into a shared internal helper that takes `tx` as parameter. **Refactor existing tested code.** R1.

#### Option B — Two-step external call (LESS PREFERRED)
```ts
// In service or route
const booking = await bookingRepository.createManual({ status: 'PENDING_REVIEW' });
if (statusOnCreate === 'CONFIRMED') {
  // Outside the createManual transaction — separate prisma.$transaction inside confirm()
  await bookingRepository.confirm({ bookingId: booking.id, shopId, changedById });
}
```

Pros: no refactor of existing confirm logic; just orchestrate sequentially.
Cons: NOT atomic — if confirm fails (e.g. INSUFFICIENT_STOCK), the booking row remains as PENDING_REVIEW. Boss CC9 in 2K instruction: "if confirm fails, rollback booking creation if possible — no orphan PENDING booking unless intentionally chosen".

**Recommended: Option A (single transaction, refactor confirm()'s inner body into shared helper).**

Refactor scope:
- Extract the body of `bookingRepository.confirm()` (everything inside `prisma.$transaction(async tx => {...})`) into a private file-scope function `_runConfirmInTransaction(tx, input)`
- `bookingRepository.confirm()` becomes a thin wrapper that opens its own `prisma.$transaction` and calls `_runConfirmInTransaction(tx, input)`
- `bookingRepository.createManual()` opens ITS own `prisma.$transaction`, inserts the booking row, then calls `_runConfirmInTransaction(tx, ...)` if needed
- `verify-booking-flow.ts` 9/9 tests must continue to pass — confirm behavior identical from caller's perspective
- `verify-booking-conversion.ts` 8/8 tests must continue to pass

Risk: refactoring tested `confirm()` body. Mitigation: tests cover both paths; refactor is "extract method" (no logic change).

**Alternative if refactor-resistance is high**: ship Option B in 2M, document orphan-PENDING risk, add cleanup endpoint later. Boss decides.

### Q3. Customer selection

**Decision**: existing `Customer.id` required.

Phase 1 API body includes `customerId: string` (required). Caller must pass an existing Customer row. Validation:
- Customer exists in DB
- `Customer.shopId === user.shopId` (tenant scoping)
- Customer not banned (`isBanned=false`)

Future Customer quick-create UI / API is a separate commit. Booking creation stays scoped to "I have a customer in mind".

This avoids duplicate-customer / phone-collision / merge problems leaking into the booking flow. Customer hygiene lives in its own domain.

If admin wants to type a new customer name+phone, UI flow is:
1. Admin types name+phone
2. UI auto-searches `Customer` by phone → if exact match, use that `customerId`
3. If no match, UI offers "Create new customer" → POST /api/customers (existing route) → returns `customerId`
4. UI then POSTs /api/sale/bookings with the `customerId`

Two API calls in the UI; cleaner than one super-route that does both.

### Q4. BroadcastProduct selection

**Decision**: `broadcastProductId String` required.

Validation rules (in repo, inside transaction):
- BroadcastProduct exists
- `BroadcastProduct.liveSession.shopId === user.shopId` (tenant)
- BroadcastProduct's `LiveSession.id` matches body's `liveSessionId` (caller declares which session)
- `BroadcastProduct.variantId !== null` (Phase 1 supports variant-level only; whole-product bookings deferred)
- `BroadcastProduct.variant.product.shopId === user.shopId` (cross-shop variant defense — same guard as Commit 2B-AUDIT-001 §5b)

Body schema:
```ts
{
  liveSessionId: string,       // required, FK
  broadcastProductId: string,  // required, FK
  customerId: string,          // required, FK
  quantity: number,            // required, int >=1, <=999
  status?: 'PENDING_REVIEW' | 'CONFIRMED',  // default PENDING_REVIEW
  notes?: string,              // optional, max 500 chars
  idempotencyKey?: string,     // optional (see Q7)
}
```

`liveSessionId` is in the body (not URL) for clarity and consistency with conversion route. URL = `POST /api/sale/bookings`.

### Q5. Unit price capture

**Decision**: `Booking.unitPrice = BroadcastProduct.priceOverride ?? ProductVariant.price`, captured at creation time.

Per Boss CC11: "Booking.unitPrice must be captured at booking creation time from: BroadcastProduct.priceOverride ?? ProductVariant.price. Conversion must continue reading Booking.unitPrice only."

Implementation:
- Inside the create transaction, after fetching BroadcastProduct (with variant included):
  ```ts
  const unitPrice = (broadcastProduct.priceOverride ?? broadcastProduct.variant.price).toString();
  ```
- Booking row written with this `unitPrice`
- Conversion path (already shipped) reads `Booking.unitPrice` directly — unchanged

Future-proof: when Boss adds tier-pricing or customer-specific discounts (Phase 5+), they'd land at booking-create level (not conversion). The conversion path stays a frozen-snapshot consumer.

### Q6. Quantity bounds

**Decision**: `1 <= quantity <= 999` (integer).

Lower bound: zero or negative quantity is meaningless; 1 = single unit.
Upper bound: 999 is conservative. Live-sale single-customer single-item orders rarely exceed 100s. Setting 999 prevents typo-induced 99999 oversells without blocking legitimate batch orders.

If a real customer needs more than 999 in one booking, admin creates multiple bookings (audit trail benefit) or uses a future bulk-import flow.

Validation in Zod + repo redundant check.

### Q7. Idempotency on create

**Decision**: optional `idempotencyKey?: string` in body. **Activated cautiously in Phase 1.**

Per Boss CC11 + 2K spec point 7: "Need to inspect whether Booking.idempotencyKey unique works with nullable values. If unclear, defer idempotencyKey and rely on UI disabled/double-click guard for Phase 1."

Verified facts:
- `Booking.idempotencyKey String?` exists
- `@@unique([shopId, idempotencyKey])` exists
- Postgres NULL-distinct semantics: many rows can have NULL `idempotencyKey` without unique-constraint violation

Phase 1 implementation:
- Body schema accepts optional `idempotencyKey?: string` with regex constraint (32-128 chars, `[A-Za-z0-9_-]+`)
- If client provides one, repo:
  - Check existing booking with `(shopId, idempotencyKey)` BEFORE creating new
  - If existing matches the requested input shape → return existing as `{ idempotent: true }`
  - If existing differs → throw `BOOKING_INTEGRITY_ERROR` (500)
  - If not found → create new with that key
- If client omits → store `null`, no idempotency lookup, normal create path

Why optional: UI's first iteration can disable the submit button on click (frontend protection). Idempotency key is server-side defense for retries / lost responses. Both layers are useful.

UI-side guard MUST be present (button disabled during submit + spinner). Server-side idempotency is the second line of defense, not the only one.

### Q8. Duplicate booking behavior

**Decision**: separate booking rows.

Per Boss spec: "Should create separate booking rows, not merge automatically. Reason: audit/live-selling behavior."

If customer types `T31` then `T31` again 30 seconds later in chat (Phase 4 parser scenario), each becomes its own `Booking` row. Audit trail preserves intent (customer wanted 2 separate confirmations). Conversion (Commit 2H, already shipped) consolidates into ONE OrderItem at convert-to-order time per Q3 grouping rule.

Manual admin double-click protection lives in idempotencyKey + UI button-disable. NOT in repo merging logic.

### Q9. Stock behavior

**Decision** (PENDING_REVIEW path): NO stock touch. Pure `Booking.create` insert.

**Decision** (CONFIRMED-on-create path):
- Open `prisma.$transaction`
- Insert booking row at `status='PENDING_REVIEW'` (not `'CONFIRMED'` directly — the inner `_runConfirmInTransaction` will flip it to CONFIRMED if reservation succeeds)
- Inside same transaction: call `_runConfirmInTransaction(tx, { bookingId, shopId, changedById })`
- Confirm does its existing atomic stock reserve via `$executeRaw` UPDATE with `WHERE quantity - reservedQty >= ?`
- If confirm throws (`INSUFFICIENT_STOCK`, etc.), the entire transaction rolls back → booking row never persists → no orphan
- If confirm succeeds, booking is `CONFIRMED` + StockReservation row created

Per Boss CC9 — orphan PENDING is an explicit no.

### Q10. BookingHistory on create

**Decision**: write history per status path.

For `PENDING_REVIEW` create:
```ts
await tx.bookingHistory.create({
  data: {
    bookingId: booking.id,
    fromStatus: null,            // null means CREATED
    toStatus: 'PENDING_REVIEW',
    changedById: user.id,
    reason: null,
    metadata: { source: 'manual_create' },
  },
});
```

For `CONFIRMED`-on-create:
- The first history row (created above) is `null → PENDING_REVIEW`
- The inner `_runConfirmInTransaction()` writes a SECOND history row `PENDING_REVIEW → CONFIRMED` (existing behavior at `booking.repository.ts` lines 238-245)
- Net: TWO rows per CONFIRMED-on-create call, mirroring the audit pattern of "create, then confirm" as separate explicit events

`fromStatus BookingStatus?` is already nullable in schema (verified). Null fromStatus = CREATED semantically. Consumers reading BookingHistory must accept `null` fromStatus.

### Q11. API + RBAC

Future route:
```
POST /api/sale/bookings
```

Auth/RBAC (mirrors existing `/api/sale/bookings/[bookingId]/{confirm,cancel}` + `/api/sale/orders/from-bookings`):
- `requireAuth()` throws AuthError → 401 if no session
- `user.shopId` null → 403
- Role NOT in `['OWNER', 'MANAGER']` → 403
- CHAT_SUPPORT: 403 (mutation forbidden per RBAC dissent §9)
- WAREHOUSE: 403

Phase 2+: parser-driven booking creation will be a SEPARATE internal service path (NOT exposed via this route). Webhook handler creates booking server-side, bypassing this admin route.

### Q12. Response shape

```ts
// HTTP 200 always (matches existing convention)
{
  success: true,
  data: {
    bookingId: string,
    status: 'PENDING_REVIEW' | 'CONFIRMED',
    quantity: number,
    unitPrice: string,            // decimal-as-string
    broadcastProductId: string,
    customerId: string,
    liveSessionId: string,
    idempotent?: boolean,         // present only when idempotencyKey was provided
    // Reservation info present only when status === 'CONFIRMED'
    reservation?: {
      reservationId: string,
      variantId: string,
      quantity: number,
    },
  },
}
```

`currency: "MYR"` not included on this route (per Boss localization context: bookings are an internal pre-order state; currency surfacing happens at conversion → Order).

### Q13. Tests

#### Pure helper tests (booking-rules.ts)

If create involves any pure helper (e.g. `selectUnitPrice(broadcastProduct, variant)`), test it. Most create logic is straight DB writes; pure helpers are minimal.

Possible new helpers:
- `resolveUnitPrice(broadcastProduct: { priceOverride: string | null }, variant: { price: string }): string` — implements §Q5 priority.

If logic is too thin to extract, skip.

#### E2E (extend `verify-booking-flow.ts` OR new script)

Per Boss earlier C8 / sequencing: prefer separate file. Recommendation:

`scripts/verify-booking-create.ts`

Test cases (8 minimum):
1. **CREATE PENDING_REVIEW** — booking row inserted, status `PENDING_REVIEW`, no stock change, BookingHistory `null → PENDING_REVIEW` written
2. **CREATE CONFIRMED** — booking row inserted, atomic confirm inline, status `CONFIRMED`, `reservedQty +=`, StockReservation row created with `bookingId + sentinel expiresAt`, TWO BookingHistory rows
3. **CREATE CONFIRMED — insufficient stock** — confirm fails inside transaction → entire transaction rolls back → NO booking row, NO history row, NO stock change
4. **Cross-shop BroadcastProduct rejected** — body claims `liveSessionId` belonging to shop B but auth user is shop A → throw 404 / 403
5. **Cross-shop variant rejected** — BroadcastProduct exists in user's shop but its variant points at another shop's product → CONVERSION_INTEGRITY_ERROR / similar
6. **Banned customer rejected** — body's `customerId` exists but `Customer.isBanned=true` → throw / 403
7. **idempotencyKey replay returns existing** — first call creates; second call with same `(shopId, idempotencyKey)` returns existing as `idempotent: true`
8. **idempotencyKey replay with different shape → integrity error** — same key, different broadcastProductId → throw `BOOKING_INTEGRITY_ERROR` (500)

#### Vitest unit tests (route handler)

Same gap as existing routes — no auth/session mock harness. Document accepted gap.

### Q14. Localization

**Decision**: NO customer-facing message in booking create.

The route response is admin-facing JSON only. No template generation.

Booking confirmation/cancel/expire messages to customer = LATER PHASE (Commit 2J or post-summary template work).

Future labels in /sale UI:
- Admin UI: Thai default, English secondary (Boss CC8 / localization requirement)
- Customer-facing surfaces: zh default, en/th optional, MYR/RM only

Booking create's response payload uses field names (English, language-agnostic). UI translates labels.

### Q15. Stop conditions before implementation

Stop and report instead of writing code if:

1. `bookingRepository.confirm()` body cannot be cleanly extracted into a `_runConfirmInTransaction(tx, ...)` helper without test regressions (Q2 Option A path)
2. `Booking.idempotencyKey` Postgres null-unique behavior differs from Phase 1 expectation under concurrent insert
3. Cross-shop variant validation requires schema changes (e.g. CHECK constraint)
4. Customer.isBanned check needs new field
5. Admin user lookup requires new auth flow (existing `requireAuth()` + role check should suffice)
6. Quantity bound 999 conflicts with stock model
7. CONFIRMED-on-create path's transaction nesting causes deadlock or constraint violation
8. Customer-facing messaging becomes necessary (per Q14, must NOT)
9. Schema or migration becomes necessary
10. Storefront / checkout / payment / order-transition flows need touching
11. Pak-ta-kra is touched (always-stop)
12. Pre-existing untracked `ErrorBoundary*`, `providers/`, `lib/logger/`, `tests/unit/hooks/` files conflict with implementation paths

---

## Blast radius

- Stock: `CONFIRMED`-on-create path touches `reservedQty` via existing `_runConfirmInTransaction()` helper. Same atomic SQL guard as Commit 2B/2D. Wrong refactor = duplicate increment or silent skip.
- Booking lifecycle: new entry point for booking row creation. Wrong validation = orphan rows / cross-shop bookings.
- Audit: BookingHistory pattern with `fromStatus: null` — NEW representation. Consumers of BookingHistory must handle null fromStatus going forward.
- Idempotency contract: introduces optional `(shopId, idempotencyKey)` lookup before create. Wrong logic = duplicate booking on retry.
- Existing tests: `verify-booking-flow.ts` (9 tests) + `verify-booking-conversion.ts` (8 tests) both depend on `bookingRepository.confirm()`. Refactor MUST preserve identical external behavior.

R-classification:
- This dissent doc: R2
- Future Commit 2M runtime: R1 (refactor of existing confirm logic + new booking-create transaction path; touches production stock arithmetic)
- Future Commit 2N route layer: R1 (new public POST endpoint)
- UI commit (later): R1 (visible admin surface)

---

## Assumptions

**Verified**:
- A1. `Booking` row supports default `status: 'PENDING_REVIEW'` — schema verified
- A2. `Booking.idempotencyKey String?` + `@@unique([shopId, idempotencyKey])` — verified
- A3. `BookingHistory.fromStatus BookingStatus?` is nullable — verified
- A4. `Booking.source BookingSource @default(MANUAL)` — verified
- A5. `Booking.createdById String?` exists — verified for tracking admin user
- A6. `bookingRepository.confirm()` already opens a `prisma.$transaction` — verified at line ~109 of `booking.repository.ts`
- A7. Existing `verify-booking-flow.ts` passes 9/9 — verified Commit 2B-AUDIT
- A8. Existing `verify-booking-conversion.ts` passes 8/8 — verified Commit 2I

**Unverified**:
- AU1. Postgres null-distinct unique under concurrent insert: ASSUMPTION two simultaneous transactions with same NULL `idempotencyKey` both succeed. Should be fine; rare edge case worth noting.
- AU2. ASSUMPTION `bookingRepository.confirm()` body refactor preserves all caller expectations. Will re-run all 9+8 = 17 E2E tests post-refactor; if any fail, STOP per Q15.

---

## Reversibility (R0/R1/R2)

| Action | Class | Mitigation |
|---|---|---|
| This dissent doc | R2 | n/a |
| `bookingRepository.confirm()` extract-method refactor | R1 | All existing E2E tests must pass identically |
| New `bookingRepository.createManual()` method | R1 | New code path; covered by new E2E tests |
| New POST route | R1 | Auth-gated; soft-launch behind feature flag possible |
| Per-call booking row creation | R0 once written | Idempotency key prevents duplicate; rollback = `bookingRepository.cancel()` if status PENDING_REVIEW; `cancel(targetStatus='CANCELLED')` if CONFIRMED |
| Schema change | n/a | NOT planned this dissent |

R0 list (per existing R0 rules):
- ❌ Modify storefront checkout / order transition / payment behavior
- ❌ Add to `Order.VALID_TRANSITIONS`
- ❌ Decrement `quantity` outside Order CONFIRMED transition path
- ❌ Auto-send Messenger / WhatsApp / email to customer
- ❌ Schema migration in Commit 2M
- ❌ Touch storefront cart / checkout / payment-slip flows
- ❌ Touch `MessageDirection` enum / Conversation / ChannelIdentity / Message tables
- ❌ Touch pak-ta-kra
- ❌ Commit pre-existing untracked `ErrorBoundary*`, etc.

---

## Blind spots

- **B1. Concurrent same-customer same-product double-click without idempotencyKey**: UI button disable is the primary defense. Without it, two bookings can be inserted within milliseconds. Per Boss Q8, this is BY DESIGN — separate audit rows.
- **B2. Cross-session idempotencyKey collision**: `(shopId, idempotencyKey)` is shop-scoped. Two different live sessions in same shop using SAME random key would collide. Mitigation: client should namespace key e.g. `${liveSessionId}:${uuid}`. Document in body schema example.
- **B3. CONFIRMED-on-create + customer simultaneously banned**: race window. If admin clicks "Confirm" while another admin bans the customer in another tab, transaction may proceed under stale read. Acceptable; Customer.isBanned is advisory not contractual.
- **B4. BroadcastProduct deleted between body submission and create call**: 404 acceptable.
- **B5. Variant.quantity changed (e.g. admin adjustment) between body submission and create**: stock validated at confirm time inside transaction; safe.
- **B6. PENDING_REVIEW orphan if admin never confirms/cancels**: schema permits indefinite PENDING_REVIEW. No auto-expire in Phase 1 (Boss decision §4 in primary dissent). UI must show pending count to admin.
- **B7. Refactor regression**: extracting `_runConfirmInTransaction` MUST preserve the exact 17 E2E test outcomes. If any regress, stop.
- **B8. `Booking.unitPrice` source contract**: locked per Q5. Any future booking-create path (parser, etc.) MUST capture price the same way.
- **B9. Customer-facing booking-confirmation message**: NOT generated. Admin must manually inform customer. Phase 2+ work to add Messenger send adapter.
- **B10. Multi-tenant variant cross-shop attack**: malformed BroadcastProduct.variantId pointing to another shop's variant. Same defense as Commit 2B-AUDIT-001 §5b: validate `variant.product.shopId === user.shopId` at create time.
- **B11. Localization**: NO message generation in this route. Future templates per Boss (zh default, en/th optional).
- **B12. Test DB harness**: still using script-style local Docker per Boss earlier. New `verify-booking-create.ts` follows same pattern.

---

## API Schema (proposed for Commit 2N route)

```ts
// src/lib/validation/sale.schemas.ts (extend existing)

export const createBookingBodySchema = z.object({
  liveSessionId: z.string().min(1, 'liveSessionId is required'),
  broadcastProductId: z.string().min(1, 'broadcastProductId is required'),
  customerId: z.string().min(1, 'customerId is required'),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1')
    .max(999, 'quantity must be at most 999'),
  status: z.enum(['PENDING_REVIEW', 'CONFIRMED']).default('PENDING_REVIEW'),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, 'idempotencyKey must match /^[A-Za-z0-9_-]+$/')
    .optional(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
```

---

## Repository contract (proposed for Commit 2M)

```ts
// src/server/repositories/booking.repository.ts (extend)

export interface CreateManualBookingInput {
  readonly shopId: string;
  readonly liveSessionId: string;
  readonly broadcastProductId: string;
  readonly customerId: string;
  readonly quantity: number;
  readonly status: 'PENDING_REVIEW' | 'CONFIRMED';
  readonly notes?: string;
  readonly idempotencyKey?: string;
  readonly createdById: string;
}

export interface CreateManualBookingResult {
  readonly bookingId: string;
  readonly status: 'PENDING_REVIEW' | 'CONFIRMED';
  readonly quantity: number;
  readonly unitPrice: string;
  readonly broadcastProductId: string;
  readonly customerId: string;
  readonly liveSessionId: string;
  readonly idempotent: boolean;
  readonly reservation?: {
    readonly reservationId: string;
    readonly variantId: string;
    readonly quantity: number;
  };
}

export const bookingRepository = Object.freeze({
  // existing confirm, cancel, convertToOrder ...
  async createManual(input: CreateManualBookingInput): Promise<CreateManualBookingResult> {
    // Implementation per §Q9 + §Q10
  },
});
```

---

## Sequencing

```
Commit 2K — THIS DISSENT (doc only)         ← current commit
        ↓
Boss/ChatGPT review
        ↓
Commit CLEANUP-1 — investigate pre-existing untracked files (ErrorBoundary*, providers/, lib/logger/, tests/unit/hooks/, modified dashboard/page.tsx + layout.tsx)
        ↓
Commit 2M — manual booking create runtime + tests
        - extract _runConfirmInTransaction helper from existing confirm
        - add createManual method
        - add resolveUnitPrice pure helper
        - new verify-booking-create.ts E2E (8 tests)
        - existing verify-booking-flow.ts + verify-booking-conversion.ts must continue 9/9 + 8/8
        ↓
Commit 2N — POST /api/sale/bookings route
        - Zod schema
        - auth + RBAC
        - calls bookingRepository.createManual
        ↓
Commit 2L — thin /sale UI shell
        - sessions list
        - workspace placeholder
        - actually exercises the routes
        ↓
Commit 2O — /sale code grid + booking management UI
        ↓
... Phase 2+ (parser, webhooks, etc.)
```

---

## Recommended next step after Commit 2K

Boss + ChatGPT review of this dissent.

After Boss approves dissent + answers any open clarifications:

**CLEANUP-1** before 2M runtime, per Boss CC13: investigate the pre-existing untracked `ErrorBoundary*` / `providers/` / `lib/logger/` / `tests/unit/hooks/` + modified `dashboard/page.tsx` + `layout.tsx` files. They may interact with /sale UI work.

Then 2M runtime → 2N route → 2L UI sequence.

---

## Brief for ChatGPT (proactive consultation per Boss instruction)

### CD1. Refactor risk — extracting `_runConfirmInTransaction`

Q2 Option A requires extracting `bookingRepository.confirm()`'s transaction body into a shared helper. Pros: clean atomicity for create-and-confirm. Cons: refactor touches production-tested code.

Risk mitigation: 17 existing E2E tests cover the path. If refactor regresses any, STOP per §Q15 stop condition #1.

Should we lock Option A unconditionally, or allow Option B (separate transactions) with documented orphan-PENDING risk as fallback if refactor proves harder than expected?

I lean **Option A locked**. Boss CC9 was clear about no-orphan-PENDING.

### CD2. `idempotencyKey` regex constraint

Body schema proposes `idempotencyKey: string regex /^[A-Za-z0-9_-]+$/`. Should it be more restrictive (e.g. require ULID format) or less (allow any 32-128 chars)?

I lean current proposal — broad enough for common UUID v4 / ULID / nanoid / app-defined keys; restrictive enough to prevent injection.

### CD3. Quantity max 999

§Q6 sets max 999. Boss might prefer different upper bound. 999 chosen as conservative ceiling against typo (no realistic single-customer-single-item live booking exceeds it). Boss confirms?

### CD4. CONFIRMED-on-create error behavior

If admin requests `status='CONFIRMED'` and stock check fails inside transaction:
- (a) Whole call returns 409 INSUFFICIENT_STOCK; nothing persists; admin sees error
- (b) Booking persists at PENDING_REVIEW; warning returned ("status downgraded due to insufficient stock")

Boss CC9: "no orphan PENDING booking unless intentionally chosen". So **(a) is correct**. Document explicitly.

### CD5. `Customer.isBanned` enforcement

Currently NO route enforces banned-customer rejection. Adding this rule to booking create might be the first place. Should we also retro-apply to other booking/order creation paths (e.g. storefront checkout)?

I lean — yes for booking create (it's a NEW path). NO retroactive change to storefront checkout (R1, separate dissent).

### CD6. New error code naming

For Q7 idempotency mismatch: `BOOKING_INTEGRITY_ERROR` or reuse existing `CONVERSION_INTEGRITY_ERROR` or `RESERVATION_INTEGRITY_ERROR`?

I lean **NEW**: `BOOKING_INTEGRITY_ERROR`. Distinct from conversion + reservation. Clearer in logs.

### CD7. Future booking-create from parser

Parser (Phase 4+) creates bookings server-side, NOT via `POST /api/sale/bookings`. Both paths share `bookingRepository.createManual()` (rename to `bookingRepository.create()` for parser reuse?) OR have separate methods?

I lean **separate methods** for now: `createManual` (admin) vs future `createFromComment` (parser). Different validation, different defaults, different telemetry.

### CD8. Localization for error messages

Error messages in route response (`"Insufficient stock"`, `"Customer not found"`) — currently English. Boss localization rule: "admin app default = Thai, English secondary".

Phase 1 Decision: KEEP English for error messages. Reason:
- Error messages are technical state; they appear in admin UI
- Admin UI's error display layer (Phase 2 future) can map error codes to Thai labels
- API stays English-only; UI translates

Confirms with Boss?

---

## Confirmation

| Constraint | Status |
|---|---|
| Doc only | ✅ |
| No code | ✅ |
| No schema | ✅ |
| No migration | ✅ |
| No API | ✅ |
| No UI | ✅ |
| No platform integration | ✅ |
| No checkout / payment / order behavior change | ✅ |
| No legacy Chat / ChatMessage migration | ✅ |
| No customer-facing message generation | ✅ |
| No pre-existing untracked files committed | ✅ |
| No pak-ta-kra changes | ✅ |

End of Commit 2K dissent. Awaiting Boss + ChatGPT review.
