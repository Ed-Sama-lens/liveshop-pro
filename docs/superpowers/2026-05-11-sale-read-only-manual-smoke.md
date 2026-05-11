# /sale read-only manual smoke checklist (living doc)

**Status:** LIVING — update in place when /sale read-only surface changes. Do NOT create a new dated checklist per commit. Add a row to the changelog table below instead.

**Scope:** Authenticated browser smoke of the /sale workspace while the page is still read-only. Performed by Boss; Claude cannot perform browser login automation against production. Captures what is automated vs what still requires a human session.

**Drop this doc when:** the first mutation button (Commit 2O-a Confirm) lands. From there, a separate mutation smoke doc takes over.

## Changelog

Most recent on top. Bump when the checklist needs new steps (new field surfaced, new panel, new API response shape).

| Date | Commit | Change |
|---|---|---|
| 2026-05-11 | 2U (this commit) | Add integrity-badge visual checks (reservation MISSING/MULTIPLE; filteredInvalidCount panel warning). Doc converted to living format. |
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

## Pass criteria

The /sale read-only shell is considered manually verified when all of:

- ✅ Page renders for OWNER / MANAGER / CHAT_SUPPORT without crash.
- ✅ Only GET fetches against `/api/sale/*` appear in network log.
- ✅ Auto-selection picks LIVE > SCHEDULED > first row.
- ✅ Empty states render when no data is present.
- ✅ All action buttons remain disabled.
- ✅ WAREHOUSE cannot access `/sale` (middleware redirect).
- ✅ No 500 in production deployment logs from /sale traffic.

## After this checklist passes

Boss + ChatGPT decide whether to proceed to:
- 2O-a Confirm button mutation wiring (requires `RATE_LIMIT_MAX=60` Vercel env decision first)
- Read-API gap filling (`GET /api/sale/customers/[id]`, session aggregates)
- TEST-CLEANUP (per-route vitest expansion already partly addressed by 2T)

## Refs

- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Handoff index: [docs/superpowers/handoffs/README.md](handoffs/README.md)
- Latest handoff: [2026-05-11-resume-after-sale-shell.md](handoffs/2026-05-11-resume-after-sale-shell.md)
