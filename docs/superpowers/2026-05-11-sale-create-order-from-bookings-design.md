# Commit 2O-c — Create Order from confirmed bookings — design doc

**Status:** DESIGN ONLY. No code changes proposed in this commit.
**Date:** 2026-05-11
**Author:** Claude Opus 4.7
**Backend status:** Route + repo already shipped. UI wiring is the only remaining work.

This doc answers Boss's 10 design questions before implementation begins. After Boss + ChatGPT review, the actual implementation lands under separate commit(s) per the recommended split in §9.

---

## 1. Existing conversion route — full audit

| Aspect | Value |
|---|---|
| Route path | `POST /api/sale/orders/from-bookings` |
| File | [src/app/api/sale/orders/from-bookings/route.ts](../../src/app/api/sale/orders/from-bookings/route.ts) |
| Auth/RBAC | `requireAuth()` → AuthError → 401. `user.shopId` required → 403. Role ∈ {OWNER, MANAGER} → 403 otherwise. CHAT_SUPPORT denied at mutation. WAREHOUSE denied. |
| Rate limit | Wrapped with `withRateLimit` (Commit 2N-HARDENING). Shares the same per-IP 60/15min bucket as Confirm + Cancel + Manual Create after Boss-set `RATE_LIMIT_MAX=60`. |
| Body schema | `createOrderFromBookingsBodySchema` in [src/lib/validation/sale.schemas.ts](../../src/lib/validation/sale.schemas.ts): `{liveSessionId: string ≥1, customerId: string ≥1, bookingIds: string[] (1..100, each ≥1 chars)}`. |
| Repository | `bookingRepository.convertToOrder({shopId, liveSessionId, customerId, changedById, bookingIds?})` in [src/server/repositories/booking.repository.ts](../../src/server/repositories/booking.repository.ts) at line 517. |
| Idempotency | Deterministic key `sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}` written to `Order.idempotencyKey` (unique). Repeat call with same booking set returns existing Order. Repo also has early-lookup short-circuit for explicit-bookingIds path so retries after `Booking.status` already flipped to `CONVERTED_TO_ORDER` still return the existing Order instead of throwing `NO_BOOKINGS_TO_CONVERT`. |
| Response shape | `{success: true, data: {orderId, orderNumber, status: 'RESERVED', idempotent, bookingCount, bookingIds: string[], totalAmount: string, currency: 'MYR'}}` |
| Activity log | `BOOKING_CONVERTED_TO_ORDER` non-blocking, only on non-idempotent. |
| Test coverage | `scripts/verify-booking-conversion.ts` 8/8 Docker E2E cases (last green at Commit 2R regression). Tests cover: single-booking convert, idempotent re-call, no-bookings empty case, same-variant+price consolidation, separate variant separate OrderItem, RESERVED→CONFIRMED stock single-decrement, explicit bookingIds idempotency, explicit bookingIds mismatch integrity. |
| Currently invoked from UI | NO. Backend complete; no /sale UI consumer wired. |

**Verdict:** Route is mature, tested, idempotent, rate-limited, RBAC-gated. No backend changes needed for 2O-c implementation.

---

## 2. Booking selection rules — eligibility for inclusion in Create Order

A booking is **eligible** for selection when ALL of:

