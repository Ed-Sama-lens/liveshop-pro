# Boss-side D4/D6 functional smoke — visual / step-by-step guide

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
**Purpose:** Click-by-click execution guide so Boss can run D4/D6 functional smoke alone, with zero ambiguity, and capture all IDs needed for Claude to verify.

This file is a companion to the checklist — the checklist names the steps, this file shows exactly what to click, what to type, what to read off the screen, and how to interpret each response.

---

## Why this guide exists

Claude cannot:
- Use Boss credentials
- Read Boss cookies / storageState
- Run authenticated POST against production
- See the admin UI

Boss must run the functional smoke manually. The smoke validates:

- **D4** (`ALLOW_NON_LIVE_BOOKING=true`) — non-live MANUAL booking path
- **D6** (`ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`) — evergreen BroadcastProduct path (no liveSessionId)
- **D3** (`ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`) — V2 conversion path using bookingIds only

The flags must all be ON in Vercel Production. The smoke validates that the *behavior* matches the flag state, not just that the flags are set.

---

## STAGE 0 — Setup (~5 min)

### 0.1 Open tools

1. Open **Chrome** (or Edge/Firefox).
2. Press `Ctrl+Shift+N` → open an **Incognito window**.
   - Reason: cuts cache + extensions. Cleanest result.
3. In the Incognito tab → navigate to `https://nazhahatyai.com/auth/sign-in`.

### 0.2 Open DevTools (critical — used to capture IDs)

1. Press **F12** (or `Ctrl+Shift+I`).
2. Switch to the **Network** tab.
3. Tick **Preserve log** (small checkbox at the top). If unchecked, requests disappear on navigation.
4. In the filter box, type `sale` → filters to `/api/sale/*` only. Cleaner view.
5. **Do not close DevTools until Stage G ends.**

### 0.3 Open a notepad

Open `notepad.exe` or Notion. Paste this template:

```
=== D4/D6 SMOKE LOG <YYYY-MM-DD> ===
Master HEAD: 6ad8483 (or newer after Track 1 PR merge)
Flags assumed ON: D3 / D4 / D6

[Step A] BroadcastProduct
  displayCode: ___________
  broadcastProductId: ___________
  variant chosen: ___________
  evergreen? (liveSessionId == null): ___________
  screenshot file: ___________

[Step B] Edit BP
  priceOverride: 9.99
  isPinned: true
  PATCH 200? ___________
  screenshot before: ___________
  screenshot after: ___________

[Step C] Booking #1
  bookingId: ___________
  source: MANUAL
  liveSessionId: ___________ (expect null)
  status: PENDING_REVIEW

[Step D] Confirm Booking #1
  status now: CONFIRMED
  reservedQty in /inventory: ___________
  screenshot: ___________

[Step E] Booking #2 (cancel test, optional)
  bookingId: ___________
  status now: CANCELLED
  reservedQty after cancel: ___________ (expect still 1)

[Step F] Convert to Order
  method used: per-row OR DevTools console
  orderId: ___________
  orderNumber: ___________
  totalAmount: RM ___________
  REPLAY idempotent? ___________ (expect TRUE)
  REPLAY same orderId? ___________ (expect YES)

[Step G] Final check
  /sale BP still pinned + RM9.99: ___________
  /sale booking status CONVERTED_TO_ORDER: ___________
  /orders shows new RESERVED order: ___________
  /inventory reservedQty: ___________
```

### 0.4 Login

1. Email + password for the OWNER (Boss) account.
2. Click login.
3. Dashboard must load. If you bounce back to sign-in → password wrong, or session expired. Try again.

### 0.5 Flag state confirmation

Vercel marks these env vars **Sensitive**, so the value is not visible in the UI. Boss must instead test behavior via three authenticated DevTools Console probes.

In the admin tab (logged in), open DevTools → Console. Paste each block; check the response.

#### Test 1 — `ALLOW_EVERGREEN_BROADCAST_PRODUCT`

```javascript
fetch('/api/sale/broadcast-products', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    productVariantId: 'PROBE_INVALID_ID',
    displayCode: 'FLAG-PROBE-D6',
  })
}).then(async r => ({ status: r.status, body: await r.json() })).then(o => console.log(JSON.stringify(o, null, 2)));
```

| Response | Verdict |
|---|---|
| `400` + body contains `Evergreen broadcast products are not enabled` | **D6 = false** ❌ stop |
| `404` + body says `ProductVariant not found` | **D6 = true** ✅ flag passes, lookup correctly fails on invalid ID |
| `400` + Zod validation error | flag passed schema layer; behavior intact |
| `500` | server error → stop, report |

