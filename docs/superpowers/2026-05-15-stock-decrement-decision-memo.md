# Stock decrement decision memo

**Filed:** 2026-05-17
**Status:** Decision memo for Boss. NO code change in this doc.
**Companion:** `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md` § 7

---

## 1. Why this decision matters

Without a stock decrement policy, `ProductVariant.quantity` never drops after fulfillment. Meanwhile `reservedQty` grows with every CONFIRMED booking + RESERVED order. Eventually `reservedQty > quantity` and the available stock formula `quantity - reservedQty` goes negative, which the UI clamps to 0 — but inventory data becomes meaningless.

This blocks real admin onboarding at moderate volume. Boss must pick a model BEFORE inviting real admins or letting public customers checkout.

## 2. Current stock behavior (verified)

| Event | quantity | reservedQty | Effect |
|---|---|---|---|
| ProductVariant created | set to initial | 0 | stock arrives |
| Booking PENDING_REVIEW created | unchanged | unchanged | soft-hold via booking row only |
| Booking CONFIRMED | unchanged | +qty | StockReservation row created |
| Booking CANCELLED before order | unchanged | -qty | reservation released |
| Booking CONVERTED_TO_ORDER | unchanged | unchanged | reservation gets `orderId` |
| Order RESERVED → CONFIRMED (payment verified) | unchanged | unchanged | no stock effect |
| Order CONFIRMED → PROCESSING | unchanged | unchanged | no stock effect |
| Order PROCESSING → SHIPPED | unchanged | unchanged | no stock effect |
| Order SHIPPED → DELIVERED | unchanged | unchanged | **gap** |

After DELIVERED, the stock is "gone" in reality (item left warehouse + reached customer) but the DB still shows it as `quantity` of N with `reservedQty` of M. Drift grows monotonically.

## 3. Three options

### Option X — Decrement on DELIVERED (intent-aligned)

**Model:**
- When Order status flips to DELIVERED, decrement `ProductVariant.quantity` by the OrderItem quantity.
- Release the StockReservation row (set `releasedAt`).

**Pros:**
- Matches admin mental model: "stock left when shipped + customer got it."
- reservedQty stays accurate throughout the order lifecycle.
- Reverts cleanly on RETURNED → re-increment.

**Cons:**
- Requires Order status transitions to actually be wired (currently mostly admin-manual via `/orders` UI).
- If admin forgets to mark DELIVERED, stock never decrements.
- Returns workflow not yet implemented; re-increment logic deferred.

**Risk:** MEDIUM. Depends on admin habit + completed order lifecycle.

### Option Y — Decrement on CONFIRMED (cash-on-hand)

**Model:**
- When Order status flips to CONFIRMED (payment verified), decrement `quantity` immediately.
- Release the StockReservation row.

**Pros:**
- Stock matches accounting at the point of payment.
- No dependency on later shipment status.
- Simpler audit (one trigger point).

**Cons:**
- Item is still in warehouse at CONFIRMED — physical vs digital mismatch for the SHIPPED window.
- If admin cancels/refunds after payment, must re-increment quantity (separate logic).
- Encourages skipping intermediate statuses (PROCESSING, SHIPPED) since they no longer matter for stock.

**Risk:** MEDIUM. Inventory "leaves" the system before it physically leaves warehouse.

### Option Z — Manual via `/inventory`

**Model:**
- No automatic decrement.
- Admin adjusts `quantity` manually via `/inventory` after each shipment batch.

**Pros:**
- Zero code change.
- Maximum admin flexibility (handles edge cases, mistakes, etc).
- Matches current behavior.

**Cons:**
- Admin must remember every shipment.
- Drift accumulates if admin forgets.
- Doesn't scale beyond ~5 orders/day.
- No audit trail of which order decremented which variant.

**Risk:** HIGH at scale. LOW for current Boss-only test usage.

## 4. Comparison table

