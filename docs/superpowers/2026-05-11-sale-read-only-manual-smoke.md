# /sale manual smoke checklist (living doc)

**Status:** LIVING — update in place when /sale surface changes. Do NOT create a new dated checklist per commit. Add a row to the changelog table below instead.

**Scope:** Authenticated browser smoke of the /sale workspace. Performed by Boss; Claude cannot perform browser login automation against production. Captures what is automated vs what still requires a human session.

**Note 2O-a (mutation era begins):** As of Commit 2O-a the Confirm button is wired to POST `/api/sale/bookings/[id]/confirm`. This doc has been extended (not replaced) with mutation steps. Cancel + Create Order remain disabled — when those ship, add corresponding sections instead of creating a new doc.

## Changelog

Most recent on top. Bump when the checklist needs new steps (new field surfaced, new panel, new API response shape).

| Date | Commit | Change |
|---|---|---|
| 2026-05-13 | Manual Create Phase 4 (this commit) | Submit enabled on `ManualCreateBookingDialog`. POST `/api/sale/bookings` fires with auto-generated `idempotencyKey` (UUID v4) + status locked to `PENDING_REVIEW`. 8-case error mapping (401/403/400/404/409/422/429/500) mirrors Confirm/Cancel/CreateOrder dialogs. Success toast + close + parent refetch. Mutation surface = **4** intentional POSTs. |
| 2026-05-13 | Manual Create Phase 3 skeleton | New button "+ สร้าง booking เอง" appears under Create Order strip. Opens `ManualCreateBookingDialog` with customer search (GET `/api/customers?search=`) + product picker (client-side filter on existing products array) + quantity input + PENDING_REVIEW status indicator + summary preview. Submit button DISABLED. Mutation surface unchanged (3 POSTs). New GET surface: `/api/customers?search=` from sale workspace. |
| 2026-05-12 | Customer Panel wiring | Customer Panel reads live from `GET /api/customers/[id]`. Booking row customer name is now click-target. Mutation surface unchanged (still 3 POSTs). |
| 2026-05-12 | cron resilience `9211ef3` | `expireReservations()` Promise.allSettled + logger. ORDER-RESERVATION-CLEANUP Commit 3. |
| 2026-05-12 | order reservation cleanup `520410d` | `orderRepository.transition('CONFIRMED')` marks `StockReservation.releasedAt`. ORDER-RESERVATION-CLEANUP Commit 1. |
| 2026-05-12 | 2O-c2 `7a6a8b1` | Create Order **dialog + POST wiring**. POST `/api/sale/orders/from-bookings` fires from `CreateOrderDialog`. Mutation surface = **3** intentional POSTs (Confirm + Cancel + CreateOrder). Route-level vitest 19/19. |
| 2026-05-11 | 2O-c1 `152a615` | Create Order **selection UI only** — per-row Checkbox on CONFIRMED+integrity-clean rows, customer/session lock, count display, Create Order button enabled when ≥1 selected. Button did NOT POST — fired sonner toast placeholder. Mutation surface unchanged (2 POSTs). |
| 2026-05-11 | 2O-c-DESIGN `f70c51c` | Design doc only. No code. Answered Q1-Q10 + D1-D5. |
| 2026-05-11 | 2O-b `defd8a0` | Cancel button enabled (single-row, CONFIRMED + integrity-clean). Required reason 3-200 chars. targetStatus hard-coded CANCELLED. Mutation surface = 2 intentional POSTs (Confirm + Cancel). |
| 2026-05-11 | RATE_LIMIT_MAX=60 | Boss set Vercel env + redeployed. POST budget per IP raised 20 → 60 per 15-min window. |
| 2026-05-11 | 2O-a.1 `fd4d10e` | First mutation (Confirm) UI smoke section. `isBookingConfirmable` 26-case unit test landed. |
| 2026-05-11 | 2O-a `7643060` | Confirm button enabled (single-row, PENDING_REVIEW + integrity-clean). Mutation surface = 1 intentional POST. |
| 2026-05-11 | 2U `9ccdca1` | Integrity-badge visual checks (reservation MISSING/MULTIPLE; filteredInvalidCount panel warning). Doc converted to living format. |
| 2026-05-11 | 2T `492543c` | Initial doc. Covers 2P/2Q/2R/2S read-only wiring. |

## Pre-flight

