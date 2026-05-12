# /sale authenticated manual test checklist

**Status:** Boss-only manual smoke checklist. Run on production with care, ONLY with test data Boss explicitly designates as safe.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7
**Audience:** Boss + ChatGPT during production smoke after deploy.

Purpose: verify end-to-end Confirm + Cancel + Create Order mutation flows against production data without touching real customer orders. Claude cannot perform this — admin browser session + production credentials are required.

---

## Pre-flight checks

- [ ] Latest master commit is `776938d` or newer on Vercel Production.
- [ ] Production deploy status is **Ready** in Vercel dashboard.
- [ ] Unauthenticated probe set passes (baseline 6/6 + sale 401 gates 3 + mutation 401 gates 3 = 12 probes).
- [ ] Boss has access to admin OWNER or MANAGER credentials.
- [ ] Boss has identified a **safe test booking** that can be Confirmed/Cancelled/Converted without affecting real customer commerce. Options:
  - (a) Existing test customer + test variant with throwaway stock.
  - (b) Newly-created test booking via internal tooling (NOT via the Manual Create modal — not yet shipped).
  - (c) A booking that originated from internal staff and is OK to mutate.
- [ ] Boss notes the **before** state of the test data:
  - Booking IDs involved
  - Their current status (PENDING_REVIEW / CONFIRMED)
  - Their associated variant's `quantity` and `reservedQty`
  - Their associated Order id (if already converted)

---

## Test scenarios

### Scenario A — Confirm flow (single booking)

**Goal:** verify Confirm button reserves stock atomically + integrity badges work.

1. Log in as OWNER or MANAGER at https://nazhahatyai.com/login.
2. Navigate to `/sale`. Verify:
   - [ ] Page renders without console error.
   - [ ] Amber test-mode banner visible.
   - [ ] Live Sessions panel shows real sessions for your shop.
   - [ ] Auto-selected session is LIVE (or SCHEDULED if no LIVE).
   - [ ] Product Codes panel shows real products.
   - [ ] Booking Queue panel shows real bookings.
3. Find a PENDING_REVIEW booking with `reservationIntegrity` OK or NOT_APPLICABLE or undefined (no INTEGRITY badge).
4. Note BEFORE state:
   - [ ] Variant stock count visible in Product Codes panel.
   - [ ] Booking row status badge = PENDING.
5. Click **Confirm** button on that row.
6. Confirm modal opens. Verify:
   - [ ] Modal summary table matches row data (booking id prefix, code, customer, qty, unit price).
   - [ ] Description warns "ตัดสต็อกชั่วคราว (reservedQty +N)".
7. Click "ยืนยัน Confirm".
8. Verify in DevTools Network panel:
   - [ ] Exactly ONE `POST /api/sale/bookings/{id}/confirm` request.
   - [ ] Request body is `{}`.
   - [ ] Response 200 with `{success: true, data: {...}}`.
9. Verify after success:
   - [ ] Modal closes.
   - [ ] sonner toast appears: "Confirm สำเร็จ — booking ถูกยืนยันและจองสต็อกแล้ว".
   - [ ] Product Codes panel refetches. Stock count on that variant DROPS by booking qty (reservedQty++).
   - [ ] Booking row badge flips PENDING → CONFIRMED.
   - [ ] Confirm button disappears from row. Cancel button now visible.

**Cleanup:** record CONFIRMED booking id for Scenario B.

### Scenario B — Cancel flow (single booking)

**Goal:** verify Cancel releases stock + reason audit + Confirm button gone from row.

1. Continue from Scenario A's confirmed booking.
2. Note BEFORE state: variant `reservedQty` after Scenario A.
3. Click **Cancel** button on the row.
4. Cancel modal opens. Verify:
   - [ ] Modal summary matches row data + activeReservationId suffix shown.
   - [ ] Reason textarea required, char counter visible.
