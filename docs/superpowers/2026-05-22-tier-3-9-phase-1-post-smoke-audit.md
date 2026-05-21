# Tier 3.9 Phase 1 Post-Smoke Audit + Phase 2 Replan

**Filed:** 2026-05-22
**Status:** Audit only — no code changes
**Master HEAD:** `1beb99f` (PR #49 deployed)
**Source:** Boss UI smoke 2026-05-22 (post Phase 1 deploy)

Phase 1 (PR #49) closed 7 of 10 Phase 1 acceptance items. UI smoke uncovered **7 new issues** + **2 workflow redesign requests** that must be addressed before Phase 2 AddFromStock work.

This doc audits root causes, classifies severity, and proposes a revised PR sequence.

---

## 1. UI smoke result summary

| Item | Status | Notes |
|---|---|---|
| 1 — Date picker | PASS | Date switch refetches both panels |
| 2 — Same code today/tomorrow | PASS | Quick-create reuse-Product (Fix-1) works |
| 3 — Manual book quick-created | PASS | But 1 code per booking limit reaffirmed (B6) |
| 4 — Bookings filter by saleDate | PASS | |
| 5 — Out-of-stock blocked | PASS | Server returns INSUFFICIENT_STOCK 409 |
| 6 — PENDING cancel visible | PASS | |
| 7 — Cancel PENDING works | PARTIAL — see C1 | Status changes to CANCELLED but row stays in active list (UX clutter) |
| 8 — Confirm still works | PASS — see C2 | Boss requests auto-confirm workflow redesign |
| 9 — Create Order V2 | PASS — see C3 + D2 | V2 path works but Boss wants auto-append behavior |

**Verdict:** Phase 1 stabilization functionally green. **Not blocker-clean for Phase 2.** New issues block AddFromStock work because they reveal workflow gaps.

---

## 2. New issues catalog

### 2.1 C1 — Cancelled bookings clutter active list (HIGH)

**Source:** Step 7 screenshot 1

**Symptom:** After Boss cancels a PENDING booking, the row stays in the "รายการจอง / Bookings" panel with status badge `CANCELLED` (strikethrough). Multiple cancellations accumulate.

**Root cause:** `SaleBookingQueuePlaceholder` renders ALL bookings returned by `GET /api/sale/bookings`. No status filter on UI side. Route doesn't filter by default either.

**Fix path:**
- UI hides terminal-status rows by default (CANCELLED / EXPIRED / CONVERTED_TO_ORDER)
- Add toggle "แสดงรายการที่ยกเลิกแล้ว" if Boss wants to review history
- Or route adds `excludeStatus=CANCELLED,EXPIRED` param

**Severity:** HIGH (UX clutter accumulates over time, harder to find active rows)

### 2.2 C2 — Auto-confirm workflow redesign (HIGH)

**Source:** Step 8 Boss directive

**Boss's expected workflow:**
- Default booking → **Auto-CONFIRMED immediately** (no PENDING intermediate)
- Stock locked for customer instantly + outbound confirmation sent (future)
- Bookings flow into existing same-day same-customer Order auto (C3)
- **Exception:** customer flagged as risky (frequent-cancel / non-payer / blacklist) → status stays PENDING + admin sees risk note

**Current model:**
- Booking → PENDING_REVIEW (no reservation)
- Admin clicks Confirm → CONFIRMED (atomic reserve)
- Two-step always

**Implication:**
- Need `Customer.riskFlags` field or computed flag (cancelRate, paymentRate)
- Need `auto_confirm_threshold` policy
- Manual Create dialog default → CONFIRMED for low-risk customers
- PENDING reserved for risky path only

**Risk:** Conflicts with Boss's earlier T5 Stock decrement model decision (currently model X = reserve at PENDING). Auto-confirm changes Phase 1D soft guard to atomic-reserve-at-create. Need re-decide.

**Severity:** HIGH (workflow redesign, not a bug). Needs dissent-4-bullet + ChatGPT review.

### 2.3 C3 — Auto-Create-Order + auto-append same-day same-customer (HIGH)

**Source:** Step 9 Boss directive

**Boss's expected workflow:**
- First CONFIRMED booking for customer X on saleDate Y → **auto-create Order #ORD-NNNNNN**
- Subsequent CONFIRMED bookings for customer X on saleDate Y → **append to same Order** (not new Order)
- Admin does NOT click checkbox + "สร้างออเดอร์" manually
- Single Order per (customer, saleDate)

**Current model:**
- Bookings stay independent until admin selects subset + clicks Create Order
- Idempotency key derived from `bookingIds` set hash → different subset = different Order
- Each Create Order call = new Order

**Implication on schema:**
- May need `Order.saleDate` (derived from BP.saleDate) for fast lookup
- Or query `Order WHERE customerId=X AND createdAt::date=Y`
- Atomic UPSERT pattern: on Booking confirm, find-or-create same-day Order, append OrderItem
- Conflict with `Order.idempotencyKey` (NOT NULL @unique). Need rethink

**Stop condition triggered:** This requires schema/order-conversion-semantic change. Per work order rule §13:
> "Do not touch payment/shipping runtime unless separately approved."

Order auto-append touches Order creation flow, adjacent to payment. Stop + report.

**Severity:** HIGH (workflow redesign + schema/repo refactor)

### 2.4 C4 — AddFromStock route not date-aware (CRITICAL)

**Source:** Boss screenshot 3 "Product code 'CCTV' already exists for this sale date in this shop"

**Symptom:** Boss switched picker to date X (where CCTV doesn't exist), tried `เพิ่มสินค้าจาก Stock` → search returns CCTV from inventory → click → server rejects with "already exists for this sale date" because AddFromStock dialog POSTs to `/api/sale/broadcast-products` WITHOUT `saleDate` field → server defaults to today (`2026-05-21`) where CCTV already exists.

**Root cause:** `AddFromStockDialog.tsx` line 181-186 builds POST body:
```ts
const body: Record<string, unknown> = {
  variantId: selectedVariant.variantId,
  displayCode,
};
if (liveSessionId !== null) body.liveSessionId = liveSessionId;
if (priceOverride.trim().length > 0) body.priceOverride = priceOverride.trim();
```
**No `saleDate` field.** Tier 3.9-B added saleDate to quick-create route but AddFromStock was left out.

**Fix path (was Phase 2 PR 3.9-C scope; now CRITICAL prerequisite):**
- Pass `selectedSaleDate` from SaleProductGridPlaceholder → AddFromStockDialog as prop
- POST body includes `saleDate: <selectedSaleDate>`
- Server creates BP with explicit saleDate (instead of defaulting to today)

**Severity:** CRITICAL — Boss's UI smoke proves AddFromStock cannot add products to non-today dates.

### 2.5 C5 — AddFromStock forces displayCode retype (MEDIUM)

**Source:** Boss screenshot 2 "ยังบังคับให้กรอก รหัสสินค้า / Display Code"

**Symptom:** Boss selects Khunpan/CCTV from search. Stock product has SKU `CCTV`. AddFromStock dialog still requires manual typing in `รหัสสินค้า / Display Code` field. Can't submit without it.

**Root cause:** Dialog `displayCode` state defaults to empty string; submit guard `if (displayCode.length === 0) throw "ใส่รหัสสินค้า"`. Doesn't auto-populate from variant SKU.

**Fix path (Phase 2 PR 3.9-C scope — already planned):**
- On variant select → auto-fill `displayCode` from `variant.saleCode ?? variant.sku`
- Remove "ใส่รหัสสินค้า" required guard if auto-default succeeds
- Boss can still override if wants different displayCode

Boss's stronger demand: **remove field entirely**, auto-derive always. Recommendation: remove field for default path; add Advanced toggle for override (matches `/inventory/new` advanced pattern).

**Severity:** MEDIUM (workflow friction, not data integrity)

### 2.6 D1 — Order detail page missing columns + order (MEDIUM)

**Source:** Boss screenshot 5 — Order #ORD-000001 page

**Symptom:** Order item table shows `[Product, SKU, ราคาต่อหน่วย, จำนวน, ยอดรวม]` only. Boss wants:
1. No. (1, 2, 3 ...)
2. รหัสสต๊อก (stockCode)
3. รหัสขาย (saleCode)
4. Product / ชื่อสินค้า
5. ราคาต่อหน่วย
6. จำนวน
7. ยอดรวม
8. Summary row at bottom: total qty + total price

**Root cause:** `src/app/(app)/orders/[id]/page.tsx` legacy table layout. Doesn't fetch stockCode/saleCode joined fields. Need:
- Route `GET /api/orders/[id]` to expose `product.stockCode`, `product.saleCode` in nested item shape
- Or join via Prisma in page server component
- UI add columns + index + summary row

**Fix path:** Single small PR. Touches `src/app/(app)/orders/[id]/page.tsx` + `src/app/api/orders/[id]/route.ts`. R2 (cheap).

**Severity:** MEDIUM (UX clarity)

### 2.7 D2 — Order shows only 1 item when multiple bookings selected (CRITICAL or NOT-A-BUG)

**Source:** Boss screenshot 5 — KAI x1 displayed; expected multiple items

**Analysis after deep audit:**

Pre-merge `groupBookingsForOrderItems` (booking-rules.ts:461) groups bookings by `productId|variantId|unitPrice`. **Same product/variant/price → 1 OrderItem with summed quantity.**

Boss screenshot shows `KAI 1 RM1`. If Boss selected 4 KAI bookings each with qty=1 and same unitPrice, expected result = 1 OrderItem with qty=4. Not 4 separate rows.

If Boss saw qty=1 instead of qty=4 in the OrderItem, **then data was lost**. Otherwise **expected behavior**.

**Need verify with Boss:** in Order #ORD-000001, qty column = 1 or 4? Screenshot resolution unclear — looks like 1.

**Possible scenarios:**
- A: Only 1 booking was CONFIRMED + selected → OrderItem qty=1. Working as designed.
- B: Multiple CONFIRMED selected but only 1 included → bug (must repro)
- C: Some bookings were CANCELLED before Order creation but UI showed them selected → repo filters via `selectConfirmedBookings`, CANCELLED dropped → OrderItem qty < expected
- D: bookingIds-only V2 path has bug

**Test plan to disambiguate:**
- Look at server logs for activity entry `CREATED_FROM_SALE_BOOKINGS` → metadata field shows bookingIds count
- Or: Boss re-test step 9 with 2 confirmed same-product bookings + checks final Order item qty

**Severity:** **CRITICAL if bug confirmed, NOT-A-BUG if Boss selected only 1 CONFIRMED**. Need Boss clarify.

### 2.8 B6 reiterated — Manual booking 1-code-per-booking limit (HIGH backlog)

**Source:** Step 3 Boss reiterated "ยังเลือกได้แค่ 1 รหัสสินค้าต่อ booking"

**Status:** Tier 3.9-B-Fix-5 was deferred from Phase 1. Still in backlog.

**Fix path:** Multi-line cart dialog → backend `$transaction` creates N Bookings.

**Severity:** HIGH (workflow gap, but workaround = create N bookings one-by-one)

---

## 3. Issue impact matrix

| Issue | Severity | Schema change | Phase reorder needed? |
|---|---|---|---|
| C1 cancelled clutter | HIGH | No | Add to Phase 2 as Fix-7 |
| C2 auto-confirm | HIGH | Maybe (Customer.riskFlags) | Defer to Phase 1.5 redesign — needs dissent + Boss verdict |
| C3 auto-create-order | HIGH | Maybe (Order.saleDate) | Defer to Phase 1.5 — stop condition: Order semantics change |
| C4 AddFromStock saleDate | **CRITICAL** | No | **Promote to Phase 2 first PR** |
| C5 AddFromStock auto-displayCode | MEDIUM | No | Phase 2 (already planned) |
| D1 Order detail columns | MEDIUM | No (joins via existing FK) | Phase 4 follow-up |
| D2 Order item loss | CRITICAL or NA | No | Verify with Boss first |
| B6 multi-code booking | HIGH | No | Phase 1F revisit |

---

## 4. Revised PR sequence

Phase 1 (PR #49) merged. Original Phase 2 = AddFromStock multi-select.

**New Phase 1.5 (before original Phase 2):** workflow redesigns C1/C2/C3 require Boss + ChatGPT decisions on workflow semantics that change Order/Booking/Customer model behavior. Cannot ship without verdict.

### 4.1 Proposed sequence

| PR | Title | Scope | Risk | Boss verdict needed |
|---|---|---|---|---|
| **3.9-Audit-2** | docs(sale): Phase 1 post-smoke audit | This doc | R2 | — |
| **3.9-Fix-C1** | fix(sale): hide terminal bookings from active list | UI filter + optional toggle | R2 | minor |
| **3.9-Fix-D1** | feat(orders): order detail columns + summary | Route + page | R2 | minor |
| **3.9-Fix-C4** | fix(sale): AddFromStock writes selected saleDate | Dialog prop + POST body | R2 | minor |
| **3.9-C** | feat(sale): AddFromStock multi-select + defaults | Original Phase 2 scope | R1 | minor |
| **3.9-D** | feat(inventory): /inventory/new shared quick-create | Original Phase 3 | R1 | minor |
| **3.9-E** | docs + verifier + handoff | wrap-up | R2 | — |
| **Phase 1.5-A** | docs(sale): auto-confirm + auto-order-append design | C2 + C3 design audit | R2 | **MAJOR — Boss + ChatGPT** |
| **Phase 1.5-B** | feat(sale): auto-confirm low-risk customers | C2 impl after design accepted | R1 (schema if riskFlags added) | post 1.5-A |
| **Phase 1.5-C** | feat(sale): auto-create-order same-day same-customer | C3 impl after design accepted | R1 (Order semantics change) | post 1.5-A |
| **3.9-Fix-B6** | feat(sale): multi-code Manual Booking | $transaction batch | R1 | minor |
| **3.10-A** | docs(sale): V Rich pill+board design audit | Existing Tier 3.10 PR-A | R2 | held on 3.9 stable |

### 4.2 Stop conditions per PR

| PR | Stop condition |
|---|---|
| C1 / D1 / C4 / C / D / E | Standard tests + smoke gates |
| Phase 1.5-A | Cannot proceed to 1.5-B/C without Boss + ChatGPT verdict on customer risk model + Order semantics |
| 1.5-B | Stop if Customer schema needs migration; report options |
| 1.5-C | Stop if Order.saleDate or new schema field needed; report options |
| B6 | Stop if multi-line transaction logic requires Booking schema change |

---

## 5. Workflow redesign — C2 + C3 design questions

These need Boss + ChatGPT verdict BEFORE implementation. Documenting current open questions:

### 5.1 Auto-confirm (C2)

| Q | Recommendation |
|---|---|
| Q-C2-1 What defines "risky customer"? | Compute from Customer.cancelRate (cancelled / total bookings ≥ N%) + non-payment rate + manual blacklist flag |
| Q-C2-2 Where to store risk signal? | New `Customer.autoConfirmEligible` boolean computed on-demand OR new `Customer.riskFlags` JSONB array |
| Q-C2-3 Default behavior for new customer (no history)? | Auto-confirm (optimistic) or PENDING (conservative)? Recommend optimistic + admin can revert via blacklist if issues |
| Q-C2-4 Override per booking? | Add `autoConfirm: false` body param so admin can force PENDING for specific suspicious booking |
| Q-C2-5 Schema migration? | Boolean field = R1 simple. JSONB array = more flexible but R1 with backfill needed. Recommend boolean for v1 |
| Q-C2-6 What happens to existing PENDING bookings during cutover? | Manual sweep + auto-confirm script (R1 ops task) or leave as-is + auto-confirm only applies to new bookings |
| Q-C2-7 Outbound message at auto-confirm? | Out of scope this phase per `HARD NO outbound`. Track for Phase 8. |

### 5.2 Auto-create-order (C3)

| Q | Recommendation |
|---|---|
| Q-C3-1 Trigger event? | Booking transition to CONFIRMED (auto or manual). Find-or-create Order for (customer, saleDate). |
| Q-C3-2 Idempotency? | Order.idempotencyKey = `auto-${shopId}-${customerId}-${saleDate}`. Each customer × saleDate = unique key. |
| Q-C3-3 Append how? | INSERT OrderItem if (productId, variantId, unitPrice) doesn't exist; UPDATE qty if exists |
| Q-C3-4 What if Order is in non-RESERVED status (already shipped/paid)? | Reject append; new Order required. |
| Q-C3-5 Order.saleDate column needed? | Yes — denormalized for fast lookup. R1 migration. Or use `Order.reservedAt::date AT TIME ZONE shop.timezone` — no migration but slower query. Recommend column. |
| Q-C3-6 What happens to current bookings without auto-create? | They remain ad-hoc Order. Auto-create kicks in only for new CONFIRMED bookings post-feature |
| Q-C3-7 Outbound message update on append? | Out of scope per HARD NO outbound. |

### 5.3 Combined impact on Phase 1.5

**C2 + C3 are coupled.** Auto-confirm triggers auto-create-order. Single cohesive redesign.

**Migration risk:**
- Add `Order.saleDate DATE NOT NULL` — needs backfill from `reservedAt` or first-booking BP.saleDate
- Add `Customer.autoConfirmEligible BOOLEAN DEFAULT true` — no backfill
- Add Order new idempotency key format → migration must handle existing legacy keys (keep both schemes)

**Estimated PR sequence for 1.5:**
1. **1.5-A docs** — design audit
2. **1.5-B-1 migration** — add columns
3. **1.5-B-2 repo** — risk flag computation + auto-confirm
4. **1.5-C-1 repo** — auto-create-order
5. **1.5-C-2 UI** — hide manual Create Order button, surface only for risky/exception path

---

## 6. Production stability assessment

Phase 1 (PR #49) functionally green. Production stable for:
- Same code across dates (C4 still buggy but Boss workaround = use quick-create)
- Manual booking quick-created code
- Bookings panel saleDate filter
- Out-of-stock guard
- PENDING cancel
- Create Order V2

Production NOT stable for:
- AddFromStock with non-today saleDate (C4 critical)
- Cancelled bookings cluttering active panel (C1)
- Order detail UX (D1)
- Auto-confirm/auto-order workflow (C2 + C3 by design)

---

## 7. Recommended next action

**STOP before Phase 2 (AddFromStock multi-select)** per work order stop condition:
> "If UI smoke reveals stock/reservation ambiguity, stop before Phase 2."

Boss reported workflow redesign ambiguity (C2 + C3) + critical AddFromStock saleDate bug (C4) + Order item loss question (D2).

**Recommendation:**
1. Boss confirms D2 reading (1 vs 4 items in Order)
2. Boss + ChatGPT decide C2 + C3 workflow redesign verdict
3. Sequence agreed:
   - Quick wins (R2): C1 + D1 + C4
   - Phase 2 (AddFromStock multi-select C5 + original scope)
   - Phase 3 (/inventory/new)
   - Phase 1.5 (auto-confirm + auto-order — gated on Boss/ChatGPT verdict)
   - Phase 4 verifier + handoff
   - Phase 5 Tier 3.10 V Rich board

---

## 8. Production safety honored

- Pak-ta-kra untouched
- No production mutation by Claude
- No env / flag flip
- No schema migration
- No outbound messaging
- No Messenger/WA/Telegram runtime
- Boss-owned `test note/` + `sale tab example/` kept untracked
- No secrets exposed
- Master HEAD: `1beb99f` (PR #49 deployed)

---

## 9. Open Boss/ChatGPT decisions

| ID | Question |
|---|---|
| D-D2 | Order #ORD-000001 actual item count: 1 (working as designed) or N (bug) |
| D-C2 | Auto-confirm trigger model: optimistic-by-default vs conservative-PENDING-by-default |
| D-C2 | Risk signal: cancelRate threshold + new column or JSONB |
| D-C3 | Order grouping: (customer, saleDate) unique → migration or query-based |
| D-C3 | Existing Order.idempotencyKey compatibility |
| D-Phase | Order of execution: quick wins first (C1+D1+C4) then redesign vs redesign first |

---

## 10. Cross-references

- `docs/superpowers/2026-05-21-tier-3-9-b-post-deploy-bug-audit.md` (PR #48)
- `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` (PR #46)
- `docs/superpowers/2026-05-21-tier-3-9-b-migration-safety-audit.md` (PR #47)
- PR #49 — Phase 1 batch
- `src/server/repositories/booking.repository.ts` — convertToOrder + groupBookingsForOrderItems
- `src/components/sale/AddFromStockDialog.tsx` — C4 + C5 fix targets
- `src/components/sale/SaleBookingQueuePlaceholder.tsx` — C1 fix target
- `src/app/(app)/orders/[id]/page.tsx` — D1 fix target