- ✅ Vercel deploy of latest commit is **Ready**
- ✅ Production smoke unauthenticated probes pass:
  - `https://nazhahatyai.com/api/sale/live-sessions` → 401
  - `https://nazhahatyai.com/api/sale/live-sessions/<dummy>/broadcast-products` → 401
  - `https://nazhahatyai.com/api/sale/bookings?liveSessionId=<dummy>` → 401
  - `https://nazhahatyai.com/sale` → 307 redirect to sign-in
- ✅ Route-level vitest covers RBAC matrix (Commit 2T):
  - 12 tests on GET `/api/sale/live-sessions`
  - 15 tests on GET `/api/sale/live-sessions/[id]/broadcast-products`
  - 19 tests on GET `/api/sale/bookings`

## What is AUTOMATED (cumulative)

| Concern | Coverage |
|---|---|
| GET unauth → 401 | route tests + production smoke probe |
| OWNER role → 200 | route tests |
| MANAGER role → 200 | route tests |
| CHAT_SUPPORT role → 200 | route tests |
| WAREHOUSE role → 403 | route tests |
| CUSTOMER role → 403 | route tests |
| User without shopId → 403 | route tests |
| GET `/api/sale/bookings` missing `liveSessionId` → 400 | route tests |
| Invalid status enum → 400 | route tests |
| Limit over max → 400 | route tests |
| Cross-shop session probe → 404 (no existence leak) | route tests |
| `reservationIntegrity` discriminator (OK / MISSING / MULTIPLE / NOT_APPLICABLE) | route tests |
| `filteredInvalidCount` cross-shop variant rejection | route tests |
| `formatMoney2` fixed-2-decimal serialization | route tests |
| `availableQty` clamp to ≥ 0 | route tests |

## What still REQUIRES MANUAL admin browser session

The following can only be verified by Boss with a real admin login because Claude has no production credential injection mechanism:

1. **Browser session login flow**
   - Sign in at `https://nazhahatyai.com/login` with an admin account (OWNER / MANAGER / CHAT_SUPPORT).
   - Confirm redirect to `/dashboard` succeeds.

2. **/sale page renders without crash**
   - Navigate to `https://nazhahatyai.com/sale`.
   - Confirm: page renders, no console errors, no React error boundary catches.
   - Check Live Sessions panel shows real sessions for your shop (or empty-state if you have none).

3. **Network panel — no mutation requests**
   - Open browser DevTools → Network tab.
   - Reload `/sale`.
   - Confirm only GET requests fire to:
     - `/api/auth/session`
     - `/api/sale/live-sessions`
     - (if a session was auto-selected) `/api/sale/live-sessions/<id>/broadcast-products`
     - (if a session was auto-selected) `/api/sale/bookings?liveSessionId=<id>&limit=100`
   - Confirm zero POST / PUT / DELETE to any `/api/sale/*` endpoint.

4. **Auto-selection works**
   - If you have an active live session, confirm it is highlighted with the green "LIVE • SELECTED" badge.
   - If you only have SCHEDULED sessions, confirm the most recent is selected with a blue badge.
   - If you have no sessions, confirm Product Codes + Customer Bookings panels show "รอเลือกรอบไลฟ์" placeholder.

5. **Action buttons remain disabled**
   - Try clicking every visible button: "เลือกรอบไลฟ์", "จองสินค้า", "Confirm / ยืนยัน", "Cancel / ยกเลิก", "Create Order / สร้างออเดอร์", "ยังไม่เปิดใช้งาน".
   - Confirm: all buttons are visually disabled and clicks produce no network request and no state change.

6. **Integrity field surfaces visually (Commit 2U)**
   - Booking Queue panel: any CONFIRMED row whose `reservationIntegrity` is `MISSING` should show an amber `INTEGRITY` badge with a warning-triangle icon next to the status pill. Hover tooltip explains "booking marked CONFIRMED but no active stock reservation". Internal reservation IDs are NOT shown.
   - Booking Queue panel: any row whose `reservationIntegrity` is `MULTIPLE` should show a red `INTEGRITY` badge with an alert-octagon icon. Hover tooltip explains "more than one active stock reservation".
   - OK / NOT_APPLICABLE rows: no integrity badge.
   - Product Codes panel: when `data.filteredInvalidCount > 0`, an amber warning row appears below the grid: "มีสินค้าบางรายการถูกซ่อนเพราะข้อมูลไม่ถูกต้อง (X รายการ)". Cross-shop / corrupt-row identifiers are NOT exposed. Suppressed when count is zero.
   - Mutation buttons remain disabled regardless of integrity state.

