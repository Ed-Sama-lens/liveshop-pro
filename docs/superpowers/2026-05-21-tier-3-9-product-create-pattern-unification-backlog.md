# Tier 3.9 — Product Create Pattern Unification Backlog

**Filed:** 2026-05-21 (during Tier 3.8 production smoke; 5 issues surfaced)
**Priority:** P0 — workflow gaps surfaced immediately after Tier 3.8 went live
**Source:** Boss feedback verbatim during smoke
**Status:** Backlog only. Do NOT implement until Codex + ChatGPT review.

---

## 1. Boss feedback (translated, verbatim intent preserved)

> "พบปัญหาหลังจาก Tier 3.8 deploy:
>
> 1. กด `+ สร้างสินค้า + รหัส CF` → กรอก stockCode `20.5.2026-CM` + saleCode `CM` + Start 1 End 10 → สร้างสำเร็จ 10 รหัส แต่ **Panel ไม่ refresh tile ใหม่ให้** ต้องกด `+ เพิ่มสินค้าจาก Stock` ซ้ำ ถึงเห็น
>
> 2. ใน `+ เพิ่มสินค้าจาก Stock` search CM → เจอ CM1-CM10 แต่ **เลือกได้ทีละตัวเท่านั้น** — เพิ่มทีละรหัสไม่สะดวกเลย ควรมี multi-select / all
>
> 3. ใน dialog เดียวกัน — แม้สินค้าใน stock มี CM1 อยู่แล้ว ระบบ **บังคับกรอก `รหัสสินค้า / Display Code` + `ราคาพิเศษ` ซ้ำ** ทั้งที่สินค้านั้นมีรหัสอยู่แล้ว ควรใช้ saleCode/SKU ของ variant เป็น displayCode ตรงๆ
>
> 4. ตรวจ `/inventory > + สินค้าใหม่` — **ยังเป็น form แบบเก่า** ที่ฉันสั่งให้แก้ไปก่อนหน้า ยังไม่ได้ปรับให้เหมือน Quick Create dialog
>
> 5. ทุกจุดใน app ที่มีคำสั่งเพิ่มสินค้าเข้า stock **ต้องใช้ pattern เดียวกันทุกจุด** ไม่งั้นต้องมานั่งแก้ซ้ำปัญหาเดิมๆ ระบบเพิ่ม + edit สินค้า ต้อง use pattern-format เดียวกันทั้งระบบ
>
> deep research dig deep ให้หมด"

---

## 2. Issue inventory

### Issue #1 — Product Codes panel ไม่ refresh หลัง quick-create

**Symptom:** POST `/api/sale/quick-product-codes` returns 201 + correct items, but `SaleProductGridPlaceholder` panel does not show new tiles. Admin must trigger `AddFromStockDialog` to force a re-render path.

**Root cause hypothesis** (needs verification):
- `SaleWorkspaceShell` refetch path goes through `GET /api/sale/live-sessions/[liveSessionId]/broadcast-products` (live-session-scoped)
- Quick-create produces **evergreen** BroadcastProduct rows (`liveSessionId = null`)
- Live-session-scoped endpoint filters them out → tiles never appear in this view
- The `+ เพิ่มสินค้าจาก Stock` dialog may use a different fetcher (`/api/sale/broadcast-products` shop-scoped) that the panel coincidentally re-renders from

**Files to investigate:**
- `src/components/sale/SaleWorkspaceShell.tsx` — refetch logic
- `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` — live-scoped query
- `src/app/api/sale/broadcast-products/route.ts` — shop-scoped query (does it include evergreen?)
- `src/server/repositories/broadcast-product.repository.ts` — `list()` method scope param

**Possible fixes (Codex/ChatGPT to decide):**
- A. Switch panel fetcher to `GET /api/sale/broadcast-products?scope=all` (or `evergreen` + `live`)
- B. Have Quick-create dialog optimistically prepend created items to panel state
- C. Make `onProductCreated` refetch from a shop-scoped union endpoint
- D. New endpoint `GET /api/sale/broadcast-products?liveSessionId=X&includeEvergreen=true`

**Risk:** Medium — changes panel data source. Storefront/admin coupling matters.

### Issue #2 — Add from Stock single-select only

**Symptom:** `AddFromStockDialog` search returns matches; admin can click only one. To wire CM1-CM10 from stock → need 10 dialog opens.

