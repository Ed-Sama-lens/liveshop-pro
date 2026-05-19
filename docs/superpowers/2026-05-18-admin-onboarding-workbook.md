# Admin onboarding — workbook

**Filed:** 2026-05-18
**Pairs with:**
- `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md` (readiness verdict)
- `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md` (day-1 paired execution)

**Status:** Actionable workbook for an admin's first 7 days. Boss/lead admin checks rows off as they happen.

This file is checklist-shaped on purpose. Each row is something the admin OR Boss completes on a specific day. If a row stalls, escalate per § Emergency.

---

## Day 0 — Setup (Boss-only)

Before sending the admin invite.

- [ ] D4/D6 functional smoke PASS (per visual guide)
- [ ] D4/D6 fixture IDs captured in MEMORY.md
- [ ] Stock decrement decision X / Y / Z made
- [ ] Local Docker verifier `npm run verify:sale:d4-d6` runs 9/9 PASS
- [ ] Production unauth smoke `npm run smoke:prod:unauth` 16/16 PASS
- [ ] PR #20 socket tsc fix merged (zero tsc errors baseline)
- [ ] PR #16 smoke harness merged (smoke runnable via npm)
- [ ] PR #17 D4/D6 visual guide merged
- [ ] Password-change UI implemented OR Boss accepts initial-password handoff out-of-band
- [ ] Boss decides admin role (OWNER / MANAGER / WAREHOUSE / CHAT_SUPPORT)
- [ ] Boss creates admin User row + ShopMember row via Prisma Studio or `/api/users` admin route
- [ ] Boss generates initial password (out-of-band)
- [ ] Boss agrees with admin on shift hours / SLA
- [ ] Telegram bot wired for production 5xx alerts (project memory says installed; verify)
- [ ] LINE / WhatsApp escalation channel set up with admin

If any row blank → invite NOT sent.

---

## Day 1 — Paired training (Boss + admin together)

Per `2026-05-18-admin-onboarding-day1-runbook.md`. ~3 hours.

### Morning (orientation, 60 min)

- [ ] Admin logs in via Incognito at `https://nazhahatyai.com/auth/sign-in`
- [ ] Admin changes password on first login (if UI exists) OR receives new password from Boss
- [ ] Boss walks `/sale` workspace structure: panels + sidebar + filter chips
- [ ] Boss walks Add from Stock dialog (Tier 3)
- [ ] Boss walks Edit / Delete dialog (Tier 3.6)
- [ ] Boss walks Manual Create Booking dialog
- [ ] Boss explains evergreen vs live-bound BroadcastProduct
- [ ] Boss explains reservedQty semantics + stock decrement gap (per chosen X/Y/Z)
- [ ] Admin asks ≥ 3 clarifying questions

### Midday (paired execution on test fixtures, 60 min)

Admin performs each, Boss watches.

- [ ] Create BroadcastProduct with displayCode `ADMIN-DAY1-001`
- [ ] Create manual booking for Boss customer, qty 1, PENDING_REVIEW
- [ ] Confirm booking → reservedQty +1
- [ ] Create second booking, qty 1, CONFIRMED on create
- [ ] Cancel second booking → reservedQty back to +1
- [ ] Convert first booking via per-row UI button OR DevTools Console
- [ ] Replay V2 conversion once via DevTools Console
- [ ] Verify Order RESERVED in `/orders`
- [ ] Verify reservedQty unchanged after convert

### Afternoon (read-only shadow, 60 min)

- [ ] Admin opens `/activity` (if reachable) and reads recent events
- [ ] Admin opens `/inventory` and inspects column meaning
- [ ] Admin opens `/orders` and inspects status filter
- [ ] Admin opens `/customers` and inspects search
- [ ] Admin opens `/live-selling` via direct URL (escape route)
- [ ] Admin asks ≥ 3 clarifying questions
- [ ] Boss writes day-1 summary in handoff doc / chat

### End-of-day-1 evaluation

| Question | Yes/No |
|---|---|
| Admin completed all paired-execution steps without errors | __ |
| Admin understands MANUAL vs future-inbound bookings | __ |
| Admin understands reservedQty + stock decrement | __ |
| Admin executed at least one read-only shadow rotation | __ |
| Boss intervened < 3 times for the same kind of question | __ |
| No production 5xx surfaced from admin actions | __ |
| No real customer touched | __ |
| Admin can articulate escalation path | __ |