7. **CHAT_SUPPORT role test**
   - Log out, log in as a CHAT_SUPPORT user (if you have one).
   - Confirm `/sale` loads and panels display data.
   - Confirm action buttons remain disabled (same as OWNER/MANAGER — `<Button disabled>` is structural, not role-based).
   - Confirm `/api/sale/bookings` POST (if you craft a curl with the session cookie) returns 403 with `error: 'Insufficient permissions'` — but DO NOT actually fire that test against production data.

8. **WAREHOUSE role test (recommended)**
   - Log out, log in as a WAREHOUSE user (if you have one).
   - Confirm `/sale` middleware redirects to `/dashboard` (WAREHOUSE excluded from `/sale` page).
   - Confirm direct GET `/api/sale/live-sessions` with WAREHOUSE session returns 403.

## Pass criteria (read-only baseline)

The /sale read-only shell is considered manually verified when all of:

- ✅ Page renders for OWNER / MANAGER / CHAT_SUPPORT without crash.
- ✅ Only GET fetches against `/api/sale/*` appear in network log (PLUS the one intentional Confirm POST, see mutation section).
- ✅ Auto-selection picks LIVE > SCHEDULED > first row.
- ✅ Empty states render when no data is present.
- ✅ Cancel + Create Order action buttons remain disabled (only Confirm enabled in 2O-a).
- ✅ WAREHOUSE cannot access `/sale` (middleware redirect).
- ✅ No 500 in production deployment logs from /sale traffic.

## Mutation steps — Confirm button (added Commit 2O-a / 2O-a.1)

Verify with a real OWNER or MANAGER admin session. CHAT_SUPPORT must NOT be able to fire Confirm; if you have a CHAT_SUPPORT account, separately verify the 403 path.

**Prep:** ensure at least one PENDING_REVIEW booking exists for the auto-selected live session. If not, create a test booking via an internal tool first.

1. **Confirm button visibility**
   - PENDING_REVIEW + reservationIntegrity OK / NOT_APPLICABLE / undefined → Confirm button visible inline on the row (small primary button with check-circle icon).
   - PENDING_REVIEW + MISSING → Confirm button HIDDEN; amber INTEGRITY badge shown instead.
   - PENDING_REVIEW + MULTIPLE → Confirm button HIDDEN; red INTEGRITY badge shown.
   - CONFIRMED / CANCELLED / EXPIRED / CONVERTED_TO_ORDER → Confirm button NEVER visible.
   - Verify with route response in DevTools — `reservationIntegrity` field surfaces in JSON.

2. **Modal opens with correct summary**
   - Click Confirm on a row.
   - Modal opens. Header reads "ยืนยันการจอง (Confirm Booking)".
   - Description includes "ตัดสต็อกชั่วคราว (reservedQty +{quantity})".
   - Summary table shows:
     - Booking (id prefix, first 12 chars + ellipsis)
     - Code (displayCode)
     - ลูกค้า (customer name)
     - จำนวน (×quantity)
     - ราคาต่อชิ้น (RM unitPrice)
   - Footer: "ยกเลิก" (outline) + "ยืนยัน Confirm" (primary).

3. **Cancel-in-modal closes without network POST**
   - Open modal.
   - Click "ยกเลิก" footer button.
   - Modal closes.
   - DevTools Network: ZERO POST request fired.

4. **Confirm sends exactly one POST**
   - Open modal again.
   - Click "ยืนยัน Confirm".
   - DevTools Network: exactly one `POST /api/sale/bookings/{id}/confirm` request.
   - Request payload is `{}` (empty body — bookingId is in the URL).
   - Spinner appears in submit button during inflight.

5. **Success path**
   - On 200 + `success: true`:
     - Modal closes automatically.
     - sonner toast: "Confirm สำเร็จ — booking ถูกยืนยันและจองสต็อกแล้ว".
     - Product Codes panel re-fetches → stock count on that variant drops by `quantity` (reservedQty++; quantity unchanged).
     - Customer Bookings panel re-fetches → that row flips from PENDING badge → CONFIRMED (green).
     - The Confirm button disappears from that row (no longer eligible).

6. **Idempotent replay path**
   - If you click Confirm on a row that is already CONFIRMED (e.g. via a stale tab + race condition), the server returns the idempotent success. Modal closes, success toast fires, no double-decrement.
   - Verify by clicking Confirm on the same row twice rapidly: only one stock decrement should appear.

