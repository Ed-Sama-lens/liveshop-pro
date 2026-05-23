# Stock + Booking State Machine — Recommended Matrix

**Filed:** 2026-05-23 (Block 4 — post Boss/ChatGPT Decision 4)
**Author:** Claude Sonnet 4.6
**Master baseline:** `310ddf3`
**Status:** Matrix only. NO runtime semantic change. NO new tests yet (tests added later only if they reflect CURRENT accepted behavior, per Boss Decision 4).
**Companion to:** `docs/superpowers/2026-05-23-stock-booking-state-machine-audit.md` (merged via PR #95)

Boss + ChatGPT Decision 4 (2026-05-23):

> **Do NOT implement stock/reservation semantic changes yet. Allowed: refine state-machine audit, create matrix of current vs recommended behavior, add tests only if they reflect current accepted behavior. Required clarification doc covers 8 questions.**

This doc answers the 8 clarification questions with current behavior + recommendation + risk + migration impact + Phase 1.5 alignment.

---

## 0. Scope rules honored

- Docs-only PR (R2)
- Zero runtime change
- Zero schema change
- Zero new test (tests deferred until matrix accepted)
- pak-ta-kra untouched
- DISSENT 4-bullet not required (R2 docs)

---

## 1. The 8 clarifications — current vs recommended matrix

### 1.1 Q1 — Should PENDING reserve stock?

| Aspect | Current | Recommended |
|---|---|---|
| Behavior | **NO.** `PENDING_REVIEW` bookings hold zero `StockReservation` rows | **NO.** Keep status quo |
| Stock impact | Available qty unchanged on booking create | Same |
| Race window | Multiple PENDING bookings can compete for same slot until confirm time | Same (mitigated by Phase 1.5 auto-confirm reducing PENDING dwell time) |
| Audit invariant (PR #55) | `PENDING_REVIEW + 0 reservations` = `NOT_APPLICABLE` (correct) | Same |
| Why | Pre-warming reservations creates orphan reservations on abandoned bookings; current TTL gap (see Q2/Q3) would compound the leak | Phase 1.5 auto-confirm shrinks the gap; revisit only after auto-confirm validated in production ≥1 week |
| Risk to change | R1 — would touch confirm path + reservation lifecycle + integrity classifier | n/a (no change) |
| Migration | NO | n/a |

**Verdict: keep current. NO change without Boss explicit Phase 2 re-evaluation.**

---

### 1.2 Q2 — If PENDING reserves, how to prevent Confirm double-reserve?

Conditional on Q1 = YES. Since Q1 recommended NO, Q2 is moot for current decision.

**Forward-looking note (only if Boss later flips Q1):**

| Aspect | Recommended if Q1 flips |
|---|---|
| Pattern | `confirm()` reads existing reservations via `bookingId` index; if active reservation exists for this booking, skip insert + return existing |
| Transaction guard | All inside single `prisma.$transaction` to prevent race |
| Idempotency | `confirm()` already returns `{ idempotent: true }` on already-CONFIRMED; extend to detect already-reserved PENDING |
| Integrity classifier | `MULTIPLE` becomes possible if PENDING + CONFIRMED both have reservation rows in flight; tighten check |

**Verdict: not applicable. Document only as future-state guidance.**

---

### 1.3 Q3 — Should CONFIRMED always reserve?

| Aspect | Current | Recommended |
|---|---|---|
| Behavior | **YES.** `bookingRepository.confirm` creates `StockReservation` row in same `$transaction` as status flip | **YES.** Keep status quo |
| Stock impact | Available qty drops by `booking.quantity` on confirm | Same |
| Atomicity | Single `$transaction` — either both succeed or both rollback | Same |
| Edge case: stock = 0 at confirm | Throws `INSUFFICIENT_STOCK`; status stays PENDING_REVIEW | Same |
| Edge case: shop deleted mid-transaction | Cascaded FK + transaction rollback | Same |
| Audit invariant | `CONFIRMED + 1 active reservation` = `OK` | Same |
| Risk to change | R1 — confirm semantics are foundational | n/a |
| Migration | NO | n/a |

**Verdict: keep current. This is the load-bearing rule of the entire flow.**

---

### 1.4 Q4 — When does physical stock decrement happen?

| Aspect | Current | Recommended |
|---|---|---|
| Decrement event | **No explicit physical decrement.** `ProductVariant.quantity` is the master count; `availableQty = quantity - sum(active reservations)` computed live | **Keep computed model.** Add explicit decrement only at fulfillment (PACKED status) — out of scope for current decision |
| Where computed | `foldReservedQty()` (PR #70) in summary; `prisma.stockReservation.groupBy WHERE releasedAt IS NULL` | Same |
| Physical inventory write | Only happens on Product/Variant create (bulk + single) and Edit dialog | Same |
| Order fulfillment | OrderItem written at CONVERTED_TO_ORDER; reservation `releasedAt` set; physical stock not decremented (commitment moves to Order) | Same (until fulfillment workflow shipped) |
| Risk to add explicit decrement | R1 — touches Order lifecycle + audit log | n/a |
| Migration | NO for current; YES for future fulfillment (OrderItem may need `decrementedAt` column) | n/a |

**Verdict: keep computed model. No physical decrement until fulfillment workflow (Tier ≥4.5).**

---

### 1.5 Q5 — What does CANCELLED release?

| Aspect | Current | Recommended |
|---|---|---|
| If CANCELLED from PENDING_REVIEW | Nothing to release (no reservation existed) | Same |
| If CANCELLED from CONFIRMED | `StockReservation.releasedAt = now` for the booking's active reservation | Same |
| Stock impact | Available qty restored by `booking.quantity` | Same |
| Atomicity | Single `$transaction`: status flip + releasedAt set | Same |
| Idempotent replay (PR #52) | Already-terminal returns `{ idempotent: true, stockReleased: false }` (no double-release) | Same |
| Edge case: 0 active reservations on CONFIRMED | Existing `resolveActiveReservation` discriminated union throws `RESERVATION_INTEGRITY_ERROR` | Same |
| Edge case: multiple active reservations | Same `resolveActiveReservation` throws | Same |
| Audit log | `BookingHistory` row written with `fromStatus`/`toStatus`/`reason` | Same |
| Risk to change | R1 | n/a |
| Migration | NO | n/a |

**Verdict: keep current. Defensive integrity error pattern is correct.**

---

### 1.6 Q6 — What does CONVERTED mean for active booking list?

| Aspect | Current | Recommended |
|---|---|---|
| Listing | `CONVERTED_TO_ORDER` is **terminal** per `isTerminalBookingStatus` (PR #52) | Same |
| Active list visibility | Hidden by default; surfaces under "ประวัติ" disclosure | Same |
| Reservation state | `releasedAt` set at convert time (transferred semantically to Order) | Same |
| Cross-link | `Booking.convertedOrderId` non-null; Order UI shows `convertedFromBookings` | Same |
| V Rich slot display | NOT shown on active board; only in history view | Same (see §2 V Rich mapping) |
| Reconfirm/re-cancel | Forbidden (terminal). Idempotent replay returns `{ idempotent: true }` | Same |
| Risk to change | R1 — would touch isTerminal helper + UI active filter + integrity classifier | n/a |
| Migration | NO | n/a |

**Verdict: keep current. CONVERTED behaves identically to CANCELLED/EXPIRED for list purposes.**

---

### 1.7 Q7 — How does Order creation affect reservation?

| Aspect | Current | Recommended |
|---|---|---|
| Trigger | `bookingRepository.convertToOrder({ bookingIds })` | Same |
| Per-booking effect | `Booking.status = CONVERTED_TO_ORDER`, `convertedOrderId = newOrderId`, `StockReservation.releasedAt = now` | Same |
| Order side | `Order.create({ status: 'RESERVED', items: groupBookingsForOrderItems() })` | Same |
| Order-level stock commitment | **Implicit.** No `OrderItemReservation` row. Stock is committed via `Order.status = RESERVED` semantic | Same (matrix Q8 below addresses making explicit) |
| Atomicity | Single `$transaction` covering all booking transitions + Order creation | Same |
| Idempotency | `Order.idempotencyKey` unique constraint; replay returns existing Order | Same |
| Edge case: 0 active reservations on a booking | Throws `RESERVATION_INTEGRITY_ERROR` via same `resolveActiveReservation` | Same |
| Edge case: stock changed between confirm + convert | OrderItem snapshots `unitPrice` at booking confirm time; quantity flows through; physical reconciliation deferred to fulfillment | Same |
| Phase 1.5-C auto-append | NOT implemented. `Q4` of Phase 1.5 decision packet decides if RESERVED orders can be appended to | Hold per Phase 1.5 packet (decision Q4: RESERVED only recommended) |
| Risk to change | R1 | n/a |
| Migration | NO for current; YES if `Order.saleDate` added (Phase 1.5-C-1) | n/a |

**Verdict: keep current. Phase 1.5-C will add `Order.saleDate` + upsert path; that work is gated by Phase 1.5 verdict packet (separate doc).**

---

### 1.8 Q8 — How do V Rich slots map to PENDING/CONFIRMED/CANCELLED/CONVERTED?

`V Rich board` = component skeleton shipped in PR #88 (NOT wired to production). Display state helper at `src/components/sale/board/board-display.helpers.ts`.

| Booking status | V Rich slot display | Source | Active board visibility |
|---|---|---|---|
| `PENDING_REVIEW` | `pending` (pulse + admin action) | `slotRowDisplayState` PR #79 | **Visible** on active board |
| `CONFIRMED` (integrity OK) | `confirmed` (solid + reservation pill) | same | **Visible** |
| `CONFIRMED` (integrity `MISSING`) | `integrity_warn` (red border + warn icon) | same | **Visible** (admin must fix) |
| `CONFIRMED` (integrity `MULTIPLE`) | `integrity_warn` (red border + count) | same | **Visible** (admin must reconcile) |
| `CANCELLED` | `terminal` (greyed + reason hover) | same | **Hidden** (history disclosure) |
| `EXPIRED` | `terminal` (greyed) | same | **Hidden** |
| `CONVERTED_TO_ORDER` | `terminal_converted` (greyed + order link) | same | **Hidden** |

| Slot interaction | Allowed for status | Disabled for status |
|---|---|---|
| Confirm button | PENDING_REVIEW | All others |
| Cancel button | PENDING_REVIEW + CONFIRMED | Terminal (CANCELLED, EXPIRED, CONVERTED) |
| Convert button | CONFIRMED (one or more selected) | All others (terminal or PENDING) |
| Quantity edit | PENDING_REVIEW only | CONFIRMED + terminal (would invalidate reservation) |
| Reservation pill | CONFIRMED + integrity = OK | All others |
| Integrity badge | CONFIRMED + integrity != OK | All others |

| V Rich row aggregation | Behavior |
|---|---|
| Multiple bookings same customer same broadcastProduct | Grouped into one slot row; status badges per booking |
| Status mix in same slot (1 PENDING + 1 CONFIRMED) | Slot shows compound state; primary action follows first-PENDING |
| All bookings terminal | Slot moves to history disclosure |

**Verdict: V Rich mapping matches existing `slotRowDisplayState` helper (PR #79) + active/terminal filter (PR #52). No new state introduced. Wiring V Rich to production layout = separate PR (held behind feature flag per Boss verdict).**

---

## 2. Current vs recommended summary

| Q | Topic | Current | Recommended action |
|---|---|---|---|
| Q1 | PENDING reserves stock | NO | Keep NO |
| Q2 | Confirm double-reserve guard | n/a (Q1=NO) | n/a |
| Q3 | CONFIRMED reserves | YES | Keep YES |
| Q4 | Physical decrement timing | At fulfillment (not yet built) | Keep computed model; defer physical until fulfillment |
| Q5 | CANCELLED releases | YES (if was CONFIRMED) | Keep YES |
| Q6 | CONVERTED in active list | Hidden (terminal) | Keep hidden |
| Q7 | Order creation releases reservation | YES (transferred) | Keep YES |
| Q8 | V Rich slot mapping | Defined in `slotRowDisplayState` (PR #79) | Keep mapping; wire only behind flag |

**Net: 8/8 recommend keeping current behavior. Zero semantic changes proposed.**

---

## 3. Tests reflecting current accepted behavior (Boss-allowed scope)

Per Boss Decision 4: "add tests only if they reflect current accepted behavior."

Permitted regression test PRs (R2):

| Test PR | Subject | Coverage gap |
|---|---|---|
| `test(sale): PENDING_REVIEW creates zero StockReservation rows` | Assert no reservation row created on booking create | Currently implicit via integration smoke; explicit unit absent |
| `test(sale): CONFIRMED has exactly 1 active reservation post-confirm` | Assert integrity = OK after `confirm()` | Partial coverage in PR #55 invariants; expand |
| `test(sale): CANCELLED idempotent replay returns stockReleased: false` | Assert second cancel returns `{ idempotent: true, stockReleased: false }` | Tested in PR #52 already; expand edge cases |
| `test(sale): CONVERTED_TO_ORDER sets releasedAt on all participating reservations` | Assert convert path releases all reservations atomically | Partial in PR #55; expand multi-booking case |
| `test(sale): isTerminalBookingStatus returns true for CONVERTED_TO_ORDER` | Lock helper behavior | Tested in PR #52 |
| `test(sale): slotRowDisplayState mapping all 5 statuses` | Lock UI display state helper | Tested in PR #79 board-display tests |

**Tests NOT permitted (would require semantic change):**

- Tests asserting PENDING reservation creation (would require Q1 flip)
- Tests asserting double-reservation prevention on CONFIRMED (would require Q2 work)
- Tests asserting physical stock decrement at convert time (would require Q4 flip)
- Tests asserting OrderItemReservation row (would require Q7 flip)

---

## 4. Risk + migration summary

| Q | Change risk if Boss later flips | Migration if Boss flips |
|---|---|---|
| Q1 PENDING reserves | R1 (touches confirm + integrity + UI) | NO |
| Q2 double-reserve guard | R1 (only matters if Q1 flips) | NO |
| Q3 CONFIRMED reserves | R0 (foundational rule, do NOT change) | n/a |
| Q4 physical decrement | R1 (touches fulfillment workflow) | YES (OrderItem.decrementedAt + audit) |
| Q5 CANCELLED releases | R0 (foundational, do NOT change) | n/a |
| Q6 CONVERTED in active | R1 (UI filter + helper) | NO |
| Q7 Order releases reservation | R0 (foundational) | n/a |
| Q8 V Rich slot mapping | R1 (UI helper change) | NO |

**Foundational rules (Q3, Q5, Q7) are R0 — never change without explicit Boss + ChatGPT signoff + production data audit.**

---

## 5. Phase 1.5 alignment

| Phase 1.5 decision | State machine Q affected | Compatible with current matrix? |
|---|---|---|
| Q1 customer flag `autoConfirmEligible` | none | YES (additive Customer column) |
| Q2 auto-confirm trust-gated | Q3 (CONFIRMED reserves) | YES (auto-confirm uses same `bookingRepository.confirm` path) |
| Q3 new-customer default true | none | YES |
| Q4 append RESERVED-only Orders | Q7 (Order creation) | YES (Order.saleDate addition; reservation release semantic unchanged) |
| Q5 batch cap 20 | none | YES (limits Manual Create batch size) |
| Q6 all-or-nothing batch | Q3 (CONFIRMED reserves) + Q5 (CANCELLED releases) | YES (transaction rollback releases any partial reservations) |
| Q7 B-first ordering | none | YES (B-series Customer column lands without touching reservation semantics) |

**Verdict: Phase 1.5 implementation does NOT require any state machine semantic change. All 7 Phase 1.5 decisions compose with current matrix.**

---

## 6. Hard rules (state machine invariants — NEVER violate)

1. `PENDING_REVIEW` MUST hold zero active `StockReservation` rows
2. `CONFIRMED` MUST hold exactly one active `StockReservation` row (integrity = OK)
3. `confirm()` MUST create reservation in same `$transaction` as status flip
4. `cancel()` from CONFIRMED MUST set `releasedAt` in same `$transaction` as status flip
5. `convertToOrder()` MUST set `releasedAt` on every participating booking's reservation in same `$transaction` as Order create
6. `isTerminalBookingStatus(s)` returns true iff `s ∈ {CANCELLED, EXPIRED, CONVERTED_TO_ORDER}`
7. Terminal bookings MUST NOT be re-confirmed, re-cancelled, or re-converted (idempotent return only)
8. `Booking.convertedOrderId` MUST be unique (no Order shares converted bookings across two Orders)
9. `StockReservation.releasedAt` MUST only be written by the three paths in §2 of audit doc (cancel, convert, future expiry worker)
10. Customer PII MUST NOT appear in `reservationIntegrity` surfaces or V Rich slot display

---

## 7. Stop conditions for any future state machine PR

If Boss later authorizes semantic change, halt PR if:

1. Test reveals `availableQty` going negative
2. Integrity classifier reports OK but reservation row missing
3. `releasedAt` written outside the 3 sanctioned paths
4. `$transaction` rollback fails to release partial reservations
5. Terminal status re-transition succeeds (idempotency guard broken)
6. Customer PII leaks into V Rich or integrity surfaces
7. Cross-shop reservation visible (tenant isolation broken)
8. Order created with bookings already CONVERTED_TO_ORDER (idempotency violation)

---

## 8. Cross-references

- PR #95 (merged) — `docs/superpowers/2026-05-23-stock-booking-state-machine-audit.md`
- PR #52 — `isTerminalBookingStatus` + history disclosure + idempotent cancel
- PR #55 — invariant tests + `MISSING`/`MULTIPLE` integrity
- PR #70 — `foldReservedQty` in summary
- PR #79 — `slotRowDisplayState` helper + V Rich board-display tests
- PR #88 — V Rich board component skeleton (NOT wired)
- PR #90 — Phase 1.5 decision matrix
- `prisma/schema.prisma` — Booking (line 947) / StockReservation (line 219) / Order (line 292)
- `src/server/repositories/booking.repository.ts` — `createManual` / `confirm` / `cancel` / `convertToOrder`
- `src/lib/sale/booking-rules.ts` — `groupBookingsForOrderItems`
- Boss/ChatGPT verdict 2026-05-23 — Decision 4

---

## 9. Status

- Docs-only PR (R2)
- Zero runtime semantic change
- Zero new test in this PR (Boss-allowed regression tests deferred to separate R2 PR after matrix accepted)
- 8/8 clarifications answered with current behavior + recommendation = KEEP
- Phase 1.5 compatibility verified (no state machine change required by Phase 1.5)
- Awaiting Boss + ChatGPT acceptance of matrix before any test PR
