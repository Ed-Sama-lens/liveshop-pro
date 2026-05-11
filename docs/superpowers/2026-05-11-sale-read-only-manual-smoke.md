# /sale manual smoke checklist (living doc)

**Status:** LIVING — update in place when /sale surface changes. Do NOT create a new dated checklist per commit. Add a row to the changelog table below instead.

**Scope:** Authenticated browser smoke of the /sale workspace. Performed by Boss; Claude cannot perform browser login automation against production. Captures what is automated vs what still requires a human session.

**Note 2O-a (mutation era begins):** As of Commit 2O-a the Confirm button is wired to POST `/api/sale/bookings/[id]/confirm`. This doc has been extended (not replaced) with mutation steps. Cancel + Create Order remain disabled — when those ship, add corresponding sections instead of creating a new doc.

## Changelog

Most recent on top. Bump when the checklist needs new steps (new field surfaced, new panel, new API response shape).

| Date | Commit | Change |
|---|---|---|
| 2026-05-11 | 2O-a.1 (this commit) | First mutation (Confirm) UI smoke section. `isBookingConfirmable` 26-case unit test landed. |
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
- ✅ Cancel + Create Order + Manual Create still disabled (no UI affordance).
- ✅ No customer-facing message generated by Confirm action.

## After this checklist passes

Boss + ChatGPT decide whether to proceed to:
- 2O-b Cancel button (after `RATE_LIMIT_MAX=60` Vercel env decision + Step 1 acceptance)
- 2O-c Create Order multi-select (larger scope)
- 2O-d Manual Create modal (requires GET customers + GET products by code)
- Read-API gap filling (`GET /api/sale/customers/[id]`, session aggregates)
- TEST-CLEANUP (per-route vitest expansion already partly addressed by 2T)

## Refs

- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Handoff index: [docs/superpowers/handoffs/README.md](handoffs/README.md)
- Latest handoff: [2026-05-11-resume-after-sale-shell.md](handoffs/2026-05-11-resume-after-sale-shell.md)