If 6+ yes → proceed to Day 2 supervised mode. Otherwise repeat Day 1 tomorrow.

---

## Day 2 — Supervised solo (Boss reviews EOD)

- [ ] Admin handles bookings + confirmations on their own shift
- [ ] Admin uses ONLY Boss-pre-approved test customers
- [ ] Admin produces ≥ 5 confirmed bookings
- [ ] Admin produces ≥ 3 V2 conversions
- [ ] Boss reviews at end-of-day:
  - [ ] All `/orders` rows from today are valid
  - [ ] reservedQty consistent with sum of CONFIRMED bookings
  - [ ] No 5xx in Vercel logs from admin's session
- [ ] Boss writes Day-2 review note

---

## Day 3 — Add payment slip review

- [ ] Admin reviews ≥ 3 slip uploads from Boss-pre-approved fake bank screenshots
- [ ] Admin marks each slip VERIFIED or FAILED
- [ ] Boss watches the first 2; admin does the 3rd alone
- [ ] Admin understands: slip rejection → NO automated customer notification → admin contacts customer manually
- [ ] No real bank slip used
- [ ] Boss writes Day-3 review

---

## Day 4 — Full booking → delivered cycle

For each of ~3 Boss-pre-approved customer interactions:

- [ ] Create booking
- [ ] Confirm
- [ ] Convert to Order
- [ ] Mark slip uploaded + verified
- [ ] Enter tracking number (manual)
- [ ] Mark Shipment IN_TRANSIT
- [ ] Mark Order DELIVERED
- [ ] If stock model Z (manual): adjust inventory immediately

Boss audits every step end-of-day.

---

## Day 5 — One real customer (Boss-known)

- [ ] Boss picks ONE friend / family / long-term customer
- [ ] Admin walks them through purchase as if it's normal
- [ ] Admin captures their booking + confirms + converts
- [ ] Boss verifies customer received correct order
- [ ] No marketing campaign, no organic discovery
- [ ] Boss interviews customer after delivery (any friction?)
- [ ] Boss writes Day-5 review

---

## Days 6-7 — Gradually widen real customer set

- [ ] Day 6: 2 real customers (Boss known)
- [ ] Day 7: 3-5 real customers (Boss known)

Each day:
- Boss audits all transactions at end-of-day
- Admin keeps notes of any UI confusion
- Boss escalates UI confusion to Claude as Tier 9 backlog item

---

## Day 8+ — Closed beta (Boss decision)

After Day 7 PASS, Boss decides:

- [ ] Continue Boss-known customers only
- [ ] OR open to friend-of-friend referrals
- [ ] OR open to organic walk-ins
- [ ] OR pause and consolidate

Public marketing campaign + storefront launch require:
- Tier 4 (inbound runtime) shipped
- Sitemap policy decided + implemented
- Stock decrement model wired
- Carrier integration MVP
- Payment slip OCR considered

Until those land, beta stays small.

---

## Product setup checklist (admin reference)

When admin needs to add new products:

- [ ] `/inventory` → Add Product
- [ ] Fill: name, stockCode, category, isActive
- [ ] Save → note `productId`
- [ ] Add ProductVariant: SKU + attributes + price + quantity
- [ ] Add image to R2 via image upload tool
- [ ] Verify variant visible in Add-from-Stock search

## Product code checklist (admin reference)

When admin needs to add a CF code / BroadcastProduct:

- [ ] `/sale` → Product Codes panel → `+ เพิ่มสินค้าจาก Stock`
- [ ] Search variant
- [ ] Display Code: project naming convention (TBD with Boss; e.g. `S-001`, `A-021`)
- [ ] Optional priceOverride
- [ ] Save → tile appears
- [ ] If pinned: click edit dialog → Pin toggle
- [ ] If price changes during live: edit dialog → update priceOverride

## Booking flow checklist (admin reference)

For each customer message / live comment:

- [ ] Identify customer (search → existing OR create new)
- [ ] Identify product code mentioned
- [ ] Create booking (Manual Create dialog) with quantity
- [ ] Status PENDING_REVIEW
- [ ] (Customer confirms payment intent OR admin verifies stock)
- [ ] Confirm booking → reservedQty +qty
- [ ] (Customer pays + uploads slip)
- [ ] Verify slip → Payment VERIFIED
- [ ] Convert booking to Order (per-row UI)
- [ ] Order RESERVED → CONFIRMED transition via admin
- [ ] (Pack + ship)
- [ ] Order → PACKED → SHIPPED → DELIVERED transitions

