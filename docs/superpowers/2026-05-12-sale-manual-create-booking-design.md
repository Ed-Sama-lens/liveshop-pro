# Sale Manual Create Booking — design doc

**Status:** DESIGN ONLY. No code in this commit. Implementation gated on Boss + ChatGPT approval.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7
**Depends on:** existing `POST /api/sale/bookings` route (Commit 2N) + `bookingRepository.createManual` runtime (Commits 2M-b/2M-c).

Goal: enable admin to manually create a booking from `/sale` UI for offline orders, phone customers, or any case where the booking didn't come through the inbox parser (which doesn't exist yet anyway). The route + repo are already shipped + tested. Only UI work remains.

---

## Existing backend surface (verified, no new work needed)

| Component | Status |
|---|---|
| `POST /api/sale/bookings` route | Shipped 2N. OWNER/MANAGER only. `withRateLimit` 60/15min. |
| Body schema `createBookingBodySchema` | `{liveSessionId, customerId, broadcastProductId, quantity (1-999), status: 'PENDING_REVIEW' | 'CONFIRMED', idempotencyKey?}` |
| Repo `bookingRepository.createManual` | Validates customer + bp + variant cross-shop, captures unitPrice, optional inline confirm via `_runConfirmInTx`, idempotent on `(shopId, idempotencyKey)` |
| Route test | 12 cases in `bookings.route.test.ts` (2T) — wait, those are GET tests. POST tests covered in 2N + verify-booking-create 13/13. |
| Docker E2E | `scripts/verify-booking-create.ts` 13/13 |
| Production smoke probe | Already in 13-probe set: unauth POST → 401 |

**Conclusion:** zero backend work. Manual Create is purely a UI modal that lets admin select customer + broadcast product + quantity + status, then POSTs to the existing route.

## UX gaps identified

### Gap 1: customer picker

Admin needs to find a customer fast. Existing `GET /api/customers?search=...` route supports search by name/phone. Confirm before implementation:

```bash
grep -n "search\|query" src/app/api/customers/route.ts
grep -n "search" src/server/repositories/customer.repository.ts
```

Expected: search param works via name LIKE / phone LIKE. If missing, add a small extension to the existing route OR implement client-side filter on a paginated `findMany` call.

### Gap 2: broadcast product picker

Admin needs to find product by display code (e.g. "A001"). Existing `GET /api/sale/live-sessions/[id]/broadcast-products` returns ALL products in the session. Client-side filter by typed prefix is sufficient for MVP. Sort by displayOrder asc.

### Gap 3: quantity + status

Trivial fields. Quantity: numeric input 1-999. Status: radio buttons PENDING_REVIEW / CONFIRMED with clear labels.

### Gap 4: confirm preview

Show admin: customer name + product (code/name/variant) + quantity + unit price + line total + status choice + warning about inline reserve when status=CONFIRMED.

## Modal shape (proposed)

**File:** `src/components/sale/ManualCreateBookingDialog.tsx` (NEW, ~350 LOC)

**Steps:**

1. **Customer step**
   - Search input: name or phone. Debounced.
   - Result list: name + phone + isBanned badge.
   - Banned customers shown but UNSELECTABLE (visual gray + disabled click).
   - Selected customer shown at top of step. Click to clear + re-search.

2. **Product step**
   - Triggered after customer selected.
   - Search/filter by display code prefix.
   - Result list: code + product name + variant name + unitPrice + availableQty.
   - Out-of-stock variants shown but flagged (warning badge) — admin can still select for PENDING_REVIEW; if status=CONFIRMED, server will return 409 INSUFFICIENT_STOCK.
   - variantId-required check happens server-side; UI just selects the BP row.

3. **Quantity + Status step**
   - Numeric input quantity. Default 1. Range 1-999.
   - Status radio: PENDING_REVIEW (default) / CONFIRMED.
   - Warning copy if CONFIRMED + low stock.

4. **Summary + Submit**
   - Customer name + product code + qty + unit + line total.
   - Submit button = primary variant, Thai label "ยืนยันสร้าง booking".
   - During inflight: spinner + disable.
   - Cancel: closes modal without POST.

5. **Success path**
   - Toast: "สร้าง booking สำเร็จ — {customerName} × {code} × {qty}".
   - Modal closes. Form resets.
   - Parent refetch token bumps → Booking Queue + Product Codes panels re-fetch with the new row.
   - If status=CONFIRMED: Product Codes stock count drops by qty (reservedQty++); Booking Queue row appears with CONFIRMED badge + Cancel button enabled.
   - If status=PENDING_REVIEW: Product Codes stock unchanged; Booking Queue row appears with PENDING badge + Confirm button enabled.

6. **Error mapping (8 cases)** — mirrors Confirm/Cancel/CreateOrder dialog pattern:

| HTTP | Server condition | Thai admin message |
|---|---|---|
| 401 | session expired | ต้อง sign-in ก่อน |
| 403 | CHAT_SUPPORT / WAREHOUSE / CUSTOMER / no shopId | ไม่มีสิทธิ์สร้าง booking |
| 400 | zod validation | ข้อมูลไม่ถูกต้อง / กรุณาตรวจรายการ |
| 404 | customer / BP not found in shop | ลูกค้าหรือสินค้าไม่พบ |
| 409 | banned customer / cross-shop / insufficient stock / idempotency mismatch | สร้างไม่ได้ — {ตรวจสอบลูกค้า/สต็อก/ข้อมูล} |
| 422 | VARIANT_REQUIRED | BroadcastProduct ไม่มี variant |
| 429 | rate limit | ส่งคำสั่งถี่เกินไป / รอ {Retry-After} วินาที |
| 500 | RESERVATION_INTEGRITY_ERROR (when status=CONFIRMED) | เซิร์ฟเวอร์มีปัญหา integrity |

## Trigger button location

Two options:

**Option A:** Add a "+ สร้าง Booking ใหม่" button in the Booking Queue panel header. Always visible when session selected.

**Option B:** Add a "+" floating action button at the top of the /sale workspace.

Recommend **A** — co-locates with existing booking management. Same panel context.

## Mutation grep delta after Manual Create ships

- `method: 'POST'` count: 3 → **4** (Confirm + Cancel + CreateOrder + ManualCreate)
- `onClick=` count: grows by ~5-8 (search inputs + select handlers + step transitions + submit + cancel)
- `axios`: 0
- `useMutation`: 0

All new POST hits confined to `ManualCreateBookingDialog.tsx`. Single intentional POST per modal submission.

## Open questions for Boss

**M1 — Customer search backend:** is the existing `/api/customers` search good enough, or do we need a sale-specific lightweight search endpoint? Recommend reuse existing.

**M2 — Banned customers in search results:** show + disable, or hide entirely? Recommend show + disable so admin sees explicit "customer is banned" rather than confused "customer disappeared."

**M3 — Multi-step vs single-form modal:** I proposed multi-step (Customer → Product → Qty/Status → Summary) for clarity. Alternative is a single flat form. Recommend multi-step for admin clarity during live session.

**M4 — Default status:** PENDING_REVIEW or CONFIRMED? Recommend PENDING_REVIEW (safer default; admin explicitly opts into stock reserve via CONFIRMED choice).

**M5 — idempotencyKey UX:** route accepts optional `idempotencyKey` (regex `^[A-Za-z0-9_-]{8,128}$`). For manual UI creation, double-click within ~1s is the main race. Recommend: auto-generate a UUID-based key on modal mount + send with every submission. Prevents double-click duplicates. NOT exposed in UI.

**M6 — Trigger button visibility for CHAT_SUPPORT:** CHAT_SUPPORT cannot create (server returns 403). Should button be hidden for that role, or shown with disabled state + tooltip? Recommend hide entirely (matches Confirm/Cancel button gating philosophy).

## Implementation effort estimate

- `ManualCreateBookingDialog.tsx`: ~350 LOC (multi-step + customer search + product search + summary)
- `useCustomerSearch` hook if extracted: ~40 LOC
- `useBroadcastProductFilter` helper if extracted: ~30 LOC (client-side filter on existing GET response)
- Booking Queue header button: ~20 LOC modification
- Smoke doc Manual Create section: ~80 lines

Total: ~500 LOC component + minor wiring + docs. Comparable to 2O-c2 effort.

## Test plan

### Pure helper tests (optional)
- `formatBookingSummary` if extracted — 4 cases (PENDING_REVIEW / CONFIRMED / out-of-stock warning / banned customer block).

### Route test
- Already covered. Existing `bookings.route.test.ts` POST tests + `verify-booking-create.ts` 13/13 are authoritative.

### Manual smoke
- Add 10-step section to manual smoke doc parallel to Confirm/Cancel/CreateOrder mutation steps.

## Stop conditions

- Customer search route shape diverges from expectation → STOP, design new sale-specific search route.
- Modal state model balloons beyond useState (e.g. needs reducer or context) → STOP, surface state-mgmt question.
- Auto-generated idempotencyKey conflicts with existing keys in production → STOP, investigate.
- Trigger button placement conflicts with existing UX → STOP, redesign.

## Recommendation

Defer until Boss + ChatGPT explicit GO. Manual Create is a significant UI surface (~500 LOC) and Boss spec PHASE 6 was DOCS-ONLY in this 10-hour session. Ship docs first.

Suggested next sequence after Boss approval:
1. `2O-d1` — design adjustments + customer search backend verification (docs only)
2. `2O-d2` — `ManualCreateBookingDialog` skeleton + customer search step
3. `2O-d3` — product step + quantity/status + summary
4. `2O-d4` — POST wiring + error mapping + smoke doc

Or single `2O-d` if Boss prefers fewer commits — but with ~500 LOC, splitting eases review.

## Refs

- Existing route: [src/app/api/sale/bookings/route.ts](../../src/app/api/sale/bookings/route.ts) POST
- Existing repo: [src/server/repositories/booking.repository.ts](../../src/server/repositories/booking.repository.ts) `createManual`
- Existing E2E: `scripts/verify-booking-create.ts` 13/13
- Existing customer routes: [src/app/api/customers/route.ts](../../src/app/api/customers/route.ts)
- Existing BP GET: [src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts](../../src/app/api/sale/live-sessions/%5BliveSessionId%5D/broadcast-products/route.ts)
- Sibling mutation dialogs: `ConfirmBookingDialog.tsx`, `CancelBookingDialog.tsx`, `CreateOrderDialog.tsx`
