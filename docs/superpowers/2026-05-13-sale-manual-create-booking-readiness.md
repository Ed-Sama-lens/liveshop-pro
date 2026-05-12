# Sale Manual Create Booking — Phase 1 readiness audit

**Status:** AUDIT ONLY. No code in this commit. Implements Phase 1 of Boss 2026-05-13 work plan.
**Date:** 2026-05-13
**Author:** Claude Opus 4.7
**Predecessor:** [2026-05-12-sale-manual-create-booking-design.md](2026-05-12-sale-manual-create-booking-design.md) (design + open questions)
**Successor:** Phase 3 (modal skeleton, no POST) → Phase 4 (POST wiring) per plan.

---

## Goal

Confirm — before writing any UI code — that:
1. Backend route `POST /api/sale/bookings` shape matches design assumptions.
2. Read APIs needed by Manual Create exist + are sufficient.
3. No schema/migration/payment/stock side-effect surprises lurk.
4. Phase 2 (new search API) is needed OR can be skipped.

If any answer is unknown, STOP and surface to Boss/ChatGPT before Phase 3.

---

## Backend route audit — `POST /api/sale/bookings`

Source: [src/app/api/sale/bookings/route.ts](../../src/app/api/sale/bookings/route.ts):56-140

| Aspect | Value |
|---|---|
| Path | `POST /api/sale/bookings` |
| Auth | `requireAuth()` + `user.shopId` present + role in `['OWNER','MANAGER']` |
| Rate limit | `withRateLimit` shared 60/15min IP bucket |
| Body schema | `createBookingBodySchema` ([booking.schemas.ts:51-79](../../src/lib/validation/booking.schemas.ts)) |
| Required fields | `liveSessionId`, `customerId`, `broadcastProductId`, `quantity` (int 1..999), `status` ('PENDING_REVIEW' \| 'CONFIRMED') |
| Optional fields | `idempotencyKey` `/^[A-Za-z0-9_-]{8,128}$/` |
| Repo entry | `bookingRepository.createManual` |
| Inline confirm | If `status='CONFIRMED'`, repo reuses `_runConfirmInTx` → reserves stock atomically |
| Response 200 | `{ success: true, data: { bookingId, status, quantity, unitPrice (fixed-2), broadcastProductId, customerId, liveSessionId, idempotent, reservation: { id } | null } }` |
| Activity log | `BOOKING_CREATED_AND_CONFIRMED` or `BOOKING_CREATED_MANUAL`, non-blocking; skipped on idempotent replay |
| Error mapping | 401 / 403 (no shop, wrong role) / 400 (zod) / 404 (customer/BP missing) / 409 (banned, cross-shop, insufficient stock, idempotency mismatch) / 422 (VARIANT_REQUIRED) / 429 (rate limit) / 500 (RESERVATION_INTEGRITY_ERROR) |
| Tests | `verify-booking-create.ts` 13/13 (Docker E2E) + route unit tests in 2N batch |
| Production smoke | Already in 13-probe set: `curl -X POST` → 401 |

**Match with design doc:** ✅ all assumptions confirmed.

**Surprises:** none.

**Stock side-effect when `status=PENDING_REVIEW`:** none. Booking row created with no `StockReservation`. `Confirm` action later reserves stock atomically.

**Stock side-effect when `status=CONFIRMED`:** inline reservation via `_runConfirmInTx` → `reservedQty++` on variant + new `StockReservation` row. Same atomic path as standalone Confirm route.

---

## Read API audit

### A — Customer lookup

| Path | Method | Status | Notes |
|---|---|---|---|
| `/api/customers` | GET | ✅ ready | List + search (name / phone / email, case-insensitive OR), pagination, `_count.orders` per row, shop-scoped, requireAuth + shopId |
| `/api/customers/[id]` | GET | ✅ ready (reused by Customer Panel) | Full record + `_count.orders` |

`/api/customers` GET supports `search` query via [customer.schemas.ts:41-48](../../src/lib/validation/customer.schemas.ts). Repository implementation [customer.repository.ts:108-117](../../src/server/repositories/customer.repository.ts) uses prisma `OR: [name contains, phone contains, email contains]` with `mode: 'insensitive'`. Returns paginated list with `_count.orders` aggregate per row.

**Sufficient for Manual Create customer picker?** **Yes.**

**Trade-off (same as Customer Panel Phase 4 chose):** reuse admin `/api/customers` instead of new `/api/sale/customers/search`. Pros: single source of truth, RBAC already correct, no namespace duplication. Cons: cross-page coupling — future admin-page changes can affect /sale. Mitigated by route being shop-scoped + read-only.

**Banned customers:** response includes `isBanned` + `bannedReason`. UI can show + disable selection per design M2 recommendation.

**PII surface in customer search list:** name, phone, email, channel, shippingType, lifetimeValue, isBanned, _count.orders. Address / labels / notes / FB id also present but Manual Create UI does NOT need them and will NOT display them. Admin-only page — no public exposure risk.

### B — Broadcast product lookup

| Path | Method | Status |
|---|---|---|
| `/api/sale/live-sessions/[id]/broadcast-products` | GET | ✅ already fetched by `SaleWorkspaceShell` |

