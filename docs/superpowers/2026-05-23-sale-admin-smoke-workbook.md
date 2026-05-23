# Sale Admin Smoke Workbook

**Filed:** 2026-05-23 (overnight Track 9)
**For:** Boss morning UI smoke after Tier 3.9 runtime batch + overnight Track 2 PR #60
**Master baseline:** `a1aef83` (post PR #59)
**Production:** https://nazhahatyai.com

This workbook is a **single-pass UI smoke** Boss can run signed-in as
OWNER / MANAGER without screen-flipping back to chat. Every section
has a pass/fail line + space for notes.

Claude does NOT execute any of these — they are authenticated
production actions Boss owns.

---

## 0. Pre-flight

```
□ pwd       /c/Users/Asus/COWORK/code/liveshop-pro
□ Vercel    latest master deploy = green (https://vercel.com/...)
□ Site      https://nazhahatyai.com loads
□ Sign in   admin account, OWNER or MANAGER role
□ DevTools  Network tab open, console open (catch silent JS errors)
```

---

## 1. Section A — `/sale` page + date picker sanity

| Step | What to check |
|---|---|
| 1 | Open `https://nazhahatyai.com/sale` |
| 2 | Page loads, no 500, no infinite spinner |
| 3 | Date picker visible top-right of workspace |
| 4 | Click → select **today** → Product Codes panel renders |
| 5 | Click → select **tomorrow** → Product Codes panel refetches |
| 6 | Network tab shows `GET /api/sale/broadcast-products?saleDate=...` per date change |

```
A_date_picker: pass / fail
notes:
```

---

## 2. Section B — Quick Create code (`/sale`)

| Step | What to check |
|---|---|
| 1 | Selected date = **tomorrow** (avoid contaminating today) |
| 2 | If Product Codes panel empty, click `+ สร้างสินค้า + รหัส CF` |
| 3 | Dialog opens — fill: `stockCode = SMK-001`, `saleCode = SMK-001`, leave everything else blank |
| 4 | Submit → toast or close + Product Codes panel refreshes |
| 5 | New row `SMK-001` appears in panel for tomorrow |
| 6 | Switch back to today → SMK-001 does NOT appear (date isolation) |

```
B_quick_create:                 pass / fail
B_date_isolation:               pass / fail
notes:
```

---

## 3. Section C — AddFromStock multi-select + defaults + hide-existing (PR #51 + #53)

| Step | What to check |
|---|---|
| 1 | Selected date = **tomorrow** (or any future date with existing stock items) |
| 2 | Click `เพิ่มสินค้าจาก Stock` |
| 3 | Type a search keyword that has results (Boss knows their inventory) |
| 4 | Each row shows checkbox (multi-select) |
| 5 | Select-all toggle visible above results (only when results exist) |
| 6 | Select 2 or more rows |
| 7 | displayCode auto-fills (saleCode → SKU → stockCode fallback) — Boss does NOT type anything |
| 8 | Price field defaulted blank — Boss does NOT type anything |
| 9 | Submit batch — single request, all rows created |
| 10 | Product Codes panel refreshes; selected rows appear on tomorrow |
| 11 | Reopen AddFromStock — already-added rows hidden by default |
| 12 | Toggle "show already added" — appear in disabled state |
| 13 | Switch to today → those rows do NOT appear (date isolation) |

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
| 2 | Quick-create code `SMK-CONF-A` (any unique stockCode) |
| 3 | Switch to **tomorrow** |
| 4 | Quick-create same code `SMK-CONF-A` |
| 5 | Succeeds → both today AND tomorrow rows visible by switching dates |
| 6 | Try creating `SMK-CONF-A` again on tomorrow |
| 7 | Fails with clear "already exists for this sale date" message |

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
| 2 | Active list shows only PENDING_REVIEW + CONFIRMED rows |
| 3 | If `ประวัติ / History` disclosure exists, click to expand |
| 4 | CANCELLED + EXPIRED + CONVERTED_TO_ORDER rows appear inside |
| 5 | Disclosure closes cleanly |
| 6 | Create a PENDING booking (Manual Create from Bookings panel) |
| 7 | Cancel it |
| 8 | Active list refreshes — cancelled row gone |
| 9 | Expand history — cancelled row appears there |

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
| 1 | Open an existing order detail page (`/orders/[id]`) |
| 2 | Item table shows 7 columns: `No.` / `รหัสสต๊อก` / `รหัสขาย` / `Product` / `unit price` / `qty` / `line total` |
| 3 | Summary row at bottom: `รวม` label + total qty + total RM amount |
| 4 | If order has multiple OrderItems (different products), check each row's totals |
| 5 | If two bookings of same product+variant+price were grouped into one OrderItem, qty reflects sum |

```
F_order_columns:                 pass / fail
F_summary_totals:                pass / fail
F_grouping_looks_correct:        pass / fail / not_sure
notes:
```

---

## 7. Section G — `/inventory/new` Quick Create (PR #60 — pending Boss review)

**Skip if PR #60 has not been merged.** Otherwise:

| Step | What to check |
|---|---|
| 1 | Open `https://nazhahatyai.com/inventory/new` |
| 2 | Default view = Quick Create dialog inline (NOT old `ProductForm` with variants list) |
| 3 | Top-right shows `Advanced form` toggle button |
| 4 | Fill stockCode `INV-SMK-001` + saleCode `INV-SMK-001`, leave rest blank |
| 5 | Submit → success toast, redirect / refresh to `/inventory` |
| 6 | `INV-SMK-001` appears in inventory list with qty 1, price 0 |
| 7 | Click row → edit page opens; can add variants / images / change details |
| 8 | Back to `/inventory/new` → click `Advanced form` toggle |
| 9 | Original `ProductForm` (multi-variant + image upload) renders |
| 10 | Toggle back to `Quick form` — Quick dialog returns |

```
G_quick_default:                 pass / fail / not_applicable
G_advanced_toggle:               pass / fail / not_applicable
G_quick_creates_product:         pass / fail / not_applicable
G_quick_no_unwanted_BP:          pass / fail (verify on /sale today: INV-SMK-001 should NOT appear)
notes:
```

---

## 8. Section H — Batch all-or-nothing (optional)

Only if Boss has spare time + a date that already has at least one
broadcast product:

| Step | What to check |
|---|---|
| 1 | Selected date has at least 1 existing code |
| 2 | Open AddFromStock, toggle "show already added" so disabled rows visible |
| 3 | Multi-select a mix of new + already-added rows |
| 4 | Submit → expect either: clear 409 error on the already-added row, OR submit button blocks the inclusion |
| 5 | After resolution, panel state matches expectation (no silent partial success) |

```
H_batch_atomic:                  pass / fail / not_tested
notes:
```

---

## 9. Final report Boss sends

Paste verbatim:

```
UI_SMOKE_TIER_3_9_RUNTIME_BATCH + TRACK_2_INVENTORY
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
unexpected_errors:
screenshots/network_notes:
```

---

## 10. Known not-yet-done (DO NOT smoke these — they don't exist yet)

- ❌ Auto-confirm of trusted customers (PR #54 design only)
- ❌ Auto-create-order + append same-day same-customer (PR #54 design only)
- ❌ Multi-code batch Manual Booking (PR #54 design only)
- ❌ Drag/drop customer to slot (Tier 3.10-E)
- ❌ V Rich pill+drawer board (Tier 3.10-B/C/D)
- ❌ Outbound message send (Tier 4.5)
- ❌ Facebook webhook / runtime (Tier 4.1+)
- ❌ Sale operations summary panel (Track 3 design only)
- ❌ Bulk Start/End No. on `/inventory/new` (PR 3.9-D2 deferred)
- ❌ Image upload on Quick form (use edit page after create)

These are intentionally out of smoke scope. Do NOT mark them as
failures — they are not implemented yet.

---

## 11. Pass / Fail next steps

### If all sections A-F PASS

- Section G + H bonus
- Report `UI_SMOKE_PASS`
- Claude prepares next autonomous block per Boss's morning order

### If any critical section fails

- Take screenshot + Network tab response
- Note error toast verbatim
- Report `UI_SMOKE_FAIL` with section ID + evidence
- Claude classifies failure + opens focused hotfix branch
- Do NOT start Phase 1.5 runtime
- Do NOT start Facebook runtime

### If Section G fails or `not_applicable`

- PR #60 status: either not merged yet OR introduced a regression
- Check `gh pr view 60` for merge status before flagging as bug

---

## 12. Cross-references

- `docs/superpowers/handoffs/2026-05-22-resume-after-overnight-tier-3-9-followup.md` — overnight Tier 3.9 batch (PR #51-#58)
- `docs/superpowers/2026-05-22-sale-auto-confirm-auto-order-design.md` (PR #54) — Phase 1.5 design (do NOT smoke; not implemented)
- `docs/superpowers/2026-05-22-tier-3-9-phase-1-post-smoke-audit.md` (PR #50) — bug catalog source-of-truth
- `tests/e2e/prod-unauth-smoke.spec.ts` — 16-test unauth baseline (Claude runs this)
