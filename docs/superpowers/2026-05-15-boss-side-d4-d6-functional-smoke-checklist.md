# Boss-side D4/D6 functional smoke checklist

**Filed:** 2026-05-17
**Master HEAD at filing:** `5a4b6f2` (post PR #12 + PR #13)
**Purpose:** Boss runs this end-to-end via admin UI. Claude does NOT
authenticate or mutate production data.

Companion to `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md` § 2.4. This checklist captures the post-Tier-1.5 + post-Tier-3.6 UI flow.

---

## Preparation

1. Open `https://nazhahatyai.com/auth/sign-in`
2. Login as OWNER (Boss).
3. Confirm dashboard loads.
4. Open browser DevTools (F12) → Network tab. Useful for capturing IDs.
5. Confirm sidebar shows **`ขายของไลฟ์สด`** as the single sales workspace entry (Tier 1.5 merged).
6. Confirm `/live-selling` is NOT in sidebar but reachable via direct URL bookmark if needed.

## Flag state (verify Vercel env, no change required)

All three flags should be ON (set during prior session by Boss):

- `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`
- `ALLOW_NON_LIVE_BOOKING=true`
- `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`

If any flag is OFF, **stop** — flip via Vercel dashboard first, redeploy, then resume.

## Pre-flight smoke

Open `/sale`. Confirm:

- Header `ขายของไลฟ์สด` (Thai-first).
- Subtitle `จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง`.
- Outline button top-right: `จัดการรอบไลฟ์` → links to `/live-selling`.
- Source filter chips card (ALL / ไลฟ์สด / Inbox / Post Comment / Manual / Telegram / WhatsApp; disabled ones line-through).
- Row 1 = Product Codes + Booking Queue.
- Row 2 = Customer Panel + Order Conversion.
- Row 3 = collapsible `<details>` with Live Sessions + Inbox.

If layout is broken or any panel shows error, **stop** — open Vercel Logs.

---

## Step A — Create Product Code (Add from Stock)

1. In **Product Codes** panel (top-left primary row), click **`+ เพิ่มสินค้าจาก Stock`** at the bottom of the panel.
2. Dialog `เพิ่มรหัสสินค้าจาก Stock` opens.
3. Description should mention live session binding (if session selected) or evergreen (if no session).
4. Search input: type ≥ 2 chars matching one of your test ProductVariants. (Production currently has 2 ProductVariants per D1 snapshot.)
5. Wait for debounced search results (~300ms).
6. Click one variant — it highlights.
7. Enter Display Code:
   - **First try:** `TEST-D6-001`
   - If duplicate error 409: `TEST-D6-002`, then `-003`, etc.
8. Leave **ราคาพิเศษ** blank (uses variant price).
9. Click **`บันทึก`**.
10. Expect: dialog closes, Product Codes panel refreshes, new tile appears.

**Record:**
- BroadcastProduct ID (from Network tab → POST `/api/sale/broadcast-products` response → `data.broadcastProductId`)
- displayCode used
- Whether evergreen (no liveSessionId) or live-bound (liveSessionId set)
- Screenshot panel after creation

**If error:**
- 400 `Evergreen broadcast products are not enabled` → D6 flag OFF; check Vercel env.
- 409 `Live-bound product code already exists` → use different displayCode.
- 404 `ProductVariant not found in this shop` → wrong variant; cross-shop.

---

## Step B — Edit Product Code (Tier 3.6)

After Step A succeeds:

1. Click the new tile (e.g. `TEST-D6-001`).
2. Dialog `แก้ไขรหัสสินค้า` opens (Tier 3.6 PR #12 merged).
3. Read-only context shown: product / SKU / available stock / variant price.
4. Edit fields:
   - **ราคาพิเศษ**: type `9.99`.
   - **ปักหมุดที่ด้านบน**: click toggle button (Pin icon).
5. Click **`บันทึก`**.
6. Expect: dialog closes, tile updates to show RM9.99 unit price, pinned (if grid sorts by pin).

**Record:**
- Screenshot before edit + after edit.
- New unitPrice displayed.
- PATCH response from Network tab.

**If error:**
- 400 `priceOverride must be a decimal with up to 2 places` → fix format.
- 409 active booking conflict → no active booking; this should not happen on a fresh BP.

**Optional**: re-open dialog, clear price field, save → priceOverride should revert to null (uses variant price).

---

## Step C — Create Non-live Manual Booking

1. In **Booking Queue** panel (top-right primary row), find the Manual Create entry (button labeled `+ สร้าง booking เอง (Manual Create — PENDING_REVIEW)` in empty state).
2. Dialog `สร้างการจองด้วยตนเอง` opens.
3. **Customer:** search for Boss customer (Warut Thaworn). Click to select.
4. **Product:** select the `TEST-D6-001` from Step A.
5. **Quantity:** 1.
6. **Status:** PENDING_REVIEW (default).
7. Click submit / สร้าง booking.

**Record:**
- Booking ID (from POST `/api/sale/bookings` response → `data.bookingId`)
- `liveSessionId` in response (should be `null` for evergreen path)
- `source` = `MANUAL`
- BookingSourceChip `สร้างเอง` (gray) should render on the row

**If error:**
- 400 `Non-live bookings are not enabled` → D4 flag OFF.
- 400 `Evergreen broadcast products are not enabled` → D6 flag OFF.
- 404 `BroadcastProduct not found` → BP ID mismatch.
- 409 cross-shop → wrong customer / wrong BP.

---

## Step D — Confirm Booking

1. On the PENDING_REVIEW row, click **Confirm** button.
2. Confirmation dialog appears → click confirm.
3. Expect: row status flips to CONFIRMED. Reservation badge `OK` shows.

**Record:**
- Status CONFIRMED
- Reservation indicator
- Screenshot

**Verify reservedQty:**
- Open `/inventory` in new tab.
- Find the ProductVariant used.
- Column `Reserved` should be `1` (incremented from 0).

**If error:**
- 409 `INSUFFICIENT_STOCK` → variant stock < 1; pick another variant.
- 409 `RESERVATION_INTEGRITY_ERROR` → data corruption; stop + report.

---

## Step E — Optional Cancel Test

To verify cancel works without breaking Step F:

1. Create a SECOND booking via Step C (use `TEST-D6-001` again, quantity 1).
2. On that second booking row, click **Cancel**.
3. Reason: `D4/D6 smoke test`.
4. Confirm.
5. Expect: row status flips to CANCELLED. Reservation released.

**Verify reservedQty:**
- Back to `/inventory`. Reserved should still be `1` (only one CONFIRMED booking remains; cancel released the cancelled booking's reservation).

**Record:**
- Second Booking ID
- Cancel timestamp
- BookingHistory visible (if surfaced in UI)

---

## Step F — Convert to Order via V2

Two methods. Pick whichever the UI exposes:

### Method 1 — Per-row Create Order

1. On the CONFIRMED booking row from Step D, click **Create Order**.
2. Confirmation dialog.
3. Submit.
4. Expect: 201 + Order created in RESERVED status. Booking status flips to CONVERTED_TO_ORDER.

### Method 2 — DevTools Console (V2 bookingIds-only path)

If UI only does V1:

1. Open DevTools Console.
2. Paste:
```javascript
fetch('/api/sale/orders/from-bookings', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({
    bookingIds: ['<paste-booking-id-from-step-D>']
  })
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))
```
3. Expect: response with `success: true` + `data.orderId` + `data.idempotent: false` + `data.status: RESERVED`.

**Record:**
- Order ID
- Order Number
- Total Amount

### Replay (V2 idempotency check)

Paste the exact same fetch again (same bookingIds).
Expect: `success: true` + same `orderId` + `idempotent: true`.

If a NEW order ID returned: **bug** — stop + screenshot + report.

---

## Step G — Final verification

Navigate:

| Page | Check |
|---|---|
| `/sale` Product Codes panel | `TEST-D6-001` still present, pinned + priceOverride visible |
| `/sale` Booking Queue panel | CONFIRMED booking shows CONVERTED_TO_ORDER status |
| `/orders` | New Order in RESERVED status with correct total |
| `/inventory` | reservedQty = 1 (transferred to Order; not released) |
| `/activity` (if reachable) | log entries for each step |

---

## Report back to Claude

Paste in chat:

```
D4/D6 functional smoke PASS:
- BroadcastProduct: TEST-D6-001 (id: cm...)
- Booking #1: cm... (CONFIRMED → CONVERTED_TO_ORDER)
- Booking #2 (cancel test, optional): cm... (CANCELLED)
- Order: cm... (RESERVED, total RM...)
- V2 replay idempotent: yes/no
- Same orderId on replay: yes/no
- reservedQty after: 1
- All steps completed: yes/no
```

Or if any step failed:

```
D4/D6 functional smoke FAIL at step <letter>:
- Error: <exact text>
- Screenshot: <attach>
- BP ID: cm... or none
- Booking ID: cm... or none
- Notes: <context>
```

## Preserve test data

Do NOT delete the test BroadcastProduct / Booking / Order after smoke. Keep as Boss/test fixture for future regression checks.

## Hard no-go during smoke

- ❌ Do not use real customer records
- ❌ Do not run raw SQL
- ❌ Do not test payment slip upload with real bank
- ❌ Do not test shipping with real carrier
- ❌ Do not invite admins until functional smoke result is reviewed

## Recovery if anything breaks

If a step throws 500 or unrecoverable error:

1. Stop immediately.
2. Screenshot.
3. Note exact step.
4. Note recent flag flips (none expected this session).
5. Report to Claude.
6. Claude opens hotfix branch + investigates.

If a step "soft-fails" (e.g. UI not yet wired but route works via Console):

1. Note as known limitation.
2. Continue with Console method.

## Cross-references

- D4/D6 activation runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- Tier 3 handoff: `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- Tier 3.6 PR: `https://github.com/Ed-Sama-lens/liveshop-pro/pull/12` (merged `6a035e5`)
- Tier 1.5 PR: `https://github.com/Ed-Sama-lens/liveshop-pro/pull/11` (merged `eba64cf`)
- Onboarding readiness: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