Shell holds `productState.products` for the selected session ([SaleWorkspaceShell.tsx:60-69](../../src/components/sale/SaleWorkspaceShell.tsx)). Manual Create modal can receive this array as a prop — zero additional fetch. Filter by display-code prefix client-side. Out-of-stock variants still shown (flagged) per design.

**Sufficient?** **Yes.** Reuse parent state. No new API.

### C — Customer by id

Already wired for Customer Panel. Not needed for Manual Create itself (modal selects customer from search list, which already includes summary fields).

---

## Phase 2 decision

**Skip Phase 2.** Existing `/api/customers?search=...` covers Manual Create needs.

Rationale:
- Repo-level OR(name, phone, email) search already case-insensitive.
- Pagination default 20 per page is acceptable for typed-search dropdown.
- Reusing avoids one new route surface + tests + smoke probe.
- Trade-off (cross-page coupling) is identical to the trade-off Customer Panel Phase 4 explicitly chose 2026-05-12.

If Manual Create requirements ever diverge from admin /customers needs (e.g. exclude banned, limit to recent activity, restrict PII fields), introduce `/api/sale/customers/search` then. Not now.

---

## Phase 3 plan — modal skeleton, no POST

**Allowed files:**

| Action | File | Reason |
|---|---|---|
| NEW | `src/components/sale/ManualCreateBookingDialog.tsx` | New modal component, ~350 LOC |
| MOD | `src/components/sale/SaleBookingQueuePlaceholder.tsx` | Add "+ สร้าง booking เอง" button to panel header. Open dialog on click. |
| MOD | `src/components/sale/SaleWorkspaceShell.tsx` | Pass `products` (from existing `productState`) to BookingQueue → modal. |
| MOD | `docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md` | Note Manual Create button visible but submit disabled. |

**Modal scope in Phase 3:**

- Trigger button: "+ สร้าง booking เอง" in Booking Queue panel header. Visible only when `state.kind === 'ready'` (live session selected). Hidden for CHAT_SUPPORT (RBAC mirrors Confirm/Cancel buttons).
- Single-form dialog (not multi-step — simpler for skeleton, easier to upgrade later).
- Fields:
  - Customer search input + result list (typed-debounce search → `/api/customers?search=...&limit=20`).
  - Selected customer chip with clear button.
  - Broadcast product select (filter by display-code prefix in existing products array, with displayCode + name + variantName + availableQty).
  - Quantity numeric input (default 1, range 1..999).
  - Status radio: PENDING_REVIEW (default, locked in Phase 3 — CONFIRMED reserved for later).
- Submit button DISABLED with copy "จะเปิดใช้งานในขั้นถัดไป (Phase 4)".
- Cancel/close works.
- No POST fired from modal.
- No customer-facing message logic.
- Customer search calls `/api/customers` GET — already authorized for OWNER/MANAGER/CHAT_SUPPORT/WAREHOUSE/CUSTOMER per `requireAuth + shopId` only. /sale workspace itself is OWNER/MANAGER/CHAT_SUPPORT-only via page guard, so no new role exposure.

**Mutation grep delta after Phase 3:** stays at **3 POSTs** (Confirm + Cancel + CreateOrder). New `fetch('/api/customers?search=...')` is GET only.

**Existing role check on customer search route:** `/api/customers` GET requires only `requireAuth + shopId` (no role gate per [route.ts:10-34](../../src/app/api/customers/route.ts)). All five role categories can read it today. /sale page renders for OWNER/MANAGER/CHAT_SUPPORT. **No new role exposure.**

---

## Phase 4 plan — POST wiring

**Allowed files:**

| Action | File |
|---|---|
| MOD | `src/components/sale/ManualCreateBookingDialog.tsx` — enable submit, wire POST |
| MOD | `docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md` — Manual Create smoke section |
| MOD | `docs/sale-api-map.md` — mutation count 3 → 4 |
| OPTIONAL | route unit tests / helper tests if gaps discovered |

**Submit behavior:**

```
POST /api/sale/bookings
body: { liveSessionId, customerId, broadcastProductId, quantity, status: 'PENDING_REVIEW', idempotencyKey }
```

Where `idempotencyKey` is auto-generated UUID v4 (base64-url 22-char string fits `[A-Za-z0-9_-]{8,128}`) on modal mount — protects against double-click duplicate submission per design M5.

**Status locked to PENDING_REVIEW** in first ship. CONFIRMED route is open server-side but UI does not expose it until Boss explicit follow-up (deferred 2O-d4 per design). Reasons:
- PENDING_REVIEW is safer first run — no immediate stock reservation surprise.
- Admin still confirms via existing Confirm button on the resulting row.
- Two-step flow (create → confirm) is easier for admin to spot mistakes.

**Success path:**
- Toast: `สร้าง booking สำเร็จ — {customerName} × {displayCode} × {qty}`
- Modal closes + form resets.
- Parent refetch token bumps → Booking Queue refetches → new PENDING_REVIEW row appears with Confirm button enabled.
- Product Codes panel unchanged (no stock reserved at PENDING_REVIEW).

