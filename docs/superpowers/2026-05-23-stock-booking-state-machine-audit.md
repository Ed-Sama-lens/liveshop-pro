# Stock + Booking State Machine — Audit

**Filed:** 2026-05-23 (Block 3 Track B)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `0c7b6e0`
**Status:** Audit only. No runtime change.

Locks the booking lifecycle + stock reservation semantics shipped
through Tier 2 (MVP) / Tier 3.9-B (saleDate). Boss + ChatGPT verdict
on §6 open ambiguities sharpens Phase 1.5 implementation.

---

## 1. Booking lifecycle (enum `BookingStatus`)

5 statuses defined in `prisma/schema.prisma`:

```
PENDING_REVIEW   — initial; admin still acts
CONFIRMED        — stock reserved; commerce committed
CANCELLED        — admin cancelled or expired-equivalent
EXPIRED          — automatic cancellation (idle/timeout)
CONVERTED_TO_ORDER — converted to OrderItem(s); terminal
```

### Transitions

```
                  ┌──────────────────┐
                  │ PENDING_REVIEW   │ (initial, no stock yet)
                  └─────┬────────────┘
                        │
              ┌─────────┴──────────┐
              │                    │
   confirm() ▼                     ▼ cancel(reason)
        ┌─────────────┐    ┌────────────────┐
        │  CONFIRMED  │    │   CANCELLED    │ (terminal)
        │ (stock res) │    └────────────────┘
        └─────┬───────┘
              │
     ┌────────┼─────────┐
     │        │         │
cancel()    convert()  expire() (timeout)
     ▼        ▼         ▼
┌──────────┐ ┌─────────────────────┐ ┌────────────┐
│CANCELLED │ │ CONVERTED_TO_ORDER  │ │  EXPIRED   │
│(stock    │ │ (stock released,    │ │ (terminal) │
│released) │ │  OrderItem written) │ └────────────┘
└──────────┘ └─────────────────────┘
```

### Active vs Terminal (PR #52 helper)

```ts
isTerminalBookingStatus(s) =
  s === 'CANCELLED' || s === 'EXPIRED' || s === 'CONVERTED_TO_ORDER';
```

Active list shows PENDING_REVIEW + CONFIRMED. Terminal hidden under
"ประวัติ" disclosure.

---

## 2. StockReservation lifecycle

`StockReservation` row created when a Booking transitions to
CONFIRMED:

```
Booking.confirm()
  → bookingRepository.confirm()
  → Prisma transaction:
      1. Booking.status = CONFIRMED + confirmedAt = now
      2. StockReservation.create({
           bookingId,
           variantId: BP.variantId,
           quantity: Booking.quantity,
           expiresAt: now + reservation_ttl,
           releasedAt: null,
         })
      3. Commit
  → bookingRepository.confirm returns { reservationId, idempotent: false }
```

### Release paths

Three places set `releasedAt`:

| Source | When | Sets |
|---|---|---|
| `bookingRepository.cancel` | admin cancels CONFIRMED booking | `releasedAt = now` |
| `bookingRepository.convertToOrder` | booking → OrderItem | `releasedAt = now` (transferred to Order stock commitment) |
| Background expiry task (TBD) | reservation TTL exceeded | `releasedAt = now` + booking → EXPIRED |

### Active reservation = `releasedAt IS NULL`

