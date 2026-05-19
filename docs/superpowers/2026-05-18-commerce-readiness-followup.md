# Commerce readiness audit — 2026-05-18 follow-up

**Filed:** 2026-05-18
**Supersedes:** schema/status sections of `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md` § 2, § 5, § 6.
**Status:** docs-only. Corrects + extends. Boss decision input.

The 2026-05-17 audit got the broad shape right but listed statuses that do not exist in `prisma/schema.prisma`. This follow-up corrects the status tables by reading the actual schema and extends the audit with a missing-test inventory + risk-prioritized PR sequence.

---

## 1. Corrected enum tables (from `prisma/schema.prisma`)

### 1.1 OrderStatus (schema line 322)

```
RESERVED
CONFIRMED
PACKED
SHIPPED
DELIVERED
CANCELLED
```

Six states. **No** `PENDING`, **no** `PROCESSING`, **no** `REFUNDED` in `OrderStatus` enum.

### 1.2 PaymentStatus (schema line 384)

```
PENDING
VERIFIED
FAILED
REFUNDED
```

Four states. **No** `AWAITING_VERIFICATION` (the prior audit invented this).

### 1.3 PaymentMethod (schema line 391)

```
TRANSFER
QR_CODE
COD
```

### 1.4 ShipmentStatus (schema line 422)

```
PENDING
ASSIGNED
PICKED_UP
IN_TRANSIT
DELIVERED
RETURNED
```

Six states. **No** `PROCESSING`, **no** `SHIPPED` (admin would expect `SHIPPED` → maps to `IN_TRANSIT`).

### 1.5 BookingStatus (schema line 765)

```
PENDING_REVIEW
CONFIRMED
CANCELLED
EXPIRED
CONVERTED_TO_ORDER
```

### 1.6 BookingSource (schema line 773)

```
MANUAL
LIVE_COMMENT
PAGE_INBOX
POST_COMMENT
WHATSAPP_CHAT
TELEGRAM_CHAT
IMPORT
SYSTEM
```

---

## 2. Implications of corrected enums

### 2.1 No `PENDING` Order state

The Order lifecycle starts at `RESERVED`, not `PENDING`. This matters because:

- `POST /api/sale/orders/from-bookings` ships RESERVED immediately on successful conversion.
- There is **no waiting state** between order creation and reservation. Reservation IS the order.
- Cancel before RESERVED is impossible — there is no Order row to cancel.

The admin runbook should explain this.

### 2.2 No `AWAITING_VERIFICATION` PaymentStatus

Payment slips move directly from `PENDING` to `VERIFIED` or `FAILED`. There is no intermediate "uploaded but not yet reviewed" status.

Implication: admins cannot distinguish "no slip uploaded yet" from "slip uploaded but I haven't looked". Either both are `PENDING`, or `slipUrl` field becomes the discriminator. If the latter, the admin UI must surface this.

This is a **followup** for Tier 4.5 or a UI polish PR — adjust admin UI to show "slip not yet uploaded" vs "slip uploaded, awaiting review" using `slipUrl` presence.

### 2.3 No `PROCESSING` or `SHIPPED` ShipmentStatus

Shipment transitions are:

```
PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                                            → RETURNED
```

Admin UI must use `IN_TRANSIT` not `SHIPPED`. The day-1 admin runbook should reference these literal labels.

### 2.4 Order DELIVERED ≠ Shipment DELIVERED

Two `DELIVERED` enums exist. They are not auto-synchronized today.

| Event | Order side | Shipment side | Stock side |
|---|---|---|---|
| Manual admin marks Order DELIVERED | `OrderStatus.DELIVERED` | Shipment unchanged | nothing |
| Manual admin marks Shipment DELIVERED | Order unchanged | `ShipmentStatus.DELIVERED` | nothing |
| Carrier API (future) reports delivered | Order unchanged | `ShipmentStatus.DELIVERED` via webhook | nothing |

Recommended Tier 6 PR introduces a single state transition handler that updates both atomically.

---

## 3. State machine gap inventory

Today there is **no enforced state machine** for either Order or Shipment. Admins can theoretically:

- Set Order DELIVERED while ShipmentStatus is still PENDING
- Cancel an Order that is already PACKED
- Mark Shipment IN_TRANSIT without first ASSIGNED
- Skip from PENDING_REVIEW Booking directly to CONVERTED_TO_ORDER without CONFIRMED

