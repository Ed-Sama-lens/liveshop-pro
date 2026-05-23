# Phase 1.5 — Auto-Confirm / Auto-Order / Multi-Code Decision Packet

**Filed:** 2026-05-23 (Track T6 — daytime autonomous continuation)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `c500fcd`
**Status:** Decision packet refinement. Builds on PR #54 design doc.
No runtime code. Boss + ChatGPT verdict gates implementation.

This doc tightens the open Phase 1.5 design from PR #54 (`2026-05-22-sale-auto-confirm-auto-order-design.md`) into a Boss-ready
decision packet. Each section enumerates options + Claude's recommended
default. Boss + ChatGPT verdict per section unlocks the matching
implementation PR.

---

## 1. Customer risk model

Boss UI smoke C2 asked for auto-confirm of "trusted" customers. The
risk model defines who qualifies.

### Options

| Option | Storage | Pros | Cons |
|---|---|---|---|
| **A — Boolean trusted flag** | `Customer.autoConfirmEligible BOOLEAN DEFAULT true` | Simplest; opt-out per customer | Binary; admin must flag risky cases manually |
| B — Score 0-100 | `Customer.trustScore INT DEFAULT 100` | Granular; allows policy tuning | Requires policy threshold + UI display + score evolution |
| C — Tags | `Customer.tags String[]` (already exists per schema audit) | Flexible; admin-driven | No formal trust semantics; tag values free-form |
| D — Cancellation/unpaid thresholds | Derived from `Order.cancelledAt` / `Payment.status` history | Data-driven; no schema change | Computed each booking; perf concern + edge cases (new customer) |

### Claude recommendation: **Option A (Boolean)**

Rationale:
- Boss workflow today is binary in practice — "I trust this person" / "this person flaked twice, don't auto-confirm"
- Minimal schema migration (1 column, default true = optimistic)
- Future migration to Option B/D possible without breaking the boolean
- Admin override always available (`PATCH /api/customers/[id]` style)

### Required schema migration if Option A adopted

```sql
ALTER TABLE "Customer" ADD COLUMN "autoConfirmEligible" BOOLEAN NOT NULL DEFAULT true;
```

R1 (additive column with safe default). No backfill needed.

---

## 2. Auto-confirm policy

### Trigger

When a new Booking is created with `source = MANUAL` (or any source
once Phase 1.5 lands), the booking repository checks the customer's
trust flag and decides initial `status`.

### Options

| Option | New booking initial status |
|---|---|
| **A — Trust-gated** | `autoConfirmEligible = true` → `CONFIRMED` (with stock reservation), else `PENDING_REVIEW` |
| B — Always optimistic | All new bookings auto-confirm (current Tier 3.9 default in some paths) |
| C — Always pending | Status quo (admin clicks confirm) |

### Claude recommendation: **Option A** (per Boss UI smoke verdict)

### Admin override

Manual Create dialog UI must show:
- Customer's current `autoConfirmEligible` flag
- Override toggle ("Confirm anyway" / "Hold as pending")
- Override reason input (free-text, optional)

### Stock reservation timing

Auto-confirm path must:
1. Open Prisma transaction
2. Insert Booking with `status = CONFIRMED`
3. Insert `StockReservation` row (`bookingId` FK, `releasedAt: null`)
4. Commit

Failure mode: if stock insufficient → throw; booking NOT created;
admin sees error toast. Same path as existing manual confirm flow
(verified by `bookingRepository.confirm` tests).

---

## 3. Auto-order append

Boss UI smoke C3 asked for same-day same-customer bookings to roll
into an existing Order rather than creating a new one each time.

### Grouping key

`(shopId, customerId, saleDate)` — distinct triple. Per the sale-date
context (Tier 3.9), `saleDate` is the natural daily boundary.

### Required schema migration

```sql
ALTER TABLE "Order" ADD COLUMN "saleDate" DATE;
CREATE INDEX "Order_shopId_customerId_saleDate_idx"
  ON "Order"("shopId", "customerId", "saleDate")
  WHERE "saleDate" IS NOT NULL;
```