Used by:
- `foldReservedQty()` in summary (PR #70)
- `prisma.stockReservation.groupBy WHERE releasedAt IS NULL` (sale summary repo)
- Booking integrity check (PR #55: CONFIRMED with no active reservation → MISSING)

---

## 3. Reservation integrity classification (PR #55)

Per Booking row, derived discriminator surfaces data corruption:

```
CONFIRMED + 1 active reservation        → 'OK'
CONFIRMED + 0 active reservations       → 'MISSING' (corruption)
CONFIRMED + 2+ active reservations      → 'MULTIPLE' (corruption)
PENDING_REVIEW + 0 reservations         → 'NOT_APPLICABLE' (correct)
CANCELLED / EXPIRED + any reservations  → 'NOT_APPLICABLE' (stale OK)
CONVERTED_TO_ORDER + reservations       → 'NOT_APPLICABLE' (stale OK)
```

Surfaced in `/api/sale/bookings` response as `reservationIntegrity`.
UI badge (PR #79 helper `slotRowDisplayState` → `integrity_warn`).

---

## 4. Order lifecycle (enum `OrderStatus`)

6 statuses:

```
RESERVED   — bookings converted, stock committed but not paid
CONFIRMED  — payment captured (existing checkout flow)
PACKED     — physical operation
SHIPPED    — out the door
DELIVERED  — customer has it
CANCELLED  — refund / void
```

### Booking → Order transition

```
bookingRepository.convertToOrder({ bookingIds })
  → for each booking:
      Booking.status = CONVERTED_TO_ORDER + convertedOrderId = newOrderId
      StockReservation.releasedAt = now (transferred semantically)
  → Order.create({
       status: 'RESERVED',
       items: aggregated OrderItems via groupBookingsForOrderItems()
     })
```

`groupBookingsForOrderItems()` (PR #55 invariant tests) groups bookings
by `(productId, variantId, unitPrice)` → one OrderItem per group with
summed `quantity`.

---

## 5. Idempotency

Three repos enforce idempotency:

| Operation | Key | Behavior |
|---|---|---|
| `bookingRepository.createManual` | `idempotencyKey` (unique per shop) | replay returns same result |
| `bookingRepository.confirm` | implicit (status check) | replay of confirm on already-CONFIRMED returns `{ idempotent: true }` |
| `bookingRepository.cancel` | implicit (status check) | replay of cancel on already-terminal returns `{ idempotent: true, stockReleased: false }` |
| `bookingRepository.convertToOrder` | `idempotencyKey` on Order | replay returns existing Order |

UI relies on idempotency for click-spam safety.

---

## 6. Known ambiguities (need Boss + ChatGPT verdict)

### Q1: Reservation TTL

The `StockReservation.expiresAt` column exists but no background
worker enforces expiry today. Reservations sit at `releasedAt: null`
indefinitely until manual cancel.

Boss decision needed:
- A) Add expiry worker (Vercel cron + booking → EXPIRED transition)
- B) Leave indefinite; admin manually cancels
- C) Pre-cancel CONFIRMED when admin starts a new live session

Currently: **B (status quo)** — no auto-expire.

### Q2: Multiple active reservations per booking

`MULTIPLE` integrity status flags corruption but no automatic fix.
Admin sees badge, must manually reconcile.

Boss decision needed:
- A) Add re-confirm endpoint that consolidates to 1 reservation
- B) Display badge + manual intervention only
- C) Auto-cancel surplus on detect

Currently: **B (status quo)**.

### Q3: PENDING_REVIEW reservation pre-warming

PENDING_REVIEW bookings do NOT reserve stock. Stock available shrinks
only at confirm. Edge case: many pending bookings competing for same
slot → race at confirm time.

Boss decision needed:
- A) Reserve at PENDING_REVIEW (soft reservation; releases on cancel + ttl)
- B) Status quo: reserve only at CONFIRMED
- C) "Hold" intent: admin marks pending → soft reservation

Currently: **B (status quo)**. Phase 1.5 auto-confirm shifts most of
this away.

### Q4: Order.saleDate

Order has no `saleDate` column today. Phase 1.5-C-1 plan adds it for
auto-order-append (same-day same-customer rolls into one Order).

Decision in Phase 1.5 decision packet (PR #90). Schema migration R1.

### Q5: Stock counter semantics

`stock.availableQty = totalQuantity - reservedQty` (where reservedQty
= sum of active reservations). Computed live from current state, not
historical.

Range mode summary `days[].items[].stock` returns CURRENT snapshot,
NOT historical (per PR #77 `stockSnapshotNote`).

No ambiguity here — explicitly documented.

### Q6: CONVERTED_TO_ORDER booking reservation

When booking transitions to CONVERTED_TO_ORDER, the reservation's
`releasedAt` is set. Stock commitment transfers to the Order (no
explicit Order-level reservation row).

Boss decision needed:
- A) Add `OrderItemReservation` model (mirror StockReservation per OrderItem)
- B) Status quo: order stock commitment is implicit
- C) Order-level reservation only on RESERVED → CONFIRMED transition

Currently: **B (status quo)**. Adequate for current scale; revisit if
fulfillment / refund flow needs reconciliation.

---

## 7. Hard rules

- ❌ Never write `StockReservation.releasedAt` outside the 3 paths in §2
- ❌ Never auto-confirm without first creating reservation in same transaction
- ❌ Never set Booking.status terminal without releasing reservation (where applicable)
- ❌ Never reuse `convertedOrderId` across multiple Orders
- ❌ Never expose customer PII in integrity status surfaces

---

## 8. Cross-references

- `prisma/schema.prisma` — Booking / StockReservation / Order / OrderItem
- `src/server/repositories/booking.repository.ts` — `createManual` / `confirm` / `cancel` / `convertToOrder`
- `src/lib/sale/booking-rules.ts` — `groupBookingsForOrderItems`
- PR #52 — `isTerminalBookingStatus` + history disclosure
- PR #55 — invariant tests
- PR #70 — `foldReservedQty` in summary
- PR #79 — `slotRowDisplayState` integrity warn state
- PR #90 — Phase 1.5 decision matrix

---

## 9. Decision

This doc lands as `docs(sale): audit stock + booking state machine`.
Zero runtime. Boss + ChatGPT verdict on §6 Q1-Q3 + Q6 sharpens Phase
1.5 + future fulfillment work.