#### Test 2 — `ALLOW_NON_LIVE_BOOKING`

```javascript
fetch('/api/sale/bookings', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    broadcastProductId: 'PROBE_INVALID_ID',
    customerId: 'PROBE_INVALID_ID',
    quantity: 1,
    source: 'MANUAL',
  })
}).then(async r => ({ status: r.status, body: await r.json() })).then(o => console.log(JSON.stringify(o, null, 2)));
```

| Response | Verdict |
|---|---|
| `400` + `Non-live bookings are not enabled` | **D4 = false** ❌ |
| `404` + `BroadcastProduct not found` | **D4 = true** ✅ |
| `400` Zod error | passes flag layer |
| `500` | stop |

#### Test 3 — `ALLOW_BOOKINGIDS_ONLY_CONVERSION`

```javascript
fetch('/api/sale/orders/from-bookings', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    bookingIds: ['PROBE_INVALID_ID']
  })
}).then(async r => ({ status: r.status, body: await r.json() })).then(o => console.log(JSON.stringify(o, null, 2)));
```

| Response | Verdict |
|---|---|
| `400` + `bookingIds-only conversion is not enabled` | **D3 = false** ❌ |
| `404` + `bookings not found` or similar | **D3 = true** ✅ |
| `400` Zod | passes flag layer |
| `500` | stop |

If all three probes confirm flags ON → proceed to Stage 0.6. If any flag returns the disabled error → flip on Vercel, wait for redeploy, re-probe.

### 0.6 Pre-flight `/sale`

1. In admin tab → click sidebar `ขายของไลฟ์สด` (Tier 1.5 entry), or go to `https://nazhahatyai.com/sale`.
2. Verify page loads with:
   - Header: `ขายของไลฟ์สด`
   - Subtitle: `จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง`
   - Outline button top-right: `จัดการรอบไลฟ์`
   - Source filter chips: ALL / ไลฟ์สด / Inbox / Post Comment / Manual / Telegram / WhatsApp
   - Row 1: Product Codes + Booking Queue
   - Row 2: Customer Panel + Order Conversion
   - Row 3: collapsible `<details>` Live Sessions + Inbox
3. If layout broken or any panel errors → STOP, report to Claude.

---

## STAGE A — Create Product Code (~5 min)

### A.1 Open Add-from-Stock dialog

1. Find **Product Codes** panel (row 1 left).
2. Scroll to the bottom → click **`+ เพิ่มสินค้าจาก Stock`**.
3. Dialog `เพิ่มรหัสสินค้าจาก Stock` opens.

### A.2 Search a variant

1. Search field → type at least 2 characters matching an existing ProductVariant.
   - Production has 2 ProductVariants. If you forget the names, open `/inventory` in a separate tab first.
2. Wait ~300 ms (debounce).
3. Results appear → click one. Tile highlights.

### A.3 Display Code + price

1. Display Code field → type `TEST-D6-001`.
2. `ราคาพิเศษ` → leave blank.
3. Confirm DevTools Network is open + Preserve log ticked.
4. Click **`บันทึก`**.

### A.4 Capture ID from Network

1. DevTools Network → top entry is **POST `/api/sale/broadcast-products`**.
2. Click it → Response tab.
3. Find `data.broadcastProductId` or `data.id` (cuid format `cm...`).
4. Paste into notepad Stage A.

### A.5 Verify UI

- Dialog closes.
- Product Codes panel refreshes.
- New tile `TEST-D6-001` visible.
- Screenshot the panel (`Win+Shift+S`).

### A.6 Error decoding

| HTTP | Error body | Cause | Action |
|---|---|---|---|
| 400 | `Evergreen broadcast products are not enabled` | D6 OFF | STOP, flip Vercel env |
| 409 | `duplicate displayCode` or `Live-bound product code already exists` | code in use | retry `TEST-D6-002`, `-003`, ... |
| 404 | `ProductVariant not found in this shop` | wrong variant / cross-shop | re-select |
| 500 | server | STOP, screenshot, report |

---

## STAGE B — Edit Product Code (~3 min)

### B.1 Open edit dialog

