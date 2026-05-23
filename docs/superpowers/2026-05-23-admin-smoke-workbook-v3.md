# Admin Smoke Workbook v3 — Block 2 close

**Filed:** 2026-05-23 (Block 2 Track T9)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `d870931` (post #78-#84 merged)
**Supersedes:** workbook v2 (PR #83)

v3 adds Section J (Sale Summary range mode) + Section K (compact panel
PR #85) once merged. Sections renumbered for stability.

This is the single-pass UI smoke Boss can run signed-in as
OWNER/MANAGER. All sections have pass/fail lines + notes.

Claude does NOT execute these — authenticated production actions Boss
owns.

---

## 0. Pre-flight

```
□ pwd               /c/Users/Asus/COWORK/code/liveshop-pro
□ Vercel deploy     master latest = green
□ Site              https://nazhahatyai.com loads
□ Sign in           admin OWNER or MANAGER
□ DevTools          Network + console open
```

---

## A. `/sale` + date picker sanity

| Step | Check |
|---|---|
| 1 | Open `/sale` |
| 2 | Page loads, no 500 |
| 3 | Date picker visible top-right |
| 4 | Today → Product Codes panel renders |
| 5 | Tomorrow → panel refetches |
| 6 | Network: `GET /api/sale/broadcast-products?saleDate=...` per change |

```
A_date_picker: pass / fail
notes:
```

---

## B. Quick Create code

| Step | Check |
|---|---|
| 1 | Date = tomorrow |
| 2 | `+ สร้างสินค้า + รหัส CF` |
| 3 | stockCode `SMK-001`, saleCode `SMK-001` |
| 4 | Submit → panel refreshes |
| 5 | Row on tomorrow; absent today |

```
B_quick_create: pass / fail
B_date_isolation: pass / fail
notes:
```

---

## C. AddFromStock multi-select + defaults

| Step | Check |
|---|---|
| 1-13 | Per PR #67/#83 workbook v1/v2 Section C |

```
C_multiselect: pass / fail
C_select_all: pass / fail / not_seen
C_defaults_displayCode: pass / fail
C_defaults_price: pass / fail
C_added_to_selected_date: pass / fail
C_already_added_hidden: pass / fail
C_already_added_toggle_disabled: pass / fail / not_seen
notes:
```

---

## D. Same code different/same date

| Step | Check |
|---|---|
| 1-7 | Per v2 Section D |

```
D_same_code_diff_date: pass / fail
D_same_code_same_date_conflict: pass / fail
notes:
```

---

## E. Terminal bookings + history

```
E_terminal_hidden: pass / fail
E_history_works: pass / fail
E_cancel_refreshes: pass / fail
notes:
```

---

## F. Order detail

```
F_order_columns: pass / fail
F_summary_totals: pass / fail
F_grouping_looks_correct: pass / fail / not_sure
notes:
```

---

## G. `/inventory/new` Quick form (PR #60)

| Step | Check |
|---|---|
| 1 | `/inventory/new` → default Quick dialog |
| 2 | `Advanced form` toggle reveals `ProductForm` |
| 3 | Quick create `INV-SMK-001` succeeds |
| 4 | Appears in `/inventory` |
| 5 | Does NOT appear on `/sale` today (no BP created) |

```
G_quick_default: pass / fail
G_advanced_toggle: pass / fail
G_quick_creates: pass / fail
G_no_unwanted_BP: pass / fail
notes:
```

---

## H. Bulk Start/End No. on `/inventory/new`

**Status:** Plan only (PR #87 design). Implementation NOT in production.
Skip section unless PR 3.9-D2-* is merged.

```
H_bulk_toggle: not_applicable
H_bulk_preview: not_applicable
H_bulk_creates_n: not_applicable
notes:
```

---

## I. Sale Summary endpoint single-day (PR #70)

| Step | Check |
|---|---|
| 1 | Signed in, open `https://nazhahatyai.com/api/sale/summary?saleDate=<today>` |
| 2 | JSON `success: true` |
| 3 | `data.saleDate` = today |
| 4 | `data.items[]` with stock/bookings/orders |
| 5 | `data.totals.totalOrders` = distinct order count |
| 6 | `data.totals.totalOrderTouches` ≥ `totalOrders` |
| 7 | NO `customerName` / `phone` / `email` |

```
I_single_day: pass / fail
I_totals_distinct: pass / fail
I_no_pii: pass / fail
notes:
```

---

## J. Sale Summary range (PR #77)

| Step | Check |
|---|---|
| 1 | `?from=<7d-ago>&to=<today>` |
| 2 | `data.days[]` 7 entries |
| 3 | `data.byCode[]` per-code rollup |
| 4 | `data.totals.dayCount = 7` |
| 5 | `stockSnapshotNote` present |
| 6 | NO PII |
| 7 | `?saleDate=...&from=...` → 400 ambiguous |
| 8 | `?from=2026-01-01&to=2026-02-15` → 400 (>31 days) |
| 9 | `?from=2026-05-23&to=2026-05-22` → 400 (inverted) |

```
J_range_7_days: pass / fail
J_byCode_rollup: pass / fail
J_stock_snapshot_note: pass / fail
J_no_pii: pass / fail
J_ambiguous_reject: pass / fail
J_oversize_reject: pass / fail
J_inverted_reject: pass / fail
notes:
```

---

## K. Sale Summary compact panel (PR #85)

| Step | Check |
|---|---|
| 1 | `/sale` shows "สรุปวันนี้" panel above primary grid |
| 2 | Loading state on first paint |
| 3 | 5-col bookings strip: ทั้งหมด / รอตรวจ / ยืนยัน / ยกเลิก / ส่งออเดอร์ |
| 4 | 3-col orders strip: ออเดอร์ / จำนวนชิ้น / ยอดรวม |
| 5 | RM thousands separator (e.g. `RM1,240.00`) |
| 6 | สต๊อกใกล้หมด / สต๊อกหมด chips when applicable |
| 7 | Switch date → panel refetches |
| 8 | Empty state when no BPs for date |
| 9 | NO mutation buttons |

```
K_panel_visible: pass / fail
K_loading_state: pass / fail
K_bookings_strip: pass / fail
K_orders_strip: pass / fail
K_thousands_sep: pass / fail
K_stock_chips: pass / fail / not_seen
K_refetch_on_date_change: pass / fail
K_empty_state: pass / fail / not_tested
K_no_mutation: pass / fail
notes:
```

---

## L. Known deferred (DO NOT smoke)

- ❌ V Rich pill+drawer board production UI (PR #63 design + #72/#79/#88 components NOT wired)
- ❌ Drag/drop from inbox to slot (Tier 3.10-E)
- ❌ Outbound message send (Tier 4.5)
- ❌ Facebook webhook / runtime (Tier 4.1+ design only; PR #82 + #91 fixtures only)
- ❌ Auto-confirm trusted customers (Phase 1.5; PR #54 + #81 + #90 design only)
- ❌ Auto-create-order append (Phase 1.5)
- ❌ Multi-code batch Manual Booking (Phase 1.5)
- ❌ Bulk inventory create on `/inventory/new` (PR #87 plan only)
- ❌ Customer-level / admin-level / CSV summary (PR #86 plan only)
- ❌ Inbox panel wiring (Tier 4.1-E)

---

## M. Final report Boss sends

```
UI_SMOKE_v3
A_date_picker:
B_quick_create:
B_date_isolation:
C_multiselect:
C_select_all:
C_defaults_displayCode:
C_defaults_price:
C_added_to_selected_date:
C_already_added_hidden:
C_already_added_toggle_disabled:
D_same_code_diff_date:
D_same_code_same_date_conflict:
E_terminal_hidden:
E_history_works:
E_cancel_refreshes:
F_order_columns:
F_summary_totals:
F_grouping_looks_correct:
G_quick_default:
G_advanced_toggle:
G_quick_creates:
G_no_unwanted_BP:
H_bulk_toggle: not_applicable
I_single_day:
I_totals_distinct:
I_no_pii:
J_range_7_days:
J_byCode_rollup:
J_stock_snapshot_note:
J_no_pii:
J_ambiguous_reject:
J_oversize_reject:
J_inverted_reject:
K_panel_visible:
K_loading_state:
K_bookings_strip:
K_orders_strip:
K_thousands_sep:
K_stock_chips:
K_refetch_on_date_change:
K_empty_state:
K_no_mutation:
unexpected_errors:
screenshots/network_notes:
```

---

## N. Pass/fail next steps

### All critical sections PASS

- Report `UI_SMOKE_v3_PASS`
- Claude continues next autonomous block

### Section G PASS

- PR #60 inventory default verified live
- Add to MEMORY.md

### Section K PASS

- PR #85 compact panel verified live
- T2 UI surface unblocked for further iteration

### Section J PASS

- PR #77 range mode verified live
- T3 dedicated `/sale/summary` route (PR #86 plan) unblocked

### Any critical fail

- Screenshot + Network response + error toast verbatim
- Report `UI_SMOKE_v3_FAIL` with section + evidence
- Claude classifies + opens hotfix
- DO NOT start Phase 1.5 / Facebook runtime

---

## O. Cross-references

- workbook v1 (PR #67)
- workbook v2 (PR #83)
- PR #60 inventory default
- PR #70 summary single-day
- PR #76 summary smoke
- PR #77 summary range
- PR #85 compact panel
- `tests/e2e/prod-unauth-smoke.spec.ts` (17 unauth cases)