| Rule | Source |
|---|---|
| `status === 'CONFIRMED'` | Repo `selectConfirmedBookings` filters non-CONFIRMED out. UI must hide selector on other statuses. |
| Same `shopId` (= authed admin's shop) | Server enforces via `where: {shopId: user.shopId, ...}`. UI lists only the authed admin's shop already. |
| Same `liveSessionId` | Repo where-clause. UI selects within ONE live session at a time. |
| Same `customerId` | Repo where-clause. UI selects within ONE customer at a time. |
| `reservationIntegrity ∈ {OK, NOT_APPLICABLE, undefined}` | Same gate as Cancel button. MISSING/MULTIPLE blocked because conversion transfers the active reservation to `orderId`; integrity errors would propagate. |
| `quantity > 0` | Trivially satisfied via Zod schema on confirm path (min 1). |
| NOT already converted (`convertedOrderId === null`) | Server-side: row's `status === 'CONFIRMED'` already implies not converted (convertedOrderId is only set when `status === 'CONVERTED_TO_ORDER'`). |

**`channelIdentityId` / `customerIdentity` cross-channel scoping:** out of scope for 2O-c. Boss spec asked "same customerIdentity? optional?" — answer: optional, and 2O-c proposes NOT requiring it. The customer is identified by `customerId` (`Customer.id`). If a single `Customer` row aggregates multiple `ChannelIdentity` rows (FB + WhatsApp etc), all of their CONFIRMED bookings in this session are eligible. This matches the storefront expectation that orders are per-customer, not per-channel.

**Cross-customer / cross-session protection:** UI must prevent the admin from ticking checkboxes across different customer-session tuples. Two paths:
- **Path A (recommended):** Group bookings in the UI by `(customer, session)`, with checkboxes only within one group. Selecting a booking in group A disables checkboxes in groups B, C... until selection is cleared.
- **Path B:** Allow free selection; on Create Order click, surface a 400 validation error from a client-side helper. Heavier UX cost.

---

## 3. UI selection model (PROPOSAL — not implemented)

### Component changes

| File | Change type | Description |
|---|---|---|
| `src/components/sale/booking-queue.helpers.ts` | extend | Add `isBookingSelectable(b): boolean` — same gates as `isBookingCancellable` (CONFIRMED + integrity-clean). Add pure helper `selectionContext(rows: SaleBookingRow[]): SelectionContext` returning `{customerId, liveSessionId, eligibleBookingIds}` derived from current Set<bookingId>. |
| `src/components/sale/SaleBookingQueuePlaceholder.tsx` | modify | Add `useState selectedIds: Set<string>`. Per-row checkbox `<Checkbox>` from shadcn rendered when `isBookingSelectable(b)`. Disabled when row would mix customer or session. Selection state stored at this component level; siblings unaffected. |
| `src/components/sale/CreateOrderDialog.tsx` | NEW | shadcn Dialog. Shows selected-bookings summary (one row per booking with code/qty/unit/line-total + grand total). Submit button calls `POST /api/sale/orders/from-bookings`. Same error-mapping pattern as Confirm + Cancel dialogs. |
| `src/components/sale/SaleBookingQueuePlaceholder.tsx` (bottom buttons) | modify | "Create Order" button at bottom of panel. Disabled until `selectedIds.size ≥ 1`. Click opens `CreateOrderDialog`. |
| `src/components/sale/SaleOrderConversionPlaceholder.tsx` | TBD | Currently placeholder demo. Either replace with live "Last created order" mini-summary OR keep placeholder until a dedicated /sale orders panel ships. Lean: keep placeholder for 2O-c. |

### UI rules

1. **Default state:** `selectedIds = new Set()`. Create Order button disabled. No checkboxes shown.
2. **When admin clicks first checkbox** (booking row B1 belonging to customer C1, session L1):
   - Add B1 to selectedIds.
   - Lock the "selection context" to `{customerId: C1, liveSessionId: L1}`.
   - For all other booking rows: enable checkbox only if `(b.customerId === C1 && b.liveSessionId === L1 && isBookingSelectable(b))`. Otherwise checkbox renders disabled with tooltip "เลือกได้เฉพาะลูกค้าและรอบไลฟ์เดียวกัน".
3. **When admin unticks the last selection:** unlock the selection context.
4. **Create Order button** sits in the bottom-row strip currently labeled "Bulk Confirm — ปิดเฟสนี้" / "Create Order — ปิดเฟสนี้". Replace the disabled Create Order text with an enabled destructive-or-primary variant when `selectedIds.size ≥ 1`. Label: `Create Order (×{count})`.
5. **Create Order button click** opens `CreateOrderDialog`. Dialog shows the booking summary, total, customer name, session id prefix. Submit button fires the POST.

### Disabled states for selector

| Row state | Checkbox |
|---|---|
| `status !== 'CONFIRMED'` | not rendered |
| `reservationIntegrity === 'MISSING' | 'MULTIPLE'` | not rendered (integrity badge already visible) |
| Selection context locked to different customer/session | rendered but `disabled` + tooltip |
| Already in `selectedIds` | rendered + checked |
| Eligible + current context | rendered + interactive |

### Cancel button + Confirm button during selection

- Cancel button stays visible on individual CONFIRMED rows but disabled when row is in `selectedIds` (admin selected it for conversion; cancelling it would leave the conversion in a stale state). On unselect, Cancel re-enables.
- Confirm button unaffected (PENDING_REVIEW rows aren't selectable in 2O-c anyway).

### Why client-side selection vs server-side query

Server-side endpoint already takes explicit `bookingIds`. Client-side selection model is simpler — admin's mental model is "I tick these N bookings then click Create Order." No server round-trip needed for selection. POST payload = `{liveSessionId, customerId, bookingIds: [...selectedIds]}`.

---

## 4. StockReservation transition — CRITICAL ANALYSIS

### What the existing `convertToOrder` does (verified via [booking.repository.ts:738-814](../../src/server/repositories/booking.repository.ts))

For each eligible CONFIRMED booking:
1. Find its single active `StockReservation` row (`releasedAt: null && bookingId === b.id`).
2. Verify cardinality:
   - 0 active → `RESERVATION_INTEGRITY_ERROR` (CONFIRMED booking must have 1 reservation).
   - ≥2 active → `RESERVATION_INTEGRITY_ERROR`.
   - exactly 1 → proceed.
3. Verify `reservation.orderId === null` (not yet bound to an Order).
4. **Update**: `stockReservation.update({where: {id}, data: {orderId: newOrder.id}})`.
   - **`bookingId` retained.**
   - **`releasedAt` stays `null`.**
   - **`expiresAt` stays at `NO_EXPIRY_SENTINEL`.**
   - **`reservedQty` on the variant is NOT touched.**

This is **Option A** in Boss's question — keep same row, add orderId, retain bookingId. Already locked in by repo + Boss decision Q1 in `2026-05-09-booking-to-order-conversion-dissent.md`.

### Why Option A is correct

- `Booking.confirm()` increments `reservedQty` by `booking.quantity`.
- `bookingRepository.cancel()` from CONFIRMED decrements `reservedQty` by `reservation.quantity` and marks `releasedAt`.
- `convertToOrder` does NOT mutate `reservedQty` — the stock is logically already reserved, just under a different audit anchor (booking → order). The variant's `reservedQty` reflects "X units committed but not yet shipped" regardless of which document holds the reservation.
- `Order.RESERVED → CONFIRMED` via `orderRepository.transition()` decrements BOTH `quantity` and `reservedQty` for each `OrderItem.quantity`. This **completes** the stock lifecycle: reservation collapses into actual sale.

Net effect across the lifecycle:
```
Booking.confirm()          reservedQty += N  (StockReservation created)
convertToOrder()           reservedQty unchanged  (reservation gains orderId)
Order.transition('CONFIRMED')  quantity -= N, reservedQty -= N
```

reservedQty net change: +N then -N = 0. Final state: quantity dropped by N. Correct.

### Risk: double-decrement on Order.transition

`orderRepository.transition()` at [order.repository.ts:376-386](../../src/server/repositories/order.repository.ts) decrements `quantity` and `reservedQty` via `OrderItem.quantity` loop. It does NOT inspect StockReservation rows.

**Storefront-checkout flow** has the same shape (creates StockReservation on order RESERVED, transitions to CONFIRMED via the same `transition()` function) — see [checkout.repository.ts:129](../../src/server/repositories/checkout.repository.ts).

**Bug both flows share:** after `transition('CONFIRMED')`, the StockReservation row STILL has `releasedAt: null`. The reservation row is orphaned. It still says "reserved" even though stock is now sold. Any future `expireReservations()` cron scanning `releasedAt: null && expiresAt <= now` will not affect committed reservations since:
- Storefront uses 24h expiry, but reservation should ideally be marked released on order confirm.
- Sale-conversion uses `NO_EXPIRY_SENTINEL` (2099) so cron never picks them up.

**Impact:** dashboards that count "open reservations" by `releasedAt IS NULL` overcount by all CONFIRMED-order reservations.

**Decision for 2O-c:** **DO NOT FIX in 2O-c.** The bug is pre-existing in storefront flow + sale-conversion flow. Fixing in 2O-c expands scope; needs a separate `ORDER-RESERVATION-CLEANUP` commit that touches `orderRepository.transition`. Note in design doc; surface as follow-up.

### What 2O-c implementation must NOT do

- Do NOT modify `bookingRepository.convertToOrder`. It is correct.
- Do NOT modify `orderRepository.transition`. The orphan-reservation bug is pre-existing.
- Do NOT touch `StockReservation` directly from any UI code.
- Do NOT add new variants of stock-decrement logic.

---

## 5. Order status / payment status

**Initial order state on conversion (already locked by `convertToOrder`):**

| Field | Value |
|---|---|
| `Order.status` | `RESERVED` |
| `Order.channel` | `MANUAL` |
| `Order.shopId` | from authed admin |
| `Order.customerId` | from request |
| `Order.totalAmount` | sum of consolidated OrderItem totalPrice |
| `Order.shippingFee` | 0 (Phase 1; admin fills at SHIPPED transition per Boss Q4 in conversion dissent doc) |
| `Order.idempotencyKey` | deterministic sale-conv key |
| `Order.orderNumber` | `ORD-{shopOrderCount+1, 6 digits}` (race-prone — pre-existing pattern; out of 2O-c scope) |
| `Payment` | NOT created by conversion. Admin enters Payment via separate /orders flow later. |

**No payment mark from 2O-c.** No paid_at, no slip upload, no OCR.

**No shipment from 2O-c.** No Shipment row created.

**No customer-facing message from 2O-c.** No Messenger/WhatsApp/Telegram. No order summary auto-send. Future commit can add a "copy order summary" button that builds a Thai/Chinese template the admin manually pastes — NOT in 2O-c.

---

## 6. Idempotency — current behavior verified

### Key format
```
sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}
```

`sortedBookingIdsHash16` = first 16 hex chars of SHA-256 over sorted bookingIds joined by `,`. Implementation at [src/lib/sale/booking-rules.ts:540-562](../../src/lib/sale/booking-rules.ts) `buildConversionIdempotencyKey()`. Pure helper; unit-tested.

### Replay scenarios

| Scenario | Behavior |
|---|---|
| Admin double-clicks Create Order within 1s with identical selection | First request creates Order. Second request hits early-lookup branch: finds existing Order by idempotency key, verifies `convertedFromBookings` set matches, returns same Order. UI shows `idempotent: true`. No duplicate Order, no duplicate stock mutation. |
| Admin reloads /sale, re-selects same N bookings, clicks Create Order again | Same as above — bookings are now CONVERTED_TO_ORDER; `selectConfirmedBookings` filter returns empty. Early-lookup short-circuit before the empty filter kicks in. Returns existing Order. |
| Admin selects N bookings, fires request, then selects N+1 bookings (different set), fires another request | Different sorted hash → different key. Second request creates SECOND Order, but the first booking set already in the second selection would be filtered out (already CONVERTED_TO_ORDER). Possible outcome: SECOND Order with fewer bookings than expected. **UI must prevent this** by clearing selection state and refetching after a successful Create Order. |
| Admin selects N bookings, request times out, admin retries with same selection | Same key → returns whatever ended up persisted server-side. Safe. |
| Admin selects empty set | UI gates this (button disabled). Server would 422 `NO_BOOKINGS_TO_CONVERT` if reached. |

### Implementation requirement

After a successful `POST /api/sale/orders/from-bookings`:
- Clear `selectedIds` Set
- Bump `refetchToken` (same mechanism as Confirm/Cancel)
- Booking queue re-fetches → converted bookings now show CONVERTED_TO_ORDER badge (existing 2U integrity-badge logic; row stays visible but Cancel/Confirm buttons gone)

---

## 7. Error mapping for UI

Same pattern as Confirm + Cancel dialogs.

| HTTP | Server condition | Thai admin message |
|---|---|---|
| 401 | AuthError | `ต้อง sign-in ก่อน` / `เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่` |
| 403 | CHAT_SUPPORT denied / no shopId / wrong role | `ไม่มีสิทธิ์สร้างออเดอร์` |
| 400 | `validateBody` zod fail (e.g. empty bookingIds, length > 100, malformed string) | `ข้อมูลไม่ถูกต้อง` / fields rendered from response |
| 409 | `BOOKING_INVALID_STATUS` / `CONFLICT` (cross-tab race: some bookings already converted) | `สร้างออเดอร์ไม่ได้` / `รายการบางส่วนถูกแปลงแล้ว หรือสถานะเปลี่ยน กรุณาโหลดข้อมูลใหม่` |
| 422 | `NO_BOOKINGS_TO_CONVERT` (selection had 0 eligible after server filter) / `VARIANT_REQUIRED` | `ไม่มีรายการที่จะแปลงเป็นออเดอร์` |
| 429 | Rate limit (shared 60-bucket per IP) | `ส่งคำสั่งถี่เกินไป` / `กรุณารอประมาณ {Retry-After} วินาทีแล้วลองใหม่อีกครั้ง` |
| 500 | `CONVERSION_INTEGRITY_ERROR` / `RESERVATION_INTEGRITY_ERROR` | `เซิร์ฟเวอร์มีปัญหา integrity` / `กรุณาแจ้ง admin ตรวจสอบข้อมูล booking` |
| network | fetch reject | `การเชื่อมต่อขัดข้อง` |

UI behavior on error:
- Modal stays open. Selection preserved (admin can adjust + retry).
- Inline error rendering inside modal (same pattern as 2O-a/2O-b).
- No auto-retry on any error.

---

## 8. Test plan

### Pure helper unit tests (new file or extend existing)

Extend `tests/unit/components/sale/booking-queue.helpers.test.ts` to add:

- `isBookingSelectable` matrix (mirrors `isBookingCancellable` 26 cases — same eligibility shape).
- Full mutual-exclusivity matrix across `isBookingConfirmable` × `isBookingCancellable` × `isBookingSelectable`: cancellable + selectable should both be true on the SAME CONFIRMED+OK row (intentional overlap — different actions on same eligible row). Verify no row is BOTH confirmable AND selectable (status doesn't permit).

### Route tests

Existing `tests/unit/app/api/sale/from-bookings.route.test.ts` does NOT exist yet (conversion route has no per-route vitest). Boss spec said "route tests if possible" — recommend ADDING a new file `tests/unit/app/api/sale/orders/from-bookings.route.test.ts` covering:
- Auth/RBAC matrix (5 cases — same shape as 2T tests)
- Empty bookingIds → 400
- bookingIds > 100 → 400
- Successful invocation calls `bookingRepository.convertToOrder` with correct args
- Idempotent replay surfaces `idempotent: true`

### Docker E2E

`scripts/verify-booking-conversion.ts` already covers the repo path 8/8. No new verifier needed unless the route handler gains new behavior — it shouldn't in 2O-c.

### Production smoke

- baseline 6/6
- /sale 307
- 3 GET unauth 401
- POST confirm unauth 401
- POST cancel unauth 401
- **NEW: POST /api/sale/orders/from-bookings unauth → 401**
- NO 61-request burst
- NO authenticated production mutation

---

## 9. Recommended implementation split

**2O-c1 (selection UI only, no POST):**
- Add `isBookingSelectable` helper + tests
- Add per-row Checkbox in `SaleBookingQueuePlaceholder`
- Add `selectedIds: Set<string>` state with customer/session lock
- Replace bottom-row "Create Order — ปิดเฟสนี้" with `Create Order (×{count})` button enabled when `selectedIds.size ≥ 1`
- Button click is a no-op placeholder (or logs to console)
- Mutation grep: still 2 POSTs (Confirm + Cancel) — no new mutation surface yet
- Manual smoke: verify selection UX, lock behavior, button enabling

**2O-c2 (CreateOrderDialog + POST wiring):**
- Add `CancelBookingDialog`-pattern dialog
- Wire selection → dialog → POST `/api/sale/orders/from-bookings`
- Add route-level vitest (per Boss spec)
- Mutation grep: 3 POSTs (Confirm + Cancel + CreateOrder)
- Production smoke includes new unauth POST 401 probe
- Manual smoke: full Confirm → Create Order flow on test booking

**2O-c3 (optional, may merge into 2O-c2):**
- Clear selection after success + refetch
- Status indicator on Order row in `SaleOrderConversionPlaceholder` (if keeping that panel)

**Recommended:** 2O-c1 first, ship + review, then 2O-c2. Lower risk per commit, easier review surface. Matches the 2O-a → 2O-a.1 split.

**Alternative:** Ship 2O-c1 + 2O-c2 together if Boss prefers one commit. Mutation grep delta will be larger (+1 POST + several onClicks) so Boss must accept review surface at once.

---

## 10. Stop conditions

Stop and report if implementation hits any of:

- **`convertToOrder` repo behavior diverges** from this design's understanding. E.g. if a future repo refactor changed StockReservation transition semantics.
- **Order.transition path appears unsafe** — e.g. an audit reveals `reservedQty` double-decrement on already-converted bookings. (Currently not a risk, per §4 analysis.)
- **Idempotency key collides** under realistic admin click patterns. (Verified safe in §6.)
- **Cross-customer / cross-session selection** can leak past UI gates and reach server — server returns 400 (correct), but UI should not allow the attempt.
- **Selection state model** balloons into Redux/Zustand/Context territory. Should stay in `useState` on `SaleBookingQueuePlaceholder` only. If state must leak to parent shell or other panels, STOP.
- **Conversion route requires schema change** — does NOT. If implementation discovers it does, STOP.
- **Mutation grep shows unexpected hits** beyond Confirm + Cancel + CreateOrder POSTs and their dialog onClicks. STOP.
- **Implementation tempts adding** Messenger/WhatsApp/Telegram, customer-facing message, auto-send, payment, shipment, Manual Create modal, batch Confirm, multi-customer batch. STOP.
- **Rate-limit budget** insufficient under realistic admin live-session click-through (admin doing 30 confirms + 5 cancels + 20 order creations = 55, under 60). Tight but workable. If real usage trips 429 frequently, Boss can tune env to 90 separately.
- **`Order.orderNumber` race** — admin creates 2+ orders concurrently; both get same `ORD-NNNNNN`. Pre-existing race documented in `convertToOrder` comments. Out of 2O-c scope to fix. If real collisions occur, surface as separate `ORDER-NUMBER-ATOMIC` follow-up.

---

## Findings + recommendation

### Findings

1. **Backend is ready.** Route + repo + idempotency + RBAC + rate-limit all shipped and tested (verify-booking-conversion 8/8). Zero backend work needed for 2O-c.
2. **StockReservation transition is locked + correct.** Option A (keep row, add orderId, retain bookingId). Net stock accounting is correct across the full lifecycle.
3. **Pre-existing orphan-reservation bug** in both storefront-checkout and sale-conversion flows: `orderRepository.transition('CONFIRMED')` doesn't mark StockReservation `releasedAt`. Reservation rows accumulate. Not new; not 2O-c scope; flag as separate cleanup.
4. **Idempotency is robust.** Same selection on retry returns same Order. Different selection produces different key. Boss-decision behavior locked.
5. **Selection state model is simple** — `Set<string>` in one component. No prop drilling. No state library.
6. **Risk surface is small.** UI consumes one already-mature endpoint. Same error-mapping pattern as 2O-a/2O-b.

### Recommendation

Proceed to **2O-c1** as the next implementation commit. Selection UI only, no POST wiring. Adds `isBookingSelectable` helper + Checkbox per row + `selectedIds` state + customer/session lock. Mutation grep remains at 2 POSTs (Confirm + Cancel). Production smoke unchanged. Manual smoke verifies selection UX in isolation.

After Boss + ChatGPT review of 2O-c1, proceed to **2O-c2** which adds `CreateOrderDialog` + POST wiring + route test. Mutation grep moves to 3 POSTs. New unauth-401 probe added to smoke.

Both commits stay within the strict no-go list: no new API routes, no schema, no platform integration, no customer-facing messages, no auto-send, no payment, no shipment, no batch Confirm.

### Boss + ChatGPT decision points

Before 2O-c1 implementation begins, confirm:

- **D1:** Selection state lives only in `SaleBookingQueuePlaceholder` (no parent shell prop drilling). OK?
- **D2:** Customer/session lock is enforced client-side (UI disables checkboxes on out-of-context rows). Server has cross-customer protection too. OK?
- **D3:** `SaleOrderConversionPlaceholder` (the demo Create Order panel) stays as-is for 2O-c (placeholder). Replacing it with a live "Last created order" mini-summary is a separate later commit. OK?
- **D4:** Split into 2O-c1 (UI selection) + 2O-c2 (POST wiring + dialog) vs single 2O-c commit. Recommend the split. Boss preference?
- **D5:** Pre-existing orphan-reservation bug in `orderRepository.transition` — file as separate `ORDER-RESERVATION-CLEANUP` follow-up, NOT 2O-c scope. OK?

After answers, implement 2O-c1 only.

---

## Refs

- Conversion route: [src/app/api/sale/orders/from-bookings/route.ts](../../src/app/api/sale/orders/from-bookings/route.ts)
- Conversion repo: [src/server/repositories/booking.repository.ts#L517](../../src/server/repositories/booking.repository.ts) (`convertToOrder`)
- Boss conversion dissent (2026-05-09): [docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md](2026-05-09-booking-to-order-conversion-dissent.md)
- Boss MVP dissent (2026-04-06): [docs/superpowers/2026-04-06-sale-mvp-dissent.md](2026-04-06-sale-mvp-dissent.md)
- Existing E2E: `scripts/verify-booking-conversion.ts` 8/8
- Idempotency helper: [src/lib/sale/booking-rules.ts](../../src/lib/sale/booking-rules.ts) `buildConversionIdempotencyKey`
- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Manual smoke (living): [docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md](2026-05-11-sale-read-only-manual-smoke.md)