7. **Error paths — inline rendering inside modal**
   - Modal stays open on any error. Admin keeps context.

   | Server case | HTTP | Inline message (Thai) |
   |---|---|---|
   | Session expired mid-modal | 401 | `ต้อง sign-in ก่อน` + `เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่` |
   | CHAT_SUPPORT clicked direct API | 403 | `ไม่มีสิทธิ์ Confirm` + `บัญชีนี้ห้าม confirm (CHAT_SUPPORT)` |
   | Stock changed between fetch + click → not enough | 409 | `Confirm ไม่ได้` + `สถานะ booking ไม่ถูกต้องหรือ stock ไม่พอ` |
   | BroadcastProduct lost variantId | 422 | `ข้อมูล booking ไม่ครบ` + `BroadcastProduct ไม่มี variant` |
   | Rate limit tripped | 429 | `ส่งคำสั่งถี่เกินไป` + `กรุณารอประมาณ {Retry-After} วินาทีแล้วลองใหม่อีกครั้ง` |
   | Reservation corruption surfaces server-side | 500 | `เซิร์ฟเวอร์มีปัญหา integrity` + `กรุณาแจ้ง admin ตรวจสอบข้อมูล booking` |
   | Network failure | — | `การเชื่อมต่อขัดข้อง` + `{err.message}` |

8. **No customer-facing message**
   - DevTools Network: confirm there is NO outbound request to Messenger / WhatsApp / Telegram / email APIs after a successful Confirm. The mutation only updates internal Booking + StockReservation + BookingHistory.

9. **Cancel + Create Order buttons remain disabled**
   - Below the booking list, two outline buttons appear: "Cancel / ยกเลิก — ยังไม่เปิดใช้งาน" and "Bulk Confirm — ปิดเฟสนี้".
   - Click each — no action, no network request.

10. **WAREHOUSE / CUSTOMER cannot Confirm (server-side gate)**
    - If you have a WAREHOUSE or CUSTOMER session, `/sale` middleware redirects you away. Direct curl with that session cookie against the POST should return 403. **DO NOT actually run that probe against production data; rely on the route-level vitest (Commit 2T) which covers this case.**

## Pass criteria (Confirm mutation)

The Confirm path is considered manually verified when all of:

- ✅ Confirm button appears only for confirmable rows (per `isBookingConfirmable` rules).
- ✅ Modal summary matches row data.
- ✅ Cancel-in-modal fires zero POST.
- ✅ Successful Confirm closes modal + shows toast + refetches panels.
- ✅ Error paths render inline inside modal; modal stays open.
- ✅ 429 includes parsed `Retry-After` wait time.
- ✅ Create Order + Manual Create still disabled (no UI affordance).
- ✅ No customer-facing message generated by Confirm action.

## Mutation steps — Cancel button (added Commit 2O-b)

Verify with a real OWNER or MANAGER admin session. CHAT_SUPPORT must NOT be able to fire Cancel; if you have a CHAT_SUPPORT account, separately verify the 403 path.

**Prep:** ensure at least one CONFIRMED booking exists in the auto-selected live session. Convenient approach: first run the Confirm flow above so a fresh CONFIRMED row is available.

1. **Cancel button visibility**
   - CONFIRMED + reservationIntegrity OK / NOT_APPLICABLE / undefined → Cancel button visible inline on the row (small destructive variant with x-circle icon).
   - CONFIRMED + MISSING → Cancel button HIDDEN; amber INTEGRITY badge shown instead.
   - CONFIRMED + MULTIPLE → Cancel button HIDDEN; red INTEGRITY badge shown.
   - PENDING_REVIEW → Cancel button NEVER visible (Confirm button shows instead).
   - CANCELLED / EXPIRED / CONVERTED_TO_ORDER → Cancel button NEVER visible.
   - Mutual exclusivity: no single row ever shows BOTH Confirm and Cancel.

2. **Modal opens with correct summary**
   - Click Cancel on a row.
   - Modal opens. Header reads "ยกเลิกการจอง".
   - Description includes "คืนสต็อก (reservedQty -{quantity})".
   - Summary table shows:
     - Booking (id prefix, first 12 chars + ellipsis)
     - Code (displayCode)
     - ลูกค้า (customer name)
     - จำนวน (×quantity)
     - ราคาต่อชิ้น (RM unitPrice)
     - Reservation (last 6 chars of activeReservationId, when present)
   - Required reason `Textarea` visible with `*` marker and placeholder "เช่น ลูกค้ายกเลิก / สินค้าหมด / ส่งไม่ได้ ...".
   - Character counter shows `0 / 200`.
   - Footer: "ยกเลิกการกด" (outline) + "ยืนยันยกเลิก" (destructive).

