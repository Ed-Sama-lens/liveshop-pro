# Phase 1.5 Design — Auto-Confirm + Auto-Order-Append + Multi-Code Booking

**Filed:** 2026-05-22
**Status:** Design only — no code change, no schema migration, no runtime behavior change
**Master HEAD baseline:** `bef98aa` (PR #50 merged)
**Scope:** liveshop-pro
**Audience:** Boss + ChatGPT

This doc documents three workflow redesigns Boss requested in the
2026-05-22 UI smoke. Each redesign requires Boss + ChatGPT decision
before any implementation PR opens. Phase 1.5 sits BETWEEN current
Tier 3.9 follow-up work and Tier 3.10 V Rich board.

---

## 1. C2 — Auto-Confirm for Normal/Trusted Customers

### 1.1 Boss's expected workflow

Verbatim from Boss UI smoke (paraphrased):

> "เมื่อ booking แล้ว ไม่ต้องขึ้นสถานะ PENDING เพื่อรอให้ทางฉันกด
> confirm. หากฉันหรือ admin เพิ่ม booking ให้ทำการ Confirm อัตโนมัติทันที
> เพื่อล็อครายการสินค้าให้กับลูกค้าคนนั้นและปรับจำนวนใน stock ทันที
> ไม่ต้อง PENDING แล้ว"
>
> "ยกเว้นกรณีเป็นลูกค้าที่มี สถานะ cancel สินค้าบ่อย จะไม่ขึ้น Confirmed
> อัตโนมัติ แต่ booking จะขึ้นเป็น PENDING พร้อม note แจ้งเตือน admin ว่า
> ผู้ใช้นี้มี การยกเลิกสินค้าบ่อย, ไม่โอนชำระ, black list เป็นต้น"

Translation:
- Default booking → **Auto-CONFIRMED immediately** (no PENDING step)
- Stock locked instantly for the customer + outbound confirmation message can flow (Phase 8 outbound, deferred)
- **Exception:** risky customers stay PENDING + risk note shown to admin

### 1.2 Current model (post-PR #49)

```
Manual Booking dialog
  → POST /api/sale/bookings { status: 'PENDING_REVIEW' }
  → BookingRow status=PENDING_REVIEW, no StockReservation, no reservedQty change
  → Admin clicks Confirm
  → POST /api/sale/bookings/[id]/confirm
  → atomic UPDATE reservedQty += qty, create StockReservation, status=CONFIRMED
```

Stock guard (PR #49 soft guard) blocks PENDING create when `available < qty` but doesn't reserve until Confirm.

### 1.3 Target model

```
Manual Booking dialog
  → POST /api/sale/bookings { status: 'AUTO' (server decides) }
  → server reads Customer.autoConfirmEligible (or computed risk signal)
    A. eligible: status=CONFIRMED, reservedQty += qty, StockReservation
       created in single transaction
    B. ineligible: status=PENDING_REVIEW, risk note attached, admin reviews
  → response includes resolved status + reason
```

### 1.4 Open design questions (Boss + ChatGPT decisions)

| # | Question | Recommendation | Risk |
|---|---|---|---|
| **Q-C2-1** | What signals define "risky"? | Phase A: explicit boolean Customer.autoConfirmEligible (default true). Phase B: computed from cancelRate ≥ 30% / unpaidOrders ≥ 2 / blacklist | LOW (additive) |
| **Q-C2-2** | Where to store risk flag? | Phase A: new boolean column. Phase B: JSONB `Customer.riskFlags` if scoring needed | LOW |
| **Q-C2-3** | Default behavior for new customer (no history)? | Optimistic: auto-confirm. Admin can flip via Customer detail page | MEDIUM |
| **Q-C2-4** | Override per-booking? | Yes — Manual Create dialog has "force PENDING for review" checkbox; admin uses for suspicious unknown customer | LOW |
| **Q-C2-5** | Schema migration needed? | YES — `Customer.autoConfirmEligible BOOLEAN DEFAULT true`. R1. No backfill (default = true for all existing) | MEDIUM |
| **Q-C2-6** | Existing PENDING bookings during cutover? | Manual sweep optional; future bookings get auto-confirm; old PENDINGs stay PENDING | LOW |
| **Q-C2-7** | Outbound confirmation? | Phase 8 deferred per HARD NO. Auto-confirm step does NOT send messages this phase | NONE |
| **Q-C2-8** | When auto-confirm fails (e.g. OOS)? | Fall back to PENDING + show error toast; do NOT silently fail | LOW |
| **Q-C2-9** | UI feedback? | Manual Create dialog shows "Customer eligible → auto-CONFIRMED" preview before submit | LOW |
| **Q-C2-10** | Audit log shape? | New action `BOOKING_AUTO_CONFIRMED` with `{ customerId, riskSignal, eligible }` metadata | LOW |

### 1.5 Implementation sequence (Phase 1.5-B)

If Boss + ChatGPT approve:

1. **1.5-B-1 migration** — add `Customer.autoConfirmEligible BOOLEAN DEFAULT true`. No backfill.
2. **1.5-B-2 repo** — `bookingRepository.createManual` reads customer.autoConfirmEligible; when true + ALLOW_NON_LIVE_BOOKING + stock available → atomic `_runConfirmInTx` in same transaction; when false → existing PENDING path
3. **1.5-B-3 UI** — Manual Create dialog adds "Customer risk preview" + override checkbox
4. **1.5-B-4 admin UI** — Customer detail page toggle for autoConfirmEligible (defer to later if too big)

### 1.6 Stop conditions

- Schema migration risk → require dissent-4-bullet
- Existing CONFIRMED→CANCEL flow must not break
- Confirm idempotency must remain (Confirm against CONFIRMED = no-op)
- Cancel must release reservation regardless of auto-confirm path
- Stock atomicity preserved via existing `$executeRaw` UPDATE pattern

---

## 2. C3 — Auto-Create-Order + Append Same-Day Same-Customer

### 2.1 Boss's expected workflow

Verbatim:

> "ระบบควรจะ create order ให้อัตโนมัติทันทีหลังจาก booking ของลูกค้าคนนั้นๆ
> CONFIRMED ชิ้นแรกแล้วเรียบร้อย และหากมี booking เพิ่มเติมในวันที่ขาย
> เดียวกัน ให้เอา booking นี้ส่งเข้าไปรวมกับ Order Number/ID เดิมของ
> ลูกค้าคนนั้นในวันที่ขาย เดียวกันอัตโนมัติ"

Translation:
- First CONFIRMED booking for `(customer, saleDate)` → auto-create Order
- Subsequent CONFIRMED bookings for same `(customer, saleDate)` → **append OrderItem to existing Order** (not create new)
- One Order per `(customer, saleDate)` natural unit
- Update message can flow to customer (Phase 8 outbound, deferred)

### 2.2 Current model

```
Admin selects N CONFIRMED bookings → clicks "สร้างออเดอร์"
  → POST /api/sale/orders/from-bookings { bookingIds }
  → idempotencyKey computed from sorted bookingIds hash
  → new Order created with N OrderItems
  → Bookings → CONVERTED_TO_ORDER
  → StockReservation.orderId set
```

Different bookingId subset → different idempotencyKey → new Order. **By design** for explicit batching, but Boss wants auto-grouping.

### 2.3 Target model

Option **A — Auto-create on Confirm transition:**

```
Booking → CONFIRMED transition
  → server queries: existing Order for (shopId, customerId, saleDate)
    in RESERVED status?
    A. yes → INSERT OrderItem (or UPDATE qty if (productId, variantId, unitPrice) matches)
            transfer this booking's StockReservation.orderId; mark booking
            CONVERTED_TO_ORDER
    B. no → create new Order; insert one OrderItem; transfer reservation
```

Option **B — Auto-append on second CONFIRMED:**

Same as A but Order isn't created on FIRST confirm; deferred until admin clicks "Create Order" or until N=2.

Boss prefers Option **A** — Order materializes immediately on first confirm.

### 2.4 Schema implications

Need to find existing Order quickly by `(shopId, customerId, saleDate)`. Options:

| Option | Mechanism | Cost |
|---|---|---|
| **A** | Add `Order.saleDate DATE` column + index `(shopId, customerId, saleDate, status)` | R1 migration, backfill from `reservedAt::date` |
| **B** | Query `Order.reservedAt::date AT TIME ZONE shop.timezone` against indexed `(shopId, customerId, createdAt)` | No migration but slower; timezone math at query time |
| **C** | New `SaleContext` table; Order FK → SaleContext | Future-proof but heavy |

Recommend **A**. Aligns with Phase 1 saleDate pattern on BroadcastProduct.

### 2.5 Idempotency contract change

Current `convertToOrder` uses `bookingIds` hash. New auto-append uses `(shopId, customerId, saleDate)` as natural key. Conflict potential:

- Existing legacy Orders have `idempotencyKey = "sale-conv:..."` (V1) or `"v2-..."` (V2)
- New auto-append Orders use `idempotencyKey = "auto:{shop}:{customer}:{saleDate}"`
- Both schemes coexist; no migration of existing keys

### 2.6 Open design questions

| # | Question | Recommendation |
|---|---|---|
| **Q-C3-1** | Trigger on Confirm OR on Booking PENDING create (when auto-confirm fires)? | Trigger on **booking transition to CONFIRMED** (whether manual confirm or auto-confirm) |
| **Q-C3-2** | Order grouping key | `(shopId, customerId, saleDate)` where saleDate = BP.saleDate |
| **Q-C3-3** | Append how? | If `(productId, variantId, unitPrice)` exists → UPDATE qty + totalPrice. Else INSERT new OrderItem. (matches existing `groupBookingsForOrderItems`) |
| **Q-C3-4** | Order already in non-RESERVED status (already shipped/paid/cancelled)? | Reject append; new Order created with `idempotencyKey = "auto:...-N"` suffix |
| **Q-C3-5** | Order.saleDate column needed? | YES (Option A) |
| **Q-C3-6** | Existing Orders without Order.saleDate? | Backfill from `Booking.broadcastProduct.saleDate` (joined via convertedFromBookings); fallback to NULL with "Untagged" UI state |
| **Q-C3-7** | Idempotency key format | `auto:{shopId}:{customerId}:{saleDate}` (deterministic, allows re-trigger to be idempotent) |
| **Q-C3-8** | Outbound message on append? | Phase 8 deferred. HARD NO outbound this phase |
| **Q-C3-9** | UI surface | Manual Create Order button kept for batched paths + exception cases; auto-create silent in normal flow |
| **Q-C3-10** | Activity log shape | New action `ORDER_AUTO_APPENDED` or `ORDER_AUTO_CREATED` |

### 2.7 Implementation sequence (Phase 1.5-C)

1. **1.5-C-1 migration** — add `Order.saleDate DATE?` + index `(shopId, customerId, saleDate, status)`. Backfill via UPDATE join.
2. **1.5-C-2 repo** — new `orderRepository.upsertFromBooking(bookingId)` method: find-or-create Order; insert-or-update-qty OrderItem; transfer reservation
3. **1.5-C-3 wire** — `bookingRepository.confirm` calls `upsertFromBooking` after status transition (within same `$transaction`)
4. **1.5-C-4 cutover** — old `convertToOrder` route kept for manual batching path

### 2.8 Stop conditions

- If existing Order status enum can't represent partially-shipped state → stop and report
- If Order.idempotencyKey unique violates during cutover → stop and report
- If StockReservation.orderId already set during append → stop (concurrency bug; existing logic doesn't expect this)
- If atomic `$transaction` exceeds timeout for batched confirm → stop and report

### 2.9 Behavior contrast

| Scenario | Current | Target |
|---|---|---|
| Admin manually confirms 1 booking | Booking CONFIRMED. No Order. | Booking CONFIRMED + Order auto-created (1 OrderItem) |
| Admin confirms second same-day same-customer booking | Booking CONFIRMED. Still no Order. | OrderItem appended to existing Order |
| Admin clicks "Create Order" on 2 bookings selected | Creates 1 Order with 2 OrderItems | Same — but Order may already exist from previous confirm (idempotent) |
| Admin confirms booking on already-shipped Order | New Order created (different idempotencyKey) | New Order with `auto:...-2` suffix; previous Order untouched |

---

## 3. B6 — Multi-Code Manual Booking

### 3.1 Boss's expected workflow

Verbatim:

> "ระบบ 'Create Manual Booking' ให้ booking ได้แค่ 1 รหัสสินค้าต่อ 1 booking
> เท่านั้นแทนที่จะสามารถเลือกเพิ่มสินค้าได้หลายๆ ชิ้น หลายๆ code ใน 1 booking
> ได้เลยในทีเดียว"

Translation: Admin should add multiple product codes + quantities in one Manual Create action. Backend creates N Bookings (or 1 multi-line Booking — design choice).

### 3.2 Schema constraint

Current `Booking` model is `1:1 BroadcastProduct` (FK `broadcastProductId NOT NULL`). Cannot represent multi-line Booking without:
- **Option A** — Schema migration: add `BookingItem` join table; Booking 1:N BookingItem
- **Option B** — UI batches N Booking inserts in `$transaction`; logically grouped via `(customer, saleDate, createdAt floor to minute)` or new `Booking.batchId`

### 3.3 Recommendation

**Option B (no schema change).** Boss intent is UX: one Manual Create form → N bookings created atomically. Existing 1:1 schema preserved; multi-line is purely a UI/transaction concern.

Multi-code Manual Create → N rows in Bookings panel. Admin sees each line individually. Auto-create-order (C3) will group them into one Order anyway.

Optional addition: `Booking.batchId` UUID for grouping UI display ("3 รายการ created together"). R2.

### 3.4 Implementation sequence (Phase 1.5-D)

1. **1.5-D-1 backend** — new `bookingRepository.createManualBatch(items[])` method using `$transaction`. All-or-nothing.
2. **1.5-D-2 route** — `POST /api/sale/bookings/batch` body `{ customerId, items: [{broadcastProductId, quantity}, ...], idempotencyKey }`. Reuse stock guard + auto-confirm path per item.
3. **1.5-D-3 UI** — Manual Create dialog adds "+ เพิ่มสินค้าอีก" button; cart-style line builder; submit once.
4. Optional: **1.5-D-4** add `Booking.batchId` if grouping UX needed.

### 3.5 Open design questions

| # | Question | Recommendation |
|---|---|---|
| **Q-B6-1** | Per-item idempotency? | One key per batch; backend ensures all-or-nothing |
| **Q-B6-2** | Mixed status (some items auto-confirmed, some pending)? | All items in a batch share auto-confirm path (per customer risk signal). If any item fails stock, entire batch rolls back |
| **Q-B6-3** | Batch limit? | 50 per batch (matches AddFromStock batch cap) |
| **Q-B6-4** | If C3 auto-order is active, all items in batch land in same Order | Yes — they share customer + saleDate by construction |

---

## 4. Migration strategy summary

| Phase | Migration name | Adds | Backfill | R-level |
|---|---|---|---|---|
| 1.5-B-1 | `add_customer_auto_confirm_eligible` | `Customer.autoConfirmEligible BOOLEAN NOT NULL DEFAULT true` | None (default) | R1 |
| 1.5-C-1 | `add_order_sale_date` | `Order.saleDate DATE?` + index `(shopId, customerId, saleDate, status)` | UPDATE join: Order.saleDate = MIN(Booking.broadcastProduct.saleDate) WHERE convertedFromBookings | R1 |
| 1.5-D-4 | (optional) `add_booking_batch_id` | `Booking.batchId UUID?` + index `(shopId, batchId)` | None (NULL for existing) | R2 |

**Both 1.5-B-1 and 1.5-C-1 are R1 — require dissent-4-bullet + Boss + ChatGPT verdict + migration safety audit (parallel to PR #47 process).**

---

## 5. Combined Phase 1.5 PR sequence (if approved)

1. **1.5-A** ← this doc (design audit)
2. **1.5-B-1** Migration: Customer.autoConfirmEligible
3. **1.5-B-2** Repo: auto-confirm path in createManual
4. **1.5-B-3** UI: Manual Create dialog risk preview + override
5. **1.5-C-1** Migration: Order.saleDate + index + backfill
6. **1.5-C-2** Repo: orderRepository.upsertFromBooking
7. **1.5-C-3** Wire: bookingRepository.confirm calls upsertFromBooking
8. **1.5-D-1/2/3** Multi-code Manual Booking batch
9. **1.5-E** Tests + verifier + handoff

Total: 8-9 PRs over Phase 1.5.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Auto-confirm reserves stock that customer abandons | MEDIUM | Confirm has cancel path; auto-confirmed booking can be cancelled by admin if customer doesn't pay |
| Order auto-append breaks payment/shipping flow | HIGH | Phase 1.5-C requires explicit verification that adding items to RESERVED-status Order doesn't break downstream. Phase 8 outbound deferred avoids customer surprise |
| Migration backfill mis-tags Orders | MEDIUM | Boss verifies sample backfill data before merge; rollback SQL prepared (per PR #47 safety pattern) |
| Customer risk signal not granular enough | LOW | Phase A is boolean; Phase B can extend to JSONB without re-migration |
| Multi-code batch hits 50-item limit | LOW | Boss workflow rarely exceeds 10-20 per booking; cap matches AddFromStock |
| Backwards compat: existing PENDING bookings | LOW | They remain PENDING; admin manually confirms; new bookings get auto-confirm |
| Auto-create Order during high-concurrency confirm | MEDIUM | `$transaction` + Order.idempotencyKey serial uniqueness + retry logic |

---

## 7. Hard no-go honored in design phase

- Pak-ta-kra untouched
- No production mutation
- No env / flag flip
- No outbound messaging
- No Messenger / WhatsApp / Telegram runtime
- No payment/shipping behavior change in Phase 1.5-A through 1.5-D (only Order materialization timing changes)

---

## 8. Boss + ChatGPT decisions needed before any Phase 1.5 PR

| ID | Question |
|---|---|
| **D-1.5-Approve-C2** | Approve auto-confirm direction + risk signal design? |
| **D-1.5-Approve-C3** | Approve auto-order-append direction + Order.saleDate migration? |
| **D-1.5-Approve-B6** | Approve multi-code batch UI without schema change (Option B)? |
| **D-1.5-Risk-Default** | New customer default: optimistic auto-confirm OR conservative PENDING? |
| **D-1.5-Order-Append-Status** | When can Order accept append? RESERVED only? PARTIALLY_PACKED also? |
| **D-1.5-Migration-Window** | Run 1.5-B-1 + 1.5-C-1 together (single migration window) or separate? |
| **D-1.5-Outbound-Gate** | Confirm outbound stays gated; auto-confirm/auto-order are silent server-side until Phase 8 |

---

## 9. What this PR does NOT do

- Does NOT implement auto-confirm
- Does NOT implement auto-order-append
- Does NOT implement multi-code Manual Booking
- Does NOT change schema
- Does NOT change runtime behavior
- Does NOT touch pak-ta-kra
- Does NOT touch payment/shipping

---

## 10. Cross-references

- `docs/superpowers/2026-05-22-tier-3-9-phase-1-post-smoke-audit.md` — bug catalog
- `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` — date-first model basis
- `docs/superpowers/2026-05-21-tier-3-9-b-migration-safety-audit.md` — migration deploy procedure (B1 sequence pattern)
- `src/server/repositories/booking.repository.ts` — current confirm + convertToOrder
- `src/lib/sale/booking-rules.ts` — `groupBookingsForOrderItems` (basis for OrderItem append logic)
- `prisma/schema.prisma` — Customer + Order + Booking models