| Aspect | Option X (DELIVERED) | Option Y (CONFIRMED) | Option Z (Manual) |
|---|---|---|---|
| Implementation effort | medium (state machine + reservation release) | medium (trigger + idempotency) | none |
| Admin burden | low (just mark delivered) | low (just verify payment) | high (manual count) |
| Inventory accuracy | high if admin completes lifecycle | high at point of payment | depends on admin |
| Audit trail | per Order DELIVERED transition | per Order CONFIRMED transition | manual entry in /activity |
| Returns handling | re-increment on RETURNED | re-increment on REFUNDED | manual |
| Scales to 10/day | yes | yes | barely |
| Scales to 100/day | yes if admins disciplined | yes | no |
| Scales to 1000/day | yes | yes | no |
| Risk of stock theft / loss tracking | low | low (but physical stock differs from DB during shipment window) | only via manual count |
| Migration needed | maybe add OrderEvent or AuditLog | maybe | none |

## 5. Boss product fit

Live commerce in Hatyai (`nazhahatyai.com`) likely involves:
- Live streams during set hours
- Customers comment during stream
- Bookings batch-confirmed by admin
- Payment via PromptPay/Maybank slip
- Shipment via local courier (J&T / Flash / Kerry / Lalamove)
- Delivery confirmation via tracking number entry

**Implication:** Admin will reliably reach CONFIRMED (because payment confirmation is the gating step). Admin may NOT reliably reach DELIVERED (customer reports rarely; tracking integration absent).

This argues for **Option Y** (decrement on CONFIRMED).

But Option Y has a physical-vs-digital window during PROCESSING/SHIPPED where DB shows zero stock but item is still in warehouse. For live commerce where "available stock" is shown to customers in real-time during the stream, this is acceptable — customers cannot reserve already-paid-for items anyway.

## 6. Recommendation

**Option Y — Decrement on CONFIRMED.**

Rationale:
1. Payment confirmation is the most reliable admin touchpoint.
2. Live commerce model: stock counted at point-of-sale, not point-of-delivery.
3. PROCESSING/SHIPPED stock window is consistent with customer expectation ("once paid, it's mine").
4. Simpler audit + clearer recovery (refund triggers re-increment).
5. Avoids dependence on tracking integration (Option X would).

## 7. Impact assessment

If Option Y chosen:

### Booking
No change.

### Order
- Add `OrderStatusChange` hook on PENDING → CONFIRMED transition.
- Wraps stock decrement in same transaction as payment verification.

### Payment
- Verify payment route triggers stock decrement.
- Failed verification rolls back nothing (no decrement happened yet).

### Shipping
No stock effect.

### Returns / Refunds (future)
- Refund triggers re-increment via inverse hook.
- Out of current scope; documented as Tier 7 follow-up.

## 8. Tests needed

- Unit: decrement helper handles edge cases (quantity = 0, multi-item Order, partial decrement).
- Integration: payment verify → stock decrement → reservation release atomically.
- Verifier: `verify-order-confirmed-decrements-stock.ts` Docker case.
- Regression: existing booking/conversion flows untouched.

## 9. Migration needed

Probably none. Existing schema supports the model:
- `ProductVariant.quantity` already mutable.
- `StockReservation.releasedAt` already exists.
- `Order.confirmedAt` (if exists; verify) tracks the trigger.

If `Order.confirmedAt` doesn't exist, add via Prisma migration (additive nullable timestamp).

## 10. Implementation phases

| Phase | Item |
|---|---|
| Y.0 | Verify `Order.confirmedAt` field (Prisma schema audit) |
| Y.0.5 | Schema migration if needed (additive) |
| Y.1 | Repository helper `decrementStockOnOrderConfirm` (pure helper + transaction wrapper) |
| Y.2 | Wire into existing payment-verify route |
| Y.3 | Unit + integration tests |
| Y.4 | Docker verifier |
| Y.5 | Production deploy (flag-gated initially: `STOCK_DECREMENT_ON_CONFIRM=true`) |
| Y.6 | Functional smoke (Boss creates Order, verifies stock decremented) |
| Y.7 | Flag default flip ON after observation window |

Each phase is a separate small PR.

## 11. Boss decision

**Required:**

- [ ] Pick model: **X / Y / Z**
- [ ] If Y: approve Phase Y.0 schema audit
- [ ] If X: approve carrier-tracking dependency timeline
- [ ] If Z: accept scale limit; commit to admin process docs

**Recommended:** Y.

**Date:** _____ (to be filled when Boss decides)

## 12. Cross-references

- Readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md` § 7
- Admin onboarding checklist: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- D4/D6 Boss smoke checklist: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
