# Admin Smoke Workbook v5 — Consolidated Edition

**Filed:** 2026-05-24 (Phase B9 consolidation)
**Author:** Claude Sonnet 4.6
**Master baseline:** `8cb8f7f`
**Status:** Authoritative smoke workbook. Supersedes v1/v2/v3/v4 for new smoke runs.

Single workbook covering all admin smoke sections. Older versions
remain for reference but new smoke runs should use this v5.

**Older versions superseded:**
- v1 (`2026-05-23-sale-admin-smoke-workbook.md`)
- v2 (`2026-05-23-sale-admin-smoke-workbook-v2.md`)
- v3 (`2026-05-23-admin-smoke-workbook-v3.md`)
- v4 (`2026-05-23-admin-smoke-workbook-v4.md`)

---

## 0. Pre-flight

Before running any section:

- [ ] Master HEAD verified (`gh api repos/Ed-Sama-lens/liveshop-pro/branches/master | jq .commit.sha`)
- [ ] Vercel deploy "Ready" for that SHA
- [ ] Production URL reachable: `https://nazhahatyai.com` returns 200
- [ ] `npm run smoke:prod:unauth` returns 17/17 PASS
- [ ] Admin signed in as OWNER on test shop
- [ ] Browser console open (track errors)
- [ ] Network tab open (track XHRs)
- [ ] Test customer + test variant available

---

## 1. Sale workspace — Section A through K (from v3)

### A. `/sale` date picker

- A.1 Date picker renders on `/sale`
- A.2 Default = today in shop timezone (Asia/Kuala_Lumpur)
- A.3 Selecting yesterday refetches BP list + bookings + summary
- A.4 Refresh page preserves selection? (verify — current code does NOT URL-sync)

### B. Quick Create product code (`/sale`)

- B.1 "+ สร้างรหัสด่วน" button visible
- B.2 Dialog opens with stockCode + saleCode inputs
- B.3 Submit creates trio (Product + Variant + BroadcastProduct)
- B.4 BP list refetches; new row appears at top
- B.5 Bulk toggle creates N trios in one transaction
- B.6 Activity log shows entry

### C. AddFromStock multi-select

- C.1 "เพิ่มจากสต็อก" button opens dialog
- C.2 Multi-select existing inventory items
- C.3 Submit attaches selected items to today's saleDate
- C.4 Creates new BroadcastProduct rows (reuses existing Product + Variant)
- C.5 NO duplicate Product rows

### D. Same/diff date conflict

- D.1 Attach existing Product to saleDate X
- D.2 Try to attach same Product to saleDate X again → reuse path (no error)
- D.3 Try to attach same Product with same saleCode to saleDate X → 409 displayCode conflict (partial unique index)

### E. Terminal bookings + history

- E.1 Active list shows PENDING_REVIEW + CONFIRMED only
- E.2 CANCELLED/EXPIRED/CONVERTED hidden by default
- E.3 "ประวัติ" disclosure reveals terminal bookings
- E.4 Click history customer name → side panel loads detail

### F. Order detail columns + totals

- F.1 Convert N CONFIRMED bookings → Order
- F.2 Order row appears at /orders
- F.3 Order detail shows items grouped by (productId, variantId, unitPrice)
- F.4 Total = sum of (quantity × unitPrice)
- F.5 Customer name + shop branding present

### G. `/inventory/new` Quick form (PR #60)

- G.1 `/inventory/new` defaults to Quick form (not Advanced)
- G.2 Quick form shows stockCode + saleCode + name + price
- G.3 Submit creates Product + 1 Variant
- G.4 NO BroadcastProduct row created
- G.5 Advanced toggle reveals multi-variant ProductForm
- G.6 Advanced ProductForm still works (legacy path)

### H. Bulk inventory (PLAN ONLY, not LIVE yet)

- (skip; D2 bulk is now LIVE — covered in Section L)

### I. Sale Summary single-day (PR #70)

- I.1 Compact panel ("สรุปวันนี้") renders above primary grid on `/sale`
- I.2 Shows totalBookings + per-status counts + totalOrders + totalGross
- I.3 Refetches on saleDate change
- I.4 Refetches on mutation (refetchToken bump)
- I.5 Empty state shows when broadcastProductCount === 0
- I.6 No PII anywhere in panel