This is enforced at the validation layer in some routes but not all. A consolidated state machine is recommended:

```
Booking:     PENDING_REVIEW → CONFIRMED → CONVERTED_TO_ORDER
                                       ↓
                                   CANCELLED ← (any non-terminal state)
                                   EXPIRED   ← (system-triggered)

Order:       RESERVED → CONFIRMED → PACKED → SHIPPED → DELIVERED
                                                    ↓
                                                CANCELLED ← (any non-terminal)

Shipment:    PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                                                         ↓
                                                     RETURNED ← (post-delivery)

Payment:     PENDING → VERIFIED → REFUNDED
                    → FAILED   → (retry: back to PENDING)
```

Recommended PR: extract `src/lib/state-machines/{booking,order,shipment,payment}.ts` with `canTransition(from, to)` table + `transition(entity, to)` enforcement.

---

## 4. Missing test coverage matrix

### 4.1 Order lifecycle

| Transition | Vitest unit? | Docker verifier? | E2E? |
|---|---|---|---|
| RESERVED → CONFIRMED (slip verified) | partial | no | no |
| CONFIRMED → PACKED | no | no | no |
| PACKED → SHIPPED | no | no | no |
| SHIPPED → DELIVERED | no | no | no |
| any → CANCELLED | partial | no | no |
| Multi-status concurrent update race | no | no | no |

### 4.2 Payment lifecycle

| Transition | Vitest | Verifier | E2E |
|---|---|---|---|
| PENDING → VERIFIED | no | no | no |
| PENDING → FAILED | no | no | no |
| VERIFIED → REFUNDED | no | no | no |
| FAILED → PENDING (retry) | no | no | no |

### 4.3 Shipment lifecycle

| Transition | Vitest | Verifier | E2E |
|---|---|---|---|
| PENDING → ASSIGNED | no | no | no |
| ASSIGNED → PICKED_UP | no | no | no |
| PICKED_UP → IN_TRANSIT | no | no | no |
| IN_TRANSIT → DELIVERED | no | no | no |
| DELIVERED → RETURNED | no | no | no |

### 4.4 Cross-entity consistency

| Scenario | Test? |
|---|---|
| Order DELIVERED while Shipment PENDING — flag? | no |
| Shipment DELIVERED → Order auto-advance? | no |
| Order CANCELLED → Payment auto-refund flag? | no |
| Cancel order with PACKED Shipment — block? | no |

---

## 5. Risk-prioritized PR sequence

Same priority order as the original audit, with corrections:

| Rank | PR | Risk if skipped |
|---|---|---|
| **P0** | Stock decrement (Track 5 X/Y/Z) | drift breaks reservedQty |
| **P0** | Order state machine guard + tests | admin can land in impossible states |
| **P1** | Payment status UI clarity (slipUrl as discriminator) | admin double-reviews or misses slips |
| **P1** | Shipment state machine guard + tests | shipping skips invalid transitions |
| **P1** | OrderAudit surface in `/orders` UI | no traceability for state changes |
| **P2** | Cross-entity consistency rules | drift between Order / Shipment / Payment |
| **P2** | Carrier API integration (one carrier first) | manual tracking burden |
| **P2** | Slip OCR / auto-verify | manual review burden |
| **P3** | Customer-facing order tracking | optional in Boss closed test |
| **P3** | Refunds / returns flow | no real refund traffic yet |

---

## 6. Decision points blocking real customer onboarding

| # | Decision | Owner | Currently |
|---|---|---|---|
| 1 | Stock decrement model | Boss | pending |
| 2 | State machine enforcement layer location (route vs lib) | Boss + Claude | not decided |
| 3 | Carrier API choice (J&T / Flash / Kerry / Lalamove / other) | Boss | pending |
| 4 | Payment method real config (PromptPay / Maybank live keys) | Boss | per-shop |
| 5 | Customer notification policy (email / SMS / Messenger) | Boss | currently no-go |
| 6 | Multi-currency timeline | Boss | not decided |
| 7 | Refund authorization (admin role / Boss-only) | Boss | not decided |

---

## 7. What this follow-up does NOT change

- No runtime code change
- No schema change
- No PR opened for state machine yet (P0 stock + P0 state machine remain pending Boss decisions)
- No test added (this is docs-only audit follow-up)

---

## 8. Cross-references

- Original audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Admin onboarding readiness: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- Admin day-1 runbook: `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md`
- Schema source of truth: `prisma/schema.prisma`