5. Try clicking "ยืนยันยกเลิก" with empty reason — button should be disabled.
6. Type reason "Smoke test cancel — Scenario B".
7. Click "ยืนยันยกเลิก".
8. Verify in Network:
   - [ ] Exactly ONE `POST /api/sale/bookings/{id}/cancel`.
   - [ ] Request body `{"targetStatus":"CANCELLED","reason":"..."}`.
   - [ ] Response 200.
9. Verify after success:
   - [ ] Modal closes.
   - [ ] sonner toast: "ยกเลิกสำเร็จ — คืน N ชิ้นสู่ stock".
   - [ ] Product Codes refetch. Stock count RISES by booking qty.
   - [ ] Booking row flips CONFIRMED → CANCELLED (strikethrough badge).
   - [ ] Cancel + Confirm buttons gone from row.

**Cleanup:** none. Cancelled booking is terminal.

### Scenario C — Create Order flow (multi-row selection)

**Goal:** verify Create Order consolidates multiple CONFIRMED bookings + customer/session lock works + reservation transfer.

**Prep:** need ≥2 CONFIRMED bookings for SAME customer + SAME live session.
- Option (a): run Scenario A twice to confirm 2 bookings.
- Option (b): existing CONFIRMED bookings on test customer.

1. In Booking Queue, click checkbox on first CONFIRMED row (customer C1, session L1).
   - [ ] Row gains primary border + tint.
   - [ ] Strip count shows "1 รายการที่เลือก".
   - [ ] Lock context engages: rows from other customers show disabled checkbox + tooltip.
2. Click checkbox on second CONFIRMED row from same C1+L1.
   - [ ] Count = 2.
   - [ ] Both rows highlighted.
3. Click "สร้างออเดอร์ (2)" button.
4. Create Order modal opens. Verify:
   - [ ] Description shows count = 2.
   - [ ] Identity block: customer name + customer id prefix + session id prefix.
   - [ ] Summary table: 2 rows with code/name/qty/unit/line.
   - [ ] Grand Total row = sum of line totals.
   - [ ] Amber note lists 4 Phase-1 constraints.
5. Click "ยืนยันสร้างออเดอร์ (2)".
6. Verify in Network:
   - [ ] Exactly ONE `POST /api/sale/orders/from-bookings`.
   - [ ] Request body `{liveSessionId, customerId, bookingIds: [...2 ids]}`.
   - [ ] Response 200.
7. Verify after success:
   - [ ] Modal closes.
   - [ ] Toast "สร้างออเดอร์สำเร็จ — Order #ORD-NNNNNN".
   - [ ] Booking Queue refetches. Both rows flip CONFIRMED → CONVERTED (blue badge).
   - [ ] Checkbox + Confirm + Cancel gone from those rows.
   - [ ] selectedIds Set cleared (strip count = 0).
   - [ ] Product Codes refetches. `reservedQty` UNCHANGED (Option A — reservation transferred to order, not released).

### Scenario D — Customer Panel live data (read-only)

**Goal:** verify Customer Panel renders real data on row click + does NOT mutate.

1. Customer Panel before click: shows empty state "ยังไม่ได้เลือก — คลิกชื่อลูกค้าในแถวรายการจอง".
2. Click customer name link in any Booking Queue row.
3. Verify in Network:
   - [ ] Exactly ONE `GET /api/customers/{id}`.
   - [ ] NO POST/PUT/DELETE fired.
4. Verify Customer Panel renders:
   - [ ] Real name + phone (if present) + email (if present).
   - [ ] ACTIVE or BANNED badge.
   - [ ] Shipping type / Order count / Lifetime value.
   - [ ] Address / labels / notes NOT shown (PII gate).
   - [ ] Edit button stays disabled.
5. Click a different row's customer name. Panel refetches with new customer.

### Scenario E — Integrity badge surfacing

**Goal:** verify MISSING/MULTIPLE rows block mutation.

**Prep:** corrupt data is RARE. If your production has any CONFIRMED booking with `activeReservationCount !== 1`, the row will show INTEGRITY badge. If none exist, skip this scenario.