### J. Sale Summary range (PR #77 / range API)

- (currently API-only; range UI deferred per PR #86)
- J.1 GET `/api/sale/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` returns days[]
- J.2 Each day has items + totals
- J.3 Top-level totals = sum across days
- J.4 stockSnapshotNote present (clarifies current-not-historical stock)
- J.5 Mixing saleDate + from/to → 400

### K. Compact summary panel (PR #85)

- K.1 Panel appears above `SaleWorkspaceShell` primary grid
- K.2 5 booking-status chips + 3 order/revenue chips + stock health chips
- K.3 totalOrderTouches chip ONLY shows when delta exists
- K.4 RM currency format with thousands separator
- K.5 Loading state shows spinner
- K.6 Error state shows destructive banner

---

## 2. NEW — Section L `/inventory/new` bulk range (D2-A + D2-B)

### L.1 Toggle visibility

- [ ] `/inventory/new` Quick form
- [ ] "สร้างหลายรหัส (Bulk range)" toggle visible, default UNCHECKED
- [ ] Start No / End No / preview hidden when toggle OFF
- [ ] "สูงสุด 100 รายการ / รอบ" hint NOT shown when toggle OFF

### L.2 Toggle ON behavior

- [ ] Toggle ON reveals Start No + End No fields
- [ ] Preview-count area renders
- [ ] Cap hint "สูงสุด 100 รายการ / รอบ" shows on right

### L.3 Preview count

- [ ] Fill `stockCodeBase=STK`, `saleCodeBase=CM`, `startNo=1`, `endNo=5`
- [ ] Preview: "5 รายการ: CM1 ถึง CM5"
- [ ] Change endNo to 200 → preview shows "เกินขีดจำกัด 100"

### L.4 Single-mode submit (toggle OFF)

- [ ] Toggle OFF. Fill `stockCodeBase=STK-SINGLE-001`, `saleCodeBase=CM-S1`
- [ ] Click "สร้างสินค้า"
- [ ] POST `/api/products` (NOT `/api/inventory/quick-product-bulk`)
- [ ] 201, dialog closes, list refreshes
- [ ] Variant sku=STK-SINGLE-001, price='0', quantity=1
- [ ] NO BroadcastProduct created

### L.5 Bulk submit + zero BPs

- [ ] Toggle ON. Fill `stockCodeBase=STK-BULK`, `saleCodeBase=CM-B`, `startNo=1`, `endNo=3`
- [ ] Click "สร้างสินค้า"
- [ ] POST `/api/inventory/quick-product-bulk` 201
- [ ] Response items have NO `broadcastProductId`
- [ ] In-dialog success: "สร้างสินค้า 3 รายการสำเร็จ"
- [ ] Dialog stays open + form resets
- [ ] `/inventory` shows 3 new products (STK-BULK1..3)
- [ ] DB query: zero new BroadcastProduct rows

### L.6 Reuse-or-create

- [ ] With STK-BULK1..3 existing, toggle ON, same params
- [ ] Submit
- [ ] 201 + createdCount: 3 + `productCreated: false` + `variantCreated: false`
- [ ] `/inventory` count unchanged
- [ ] Name/description NOT overwritten

### L.7 All-or-nothing rollback

- [ ] Pre-create STK-PARTIAL11 in single mode
- [ ] Toggle ON. `stockCodeBase=STK-PARTIAL`, `saleCodeBase=CM-P`, `startNo=10`, `endNo=12`
- [ ] Submit — depends on reuse path engagement
- [ ] If 409: pre-submit count unchanged

### L.8 Quantity 0 + price 0

- [ ] Toggle ON. Fill all + `quantity=0` + `price=0`
- [ ] Submit succeeds 201
- [ ] Variants created with quantity=0, price=0

### L.9 Cap enforcement

- [ ] Toggle ON. `startNo=1`, `endNo=101`
- [ ] Submit → 400
- [ ] Field error on endNo: "Bulk range too large: 101 > 100"

### L.10 RBAC

- [ ] Sign in as CHAT_SUPPORT user
- [ ] Attempt bulk submit
- [ ] 403 "Insufficient permissions"
- [ ] Sign in as WAREHOUSE → 403 same

### L.11 Advanced ProductForm path intact

- [ ] `/inventory/new` → click "Advanced form" toggle
- [ ] Switches to multi-variant ProductForm
- [ ] Bulk toggle NOT present in Advanced view
- [ ] Existing Advanced create flow unchanged

### L.12 Image upload absent

- [ ] No "รูปสินค้า URL" field in either mode
- [ ] Images added via inventory edit page after product creation

---

## 3. NEW — Section M Phase 1.5 readiness (NOT LIVE — placeholder)

Phase 1.5 runtime is HARD-HELD. This section is reserved for future
post-implementation smoke. Currently:

- M.1 (reserved) Auto-confirm gate visible on Customer edit page
- M.2 (reserved) Auto-order-append badge on Order detail
- M.3 (reserved) Multi-code Manual Create batch UI

Do NOT smoke M.* until Boss explicitly authorizes Phase 1.5 implementation PRs.

---

## 4. NEW — Section N V Rich board readiness (NOT LIVE — placeholder)

V Rich board skeleton is shipped but NOT wired. This section is
reserved for post-wiring smoke. Currently:

- N.1 (reserved) Board renders behind feature flag
- N.2 (reserved) Slot pills sort naturally
- N.3 (reserved) Slot click opens booking detail
- N.4 (reserved) Stock decrement reflects in slot count

Do NOT smoke N.* until Boss explicitly authorizes V Rich wiring PRs.

---

## 5. Pass/fail template

For each section sub-step, mark:

```
✅ PASS — verified visually + Network shows expected request/response
⚠️ PARTIAL — works but with UX issue (capture screenshot)
❌ FAIL — broken behavior; capture screenshot + Network tab + error toast verbatim
🚫 BLOCKED — cannot test (e.g. RBAC role unavailable)
```

### On FAIL

- Capture screenshot
- Capture Network response (status + body)
- Capture browser console error verbatim
- Report `UI_SMOKE_v5_<SECTION>_FAIL` with sub-step ID + evidence
- Claude classifies + opens hotfix PR
- HARD GATE: do NOT start Phase 1.5 / Facebook runtime while ANY active section FAILs

---

## 6. Coverage matrix

| Section | Feature | Boss Smoke Status | Source |
|---|---|---|---|
| A | `/sale` date picker | pending | Block 3 |
| B | Quick Create | pending | Tier 3.8 |
| C | AddFromStock | pending | Tier 3.x |
| D | Date conflict | pending | Tier 3.9-B-Fix-1 |
| E | Terminal bookings | pending | PR #52 |
| F | Order detail | pending | Tier 2 |
| G | `/inventory/new` Quick | pending | PR #60 |
| H | Bulk inventory plan | n/a | PR #87 plan only |
| I | Summary single-day | pending | PR #70 |
| J | Summary range | pending API only | PR #77 |
| K | Compact summary panel | pending | PR #85 |
| **L** | **Inventory bulk D2** | **pending — new section** | **PR #104 + #105** |
| M | Phase 1.5 | reserved | held |
| N | V Rich wired | reserved | held |

Total active sections requiring Boss smoke: **12 (A-L)**.

---

## 7. Estimated smoke time

| Pass | Time |
|---|---|
| Full A-K + L | ~45-60 min |
| Critical only (B/E/F/I/K/L) | ~20 min |
| L only (new) | ~10 min |

Recommend Boss start with critical-only pass; full pass when time permits.

---

## 8. Cross-references

- Older workbooks: v1/v2/v3/v4 (kept for historical reference)
- `docs/superpowers/2026-05-24-edit-product-code-refresh-audit.md` (F4 closure)
- `docs/superpowers/2026-05-24-sale-workspace-state-map.md` (state model)
- `docs/superpowers/2026-05-24-admin-api-index.md` (API endpoints)
- `docs/superpowers/2026-05-23-inventory-api-reference.md` (inventory bulk)
- `docs/superpowers/2026-05-24-phase-1-5-implementation-checklist.md` (Phase 1.5 hold)
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (V Rich hold)

---

## 9. Status

- Authoritative workbook as of master `8cb8f7f`
- 12 active sections (A through L)
- 2 reserved sections (M Phase 1.5, N V Rich)
- Boss smoke STILL PENDING for all 12 active sections
- R2 docs-only PR