1. Click the `TEST-D6-001` tile in Product Codes.
2. Dialog `แก้ไขรหัสสินค้า` opens (Tier 3.6, PR #12).

### B.2 Read-only context

Top of dialog must show: product name, SKU, available stock, variant price.

### B.3 Edit

1. `ราคาพิเศษ` → clear + type `9.99`.
2. `ปักหมุดที่ด้านบน` (Pin icon toggle) → click ON (active).
3. Screenshot before save.
4. Click `บันทึก`.

### B.4 Network verification

1. Network tab → **PATCH `/api/sale/broadcast-products/<id>`**.
2. Status: 200.
3. Response: `data.unitPrice === "9.99"`, `data.isPinned === true`.

### B.5 UI verification

- Dialog closes.
- Tile shows **RM9.99** (NOT THB, NOT ฿).
- Tile pinned to top of grid.
- Screenshot.

### B.6 Optional clear-price test

- Re-open edit dialog → clear `ราคาพิเศษ` → save.
- Tile reverts to variant base price.
- Re-set 9.99 before Stage C/F (totals depend on it).

### B.7 Error decoding

| HTTP | Cause | Action |
|---|---|---|
| 400 `priceOverride must be a decimal with up to 2 places` | format wrong | enter `9.99` exactly |
| 409 `active booking conflict` | should not happen on fresh BP | STOP, report |
| 500 | server | STOP |

---

## STAGE C — Create Manual Booking #1 (~3 min)

### C.1 Open dialog

1. Booking Queue panel (row 1 right).
2. Empty state → button `+ สร้าง booking เอง (Manual Create — PENDING_REVIEW)`.
3. Non-empty state → same button in panel header.
4. Dialog `สร้างการจองด้วยตนเอง` opens.

### C.2 Fill

1. Customer → search `Warut Thaworn` (Boss test customer). Select.
2. Product → select `TEST-D6-001`.
3. Quantity → `1`.
4. Status → leave default `PENDING_REVIEW`.
5. Submit.

### C.3 Capture

1. Network → **POST `/api/sale/bookings`** → 201.
2. Response:
   - `data.bookingId` (`cm...`)
   - `data.liveSessionId === null` (evergreen path)
   - `data.source === "MANUAL"`
3. Notepad.

### C.4 UI

- New row in Booking Queue.
- Chip `สร้างเอง` (gray) on row.
- Status badge `PENDING_REVIEW`.

### C.5 Errors

| HTTP | Cause |
|---|---|
| 400 `Non-live bookings are not enabled` | D4 OFF |
| 400 `Evergreen broadcast products are not enabled` | D6 OFF |
| 404 `BroadcastProduct not found` | BP ID wrong (re-check Stage A) |
| 409 cross-shop | wrong customer or BP shop |

---

## STAGE D — Confirm Booking #1 (~3 min)

### D.1 Confirm action

1. On PENDING_REVIEW row → click `Confirm`.
2. Confirmation dialog → confirm.
3. Status flips to **CONFIRMED**.

### D.2 Capture

- Network → **POST `/api/sale/bookings/<id>/confirm`** → 200.
- Response `data.status === "CONFIRMED"`.
- Reservation badge `OK` visible.

### D.3 reservedQty check

1. Open a new tab (do not close `/sale`): `https://nazhahatyai.com/inventory`.
2. Find the variant used.
3. Column **Reserved** must = `1`.
4. Available decreased by 1.
5. Screenshot. Notepad.

### D.4 Errors

| HTTP | Cause | Action |
|---|---|---|
| 409 `INSUFFICIENT_STOCK` | variant stock < 1 | pick another variant, restart Stage A |
| 409 `RESERVATION_INTEGRITY_ERROR` | data corruption | STOP, report |

---

## STAGE E — Optional cancel test (~5 min, skippable)

### E.1 Booking #2

Repeat Stage C exactly with the same customer + `TEST-D6-001` + qty 1 + PENDING_REVIEW. Capture booking #2 ID.

### E.2 Cancel

1. Row #2 → `Cancel` button.
2. Reason: `D4/D6 smoke test`.
3. Confirm.
4. Status flips to **CANCELLED**.

### E.3 Reservation behavior

1. Back to `/inventory` tab → refresh.
2. Reserved must still = `1` (booking #1 still CONFIRMED; booking #2 cancel released its reservation).
3. If Reserved = `2` → bug. STOP, report.
4. If Reserved = `0` → bug (released wrong booking). STOP, report.

---

## STAGE F — Convert to Order (V2) (~5 min)

### Method 1 — per-row Create Order

1. Back to `/sale` Booking Queue.
2. CONFIRMED row (booking #1) → `Create Order`.
3. Confirmation → submit.
4. Network → **POST `/api/sale/orders/from-bookings`** → 201.
5. Response:
   - `data.orderId` (`cm...`)
   - `data.orderNumber` (`ORD-...`)
   - `data.idempotent === false`
   - `data.status === "RESERVED"`

### Method 2 — DevTools Console (V2 bookingIds-only)

If UI shows no per-row Create Order button, or returns 404:

1. DevTools → Console tab.
2. Paste (replace `<paste-booking-id>` with booking #1 ID from Stage D):

```javascript
fetch('/api/sale/orders/from-bookings', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    bookingIds: ['<paste-booking-id>']
  })
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)));
```

3. Press Enter.
4. Console prints response — copy `orderId`, `orderNumber`, `totalAmount` to notepad.

### F.1 Capture

- orderId
- orderNumber
- totalAmount (expected `9.99 * 1 = RM9.99`)
- `data.idempotent: false` on first run

### F.2 REPLAY (idempotency — critical)

1. Press Up arrow in Console → recall the fetch.
2. Press Enter again.
3. Second response:
   - `data.orderId` **same** as first call
   - `data.idempotent === true`
   - `data.status === "RESERVED"`
4. Notepad: replay idempotent = YES + same orderId = YES.

### F.3 Replay failure modes

| Replay result | Meaning | Action |
|---|---|---|
| New orderId on second call | **V2 idempotency bug** | STOP, screenshot Console, report |
| 500 | server bug | STOP, report |
| 409 | should not happen (idempotency returns same orderId, not 409) | STOP, report |

---

## STAGE G — Final verification (~3 min)

| Page | Check | Expected |
|---|---|---|
| `/sale` Product Codes | `TEST-D6-001` still present | pinned + RM9.99 |
| `/sale` Booking Queue | booking #1 status | CONVERTED_TO_ORDER |
| `/sale` Booking Queue | booking #2 (if Stage E) | CANCELLED |
| `/orders` | new order from Stage F | RESERVED, total RM9.99 |
| `/inventory` | variant Reserved | 1 (NOT released after conversion) |
| `/activity` (if reachable) | log entries for each step | traceable |

If all six rows pass → SUCCESS.

---

## Reporting back to Claude

### PASS template

```
D4/D6 functional smoke PASS:
- master HEAD verified: 6ad8483 (or current)
- flags ON: D3 + D4 + D6 (probed in Stage 0.5)
- BroadcastProduct: TEST-D6-001 (id: cm__________)
- Booking #1: cm__________ (CONFIRMED → CONVERTED_TO_ORDER)
- Booking #2 (cancel test, optional): cm__________ (CANCELLED) | skipped
- Order: cm__________ (number: ORD-____, RESERVED, total RM9.99)
- V2 replay idempotent: yes
- Same orderId on replay: yes
- reservedQty after: 1
- All Stage A-G complete: yes
- Screenshots: <count or attached>
```

### FAIL template

```
D4/D6 functional smoke FAIL at Stage <letter>:
- Sub-step: <e.g. A.4 Network capture>
- Exact error text: <copy paste>
- HTTP status: <number>
- BP ID: cm__________ or none
- Booking ID: cm__________ or none
- Order ID: cm__________ or none
- Screenshots: <attached>
- Notes: <context>
```

---

## Preserve test data

Do NOT delete the test BP / Booking / Order after the smoke. They serve as the production regression fixture for the next session.

---

## Hard no-go during smoke

- ❌ Do not use real customer records (Boss customer `Warut Thaworn` is the designated test fixture)
- ❌ Do not run raw SQL against production
- ❌ Do not upload a real payment slip
- ❌ Do not test shipping with a real carrier
- ❌ Do not invite real admin users before the smoke result is reviewed
- ❌ Do not touch pak-ta-kra

---

## Recovery on 500

1. STOP immediately.
2. Screenshot the screen and DevTools.
3. Note stage + sub-step.
4. Do NOT retry, refresh, or flip any flag.
5. Report to Claude.

---

## Tips for accurate capture

1. Preserve log in Network tab — tick before every test.
2. Filter `sale` in Network — easier visual scan.
3. Screenshot every successful step — fast trace path if a later step fails.
4. Use Incognito — eliminates extension interference.
5. Copy every `cm...` ID immediately — never reconstruct from memory.
6. DevTools Console is more reliable for V2 path than UI buttons — captures idempotency directly.
7. The REPLAY step (F.2) is the single most important check — do not skip.

---

## Cross-references

- Original checklist: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
- Activation runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- Stock decision memo: `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
- Session handoff: `docs/superpowers/2026-05-15-session-handoff-for-next-claude.md`