Backfill:
```sql
UPDATE "Order" o SET "saleDate" = (
  SELECT MIN(bp."saleDate")
  FROM "Booking" b
  JOIN "BroadcastProduct" bp ON bp.id = b."broadcastProductId"
  WHERE b."convertedOrderId" = o.id
)
WHERE EXISTS (SELECT 1 FROM "Booking" b WHERE b."convertedOrderId" = o.id);
```

R1 (additive column + backfill). Old Orders without saleDate (Tier
3.8 legacy) remain NULL and use one-order-per-conversion fallback.

### Append semantics

When a new Booking transitions to `CONVERTED_TO_ORDER`:

1. Look up existing Order matching `(shopId, customerId, saleDate)` AND `status IN eligibleStatuses` (see below)
2. If found → append `OrderItem` to that Order
3. If not found → create new Order
4. Update Order totals (`totalAmount` += new line total)

### Eligible Order statuses for append

| Status | Append allowed? | Reason |
|---|---|---|
| `RESERVED` | ✅ | Active order; admin still adding |
| `CONFIRMED` | ❓ (recommend NO) | Admin already committed; appending creates new line silently |
| `PACKED` | ❌ | Physical operation in progress; new item missed the pack |
| `SHIPPED` | ❌ | Out the door |
| `DELIVERED` | ❌ | Customer has it |
| `CANCELLED` | ❌ | Reopen would confuse |

### Claude recommendation: **RESERVED only**

Rationale: any other status = real operational state changed; new line
must be a new order to surface the divergence to admin.

### Audit log

Every append writes an `OrderAudit` row:

```ts
{
  orderId,
  action: 'AUTO_APPENDED_FROM_BOOKING',
  bookingId,
  itemDelta: { variantId, quantity, totalPrice },
  beforeTotal,
  afterTotal,
  createdById: user.id, // admin who triggered
}
```

R1 (existing `OrderAudit` model per schema audit).

---

## 4. Multi-code Manual Booking

Boss UI smoke B6 asked for admin to enter multiple product codes in
one Manual Create action.

### UI design

`ManualCreateBookingDialog` adds a "batch mode" toggle:
- Default: single product code (current behavior)
- Batch: array of `(productCode, quantity)` rows; "+" button to add row

### Schema implication: **none required**

Multiple Booking rows already supported by `bookingRepository.createManual`
called N times in a single transaction. Wrap in
`prisma.$transaction([...])` for all-or-nothing semantics.

### Validation

- 1 ≤ batch size ≤ 20 (admin-only; bounded to prevent UI mistakes)
- Each row passes existing `createBookingBodySchema`
- All rows share `customerId + saleDate + source` from dialog state
- Per-row stock reservation; first failure rolls back entire batch

### Idempotency

If the route adopts a per-batch `idempotencyKey`:
- Same key replays same response without creating duplicates
- Different key creates new Bookings (admin click-spam)

---

## 5. Interaction with V Rich slots (Tier 3.10)