3. **Reason validation**
   - Type 0 chars → "ยืนยันยกเลิก" button disabled. Helper shows "อย่างน้อย 3 ตัวอักษร".
   - Type 1-2 chars → button still disabled.
   - Type leading/trailing spaces only → still disabled (trim applied before validation).
   - Type 3+ valid chars → button enables. Helper shows "ok".
   - Try pasting > 200 chars → `maxLength` on textarea blocks at 200 (browser-level).

4. **Close-in-modal sends no POST**
   - Open modal, type reason, click "ยกเลิกการกด".
   - Modal closes.
   - DevTools Network: ZERO POST request fired. Reason cleared from state (re-open modal — textarea empty).

5. **Submit sends exactly one POST**
   - Open modal again. Type valid reason. Click "ยืนยันยกเลิก".
   - DevTools Network: exactly one `POST /api/sale/bookings/{id}/cancel`.
   - Request payload is `{"targetStatus":"CANCELLED","reason":"<trimmed reason>"}`.
   - `targetStatus` is hard-coded "CANCELLED" — verify it never says "EXPIRED" in payload.
   - Spinner appears in submit button during inflight.

6. **Success path**
   - On 200 + `success: true`:
     - Modal closes automatically. Reason input cleared.
     - sonner toast: "ยกเลิกสำเร็จ — คืน {releasedQuantity} ชิ้นสู่ stock".
     - Product Codes panel re-fetches → stock count on that variant rises by `quantity` (reservedQty--; quantity unchanged).
     - Customer Bookings panel re-fetches → that row flips from CONFIRMED badge → CANCELLED (strikethrough).
     - Cancel button disappears from that row (no longer eligible). Row stays visible but read-only.

