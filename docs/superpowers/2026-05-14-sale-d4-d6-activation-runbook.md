# D4 + D6 activation runbook (post-Tier-3)

**Filed:** 2026-05-14
**Status:** Plan only. Do NOT execute until PR #4 (Tier 3 Add from Stock) is merged to master and Boss + ChatGPT approve activation.

---

## 1. Prerequisites (must all be true)

- [ ] PR #4 `feat/sale-add-from-stock` merged to master.
- [ ] Vercel production deploy of merged master `Ready / SUCCESS`.
- [ ] 9-probe production smoke passes after Tier 3 deploy.
- [ ] Production state still no real customer usage (only Boss test data).
- [ ] Boss + ChatGPT explicit GO for D4 + D6 paired flag flip.
- [ ] Fresh production DB snapshot (per D1 method — `pg_dump` via Docker `postgres:18-alpine`, stored in `backups/` gitignored locally).

If any item is false: STOP. Document blocker. Defer.

## 2. Activation sequence (single window)

Both flags flipped together because functional path needs both. Splitting them creates a dead-config intermediate state.

### Step 1 — Vercel env

Boss adds via Vercel dashboard → Settings → Environment Variables → Production scope:

```
ALLOW_EVERGREEN_BROADCAST_PRODUCT=true
ALLOW_NON_LIVE_BOOKING=true
```

Keep `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true` (D3, already set).

### Step 2 — Redeploy

Vercel Deployments → latest production → ⋮ → Redeploy (use existing build cache). Wait `Ready`.

### Step 3 — Unauth smoke (9 probes)

| # | Probe | Expected |
|---|---|---|
| 1 | `GET /` | 307 sign-in |
| 2 | `GET /favicon.ico` | 200 |
| 3 | `GET /sale` | 307 sign-in |
| 4 | `GET /api/sale/live-sessions` | 401 |
| 5 | `GET /api/sale/customers/search?q=test` | 401 |
| 6 | `POST /api/sale/bookings` | 401 |
| 7 | `POST /api/sale/orders/from-bookings` | 401 |
| 8 | `GET /api/storefront/<bogus>/products` | 404 |
| 9 | `GET /api/auth/csrf` | 200 |
| extra | `GET /api/sale/broadcast-products` | 401 |

All must pass before authenticated smoke.

### Step 4 — Authenticated functional smoke (Boss-side admin)

Boss performs the following via admin UI logged in as OWNER:

1. **Create evergreen BroadcastProduct.**
   - Navigate to `/sale`.
   - Currently in "no live session selected" state? Pick the SCHEDULED session OR the ENDED session — either is fine for this step. (We pick evergreen, so live session selection is for visual context only.)
   - Click "เพิ่มสินค้าจาก Stock" in Product Codes panel.
   - Pick one existing ProductVariant.
   - Enter displayCode like `EVG-TEST-1`.
   - Leave priceOverride empty (use variant default).
   - Submit. Expect 201 + row appears in product grid.

2. **Create non-live MANUAL booking against that evergreen BP.**
   - Click Manual Create (existing booking queue entry point).
   - Pick Boss's own Customer.
   - Pick the evergreen BroadcastProduct just created.
   - Quantity 1. Status PENDING_REVIEW.
   - Submit. Expect 201 + booking row appears in queue with source chip `สร้างเอง`.

3. **Confirm the booking.**
   - Click Confirm on the row. Expect 200 + status flips to CONFIRMED + reservation badge OK.
   - Verify `ProductVariant.reservedQty` increased by 1 (Boss can check via admin product view or Railway DB inspector).

4. **Convert via V2.**
   - Click Create Order on the row.
   - Expect 201 + Order created in RESERVED status + booking flips to CONVERTED_TO_ORDER + reservation transferred (orderId set).

5. **Replay V2 conversion.**
   - Repeat step 4 with same bookingIds — should return existing Order (idempotent), no duplicate.

6. **Document IDs.**
   - Boss notes the IDs of created Order, Booking, BroadcastProduct, ProductVariant in private notes.

## 3. Success criteria

- All 5 steps complete without 500.
- Created Order is RESERVED + has correct totals.
- StockReservation row exists with `orderId` set + `bookingId` preserved.
- BookingHistory rows exist for PENDING → CONFIRMED → CONVERTED transitions.
- Activity log records each mutation.
- No customer-facing message sent (verified by checking no entry in Conversation/Message tables for this customer in the window).

## 4. Rollback (if any step fails)

### 4.1 Behavior rollback (flag flip-off)

Vercel env → flip `ALLOW_NON_LIVE_BOOKING=false` + `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false` → redeploy.

Existing rows (BP + Booking + Order) remain. They do not regress; they simply cannot be extended by NEW non-live creates.

### 4.2 Data rollback

If functional smoke produced obviously broken data:

- `DELETE FROM "StockReservation" WHERE orderId = '<order-id>';`
- `DELETE FROM "OrderItem" WHERE orderId = '<order-id>';`
- `DELETE FROM "OrderAudit" WHERE orderId = '<order-id>';`
- `DELETE FROM "Order" WHERE id = '<order-id>';`
- `UPDATE "Booking" SET status = 'CONFIRMED', convertedOrderId = NULL WHERE id IN (<booking-ids>);` (or DELETE if want to undo entirely)
- `DELETE FROM "BookingHistory" WHERE bookingId IN (<booking-ids>);`
- `DELETE FROM "Booking" WHERE id IN (<booking-ids>);`
- `DELETE FROM "BroadcastProduct" WHERE id = '<bp-id>';`

Only do this if Boss confirms the data is purely test data + no other rows reference it. Production has zero real customer data so this is safe in the current window.

### 4.3 Worst case

Restore from pre-D4-D6 Railway snapshot taken in step 1.

## 5. Post-activation observation

- Watch Vercel logs for unexpected 500s in next 24h.
- Watch `BookingSource = MANUAL` non-live booking pattern for any integrity errors.
- Watch StockReservation integrity (no missing / multiple states on CONFIRMED bookings).
- Confirm storefront / checkout / payment paths unchanged.
- No customer-facing message sent.

## 6. Why not D4 alone or D6 alone

- D4 alone (`ALLOW_NON_LIVE_BOOKING=true` only): Manual Create dialog gates `broadcastProductId` to existing BP rows. Without `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` + actual evergreen BPs in DB, the non-live path errors at repository layer ("Evergreen broadcast products are not enabled"). Dead config.
- D6 alone (`ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` only): Admin can create evergreen BPs via Tier 3 dialog, but cannot create bookings against them (`ALLOW_NON_LIVE_BOOKING=false` rejects at repository). Half-functional.
- Both together: full Tier 3 + booking + V2 conversion path becomes exercisable.

## 7. After successful activation

- Update `docs/superpowers/MEMORY.md` (project memory) with activation timestamp + smoke result.
- Plan Tier 4 inbound runtime (Messenger / WhatsApp / Telegram / parser).
- Plan Tier 3.5 — BroadcastProduct Update + Delete admin actions.

## 8. Hard no-go (during this activation window)

- Do not flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION` (already on).
- Do not enable Phase B.
- Do not start Add from Stock UI on customer-facing pages.
- Do not start parser / inbound runtime.
- Do not run authenticated production POST against the public storefront / checkout / payment routes.
- Do not pak-ta-kra anything.
- Do not commit / upload backup dump.

## 9. Cross-references

- D6 plan: `docs/superpowers/2026-05-14-sale-evergreen-product-code-d6-plan.md`
- Tier 3 plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- Tier 3 handoff: `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- PR 2 D1 runbook: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md` § 16