**Error mapping (8 cases — mirror Confirm/Cancel/CreateOrder pattern):**

| HTTP | Server condition | Thai admin message |
|---|---|---|
| 401 | session expired | `ต้อง sign-in ก่อน — เซสชันหมดอายุ` |
| 403 | wrong role / no shopId | `ไม่มีสิทธิ์สร้าง booking` |
| 400 | zod validation | `ข้อมูลไม่ถูกต้อง — กรุณาตรวจรายการ` |
| 404 | customer / BP not found in shop | `ลูกค้าหรือสินค้าไม่พบ` |
| 409 | banned / cross-shop / insufficient stock (status=CONFIRMED only) / idempotency mismatch | `สร้างไม่ได้ — กรุณาตรวจข้อมูล` |
| 422 | VARIANT_REQUIRED | `BroadcastProduct ไม่มี variant` |
| 429 | rate limit | `ส่งคำสั่งถี่เกินไป กรุณารอ {Retry-After} วินาที` |
| 500 | RESERVATION_INTEGRITY_ERROR | `เซิร์ฟเวอร์มีปัญหา integrity` |

**Mutation grep delta after Phase 4:** 3 → **4** POSTs (ManualCreate added). All hits inside `ManualCreateBookingDialog.tsx`. Single intentional POST per submission.

**Production smoke add:** `curl -X POST` against `/api/sale/bookings` → expect 401 (already covered — existing probe in [sale-api-map.md:148-149](../sale-api-map.md)).

---

## Stop conditions

STOP and surface to Boss/ChatGPT if any of these occur during Phase 3 or 4:

1. `/api/customers?search=...` returns unexpected shape (e.g. nested `items` vs flat array).
2. Customer search returns 403 for CHAT_SUPPORT — would need new sale-namespaced route.
3. Existing products array from shell does not include required fields for product picker.
4. idempotencyKey collision with existing key in production (extremely rare — UUID v4 collision probability ~negligible).
5. Modal state ballooning beyond useState — needs reducer/context.
6. Submit button bypasses isSubmitting guard — double POST risk.
7. Adding the panel-header button conflicts with existing 2O-c1 Create Order strip layout.
8. Mutation grep shows >4 POSTs after Phase 4 ship.

---

## Decision summary

| Phase | Decision | Reason |
|---|---|---|
| Phase 2 (new search API) | **SKIP** | `/api/customers?search=...` sufficient. Same trade-off Customer Panel Phase 4 chose. |
| Phase 3 (skeleton, no POST) | **PROCEED** | Backend ready, read APIs ready, no schema work. |
| Phase 4 (POST wiring) | **PROCEED after Phase 3 green** | Match Confirm/Cancel/CreateOrder dialog pattern. PENDING_REVIEW only. |
| Phase 5 (stabilization) | **PROCEED after Phase 4 ships** | Smoke checklist + optional helper tests. |
| Phase 6 (omnichannel discovery) | **PROCEED docs-only after Phase 5** | If time remains. |

---

## CD / CC / CN consultation items for Boss → ChatGPT

- **CD-1** Customer search reuse vs new sale-namespaced route. Audit recommends reuse. ChatGPT verdict?
- **CD-2** Manual Create modal status field locked to PENDING_REVIEW for first ship. CONFIRMED deferred. Acceptable?
- **CD-3** idempotencyKey auto-generated UUID v4 on modal mount. Confirm acceptable vs per-submit re-gen.
- **CC-1** Multi-step modal (Customer → Product → Qty → Summary) vs single-form modal. Audit recommends single-form for Phase 3 skeleton; can upgrade later if Boss prefers wizard UX.
- **CC-2** Trigger button placement: Booking Queue panel header (audit pick) vs workspace-level FAB.
- **CN-1** Banned customer in search results: show + disable (audit pick) vs hide entirely.
- **CN-2** Out-of-stock variant in product picker for PENDING_REVIEW status: allow selection (audit pick — server accepts because no reservation fires). For future CONFIRMED status would need warning copy.

---

## Refs

- [Existing design doc](2026-05-12-sale-manual-create-booking-design.md) — 6 open questions + UX gaps
- [Customer Panel design (precedent for route reuse)](2026-05-12-sale-customer-panel-design.md)
- [Sale API map](../sale-api-map.md)
- [Booking POST route](../../src/app/api/sale/bookings/route.ts)
- [Booking body schema](../../src/lib/validation/booking.schemas.ts)
- [Customer route + repo](../../src/app/api/customers/route.ts)
- [Customer query schema](../../src/lib/validation/customer.schemas.ts)
- [Booking queue placeholder](../../src/components/sale/SaleBookingQueuePlaceholder.tsx)
- [Workspace shell](../../src/components/sale/SaleWorkspaceShell.tsx)
- [Confirm/Cancel/CreateOrder dialogs](../../src/components/sale/) — error-mapping pattern reference
- Authenticated manual test checklist: [2026-05-12-sale-authenticated-manual-test-checklist.md](2026-05-12-sale-authenticated-manual-test-checklist.md)