7. **Error paths — inline rendering inside modal**
   - Modal stays open on any error. Reason is preserved.

   | Server case | HTTP | Inline message (Thai) |
   |---|---|---|
   | Session expired mid-modal | 401 | `ต้อง sign-in ก่อน` + `เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่` |
   | CHAT_SUPPORT clicked direct API | 403 | `ไม่มีสิทธิ์ยกเลิก` + `บัญชีนี้ห้ามยกเลิก booking` |
   | reason missing/malformed on the wire (shouldn't happen with client validation) | 400 | `ข้อมูลไม่ถูกต้อง` + `reason ไม่ถูกต้อง` |
   | Booking already CANCELLED by another tab / convert-to-order race | 409 | `ยกเลิกไม่ได้` + `สถานะ booking ไม่ใช่ CONFIRMED แล้ว หรือมีการเปลี่ยนแปลงจากหน้าต่างอื่น กรุณาโหลดข้อมูลใหม่` |
   | BroadcastProduct lost variantId mid-flight | 422 | `ข้อมูล booking ไม่ครบ` |
   | Rate limit tripped | 429 | `ส่งคำสั่งถี่เกินไป` + `กรุณารอประมาณ {Retry-After} วินาทีแล้วลองใหม่อีกครั้ง` |
   | Reservation MISSING/MULTIPLE surfaces server-side at release time | 500 | `เซิร์ฟเวอร์มีปัญหา integrity` + `กรุณาแจ้ง admin ตรวจสอบข้อมูล booking` |
   | Network failure | — | `การเชื่อมต่อขัดข้อง` + `{err.message}` |

8. **No customer-facing message**
   - DevTools Network: confirm there is NO outbound request to Messenger / WhatsApp / Telegram / email APIs after a successful Cancel. The mutation only updates internal Booking + StockReservation + BookingHistory.

9. **Confirm + Create Order + Manual Create unchanged**
   - Confirm button still appears + works on PENDING_REVIEW rows.
   - "Bulk Confirm" + "Create Order" buttons below the booking list remain `<Button disabled>`.

10. **WAREHOUSE / CUSTOMER cannot Cancel (server-side gate)**
    - If you have a WAREHOUSE or CUSTOMER session, `/sale` middleware redirects you away. Direct curl with that session cookie against the POST should return 403. **DO NOT actually run that probe against production data; rely on the route-level vitest (Commit 2T equivalent for cancel route — same RBAC matrix).**

## Pass criteria (Cancel mutation)

The Cancel path is considered manually verified when all of:

- ✅ Cancel button appears only for cancellable rows (per `isBookingCancellable` rules).
- ✅ Modal summary matches row data + shows reservation suffix when present.
- ✅ Required reason validation blocks submit < 3 chars.
- ✅ Close-in-modal fires zero POST and clears reason.
- ✅ Submit fires exactly one POST with `targetStatus=CANCELLED` (never EXPIRED).
- ✅ Successful Cancel closes modal + shows toast + refetches panels + flips row to CANCELLED.
- ✅ Error paths render inline; modal stays open; reason preserved.
- ✅ 429 includes parsed `Retry-After` wait time.
- ✅ Confirm button still works on PENDING_REVIEW rows.
- ✅ Create Order strip (2O-c1) is visible but the button is non-mutating.
- ✅ Manual Create still disabled.
- ✅ No customer-facing message generated by Cancel action.

## Selection steps — Create Order strip (added Commit 2O-c1, non-mutating)

The Booking Queue panel now shows a "Create Order" strip below the row list. The strip lets admin tick eligible CONFIRMED rows toward a future conversion. **No POST fires from 2O-c1.** Submit is a sonner-toast placeholder until 2O-c2 wires the dialog + route call.

1. **Checkbox visibility per row**
   - CONFIRMED + reservationIntegrity OK / NOT_APPLICABLE / undefined → Checkbox visible.
   - CONFIRMED + MISSING / MULTIPLE → Checkbox HIDDEN (integrity badge shows instead).
   - PENDING_REVIEW / CANCELLED / EXPIRED / CONVERTED_TO_ORDER → Checkbox NEVER visible. Confirm/Cancel buttons govern those rows.
   - Eligibility helper: `isBookingSelectable(row)` — bit-identical to `isBookingCancellable(row)`.

2. **Empty selection initial state**
   - "Create Order" strip shows: `Create Order: 0 รายการที่เลือก`.
   - Button label: `Create Order (0)`. Disabled. Outline variant.
   - No `ล้างการเลือก` link visible.

3. **First selection locks customer + session context**
   - Tick the checkbox on a CONFIRMED row.
   - Row gains primary-color border + tint background.
   - Strip count updates to `1 รายการที่เลือก`.
   - Button enables with primary variant: `Create Order (1)`.
   - `ล้างการเลือก` link appears next to the count.
   - All other rows: any row that does NOT belong to the same `(customerId, liveSessionId)` shows its checkbox visibly disabled with tooltip "เลือกได้เฉพาะลูกค้าและรอบไลฟ์เดียวกัน".

4. **In-context selection adds**
   - Tick another CONFIRMED row that shares the same customer + session.
   - Count increases. Row highlights.
   - Out-of-context rows remain disabled.

5. **Untick reduces count**
   - Untick a selected row.
   - Count decreases. Row reverts to default border.
   - When count reaches 0: lock releases, all CONFIRMED+integrity-clean rows re-enable their checkboxes regardless of customer/session.

6. **Selected row's Cancel button is locked**
   - On a row that is currently in `selectedIds`, the Cancel button still renders but is disabled with tooltip "ยกเลิกเลือกก่อนถึงจะ Cancel ได้".
   - Untick the row → Cancel re-enables. This prevents admin from releasing stock under a row marked for conversion.

7. **Confirm button unaffected**
   - Confirm button on PENDING_REVIEW rows continues to work normally. Selection state does not interact with Confirm flow.

8. **`ล้างการเลือก` link clears all**
   - Click the link → `selectedIds` resets to empty Set → lock releases → all out-of-context rows re-enable.

9. **Create Order button — NON-MUTATING in 2O-c1**
   - Click `Create Order ({count})` with ≥1 selected.
   - Sonner toast appears: title `Create Order — รอ 2O-c2` + description showing the selection size + lock customer/session prefix.
   - **DevTools Network: ZERO POST request fires.** No fetch, no XHR.
   - Mutation grep on src/components/sale + src/app/(app)/sale should still show exactly 2 POST method strings (ConfirmBookingDialog + CancelBookingDialog only).

10. **Refetch interaction**
    - If admin triggers Confirm or Cancel on an unrelated row mid-selection, the booking panel re-fetches. Selection state is preserved across refetch (selectedIds is stable; only state.bookings changes).
    - If a refetch returns rows where a previously-selected booking no longer exists (e.g. it flipped to CONVERTED_TO_ORDER server-side somehow), the lock derivation still works on the remaining selected rows. The missing booking is silently dropped from the lock context.

## Pass criteria (Create Order selection — 2O-c1 only)

The selection path is considered manually verified when all of:

- ✅ Checkbox renders ONLY on CONFIRMED + integrity-clean rows.
- ✅ First selection locks customer + session context.
- ✅ Out-of-context checkboxes show disabled state + tooltip.
- ✅ Selected rows show visible highlight (border + tint).
- ✅ Cancel button on selected rows is disabled with tooltip.
- ✅ Confirm button on PENDING_REVIEW rows is unaffected.
- ✅ `Create Order (N)` button enables when N ≥ 1.
- ✅ Click on enabled button fires sonner toast and **ZERO POST**.
- ✅ `ล้างการเลือก` link clears selection + unlocks context.
- ✅ Mutation grep on sale UI shows EXACTLY 2 POST sites (Confirm + Cancel) — no third POST introduced by 2O-c1.

## Mutation steps — Create Order dialog (added Commit 2O-c2)

Verify with a real OWNER or MANAGER admin session. CHAT_SUPPORT must NOT be able to fire Create Order; route returns 403 server-side regardless of UI state.

**Prep:** select ≥2 CONFIRMED + integrity-clean bookings from the SAME customer + same live session (lock context active). If only 1 row available, single-row conversion also valid.

1. **Create Order button opens modal**
   - Click `สร้างออเดอร์ (N)` button at bottom of Booking Queue panel.
   - Modal opens. Title: `สร้างออเดอร์จากรายการจอง`.
   - Description shows count + warns about CONVERTED_TO_ORDER status flip.

2. **Modal summary matches selected rows**
   - Identity block shows: ลูกค้า (customer name) / Customer (id prefix 12 chars) / Session (id prefix 12 chars).
   - Summary table: one row per selected booking with displayCode + product/variant name + qty + unit price + line total.
   - Scrollable when rows > visible area.
   - Grand Total row shows `RM{sum}`.
   - Note block (amber) lists 4 Phase-1 constraints: status flips to CONVERTED_TO_ORDER, NO paid mark, NO customer message, Order created in RESERVED state.

3. **Cancel-in-modal sends no POST**
   - Click `ยกเลิก` footer button.
   - Modal closes. Selection state PRESERVED (Create Order strip still shows count). Admin can re-open or refine selection.
   - DevTools Network: ZERO POST fired.

4. **Submit sends exactly one POST**
   - Re-open modal. Click `ยืนยันสร้างออเดอร์ (N)` (destructive variant disabled-during-inflight).
   - DevTools Network: exactly one `POST /api/sale/orders/from-bookings`.
   - Request payload:
     ```
     {
       "liveSessionId": "<locked session id>",
       "customerId": "<locked customer id>",
       "bookingIds": ["...selectedIds in selection order"]
     }
     ```
   - Spinner appears in submit button during inflight.

5. **Success path**
   - On 200 + `success: true`:
     - Modal closes automatically.
     - sonner toast: `สร้างออเดอร์สำเร็จ — Order #ORD-NNNNNN`.
     - **selectedIds cleared** → Create Order strip count returns to 0.
     - Booking queue refetches → rows that were converted now show CONVERTED badge (blue, no strikethrough) instead of CONFIRMED. Cancel + Confirm + Select all gone from those rows.
     - Product Codes panel also refetches (refetch token bumps) — `reservedQty` unchanged (Option A — reservation transferred to order, not released).

6. **Idempotent replay**
   - If admin double-clicks Create Order within 1s, second request hits server-side idempotency key.
   - Server returns same Order with `idempotent: true`.
   - Toast wording switches to `ออเดอร์อยู่แล้ว — Order #ORD-NNNNNN`.
   - No duplicate Order created.

7. **Error paths — inline rendering**
   - Modal stays open. Selection preserved.

   | Server case | HTTP | Inline message (Thai) |
   |---|---|---|
   | Session expired mid-modal | 401 | `ต้อง sign-in ก่อน` + `เซสชันหมดอายุ ...` |
   | CHAT_SUPPORT direct API | 403 | `ไม่มีสิทธิ์สร้างออเดอร์` + `(เฉพาะ OWNER/MANAGER)` |
   | Mid-flight: cross-tab status flip on one of the bookingIds | 409 | `สร้างออเดอร์ไม่ได้` + `booking บางรายการอาจถูกเปลี่ยนสถานะแล้ว กรุณาโหลดข้อมูลใหม่` |
   | Validation (empty bookingIds / over 100 / empty session/customer id) — shouldn't happen with UI gates | 400 | `ข้อมูลไม่ถูกต้อง` + `กรุณาตรวจรายการที่เลือก` |
   | BroadcastProduct lost variantId mid-flight | 422 | `ข้อมูล booking ไม่ครบ` |
   | Rate limit | 429 | `ส่งคำสั่งถี่เกินไป` + `กรุณารอประมาณ {Retry-After} วินาที...` |
   | Reservation integrity / unknown server error | 500 | `เซิร์ฟเวอร์มีปัญหา` + `กรุณาแจ้ง admin ...` |
   | Network failure | — | `การเชื่อมต่อขัดข้อง` + `{err.message}` |

8. **No customer-facing message**
   - DevTools Network: confirm NO outbound request to Messenger / WhatsApp / Telegram / email APIs after a successful Create Order.

9. **No payment / shipment action**
   - DevTools Network: no POST to `/api/orders/[id]/payment`, no POST to `/api/orders/[id]/shipment`. Order lands in RESERVED state only.

10. **Other actions unchanged**
    - Confirm button on PENDING_REVIEW rows still works.
    - Cancel button on CONFIRMED rows (not in selection) still works.
    - Manual Create + Bulk actions still disabled.

## Pass criteria (Create Order mutation — 2O-c2)

The Create Order path is considered manually verified when all of:

- ✅ Modal opens with correct selection summary + grand total.
- ✅ Cancel-in-modal fires zero POST + preserves selection.
- ✅ Submit fires exactly one `POST /api/sale/orders/from-bookings`.
- ✅ Successful Create Order closes modal + clears selection + shows toast with Order number + refetches panels.
- ✅ Converted rows show CONVERTED badge after refetch; selectable/confirmable/cancellable all hidden.
- ✅ Error paths render inline; modal stays open; selection preserved.
- ✅ 429 includes parsed `Retry-After` wait time.
- ✅ Idempotent replay toast distinguishes "already exists" from "newly created".
- ✅ Confirm + Cancel buttons still work normally.
- ✅ NO customer-facing message generated.
- ✅ NO payment/shipment action triggered.
- ✅ Mutation grep on sale UI shows EXACTLY 3 POST sites (Confirm + Cancel + CreateOrder).

## Customer Panel — live data (added 2026-05-12)

The Customer Panel now reads from `GET /api/customers/[id]`. No new sale-namespaced API; reuses the existing admin route. Selection comes from clicking the customer name link in a Booking Queue row.

1. **Empty initial state**
   - On `/sale` load, Customer Panel shows: "ยังไม่ได้เลือก — คลิกชื่อลูกค้าในแถวรายการจอง". Placeholder variant pill.

2. **Click selects customer**
   - In Booking Queue, customer name is rendered as a `<button>` with underline-on-hover. Title tooltip "คลิกเพื่อดูข้อมูลลูกค้า".
   - Click does NOT toggle the checkbox or trigger Confirm/Cancel.
   - Customer Panel switches to loading state with subtitle "กำลังโหลด: {hint}" using the row's customer name for instant context.

3. **Loaded state**
   - Customer Panel renders: name, phone (mono), email, ACTIVE/BANNED badge, bannedReason if banned, Shipping type, Order count, Lifetime value (RM).
   - Edit button stays `<Button disabled>` (no mutation in this phase).
   - Footer note: "Address / labels / notes — ดูใน /customers" directs admin to /customers page for richer data.

4. **DevTools Network probe**
   - Click flow fires exactly one `GET /api/customers/{id}`. No POST. No PUT. No DELETE.

5. **Cross-shop safety**
   - Cross-shop customer id (manipulated URL/cookie scenario) → server returns 404 → Customer Panel shows error message.

6. **PII guardrails**
   - Address fields (street/district/province/postalCode), labels, notes, raw FB identifiers NOT shown.
   - Email shown only when present.
   - bannedReason shown only when isBanned=true.

7. **Cancel button gating unchanged**
   - Clicking customer name on a row already in the Create Order selection does NOT alter the selection or unlock the customer/session lock.

## Pass criteria (Customer Panel)

- ✅ Empty state until first click.
- ✅ Click on customer name fires single GET, populates panel.
- ✅ Banned customer shows BANNED badge + reason.
- ✅ Order count + lifetime value render.
- ✅ Address / notes / labels not exposed.
- ✅ Cross-shop id → 404 → error message.
- ✅ Edit button stays disabled.
- ✅ No POST/PUT/DELETE fired by Customer Panel.

## After this checklist passes

Boss + ChatGPT decide whether to proceed to:
- 2O-d Manual Create modal (requires GET customers list + GET products by code)
- Per-session booking-count enrichment on Customer Panel
- ORDER-RESERVATION-CLEANUP Commit 2 historical backfill (run after Commits 1+3 stable ≥1 week)
- TEST-CLEANUP (per-route vitest expansion now partly addressed)

## Refs

- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Handoff index: [docs/superpowers/handoffs/README.md](handoffs/README.md)
- Latest handoff: [2026-05-11-resume-after-sale-shell.md](handoffs/2026-05-11-resume-after-sale-shell.md)
