# Phase 1.5 — Implementation Checklist

**Filed:** 2026-05-24 (autonomous Track 10)
**Author:** Claude Sonnet 4.6
**Status:** Pre-flight checklist. NO runtime change. Phase 1.5 runtime remains HARD-HELD per Boss Decision 2.

This doc is a tactical companion to the Phase 1.5 verdict packet
(merged via PR #98). The verdict packet answered "what should the
defaults be?" — this checklist answers "what concretely must happen
once Boss says IMPLEMENT?"

Three feature series:

- **B-series** — Auto-confirm via Customer.autoConfirmEligible
- **C-series** — Auto-order-append via Order.saleDate
- **D-series** — Multi-code Manual Create batch

---

## 0. Hard gates (none cleared)

| Gate | Status |
|---|---|
| Boss explicit `IMPLEMENT 1.5-B-1 NOW` verdict | ❌ not given |
| Boss explicit `IMPLEMENT 1.5-C-1 NOW` verdict | ❌ not given |
| Boss explicit `IMPLEMENT 1.5-D-1 NOW` verdict | ❌ not given |
| Boss UI smoke workbook v3 A-K complete | ❌ pending |
| Boss UI smoke workbook v4 L complete | ❌ pending |

**Nothing in this checklist executes until all relevant gates clear.**

---

## 1. B-series — Auto-confirm

### 1.1 1.5-B-1-schema (R1 migration)

**Pre-flight:**
- [ ] Boss verdict on Q1 (boolean) + Q3 (default `true`)
- [ ] Branch `feat/phase-1-5-b-1-schema`
- [ ] DISSENT 4-bullet in PR body
- [ ] Verify no existing migration with same name

**Migration:**
```sql
ALTER TABLE "Customer" ADD COLUMN "autoConfirmEligible" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Customer_shopId_autoConfirmEligible_idx" ON "Customer"("shopId", "autoConfirmEligible");
```

**Tests:**
- [ ] `npx prisma migrate diff --from-empty --to-schema-datasource prisma/schema.prisma` matches expected
- [ ] Migration applies cleanly to fresh Docker postgres
- [ ] Migration applies cleanly to a copy of production schema (Boss runs manually)
- [ ] Existing Customer rows all default to `true` after backfill (verify count == count(autoConfirmEligible = true))

**Rollback plan:**
```sql
ALTER TABLE "Customer" DROP COLUMN "autoConfirmEligible";
DROP INDEX "Customer_shopId_autoConfirmEligible_idx";
```
Safe — column is additive, no foreign keys, no other table touched.

### 1.2 1.5-B-1-repo (R2 — type follow-up)

After schema lands on master + auto-deploys to Vercel + Boss confirms:

- [ ] `customerRepository.findById` returns new field
- [ ] `customerRepository.list` returns new field
- [ ] Update `Customer` Zod schema if exposed
- [ ] No mutation API exposed yet — read-only

### 1.3 1.5-B-1-ui (R1 — UI surface)

- [ ] Edit-customer page renders toggle (`Switch` component)
- [ ] PATCH `/api/customers/[id]` accepts `autoConfirmEligible: boolean`
- [ ] Tests: route accepts/rejects per RBAC
- [ ] Tests: UI toggle reflects current state + bumps `refetchToken` on save

### 1.4 1.5-B-2-repo (R1 — auto-confirm path)

- [ ] `bookingRepository.confirm` reads `customer.autoConfirmEligible`
- [ ] When `true` AND status PENDING_REVIEW → auto-transition to CONFIRMED in same tx as reservation create
- [ ] When `false` → require admin explicit click (existing behavior)
- [ ] Return value annotates `{ autoConfirmed: boolean }` for UI
- [ ] Tests: trust-gated path / untrusted path / idempotent replay

### 1.5 1.5-B-2-route (R1 — response shape change)

- [ ] `POST /api/sale/bookings` (confirm body) returns `{ autoConfirmed }`
- [ ] Existing route tests updated for new envelope field
- [ ] Backward-compatible: old clients ignore extra field

### 1.6 1.5-B-2-ui (R1 — Confirm dialog change)

- [ ] `ConfirmBookingDialog` shows "Auto-confirm" preview pill on eligible customers
- [ ] Tests: dialog branches correctly

### 1.7 1.5-B-2-tests (R2)

Locked invariants from `tests/unit/lib/sale/state-machine-invariants.test.ts` MUST still pass. Add:

- [ ] Auto-confirm path creates exactly 1 reservation
- [ ] Auto-confirm path with `autoConfirmEligible=false` falls back to manual path
- [ ] Idempotent auto-confirm replay returns `{ idempotent: true }`

### 1.8 B-series exit criteria

- [ ] Vercel deploy stable ≥ 1 week with no auto-confirm reservation drift
- [ ] Boss reports zero false-positives on auto-confirm
- [ ] Production smoke 17/17 throughout
- [ ] Full vitest stays green
- **Hold all C-series until this gate clears.**

---

## 2. C-series — Auto-order-append

### 2.1 1.5-C-1-schema (R1 migration + data backfill — most-risky)

**Pre-flight:**
- [ ] B-series 1-week stability confirmed
- [ ] Boss verdict on Q4 (RESERVED-only append-eligible)
- [ ] DISSENT 4-bullet covering backfill blast radius

**Migration:**
```sql
ALTER TABLE "Order" ADD COLUMN "saleDate" DATE;
CREATE INDEX "Order_shopId_customerId_saleDate_status_idx" ON "Order"("shopId", "customerId", "saleDate", "status");
```

**Backfill (separate PR, Boss-run):**
```sql
-- Derive saleDate from earliest converted booking per Order
UPDATE "Order" o
SET "saleDate" = (
  SELECT MIN(bp."saleDate")::date
  FROM "Booking" b
  JOIN "BroadcastProduct" bp ON bp.id = b."broadcastProductId"
  WHERE b."convertedOrderId" = o.id AND bp."saleDate" IS NOT NULL
)
WHERE "saleDate" IS NULL;
```

**Backfill verification:**
- [ ] Count rows where saleDate IS NULL post-backfill (target: 0 for orders with converted bookings)
- [ ] Manual sanity-check on 5 random Orders that backfill matches actual booking timestamps

**Rollback:**
```sql
DROP INDEX "Order_shopId_customerId_saleDate_status_idx";
ALTER TABLE "Order" DROP COLUMN "saleDate";
```

### 2.2 1.5-C-2-repo (R1 — upsert path)

- [ ] `orderRepository.upsertFromBooking(shopId, customerId, saleDate)` new fn
- [ ] When RESERVED Order exists for (shopId, customerId, saleDate) → append OrderItem
- [ ] When no eligible Order → create new
- [ ] `idempotencyKey` per OrderItem batch (NOT per Order)
- [ ] Append path snapshots unitPrice from booking, NOT from latest variant price
- [ ] Tests: append happy-path / new-Order path / status-filter (CONFIRMED Order excluded)

### 2.3 1.5-C-3-route (R1 — semantic change)

- [ ] `POST /api/sale/orders/from-bookings` calls `upsertFromBooking`
- [ ] Response annotates `{ appended: boolean, orderId }`
- [ ] Existing route tests updated

### 2.4 1.5-C-3-ui (R1 — Order detail badge)

- [ ] Order detail shows "appended" badge / audit log entry for items added post-create

### 2.5 1.5-C-3-tests (R2)

State-machine invariants MUST still pass. Add:

- [ ] Same-saleDate same-customer second batch appends to RESERVED Order
- [ ] Different-saleDate creates new Order (saleDate uniqueness)
- [ ] CONFIRMED Order does NOT receive appends (Q4 RESERVED-only)
- [ ] Stock reservations still released atomically per booking convertToOrder

### 2.6 C-series exit criteria

- [ ] Vercel deploy stable ≥ 1 week
- [ ] No Order with multiple saleDate values across its items
- [ ] Boss reports no audit confusion on appended orders
- [ ] Production smoke green

---

## 3. D-series — Multi-code Manual Create

### 3.1 1.5-D-1-impl (R1)

**Pre-flight:**
- [ ] Boss verdict on Q5 (cap 20) + Q6 (all-or-nothing)
- [ ] Independent of B-series and C-series

**Changes:**
- [ ] `bookingRepository.createManualBatch(input)` new fn
- [ ] Body schema accepts `bookings: [{ broadcastProductId, quantity, unitPrice }]` array up to cap 20
- [ ] Single `$transaction` — any failure rolls back all
- [ ] `POST /api/sale/bookings` `action: 'manual-create-batch'` dispatch
- [ ] UI: `ManualCreateBookingDialog` adds "Multi-code" toggle

**Tests:**
- [ ] Cap enforced at 21
- [ ] All-or-nothing rollback on any single failure
- [ ] Mixed-status outcome impossible (transactional guarantee)
- [ ] Stock reservations created atomically for confirmed multi-batch (if combined with B-series)

### 3.2 D-series exit criteria

- [ ] Vercel deploy stable
- [ ] No reservation leak observed under partial-failure scenarios

---

## 4. Interactions with V Rich slots

When V Rich board wires (Tier 3.10-B-WIRE, separate from Phase 1.5):

| Phase 1.5 feature | V Rich impact |
|---|---|
| Auto-confirm (B-series) | Slot fills immediately on PENDING→CONFIRMED auto-transition |
| Auto-order-append (C-series) | Slot "convert" action targets existing Order; no V Rich state change |
| Multi-code batch (D-series) | N slots fill atomically in same UI tick |

Mapping in `slotRowDisplayState` helper requires no change — all three features compose with current state mapping.

---

## 5. Interactions with FB parser (Tier 4.1+)

Phase 1.5 is FB-agnostic. When FB parser lands (Tier 4.1+), it will:

- Read `customer.autoConfirmEligible` to decide if a parsed booking auto-confirms
- Append to existing RESERVED Order if customer + saleDate match
- Use multi-code batch path for "พี่ขอ CM1, CM3, CM5" patterns

Phase 1.5 must NOT depend on FB parser landing — they are independent tracks.

---

## 6. Interactions with summary counts

Phase 1.5 changes affect summary counts:

| Field | B-series effect | C-series effect | D-series effect |
|---|---|---|---|
| `totalBookings` | unchanged | unchanged | grows by batch size on single submit |
| `totalOrders` | unchanged | LOWER (consolidation) | unchanged |
| `totalOrderTouches` | unchanged | grows (multi-touch Order) | unchanged |
| Per-status `confirmed` | grows faster (auto) | unchanged | grows by batch size |

UI must continue to show `totalOrderTouches` chip only when delta exists (existing `hasOrderTouchDelta` helper handles this).

---

## 7. What Boss must approve explicitly

Order of decision authority (in implementation order):

1. **Q1 + Q3 verdict** → unlocks 1.5-B-1-schema
2. After schema deploys: **Boss explicit `IMPLEMENT 1.5-B-1 NOW` per atomic PR** (no bulk approval)
3. After B-1 stable: **Q2 verdict** → unlocks 1.5-B-2-*
4. After B-series 1 week stable: **Q4 verdict** → unlocks 1.5-C-1-schema
5. After C-1 schema deploys: **Backfill PR (separate, Boss-run)**
6. After backfill verified: **C-2 + C-3 PRs**
7. After C-series 1 week stable: **Q5 + Q6 verdict** → unlocks D-1
8. **Q7 verdict** (PR ordering) — implicit via above sequence (B-first)

---

## 8. Production safety checklist

For EVERY Phase 1.5 PR:

- [ ] DISSENT 4-bullet in PR body
- [ ] tsc EXIT=0
- [ ] lint 0 errors
- [ ] Targeted vitest green
- [ ] Full vitest green (no regression)
- [ ] State-machine invariants (53 tests) STILL PASS
- [ ] Existing 1646+ tests STILL PASS
- [ ] Production smoke 17/17 after Vercel deploy
- [ ] Boss UI smoke if UI surface changed
- [ ] No env / flag flip by Claude
- [ ] No production POST by Claude
- [ ] No outbound / Facebook runtime change
- [ ] pak-ta-kra untouched

---

## 9. Stop conditions

Halt Phase 1.5 implementation if any of:

1. Schema migration produces unexpected diff
2. Backfill row count mismatch
3. Stock reservation race (negative availableQty observed)
4. Auth boundary breach
5. Existing test regression
6. tsc/lint failure
7. Migration not idempotent
8. Customer PII exposure
9. `idempotencyKey` collision
10. State-machine invariant test breaks unintentionally

On any stop: revert PR, file `docs/superpowers/<date>-phase-1-5-stop-<topic>.md`, await Boss verdict.

---

## 10. Hard no-go (apply to ALL Phase 1.5 PRs)

- ❌ NO Phase 1.5 runtime PR opens without Boss `IMPLEMENT 1.5-X-Y NOW`
- ❌ NO migration generated on local branch without verdict
- ❌ NO `prisma migrate deploy` against production by Claude
- ❌ NO Customer row mutation in production by Claude
- ❌ NO Order row mutation in production by Claude
- ❌ NO env or flag change by Claude
- ❌ pak-ta-kra untouched

---

## 11. Cross-references

- `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` (Block 5, the verdicts)
- `docs/superpowers/2026-05-23-phase-1-5-decision-matrix.md` (Block 2, the questions)
- `docs/superpowers/2026-05-23-stock-booking-state-machine-matrix.md` (state machine invariants)
- `tests/unit/lib/sale/state-machine-invariants.test.ts` (53 lockdown tests)
- `prisma/schema.prisma` (Customer line 239 / Order line 292 / Booking line 947 / StockReservation line 219)

---

## 12. Status

- Checklist filed. No code changes.
- B-series: blocked by Q1/Q3 verdict
- C-series: blocked by Q4 verdict + B-series stability
- D-series: blocked by Q5/Q6 verdict
- All implementation paths frozen behind Boss explicit `IMPLEMENT 1.5-X-Y NOW`.