## Confirm/cancel checklist

For confirm:
- [ ] Booking exists in PENDING_REVIEW
- [ ] reservedQty has room (variant.quantity - variant.reservedQty ≥ booking.quantity)
- [ ] Click Confirm → status flips to CONFIRMED, reservation appears

For cancel:
- [ ] Booking exists in PENDING_REVIEW or CONFIRMED
- [ ] Click Cancel → confirm dialog
- [ ] Enter reason
- [ ] Submit → status flips to CANCELLED, reservation released (if was CONFIRMED)
- [ ] Customer notification: NONE automated; admin contacts out-of-band

## Create order checklist

- [ ] One or more CONFIRMED bookings from the same customer
- [ ] Per-row Create Order button OR DevTools Console V2 path
- [ ] Order created RESERVED
- [ ] Booking flips CONVERTED_TO_ORDER
- [ ] reservedQty unchanged (transferred from booking to order)
- [ ] Replay returns same orderId + `idempotent: true`

## Payment/slip limitations

What admin CAN do today:

- View slip image
- Mark VERIFIED or FAILED
- Re-request slip from customer (manually, out-of-band)

What admin CANNOT do today:

- ❌ Auto-OCR
- ❌ Auto-verify with bank API
- ❌ Auto-notify customer of verify result
- ❌ Refund without raw Prisma access (no admin refund UI)
- ❌ Process card payments
- ❌ Handle dispute / chargeback

## Shipping limitations

What admin CAN do today:

- Enter tracking number manually
- Mark Shipment transitions: PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED → RETURNED
- View Shipment list per Order

What admin CANNOT do today:

- ❌ Auto-call carrier API
- ❌ Print shipping label from inside the app
- ❌ Auto-update on carrier webhook
- ❌ Handle COD reconciliation
- ❌ Handle international customs

## Do NOT use yet

- ❌ Don't onboard real customers beyond Boss-known set until Tier 4 ships
- ❌ Don't run bulk operations (cancel all / refund batch)
- ❌ Don't use `/storefront/admin` external-facing real customer flows
- ❌ Don't expect Messenger/WhatsApp/Telegram inbound
- ❌ Don't expect cron-based SLA/reminder
- ❌ Don't trust analytics without manual audit
- ❌ Don't enable multi-currency
- ❌ Don't expect tax / discount / promo calculation
- ❌ Don't share login credentials between admins (no 2FA)

## Smoke before each live session

Before every scheduled live commerce session:

- [ ] `npm run smoke:prod:unauth` 16/16 PASS
- [ ] Vercel last deploy is Ready
- [ ] Flags D3 + D4 + D6 ON (run flag-probe console block from D4/D6 visual guide § 0.5)
- [ ] `/sale` workspace loads cleanly
- [ ] Booking Queue is empty OR known state
- [ ] reservedQty matches sum of unrealized CONFIRMED bookings
- [ ] Telegram / LINE escalation reachable

## Incident escalation

| Severity | Trigger | Action |
|---|---|---|
| LOW | UI display only | Hard refresh once; if persists → screenshot + Boss |
| MED | 4xx with clear message | Read + follow hint; if unclear → Boss |
| HIGH | 5xx OR data anomaly | STOP. Screenshot + DevTools. Report Boss immediately. |
| CRITICAL | Production fully down | STOP. LINE + phone Boss. |

Admin NEVER:

- ❌ Restarts Vercel deploys
- ❌ Edits Vercel env vars
- ❌ Deletes records via Prisma Studio
- ❌ Uses raw SQL
- ❌ Rotates secrets
- ❌ Changes Meta App settings

## Screenshots placeholder

Each row referencing "screenshot" expects:

- Admin captures via `Win+Shift+S` (Windows) or `Cmd+Shift+4` (Mac)
- Saves to local OneDrive / Google Drive folder named `liveshop-admin-day-N`
- Sends Boss via LINE / WhatsApp
- Does NOT commit to repo (covered by `tests/e2e/screenshots/` gitignore)

---

## Cross-references

- Day-1 runbook: `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md`
- Readiness verdict: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Stock decision: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Commerce readiness: `docs/superpowers/2026-05-18-commerce-readiness-followup.md`
- Phase B dry-run: `docs/superpowers/2026-05-18-phase-b-dry-run-test-data-plan.md`