1. Find row with INTEGRITY badge (amber MISSING or red MULTIPLE).
2. Verify:
   - [ ] Confirm button HIDDEN.
   - [ ] Cancel button HIDDEN.
   - [ ] Checkbox HIDDEN.
   - [ ] Customer name still clickable (Customer Panel still loads).
3. Inspect API response in DevTools — `reservationIntegrity` field in booking row should be `MISSING` or `MULTIPLE`.

### Scenario F — Rate limit behavior (optional, ADVANCED)

**Goal:** verify 429 path works. Run only if Boss explicitly approves. Burns POST budget.

1. Identify a PENDING_REVIEW booking. Open the row.
2. Click Confirm 21+ times in rapid succession (or use a script with same session cookie + 21 sequential POSTs).
3. After exhausting the 60-point bucket within 15min window, observe:
   - [ ] 429 response with `Retry-After: 900` header.
   - [ ] Confirm dialog shows inline error "ส่งคำสั่งถี่เกินไป — กรุณารอประมาณ {N} วินาทีแล้วลองใหม่อีกครั้ง".
   - [ ] Modal stays open. Selection preserved.
4. Wait `Retry-After` seconds. Retry. Should succeed.

**WARNING:** depleting the bucket affects ALL admin users on the same IP for 15 min. Do not run during active selling.

---

## Cleanup after testing

1. Note all booking + order ids that were mutated.
2. For Scenario A confirmed bookings: cancelled in Scenario B → terminal state OK.
3. For Scenario C orders: orders are in RESERVED status. Either:
   - Use admin /admin/orders page to transition each test Order through PACKED → SHIPPED → DELIVERED (full flow), OR
   - Manually mark as a known test order via notes field, OR
   - Cancel via admin /admin/orders → CANCELLED (releases stock + cascades).
4. Document test data state in Boss memory.

---

## Failure handling

If any scenario fails:

| Failure | Action |
|---|---|
| HTTP 500 on mutation | STOP. Capture full response body + check Vercel logs. Do not retry. |
| Stock count doesn't change after Confirm | STOP. Race or repository bug. Check Booking + StockReservation + ProductVariant via Railway shell. |
| Booking row status doesn't flip after Confirm | Refetch broken. Manually reload `/sale` to verify. |
| Multiple POSTs fire from one click | UI bug. Capture Network screenshot. |
| Modal can't close mid-request | Expected behavior — submit button disables until response. |
| Customer Panel shows demo data instead of real | Build cache issue — Vercel may need redeploy with cache busted. |
| INTEGRITY badge appears unexpectedly | Real data corruption. Cross-reference with verify-booking-flow Test 6 multi-active simulation. |

Report all failures with: commit hash + scenario + step number + Network response + console errors.

---

## What this checklist does NOT cover

- ❌ Manual Create Booking modal — NOT yet shipped. See [docs/superpowers/2026-05-12-sale-manual-create-booking-design.md](2026-05-12-sale-manual-create-booking-design.md).
- ❌ Payment / shipment flows — separate /admin/orders page.
- ❌ Customer-facing message generation — out of scope.
- ❌ Messenger / WhatsApp / Telegram — Phase 2+ future.
- ❌ Cron `expireReservations` — server-side, not user-triggered. Verify via Vercel logs after Boss-approved cron run.
- ❌ ORDER-RESERVATION-CLEANUP backfill — separate one-shot script, run by Boss with dry-run first.

---

## Refs

- Manual smoke (read-only baseline): [2026-05-11-sale-read-only-manual-smoke.md](2026-05-11-sale-read-only-manual-smoke.md)
- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Confirm/Cancel/CreateOrder dialogs: `src/components/sale/`
- Customer Panel: [SaleCustomerPanelPlaceholder.tsx](../../src/components/sale/SaleCustomerPanelPlaceholder.tsx)
- Booking Queue: [SaleBookingQueuePlaceholder.tsx](../../src/components/sale/SaleBookingQueuePlaceholder.tsx)
