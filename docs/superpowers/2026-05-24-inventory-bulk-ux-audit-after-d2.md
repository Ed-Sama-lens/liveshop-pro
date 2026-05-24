# Inventory Bulk UX Audit — After Tier 3.9-D2

**Filed:** 2026-05-24 (autonomous docs block Track 2)
**Author:** Claude Sonnet 4.6
**Status:** Audit only. NO runtime change. NO UX edit. Future copy improvement candidates listed at end for Boss review.
**Source files audited:** `src/components/inventory/QuickInventoryProductDialog.tsx` (354 lines) + `src/components/shared/QuickProductFormFields.tsx` (bulk-range block lines 62–246) + `src/server/repositories/inventory-bulk.repository.ts` (P2002 classifier) + `src/app/api/inventory/quick-product-bulk/route.ts` (route handler) + `src/lib/validation/inventory.schemas.ts` (Zod schema) + `src/components/shared/quick-product-form.types.ts` (cap constant).

Companion to:
- `docs/superpowers/2026-05-23-inventory-bulk-d2-final-handoff.md` (architecture)
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` Section L (smoke steps)
- `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` Section L (canonical)
- `docs/superpowers/2026-05-23-inventory-api-reference.md` (API ref)

---

## 0. Scope

Audit user-facing UX of `/inventory/new` quick-create dialog with bulk range toggle ON. Covers:

- Start/End No. UX
- preview count rendering
- max cap copy
- duplicate / conflict copy (P2002)
- success count copy
- quantity 0 / price 0 handling
- optional category / name / details
- Advanced ProductForm fallback path
- what Boss must smoke in workbook v5 Section L
- copy improvements candidate list (NO change unless trivial — held for Boss)

NO runtime edit in this audit. NO copy change. Improvement candidates are recommendations only.

---

## 1. Current UX inventory (verified from source)

### 1.1 Start / End No. inputs

| Item | Behavior | Source |
|---|---|---|
| Label | `Start No.` / `End No.` (English labels, no Thai gloss) | `QuickProductFormFields.tsx:202,215` |
| Input type | `<Input type="number">` | `QuickProductFormFields.tsx:206,219` |
| Required when bulk ON | YES — empty triggers `previewExample === ''` (no preview shown) | `QuickProductFormFields.tsx:65,75` |
| Validation | client: range parsed via `parseInt` + `Number.isFinite` + `start <= end` → previewCount = 1 if invalid | `QuickProductFormFields.tsx:62-71` |
| Server validation | Zod `startNo` + `endNo` required positive ints + `endNo >= startNo` enforced by `inventoryBulkBodySchema` | `inventory.schemas.ts` |
| Aria | `aria-invalid` bound to `fieldErrors.startNo` / `fieldErrors.endNo` | `QuickProductFormFields.tsx:210,223` |
| Reset on toggle OFF | YES — `toggleBulkMode(false)` clears `startNo` + `endNo` to avoid stale carry-over into single-mode submit | `QuickInventoryProductDialog.tsx:192-201` |

**UX observation:** Start/End No. inputs are spatially adjacent in a 2-column grid. Cap hint and preview render below as a single conditional block. Visual hierarchy: toggle → Start/End → preview/cap → quantity/price below.

### 1.2 Preview count

| Item | Behavior | Source |
|---|---|---|
| Render condition | `showBulkRange && previewExample !== ''` | `QuickProductFormFields.tsx:228` |
| Text format | `จะสร้าง: ${previewCount} รายการ: ${saleCodeBase}${start} ถึง ${saleCodeBase}${end}` | `QuickProductFormFields.tsx:82` |
| Icon | `Info` icon (lucide) at `text-muted-foreground` color when under cap | `QuickProductFormFields.tsx:236-237` |
| Edge case empty | When startNo OR endNo empty → previewCount = 1, previewExample = '' → no render | `QuickProductFormFields.tsx:65-67,75-78` |
| Edge case start > end | previewCount = 1 (no render of preview when previewExample === '') | `QuickProductFormFields.tsx:80-82` |

### 1.3 Max cap copy

| Item | Behavior | Source |
|---|---|---|
| Cap value (UI) | `QUICK_PRODUCT_BULK_MAX_RANGE` = 100 | `quick-product-form.types.ts` |
| Cap value (server) | `QUICK_BULK_MAX_RANGE` = 100 (same constant) | `inventory.schemas.ts` |
| Cap hint always visible when bulk ON | `สูงสุด 100 รายการ / รอบ` shown next to toggle label | `QuickInventoryProductDialog.tsx:308` |
| Cap exceeded message | `จำนวน ${previewCount} รายการ เกินขีดจำกัด ${QUICK_PRODUCT_BULK_MAX_RANGE} ต่อครั้ง` + `AlertCircle` icon + `text-destructive` color | `QuickProductFormFields.tsx:239-242` |
| Server hard reject | Zod refusal → 400 with `error` field set to schema message; tested via D2-A unit test "rejects > 100 items" | `tests/unit/app/api/inventory/quick-product-bulk.route.test.ts` |

**UX observation:** Cap hint repeats twice (next to toggle + below inputs when exceeded). Toggle hint is informational; below-inputs hint is reactive error.

### 1.4 Duplicate / conflict copy (P2002)

| Item | Behavior | Source |
|---|---|---|
| When fires | Prisma P2002 unique-constraint violation inside `$transaction` | `inventory-bulk.repository.ts:121-122` |
| Most likely target | `Product.@@unique([shopId, stockCode])` — should NOT fire post Tier 3.9-B-Fix-1 reuse logic | `inventory-bulk.repository.ts:62-64` |
| Error class | `ConflictError` (custom, HTTP 409) | `inventory-bulk.repository.ts:67` |
| Message | `Stock code already exists in this shop with different metadata. Reuse logic failed unexpectedly.` (English-only) | `inventory-bulk.repository.ts:74` |
| Other target | Variant SKU collision — different message returned | `inventory-bulk.repository.ts:67-77` |
| Surfaced to user | `body.error` → `setTopLevelError(body.error ?? 'Create failed')` | `QuickInventoryProductDialog.tsx:238` |

**UX observation:** Conflict copy is English-only. All other dialog labels/messages are Thai. Inconsistency: Boss + Thai-speaking admin sees English error in otherwise-Thai UI. Listed as copy candidate #4 below.

### 1.5 Success count copy

| Item | Behavior | Source |
|---|---|---|
| Trigger | bulk mode response `data.createdCount` is number | `QuickInventoryProductDialog.tsx:246` |
| Message | `สร้างสินค้า ${data.createdCount} รายการสำเร็จ` | `QuickInventoryProductDialog.tsx:247` |
| Post-success behavior | dialog stays OPEN + form resets + admin can continue adding ranges | `QuickInventoryProductDialog.tsx:248-253` |
| Refresh | `router.refresh()` triggered → product list re-fetches in background | `QuickInventoryProductDialog.tsx:250` |
| Single mode | dialog closes on success (legacy UX, no count needed) | `QuickInventoryProductDialog.tsx:256-258` |

### 1.6 Quantity 0 / price 0 handling

| Item | Behavior | Source |
|---|---|---|
| Quantity input min | `min={0}` | `QuickProductFormFields.tsx:259` |
| Quantity label | `จำนวน (0 = สินค้าหมด)` — explicit Thai gloss for 0 case | `QuickProductFormFields.tsx:251` |
| Price input | accepts 0 (Boss requirement) | `inventory.schemas.ts` + D2-A test "price 0 valid" |
| Server validation | `quantity >= 0` + `price >= 0` per Zod | `inventory.schemas.ts` |
| Quantity 0 → status | Product created with 0 stock; surfaces in inventory list as "out of stock" | downstream display |

### 1.7 Optional fields

| Field | Required? | Server fallback if empty |
|---|---|---|
| `name` | optional | server fills placeholder from `saleCode` / `stockCode` (per dialog JSDoc + inventory.schemas) |
| `categoryId` | optional | NULL allowed; cross-shop injection blocked pre-`$transaction` |
| `details` | optional | NULL allowed |
| `cost` | optional | NULL allowed |
| `lowStockAt` | optional | NULL allowed (no alert until configured) |

### 1.8 Advanced ProductForm fallback

| Item | Behavior | Source |
|---|---|---|
| Trigger | Existing "Advanced" toggle on `/inventory/new` page (separate component, NOT this dialog) | `src/app/inventory/new/page.tsx` (per JSDoc reference) |
| Behavior | Renders old `ProductForm` component for multi-variant + upfront image upload | dialog JSDoc lines 56-59 |
| Untouched by D2 | YES — D2-B added bulk toggle to quick dialog only; Advanced path is the same component pre-D2 | confirmed by D2-B PR scope |
| Section L.11 verification | Boss must verify Advanced toggle still works post-D2 | workbook v4/v5 Section L |

---

## 2. Workbook v5 Section L — what Boss must smoke

Per workbook v5 Section L (canonical post PR #122 merge), Boss smokes these 12 sub-sections at `/inventory/new`:

| Sub | Topic | Priority |
|---|---|---|
| L.1 | Toggle default OFF | HIGH |
| L.2 | Toggle ON renders Start/End/preview/cap | HIGH |
| L.3 | Preview count rendering | MED |
| L.4 | Single-mode submit preserves `POST /api/products` (not new endpoint) | HIGH (regression) |
| L.5 | Bulk-mode submit creates N + zero BroadcastProducts | HIGH (regression) |
| L.6 | Reuse-or-create (re-submit same codes returns success + `productCreated: false`) | HIGH |
| L.7 | All-or-nothing rollback when one fails | MED |
| L.8 | Quantity 0 + price 0 valid | MED |
| L.9 | Cap enforcement server-side (try 101 → 400) | HIGH (security) |
| L.10 | RBAC (CHAT_SUPPORT/WAREHOUSE/CUSTOMER → 403) | HIGH (security) |
| L.11 | Advanced ProductForm path untouched | MED (regression) |
| L.12 | Image upload absent in both modes (deferred per dialog JSDoc) | LOW |

**Recommended Boss smoke order:** L.4 → L.1 → L.2 → L.5 → L.11 → L.10 → L.6 → L.8 → L.9 → L.3 → L.7 → L.12.

---

## 3. Possible copy improvements (candidates only — HELD for Boss verdict)

### Candidate #1 — Label Thai gloss for Start/End No.

**Current:** `Start No.` / `End No.` (English)
**Proposed:** `เริ่มที่เลข (Start No.)` / `ถึงเลข (End No.)` or pure Thai `เริ่มที่เลข` / `ถึงเลข`
**Why:** All other dialog labels are Thai. Boss workflow is Thai-first. English-only feels grafted.
**Risk:** R2 — single string change, no behavior. Trivial PR.
**Defer reason:** Boss may prefer English for clarity (numerical context). Held for Boss preference.

### Candidate #2 — Preview text reword

**Current:** `จะสร้าง: 5 รายการ: ABC1 ถึง ABC5`
**Proposed:** `จะสร้าง 5 รายการ — ABC1 ถึง ABC5` (drop double colon, use em-dash)
**Why:** Two colons in one short string feel cluttered. Em-dash separates count from range cleanly.
**Risk:** R2 — single string change, no behavior.
**Defer reason:** Purely cosmetic. Boss may not care.

### Candidate #3 — Cap hint position

**Current:** Cap hint `สูงสุด 100 รายการ / รอบ` next to toggle label, ALSO appears below inputs when exceeded.
**Observation:** Redundant when bulk is OFF (hint shows even when no Start/End entered). Hint also competes visually with toggle label.
**Proposed:** Move cap hint to render BELOW the bulk-range inputs as part of preview block. Toggle label stays clean.
**Risk:** R2 — single layout change, no behavior. Slightly more LOC than other candidates.
**Defer reason:** Visual judgment call. Boss should approve layout direction first.

### Candidate #4 — Translate P2002 conflict message to Thai (RECOMMENDED if any one chosen)

**Current:** `Stock code already exists in this shop with different metadata. Reuse logic failed unexpectedly.` (English)
**Proposed:** `รหัสสต็อกซ้ำในร้านนี้แต่ข้อมูลไม่ตรงกัน (ระบบ reuse ล้มเหลว ติดต่อทีมพัฒนา)` or similar
**Why:** Boss + Thai admin sees English error in otherwise-Thai UI. Conflict is rare (post-reuse logic) so message readability matters when it does fire — admin needs to know what to do.
**Risk:** R2 — single string change in `inventory-bulk.repository.ts:74`. No test depends on exact wording.
**Defer reason:** Boss may want the English form preserved for grep / log clarity. Recommend translate-with-English-suffix for both audiences: `รหัสสต็อกซ้ำ (Stock code already exists)...`

### Candidate #5 — Success message richer

**Current:** `สร้างสินค้า 5 รายการสำเร็จ`
**Proposed:** `สร้างสินค้า 5 รายการสำเร็จ (ABC1–ABC5)` — include code range for confirmation
**Why:** Admin pastes range, hits submit, sees count only. Including range confirms what was actually created (range might differ from input if reuse-or-create returned existing rows).
**Risk:** R2 — string + simple template using `data.items` (already in response).
**Defer reason:** Requires reading `body.data.items[0].saleCode` + `items[last].saleCode`. Trivial but slightly more code than #1/#2.

### Candidate #6 — Show productCreated count separately

**Current:** `สร้างสินค้า 5 รายการสำเร็จ` — does NOT distinguish newly-created vs reused.
**Proposed:** `สร้างใหม่ 3 / reuse 2 / รวม 5` — admin sees reuse hit rate.
**Why:** Reuse-or-create means count !== always-new. Boss wants visibility into actual new rows vs existing.
**Risk:** R2 — single string change using `data.items.filter(i => i.productCreated).length` already in response.
**Defer reason:** Boss may not want extra visual noise. Useful for debugging, possibly not for daily flow.

### Candidate #7 — Confirm count before submit if > 50

**Current:** No confirm dialog. Cap is hard at 100. Admin can submit 90 with one click.
**Proposed:** If `previewCount > 50`, show inline checkbox `ฉันยืนยันสร้าง ${previewCount} รายการ` before enabling Submit.
**Why:** Fat-finger 90 instead of 9 creates 90 product rows in one tx. Hard to undo without manual delete.
**Risk:** R1 — touches submit gate logic + adds form state. More than R2 trivial.
**Defer reason:** Adds friction. Boss may reject. Hold for Boss UX decision.

### Recommendation summary

| Candidate | Recommend ship now? | Risk |
|---|---|---|
| #1 Start/End label Thai gloss | Boss decides | R2 |
| #2 Preview text reword | Boss decides | R2 |
| #3 Cap hint position | Boss decides | R2 |
| #4 Translate P2002 conflict | **Recommend** (user-facing copy consistency win) | R2 |
| #5 Success message + range | Boss decides | R2 |
| #6 productCreated count split | Boss decides | R2 |
| #7 Confirm > 50 gate | Boss decides — adds friction | R1 |

**This audit does NOT ship any of the above.** Boss/ChatGPT verdict needed before any copy PR opens.

---

## 4. Production safety

| Item | Status |
|---|---|
| Runtime change | NONE |
| Copy change | NONE |
| Schema change | NONE |
| Env change | NONE |
| New tests | NONE |
| Source files edited | NONE — audit reads source only |
| pak-ta-kra touched | NO |
| Secrets requested | NO |
| Production probed | NO |

---

## 5. Cross-references

- `docs/superpowers/2026-05-23-inventory-bulk-d2-final-handoff.md` (D2 architecture + behavior contract)
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` Section L (12 sub-sections)
- `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` Section L (canonical post PR #122)
- `docs/superpowers/2026-05-23-inventory-api-reference.md` (API ref)
- `src/components/inventory/QuickInventoryProductDialog.tsx` (dialog, 354 lines)
- `src/components/shared/QuickProductFormFields.tsx` (bulk range block lines 62-246)
- `src/server/repositories/inventory-bulk.repository.ts` (P2002 classifier + repo)
- `src/app/api/inventory/quick-product-bulk/route.ts` (route handler)
- `src/lib/validation/inventory.schemas.ts` (Zod schema)
- `src/components/shared/quick-product-form.types.ts` (cap constant)

---

## 6. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero copy change
- 7 copy improvement candidates listed for Boss verdict
- All evidence cited to source file:line
- pak-ta-kra untouched
- Awaiting Boss verdict on any of the 7 candidates before opening any copy PR