Phase 1.5 auto-fill MUST be compatible with V Rich slot drawer
(per Tier 3.10-A audit PR #63).

### Slot fill from auto-confirm

When auto-confirm runs:
1. Booking created with `status = CONFIRMED`
2. Slot drawer UI sees the new booking via existing `GET /api/sale/bookings?saleDate=...&status=...` poll
3. `buildSlots()` (PR #72 helper) places the booking in the next empty slot
4. UI re-renders with filled slot

No new Slot table needed (per Tier 3.10-A locked decision §3 Q3).

### Conflict: stock available but slot full

Stock count = `Variant.quantity`. Slot count = `Variant.quantity` per
`buildSlots()`. They are the same number → conflict cannot occur in
practice.

Edge case: if admin lowers stock mid-day, existing CONFIRMED bookings
exceed slot count → `buildSlots()` overflow array surfaces this for UI
(per PR #72 helper contract). Auto-confirm policy should check
`availableQty` before confirming + downgrade to PENDING if at capacity.

---

## 6. Interaction with future Facebook parser (Tier 4.6+)

Phase 1.5 ships before Facebook auto-booking. Compatibility checklist:

- Booking.source set by adapter (`PAGE_INBOX` / `LIVE_COMMENT` / etc)
- Auto-confirm policy applies based on `Customer.autoConfirmEligible` regardless of source
- Parser-discovered customer → upsert `Customer` row → check trust flag → auto-confirm or pending
- Existing manual override works the same way

No coupling. Phase 1.5 is source-agnostic.

---

## 7. Interaction with outbound confirmation (Tier 4.5+)

Phase 1.5 lands BEFORE outbound (per all current hard no-go).

After Tier 4.5 ships, auto-confirm path will additionally:
1. Auto-confirm → CONFIRMED booking
2. Outbound service sends confirmation message to customer's channel
3. Outbound message idempotency: `(bookingId, channel, 'CONFIRMATION')`

Phase 1.5 must store enough state for outbound to find the customer's
channel:
- `Booking.channelIdentityId` (already exists per schema audit)
- `Booking.conversationId` (already exists)

No additional schema needed.

---

## 8. Implementation PR sequence

| PR | Title | Risk | Depends |
|---|---|---|---|
| 1.5-B-1 | `migration: add Customer.autoConfirmEligible BOOLEAN` | R1 (schema) | — |
| 1.5-B-2 | `feat(sale): auto-confirm path in bookingRepository.createManual` | R1 | 1.5-B-1 |
| 1.5-B-3 | `feat(sale): UI override + risk display in ManualCreateBookingDialog` | R1 | 1.5-B-2 |
| 1.5-C-1 | `migration: add Order.saleDate DATE + index + backfill` | R1 (schema + backfill) | — |
| 1.5-C-2 | `feat(sale): orderRepository.upsertFromBooking append path` | R1 | 1.5-C-1 |
| 1.5-C-3 | `feat(sale): wire bookingRepository.confirm to upsert Order` | R1 | 1.5-C-2 |
| 1.5-D-1 | `feat(sale): Multi-code Manual Booking batch UI + route` | R1 | 1.5-B-1 (for trust check per row) |

Each step independently reviewable. Each requires `dissent-4-bullet`
before first edit.

---

## 9. Required Boss decisions

Numbered for verbatim verdict reply:

1. **Risk model**: Boolean (Option A) / Score / Tags / Threshold?
2. **Auto-confirm policy**: Trust-gated (Option A) / Always optimistic / Always pending?
3. **Default for new customers**: `autoConfirmEligible = true` (optimistic) or `false` (conservative)?
4. **Append-eligible Order statuses**: RESERVED only / RESERVED + CONFIRMED / other?
5. **Multi-code batch size cap**: 20 / lower / higher?
6. **Multi-code transaction semantics**: all-or-nothing (recommended) or partial-success?
7. **PR ordering**: B-series before C-series, or C-series first (simpler migration)?

Defaults proposed in §1-§4 above are conservative + reversible.

---

## 10. Hard no-go

All Phase 1.5 PRs:

- ❌ No outbound messaging in 1.5 (Tier 4.5)
- ❌ No Facebook runtime in 1.5
- ❌ No payment/shipping touch
- ❌ Schema migration LANDS via Vercel auto-deploy (R1) — Boss must verify migration runs successfully before merging the wiring PR
- ❌ No env / flag change by Claude
- ❌ pak-ta-kra untouched

---

## 11. Stop conditions

Implementation PR opens a Pause + Report if any of these surface
during implementation:

- Booking creation race condition (two manual creates for same slot)
- Stock reservation count diverges from active bookings
- Migration fails on production Railway DB (Boss intervenes)
- `Customer.autoConfirmEligible` default conflicts with existing rows
- Order append crosses a status boundary that needs new admin signal
- Multi-code batch hits DB lock contention
- Phase 1.5 tests can't reach 80% coverage on the new paths

---

## 12. Cross-references

- PR #54 — parent design doc (`2026-05-22-sale-auto-confirm-auto-order-design.md`)
- PR #63 — Tier 3.10-A design audit (V Rich board)
- PR #65 — Oho inbox architecture
- `prisma/schema.prisma` — Customer / Order / OrderAudit / Booking / StockReservation
- `src/server/repositories/booking.repository.ts` — existing `createManual` + `confirm` + `cancel` patterns

---

## 13. Decision

This doc lands as `docs(sale): refine Phase 1.5 auto-confirm/auto-order/multi-code decision packet`.
Zero runtime change. Boss + ChatGPT verdict per question §9 unlocks
the matching implementation PR.