**Root cause:** Dialog design (Tier 3 PR #4) = pick 1 variant + assign 1 displayCode + 1 priceOverride + 1 isPinned. Not batched.

**Files to investigate:**
- `src/components/sale/AddFromStockDialog.tsx` — current state machine
- `src/lib/validation/broadcast-product.schemas.ts` — `createBroadcastProductBodySchema` (does it accept arrays?)
- `src/app/api/sale/broadcast-products/route.ts` — POST handler

**Possible fixes:**
- A. Checkbox column in search results + bulk submit → `POST /api/sale/broadcast-products/bulk` (new route)
- B. Reuse Tier 3.8 `quickProductCodesRepository.createBulk` for the bulk path (admin picks N existing variants → server creates N BPs)
- C. Convert dialog to multi-step: search → select multiple → review → confirm

**Risk:** Medium — new route or schema variant. Must keep tenant safety.

### Issue #3 — displayCode + priceOverride forced redundantly

**Symptom:** When admin picks CM1 from stock (Variant.sku = CM1, Product.saleCode = CM1), form still demands separate `รหัสสินค้า / Display Code` + `ราคาพิเศษ`.

**Root cause:** Tier 3 schema treats `displayCode` and `priceOverride` as always-required on the dialog because the original design separated "display in `/sale`" from "stock SKU". Boss's workflow has these as 1:1.

**Files to investigate:**
- `src/components/sale/AddFromStockDialog.tsx` — form fields
- `src/lib/validation/broadcast-product.schemas.ts` — `createBroadcastProductBodySchema` displayCode requirement
- `src/server/repositories/broadcast-product.repository.ts` — current uniqueness logic

**Possible fixes:**
- A. Default displayCode to selected variant's `sku` or product's `saleCode`. Make field optional.
- B. Default priceOverride to empty (use variant.price). Field already optional in schema; remove "required" attribute from form.
- C. Add "smart prefill" toggle: if 1:1 mapping detected, auto-fill + skip those steps.

**Risk:** Low — form-layer + default-value fix. Schema already allows priceOverride optional.

### Issue #4 — `/inventory/new` form not unified

**Symptom:** Boss opens `/inventory > + สินค้าใหม่` → sees OLD form (name + stockCode + saleCode + category + description + variant section with SKU/price/cost/quantity/lowStockAt/attributes). Tier 3.8 only relaxed Zod validation — did NOT rewrite the form UI.

**Root cause:** Scope of Tier 3.8 PR-A was schema relaxation only. Form layout change deferred.

**Files to investigate:**
- `src/app/(app)/inventory/new/page.tsx` — current wrapper
- `src/components/inventory/ProductForm.tsx` — 342-line component, multi-variant editor
- `src/components/sale/CreateQuickProductCodeDialog.tsx` — new Tier 3.8 dialog (reference shape)

**Possible fixes:**
- A. Rewrite `/inventory/new` to embed `CreateQuickProductCodeDialog` (or its sub-fields) as the primary path. Add "Advanced" toggle for multi-variant.
- B. Make `CreateQuickProductCodeDialog` the canonical form; `/inventory/new` becomes a thin wrapper that calls it inline.
- C. Extract shared form sections (`<ProductBasicFields>`, `<VariantBasicFields>`, `<BulkRangeFields>`) so both surfaces reuse the same primitives.

**Risk:** Medium — `/inventory/new` is the only path that lets admin edit multi-variant products today. Cannot lose that capability.

### Issue #5 (meta) — Pattern unification mandate

**Boss directive:** Every surface that creates or edits a Product/Variant in the app must use the SAME pattern.

**Audit needed** to find every surface:
- `/inventory/new` (current OLD form)
- `/inventory/[id]` edit (current full form)
- `/sale > + สร้างสินค้า + รหัส CF` (NEW Tier 3.8 dialog)
- `/sale > + เพิ่มสินค้าจาก Stock` (Tier 3 dialog — only creates BroadcastProduct, doesn't create Product/Variant)
- `/sale > Product Code tile → edit` (Tier 3.6 dialog — edits BroadcastProduct, NOT Product/Variant)
- CSV import (`/api/products/import`) — bulk Product+Variant creation
- Any other route that POSTs to `/api/products` or `/api/products/[id]`
- Bulk operations in `/inventory` list (BulkEditBar component)

**Decision needed:** Which is canonical?
- Option A: Tier 3.8 Quick Create dialog wins. Other surfaces become thin wrappers.
- Option B: New unified "ProductFormCanonical" component. All surfaces use it.
- Option C: Form-section primitives (no canonical "form" — only canonical "fields").

---

## 3. Required improvements

Per Boss directive: all 5 issues must be fixed in coordinated PRs, not piecemeal.

Suggested PR sequence:

### PR-1: Investigation + audit doc (R0)
- Audit every product-create/edit surface
- Document data flow for each (which API, which schema, which fetcher)
- Define canonical pattern (decision A/B/C from § 2.5)
- Codex + ChatGPT review before code

### PR-2: Fix Issue #1 — Panel refresh (R1)
- Quick-create panel must show created tiles immediately
- Decide A/B/C/D from § 2.1
- Test: live + evergreen mixed display

### PR-3: Fix Issue #3 — Smart displayCode default (R1)
- Lowest-risk wins: form-layer prefill + remove redundant required
- Tests: schema accepts undefined displayCode + saleCode fallback

### PR-4: Fix Issue #4 — `/inventory/new` rewrite (R1)
- Apply canonical pattern from PR-1
- Preserve advanced multi-variant via "Advanced" mode
- Tests: form render + submit + bulk + variant editing

### PR-5: Fix Issue #2 — Multi-select Add from Stock (R1)
- Schema + route accept array
- Dialog adds checkbox column + bulk submit
- Tests: 1-of-N select, all-select, partial-failure handling

### PR-6: Pattern unification PR (R2 mostly)
- Replace remaining inconsistent surfaces with canonical primitives
- Update CSV import to share validation rules
- Tests: golden snapshot of each form

### Handoff PR
- Single doc summarizing what changed + how to test all 5 issues

---

## 4. Decision points for Codex + ChatGPT consult

Before any implementation:

1. **Canonical pattern: A / B / C from § 2.5** — single form? primitives? wrappers?
2. **Panel refresh strategy: A / B / C / D from § 2.1** — endpoint change vs optimistic vs union endpoint
3. **Multi-select scope** — pure UI checkbox vs backend bulk route vs reuse Tier 3.8 repo
4. **`/inventory/new` deprecation** — replace fully? keep "Advanced" mode? feature-flag rollover?
5. **Multi-variant editing** — Tier 3.8 dialog supports 1 variant only. Multi-variant needs separate path. Where?
6. **Variant attributes** — Tier 3.8 doesn't expose `attributes` (color, size, etc). Acceptable for live-selling but maybe not for storefront?
7. **Sequencing** — PR-2 (panel refresh) ahead of full rewrite to unblock workflow now?
8. **Image upload** — still deferred (Tier 3.9.5?) or include in this round?
9. **Edit-in-stock nested dialog** (from Tier 3.7 backlog § 2.4) — bundle with this Tier 3.9 work?
10. **Feature flag rollout** — `ALLOW_UNIFIED_PRODUCT_FORM=true` for staged migration?

---

## 5. Audit checklist (to run during PR-1 investigation)

```bash
# Find every product/variant create/edit POST/PATCH path
grep -rn "/api/products" src/ --include='*.ts' --include='*.tsx'
grep -rn "POST.*products\|PATCH.*products" src/

# Find every component that owns product/variant form state
find src/components -name "*Form*" -o -name "*Product*" -o -name "*Variant*"

# Find every route handler under /api/products
ls -R src/app/api/products/

# Find every place ProductCategory is created/edited
grep -rn "productCategory" src/

# Find every place that calls createProductSchema or createVariantSchema
grep -rn "createProductSchema\|createVariantSchema" src/

# Find every storefront product display path (consumers of new pattern)
grep -rn "product.name\|product\\.images" src/app/shop/
```

Result goes into a "Surface audit" matrix in PR-1.

---

## 6. Risks per issue

| Issue | Risk |
|---|---|
| #1 Panel refresh | Medium — touches data source; storefront may share endpoint |
| #2 Multi-select | Medium — new route OR schema variant + bulk transaction |
| #3 displayCode default | Low — form-layer + small schema relaxation |
| #4 `/inventory/new` rewrite | Medium — removes/restructures admin's main entry |
| #5 Pattern unification | High — wide-blast-radius refactor; must batch carefully |
| **Cumulative** | **HIGH** — 5 issues = potential 1500-2500 LOC across many files |

---

## 7. What this docs does NOT do

- Does NOT implement any of the 5 fixes
- Does NOT modify schema
- Does NOT change runtime
- Does NOT block Boss from continuing current Tier 3.8 smoke if useful workarounds exist
- Does NOT pre-empt Codex / ChatGPT review

---

## 8. Boss instruction

> "deep research dig deep ให้หมด — แต่จดไว้ก่อน. ยังมีส่วนที่ต้องให้แก้ไขอีก."

Pending more issues from Boss before implementation begins.

---

## 9. Cross-references

- Tier 3.7 backlog (superseded): `docs/superpowers/2026-05-20-tier-3-7-inline-product-variant-creation-backlog.md`
- Tier 3.8 backlog: `docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md`
- Tier 3.8 implementation handoff: `docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-implementation-handoff.md`
- Sale UI polish backlog: `docs/superpowers/2026-05-15-sale-ui-qa-polish-backlog.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`

---

End of backlog. Do NOT implement until Boss/Codex/ChatGPT explicit approval.
