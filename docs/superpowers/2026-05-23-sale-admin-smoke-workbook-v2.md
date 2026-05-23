# Sale Admin Smoke Workbook — v2 (post #60 + #70 + #77)

**Filed:** 2026-05-23 (Track T8 — daytime autonomous continuation)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `c500fcd` (#77 merged)
**Production:** https://nazhahatyai.com
**Supersedes:** `docs/superpowers/2026-05-23-sale-admin-smoke-workbook.md` (v1, PR #67)

v2 adds Section I for `GET /api/sale/summary` (single-day + range) and
documents the post-PR-60 inventory state. v1 sections renumbered for
consistency.

This workbook is a **single-pass UI smoke** Boss can run signed-in
as OWNER / MANAGER without screen-flipping back to chat. Every section
has a pass/fail line + space for notes.

Claude does NOT execute these — authenticated production actions Boss
owns.

---

## 0. Pre-flight

```
□ pwd            /c/Users/Asus/COWORK/code/liveshop-pro
□ Vercel deploy  latest master = green (Vercel dashboard)
□ Site           https://nazhahatyai.com loads
□ Sign in        admin account, OWNER or MANAGER role
□ DevTools       Network tab + console open
```

---

## 1. Section A — `/sale` page + date picker sanity

| Step | What to check |
|---|---|
| 1 | Open `https://nazhahatyai.com/sale` |
| 2 | Page loads, no 500, no infinite spinner |
| 3 | Date picker visible top-right |
| 4 | Today → Product Codes panel renders |
| 5 | Tomorrow → Product Codes panel refetches |
| 6 | Network shows `GET /api/sale/broadcast-products?saleDate=...` per change |

```
A_date_picker: pass / fail
notes:
```

---

## 2. Section B — Quick Create code (`/sale`)

| Step | What to check |
|---|---|
| 1 | Selected date = **tomorrow** (avoid contaminating today) |
| 2 | Empty Product Codes → `+ สร้างสินค้า + รหัส CF` |
| 3 | Fill stockCode `SMK-001`, saleCode `SMK-001`, leave else blank |
| 4 | Submit → success → panel refreshes |
| 5 | `SMK-001` appears on tomorrow |
| 6 | Switch to today → does NOT appear (date isolation) |

```
B_quick_create:                 pass / fail
B_date_isolation:               pass / fail
notes:
```

---

## 3. Section C — AddFromStock multi-select + defaults + hide-existing (PR #51 + #53)

| Step | What to check |
|---|---|
| 1 | Selected date = **tomorrow** |
| 2 | Click `เพิ่มสินค้าจาก Stock` |
| 3 | Search keyword with results |
| 4 | Each row checkbox visible |
| 5 | Select-all toggle visible above results |
| 6 | Select 2+ rows |
| 7 | displayCode auto-fills (saleCode→SKU→stockCode) — no typing |
| 8 | Price blank default — no typing |
| 9 | Submit batch — single request |
| 10 | Panel refresh; rows appear tomorrow |
| 11 | Reopen AddFromStock — already-added hidden by default |
| 12 | Toggle "show already added" → disabled state |
| 13 | Switch to today → rows do NOT appear |

```
C_multiselect_visible:           pass / fail
C_select_all_visible:            pass / fail / not_seen
C_defaults_no_manual_displayCode:pass / fail
C_defaults_no_manual_price:      pass / fail
C_added_to_selected_date:        pass / fail
C_already_added_hidden:          pass / fail
C_already_added_toggle_disabled: pass / fail / not_seen
C_date_isolation:                pass / fail
notes:
```

---

## 4. Section D — Same code different date / same date conflict

| Step | What to check |
|---|---|
| 1 | Selected date = **today** |
| 2 | Quick-create `SMK-CONF-A` |
| 3 | Switch to **tomorrow** |
| 4 | Quick-create same `SMK-CONF-A` |
| 5 | Succeeds → both today + tomorrow visible by switching |
| 6 | Try creating `SMK-CONF-A` again on tomorrow |
| 7 | Fails with clear "already exists for this sale date" |

```
D_same_code_diff_date:           pass / fail
D_same_code_same_date_conflict:  pass / fail
notes:
```

---

## 5. Section E — Terminal bookings hidden + history (PR #52 C1)

| Step | What to check |
|---|---|
| 1 | Bookings panel visible on `/sale` |
| 2 | Active list only PENDING_REVIEW + CONFIRMED |
| 3 | `ประวัติ / History` disclosure → expand |
| 4 | CANCELLED + EXPIRED + CONVERTED_TO_ORDER appear there |
| 5 | Disclosure closes cleanly |
| 6 | Create PENDING via Manual Create |
| 7 | Cancel it |
| 8 | Active list refresh — cancelled row gone |
| 9 | Expand history — cancelled row visible |

```
E_terminal_hidden_from_active:   pass / fail
E_history_disclosure_works:      pass / fail
E_cancel_refreshes_ui:           pass / fail
notes:
```

---

## 6. Section F — Order detail columns + totals (PR #52 D1)

| Step | What to check |
|---|---|
| 1 | Open order detail page (`/orders/[id]`) |
| 2 | Item table 7 cols: No / รหัสสต๊อก / รหัสขาย / Product / unit price / qty / line total |
| 3 | Summary row: `รวม` + total qty + total RM |
| 4 | Multi-item / grouped qty looks correct |

```
F_order_columns:                 pass / fail
F_summary_totals:                pass / fail
F_grouping_looks_correct:        pass / fail / not_sure
notes:
```

---

## 7. Section G — `/inventory/new` Quick Create (PR #60)

**PR #60 merged on master `67381c1`.** Smoke this section.

| Step | What to check |
|---|---|
| 1 | Open `https://nazhahatyai.com/inventory/new` |
| 2 | Default view = Quick Create dialog inline (NOT old ProductForm) |
| 3 | Top-right `Advanced form` toggle button |
| 4 | Fill stockCode `INV-SMK-001` + saleCode `INV-SMK-001`, blank else |
| 5 | Submit → success → redirect/refresh to `/inventory` |
| 6 | `INV-SMK-001` in inventory list (qty 1, price 0) |
| 7 | Click row → edit page opens; can add variants/images |
| 8 | `/inventory/new` → click `Advanced form` toggle |
| 9 | Original `ProductForm` (multi-variant + image upload) renders |
| 10 | Toggle back to `Quick form` → Quick dialog returns |
| 11 | Verify `INV-SMK-001` does NOT appear on `/sale` today (no BroadcastProduct created) |

```
G_quick_default:                 pass / fail
G_advanced_toggle:               pass / fail
G_quick_creates_product:         pass / fail
G_quick_no_unwanted_BP:          pass / fail
notes:
```

---

## 8. Section H — Batch all-or-nothing (optional)

Only if Boss has time + date has existing item:

| Step | What to check |
|---|---|
| 1 | Selected date has ≥1 existing item |
| 2 | Open AddFromStock, toggle "show already added" |
| 3 | Multi-select mix of new + already-added |
| 4 | Submit → clear 409 OR submit blocks already-added inclusion |
| 5 | No silent partial success |

```
H_batch_atomic:                  pass / fail / not_tested
notes:
```

---

## 9. Section I — Sale Operations Summary endpoint (PR #70 + #77)

**No UI panel yet** (T2 deferred). Smoke API directly with browser
DevTools or `curl` after sign-in (admin session cookie required).

### 9.1 Single-day mode (PR #70)

| Step | What to check |
|---|---|
| 1 | Sign in admin → keep session cookie |
| 2 | Open `https://nazhahatyai.com/api/sale/summary?saleDate=<today>` in same browser tab (uses cookie) |
| 3 | Response JSON with `success: true` |
| 4 | `data.saleDate` echoes today |
| 5 | `data.shopId` matches your shop |
| 6 | `data.items[]` lists today's product codes with stock/bookings/orders |
| 7 | `data.totals.totalOrders` = distinct order count (not over-counted) |
| 8 | `data.totals.totalOrderTouches` ≥ `totalOrders` |
| 9 | NO `customerName` / `phone` / `email` anywhere in JSON |

### 9.2 Range mode (PR #77)

| Step | What to check |
|---|---|
| 1 | `https://nazhahatyai.com/api/sale/summary?from=<7-days-ago>&to=<today>` |
| 2 | Response has `days[]` array of 7 entries |
| 3 | `byCode[]` rolls up per displayCode across range |
| 4 | `totals.dayCount = 7` |
| 5 | `stockSnapshotNote` field present (documents current-vs-historical) |
| 6 | NO PII in JSON |

### 9.3 Mode rejection

| Step | What to check |
|---|---|
| 1 | `?saleDate=today&from=<x>` → 400 ambiguous |
| 2 | `?from=<x>&to=<x-2>` (to < from) → 400 |
| 3 | `?from=2026-01-01&to=2026-02-15` (>31 days) → 400 |

```
I1_single_day:                   pass / fail
I1_totals_distinct:              pass / fail
I1_no_pii:                       pass / fail
I2_range_7_days:                 pass / fail
I2_byCode_rollup:                pass / fail
I2_stock_snapshot_note:          pass / fail
I3_ambiguous_reject:             pass / fail
I3_inverted_range_reject:        pass / fail
I3_oversize_reject:              pass / fail
notes:
```

---

## 10. Final report Boss sends

```
UI_SMOKE_TIER_3_9_RUNTIME_v2
A_date_picker:
B_quick_create:
B_date_isolation:
C_multiselect_visible:
C_select_all_visible:
C_defaults_no_manual_displayCode:
C_defaults_no_manual_price:
C_added_to_selected_date:
C_already_added_hidden:
C_already_added_toggle_disabled:
C_date_isolation:
D_same_code_diff_date:
D_same_code_same_date_conflict:
E_terminal_hidden_from_active:
E_history_disclosure_works:
E_cancel_refreshes_ui:
F_order_columns:
F_summary_totals:
F_grouping_looks_correct:
G_quick_default:
G_advanced_toggle:
G_quick_creates_product:
G_quick_no_unwanted_BP:
H_batch_atomic:
I1_single_day:
I1_totals_distinct:
I1_no_pii:
I2_range_7_days:
I2_byCode_rollup:
I2_stock_snapshot_note:
I3_ambiguous_reject:
I3_inverted_range_reject:
I3_oversize_reject:
unexpected_errors:
screenshots/network_notes:
```

---

## 11. Known not-yet-done (DO NOT smoke — does not exist)

- ❌ Auto-confirm of trusted customers (PR #54 + #81 design only)
- ❌ Auto-create-order + same-day same-customer append (design only)
- ❌ Multi-code batch Manual Booking (design only)
- ❌ Drag/drop customer to slot (Tier 3.10-E)
- ❌ V Rich pill+drawer board (Tier 3.10-B/C/D — pure helpers shipped #72 #79)
- ❌ Outbound message send (Tier 4.5)
- ❌ Facebook webhook / runtime (Tier 4.1+ design only)
- ❌ Sale operations summary compact panel UI (T2 deferred)
- ❌ Bulk Start/End No. on `/inventory/new` (PR 3.9-D2 deferred)
- ❌ Image upload on Quick form (use edit page after create)
- ❌ Per-customer / per-admin / CSV summary (T1 sequence later)

These are intentionally out of smoke scope. Do NOT mark as failures.

---

## 12. Pass / Fail next steps

### Section A-F all PASS

- Report `UI_SMOKE_PASS`
- Claude continues next autonomous block

### Section G PASS

- PR #60 inventory default verified live
- Add to memory MEMORY.md as confirmed

### Section I PASS

- Sale Summary API verified live single + range mode
- T2 UI panel becomes unblocked (when Boss authorizes)

### Any critical fail

- Screenshot + Network response + error toast verbatim
- Report `UI_SMOKE_FAIL` with section ID + evidence
- Claude classifies + opens hotfix
- DO NOT start Phase 1.5 / Facebook runtime

---

## 13. Cross-references

- v1: `docs/superpowers/2026-05-23-sale-admin-smoke-workbook.md` (PR #67)
- PR #60 inventory quick-create default
- PR #70 sale summary single-day endpoint
- PR #76 summary endpoint smoke spec
- PR #77 summary range query
- PR #78 inventory quick-create edge cases (tests only)
- PR #79 V Rich display layer helpers (tests only)
- PR #80 broadcast-products saleDate filter tests
- PR #81 Phase 1.5 decision packet
- PR #82 FB/Oho local webhook test plan
