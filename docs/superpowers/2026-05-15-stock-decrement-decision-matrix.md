# Stock decrement decision — quick-pick matrix

**Filed:** 2026-05-18 (matrix companion to the 2026-05-17 memo)
**Pairs with:** `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
**Status:** Boss decision needed. No code change.

This file restates the X/Y/Z decision in a one-screen matrix Boss can read in <5 minutes, with one correction to the memo (Order enum) and one verification (schema fields).

---

## 1. Quick decision: X / Y / Z

**Recommendation: Y** (decrement on CONFIRMED).

Pick by gut and read the row that matches the gut:

| Gut | Pick |
|---|---|
| "Stock leaves when customer gets it" | X |
| "Stock leaves when payment clears" | Y ✅ recommended |
| "Just let me update manually" | Z |

If unsure → Y.

---

## 2. Correction to the memo

The 2026-05-17 memo § 2 lists Order transitions `CONFIRMED → PROCESSING → SHIPPED → DELIVERED`. The actual schema (`prisma/schema.prisma` line 322) defines:

```
RESERVED → CONFIRMED → PACKED → SHIPPED → DELIVERED
                              ↓
                          CANCELLED ← (any non-terminal)
```

No `PROCESSING` state. `PACKED` replaces it. This does not change the X/Y/Z decision but matters for implementation labels.

---

## 3. Schema verification (impacts Phase Y.0)

Read `prisma/schema.prisma` line 287-302:

```
model Order {
  ...
  confirmedAt    DateTime?  ← exists, line 299
  packedAt       DateTime?  ← exists, line 300
  shippedAt      DateTime?  ← exists, line 301
  deliveredAt    DateTime?  ← exists, line 302
  ...
}
```

**Phase Y.0 schema audit verdict: PASS. No migration needed.** The `confirmedAt` timestamp already exists. Phase Y.0.5 (migration) in the memo can be deleted.

---

## 4. Side-by-side decision matrix

| Aspect | X (DELIVERED) | Y (CONFIRMED) ✅ | Z (Manual) |
|---|---|---|---|
| **Trigger** | `OrderStatus.DELIVERED` | `OrderStatus.CONFIRMED` (payment verified) | none |
| **Schema migration** | none | none | none |
| **New code** | decrement helper + state hook + tests + verifier | decrement helper + state hook + tests + verifier | none |
| **Lines of code estimate** | ~400 (incl. tests) | ~400 (incl. tests) | 0 |
| **Reversibility** | R1 (flag-gated rollout) | R1 (flag-gated rollout) | R0 (no change) |
| **Inventory accuracy** | high if admin reaches DELIVERED | high at payment moment | depends on admin |
| **Physical vs digital gap** | none | exists during PACKED+SHIPPED window | always (manual) |
| **Refund/cancel re-increment** | needed (RETURNED + CANCELLED) | needed (REFUNDED + CANCELLED) | manual |
| **Returns flow dependency** | yes (Tier 7) | yes (Tier 7) | manual |
| **Admin burden / order** | one click DELIVERED | one click VERIFY slip | per shipment manual count |
| **Scales to 10 orders/day** | ✅ | ✅ | barely |
| **Scales to 100 orders/day** | ✅ if disciplined | ✅ | ❌ |
| **Scales to 1000 orders/day** | ✅ with carrier API | ✅ | ❌ |
| **Audit trail location** | `OrderAudit` on `→ DELIVERED` | `OrderAudit` on `→ CONFIRMED` | `/activity` manual entries |
| **Live commerce fit** | weaker (relies on delivery confirmation admin rarely does) | stronger (payment is the gating step) | weakest |
| **Implementation risk** | medium — depends on full state machine | medium — single trigger point | none |
| **Test surface** | + state machine integration | + payment verify integration | + manual flow doc |
| **Boss's mental model** | "I sold it when customer got it" | "I sold it when they paid" | "I'll count when I have time" |
| **Failure mode if admin lapse** | drift toward over-stock (item never marked DELIVERED) | drift toward under-stock (slip rejected after stock already decremented — needs rollback) | drift in either direction |
| **Recovery effort if drift accumulates** | medium (recount + bulk DELIVERED-mark) | medium (recount + ledger reconciliation) | full recount required |

---

## 5. One-screen failure-mode table

What goes wrong, and what to do about it.

### Option X — DELIVERED

| Failure | Effect | Recovery |
|---|---|---|
| Admin forgets to mark DELIVERED | `quantity` stays high; `reservedQty` stays high | Nightly cron auto-finalizes orders aged > 14 days OR weekly admin sweep |
| Customer never confirms delivery | Same as above | Cron + admin policy |
| Item lost in transit | DB still shows stock | Manual zero-out + insurance claim outside system |
| Return after DELIVERED | Need re-increment | Tier 7 RETURNED → re-increment hook |

### Option Y — CONFIRMED

| Failure | Effect | Recovery |
|---|---|---|
| Payment verified mistakenly (bad slip) | Stock already decremented | Manual re-increment + FAILED payment status transition + OrderAudit entry |
| Refund issued | Need re-increment | Tier 7 REFUNDED → re-increment hook |
| Concurrent payment verify on same order | Double decrement risk | Transaction lock + idempotency key |
| Order CANCELLED after CONFIRMED | Need re-increment | Cancel-after-confirmed → inverse hook |

### Option Z — Manual

| Failure | Effect | Recovery |
|---|---|---|
| Admin forgets one shipment | `quantity` overstates available | manual count |
| Admin counts wrong | Mis-state | manual recount |
| Multiple admins, no coordination | Conflicting edits | Last-write-wins; race |
| Audit gap | No traceability | none |

---

## 6. Implementation order (if Y picked)

Updated from memo (Y.0.5 removed because `confirmedAt` already exists):

| Phase | What | Risk | LOC |
|---|---|---|---|
| Y.0 | Schema audit (done — PASS) | R0 | 0 |
| Y.1 | Repository helper `decrementStockOnOrderConfirm` (pure helper) | R2 | ~60 |
| Y.2 | Wire into payment-verify route | R1 | ~30 |
| Y.3 | Unit + integration tests | R2 | ~150 |
| Y.4 | Docker verifier `verify-order-confirmed-decrements-stock.ts` | R2 | ~120 |
| Y.5 | Feature flag `STOCK_DECREMENT_ON_CONFIRM` (default OFF) | R1 | ~10 |
| Y.6 | Deploy + Boss functional smoke | R1 | 0 |
| Y.7 | Flag default flip ON after 7-day observation | R1 | ~5 |
| Y.8 (later) | RETURNED + REFUNDED re-increment hooks (Tier 7) | R1 | ~150 |

Each phase is a separate PR.

---

## 7. What Boss decides

Three rows. One vote each.

- **Decision A — model:** [ ] X [ ] **Y** [ ] Z
- **Decision B — initial deployment:** [ ] flag-gated default OFF + observe [ ] direct on (no flag) [ ] dev preview only first
- **Decision C — re-increment scope at first ship:** [ ] CANCELLED only [ ] REFUNDED only [ ] both [ ] neither (Tier 7)

Defaults if Boss says "go ahead, your call": A=Y, B=flag-gated default OFF, C=CANCELLED only.

---

## 8. What this matrix does NOT do

- Does not implement any of X/Y/Z
- Does not change schema
- Does not flip any flag
- Does not authorize Tier 7 (returns/refunds) work
- Does not pre-empt the order state machine PR (separate)

---

## 9. Cross-references

- Decision memo: `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
- Commerce readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Commerce readiness follow-up: `docs/superpowers/2026-05-18-commerce-readiness-followup.md`
- Schema source: `prisma/schema.prisma`
