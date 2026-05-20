# Tier 3.8 — Quick Bulk Product Code Creation (Live-Selling Workflow)

**Filed:** 2026-05-20 (during Boss D4/D6 smoke Step A workaround, when Inventory create form blocked Boss with Validation failed + UX gap)
**Priority:** **P0** — blocks Boss's actual live-selling workflow
**Source:** Boss feedback during D4/D6 smoke workaround; comparison to Boss's previous POS system
**Status:** Backlog, NOT implemented. Boss explicit instruction: DO NOT IMPLEMENT until Codex + ChatGPT consult.

---

## 1. Problem statement

Boss's real live-selling workflow does NOT match current `/inventory` create form assumptions.

### Boss's actual workflow (from previous POS system)

1. Before live or chat session: bulk-create empty product code stubs (e.g. `CM1`, `CM2`, ... `CM100`)
2. During live: customers commit to specific codes (`เอา CM7 ค่ะ`)
3. After confirm: admin edits the code's name + price + quantity inline
4. Each code starts with quantity 1 + price 0 → filled in only when sold

### Current `/inventory` form breaks this workflow

Boss tried to create one product to unblock D4/D6 smoke. Got `Validation failed` error after filling minimal fields (likely from `quantity: 0` rejection, `price: 0` rejection, or `category` required).

### UX comparison

| Field | Current `/inventory` form | Boss's previous POS form (image 4) | Boss request |
|---|---|---|---|
| ชื่อสินค้า (name) | **required** | **optional** (Product Details) | optional — edit later |
| รหัสสต็อก (stock code) | required | **required** (Product Stock Code) | required |
| รหัสขาย (sale code) | required | **required** (Sale Code) | required |
| หมวดหมู่ (category) | required-ish dropdown (no default) | n/a in image 4 | optional + 3 fixed categories + edit later |
| Description | required-ish text | optional Product Details | optional |
| รูปสินค้า (image) | **required upload** (assumed) | n/a in image 4 | optional |
| Start / End No. (bulk) | **does NOT exist** | **exists** (1 → 100 range) | required new feature |
| SKU | required | implicit (auto from sale code?) | derive from sale code + start/end |
| ราคา (price) | rejects 0 | accepts 0 | accept 0 (default) |
| จำนวน (quantity) | rejects 0 (?) | accepts | accept 0 (treat as out-of-stock) |
| แจ้งเตือนสต็อกต่ำ | optional | n/a | optional |
| ราคาต้นทุน (cost) | optional | n/a | optional |

---

## 2. Boss explicit spec for new create form

Verbatim Boss instructions (Thai source, translated for engineer audience):

### 2.1 Required fields (กรอกบังคับ)
- **รหัสสต็อก** (`stockCode`)
- **รหัสขาย** (`saleCode`)

### 2.2 Optional fields (ไม่บังคับ — edit later)
- **หมวดหมู่** (`category`) — fixed 3 options:
  1. `วัตถุมงคล` / `amulets`
  2. `ชุดไหว้-ของไหว้` / `Pray Set`
  3. `ทำบุญ` / `donation`
  - Default = `ไม่มีหมวดหมู่` if not selected
  - Editable later in Product Codes panel
- **รูปสินค้า** (`image`) — single image upload, optional
- **ชื่อสินค้า** (`name`) — optional, default empty string
- **ข้อมูลสินค้า** (`description`) — optional, default empty
- **จำนวน** (`quantity`) — accept 0 (UI shows "สินค้าหมด" / "out of stock"); default 0 if blank
- **แจ้งเตือนสต็อกต่ำที่** (`lowStockAt`) — optional; if set, system warns when stock drops below
- **ราคา (RM)** (`price`) — accept 0 (default if blank); shown as 0 in UI
- **ราคาต้นทุน (RM)** (`costPrice`) — fully optional

### 2.3 Bulk create feature
- **Start Number** (`startNo`) — optional integer
- **End Number** (`endNo`) — optional integer
- Behavior:
  - If both **blank** → create 1 product with the codes as-typed
  - If both **set** (e.g. `1` and `67`) → create `67 - 1 + 1 = 67` products:
    - `stockCode` = base + `i` (e.g. `20.5.2026-CM1`, `...CM2`, ..., `...CM67`)
    - `saleCode` = base + `i` (e.g. `CM1`, ..., `CM67`)
    - Each gets `quantity = 1`, `price = 0`, `name = ''`
  - Pattern: append number directly to base codes (no separator unless typed by user)

---

## 3. Required improvements

### 3.1 Fix `Validation failed` bug (image 1)

Investigate `/api/products` POST + `productSchemas` / Zod validation:
- Identify why fields Boss filled triggered fail
- Most likely: `quantity: z.number().int().min(1)` should be `.min(0)`
- Or: `price: z.number().positive()` should be `.nonnegative()` (allow 0)
- Or: `category: z.string()` should be `.optional()` or `.nullable()`

Surface exact field errors to UI (currently just toast `Validation failed` with zero detail — admin cannot debug).

### 3.2 Rewrite `/inventory/new` form

Simplify per § 2 spec:
- Remove required attribute from `name`, `description`, `image`, `category`
- Add **Start No.** + **End No.** inputs
- Adjust `quantity` min from `1` to `0`
- Adjust `price` from `positive` to `nonnegative`
- Add fixed 3-category dropdown
- Add empty-default placeholders

### 3.3 Backend transactional bulk create

New route or extended existing `/api/products` POST:
- Accept optional `startNo` + `endNo` in body
- If both set + valid range → server-side loop creates N products + N variants in one Prisma `$transaction`
- Range cap (e.g. max 200 per request) to prevent runaway
- Idempotency key support so retry on flaky network doesn't double-create
- Return array of created product IDs

### 3.4 Cleanup category dropdown

- Add fixed enum: `['AMULETS', 'PRAY_SET', 'DONATION']` (English internal) ↔ Thai display labels
- Either:
  - Seed Category table with these 3 + flag `isSystem: true` (preserves existing dynamic category logic)
  - OR: hardcode constant + skip table (simpler; remove existing Category model if unused elsewhere)
- Decide with Codex + ChatGPT

### 3.5 In-place edit from Product Codes panel

Already covered by Tier 3.7 backlog (edit-in-stock link in Tier 3.6 dialog). Pair Tier 3.8 with Tier 3.7 since Boss explicitly mentioned both.

### 3.6 Inventory list display for empty-name products

- Show fallback `[ไม่มีชื่อ]` placeholder in product list
- Show `0 RM` for price-zero
- Show `สินค้าหมด` badge for quantity-zero
- Sort: most-recently-created first so bulk-created run sits together
- Filter: "incomplete products" (name OR price = 0) to surface what needs filling

---

## 4. PR scope estimate

| Component | New / Modified | LOC est | Risk |
|---|---|---|---|
| `prisma/schema.prisma` — adjust ProductVariant fields if any constraint changes | possible MOD | ~20 | R1 |
| `src/lib/validation/product.schemas.ts` — relax quantity/price/name | MOD | ~50 | R1 |
| `src/lib/validation/product.schemas.ts` — add bulk create body schema | NEW | ~80 | R2 |
| `src/server/repositories/product.repository.ts` — `createBulk` method (transactional) | NEW | ~150 | R1 |
| `src/app/api/products/route.ts` — accept bulk mode in POST | MOD | ~80 | R1 |
| `src/app/(app)/inventory/new/page.tsx` — simplified form + Start/End No. | MAJOR MOD | ~300 | R1 |
| `src/components/inventory/ProductForm.tsx` — simplify or replace | MAJOR MOD | ~250 | R1 |
| `src/lib/constants/categories.ts` — fixed 3-category enum + labels | NEW | ~40 | R2 |
| Seed migration for 3 system categories (if Category table preserved) | NEW migration | ~30 | R1 |
| Inventory list display (`/inventory`) — empty-name fallback + filters | MOD | ~150 | R2 |
| Tests: route bulk create + validation + form | NEW | ~400 | R2 |
| Docker verifier `verify-bulk-product-create.ts` | NEW | ~200 | R2 |
| Handoff doc | NEW | ~200 | R2 |

**Total: ~1,950 LOC** across ~12 files. Major refactor.

---

## 5. Risk + reversibility

- **R-level:** R1 (schema-ish + validation relaxation + new bulk transaction + form rewrite)
- **Blast radius:**
  - Existing products with `quantity > 0` + `price > 0` unaffected
  - Storefront `/shop/[shopId]` may render `[ไม่มีชื่อ]` placeholders for incomplete products — confirm acceptable (or filter `name != ''` in storefront query)
  - Existing CSV export must handle empty name
  - Image upload R2 path unchanged
- **Schema impact:**
  - If Boss accepts `name` empty: relax DB constraint OR keep DB constraint + default to `'(ไม่มีชื่อ)'`
  - `quantity` already `Int` not `Int @check >= 1`, likely no schema change
  - `price` is `Decimal`, likely no schema change
  - Decision needed: introduce `Category` enum vs keep flexible Category table
- **Storefront safety:** prevent empty-name products from being publicly listed by default; admin marks `isActive` only after filling. Default `isActive: false` on bulk create.
- **Tenant safety:** `Product.shopId` from session, all variants `productId` from same Product, BroadcastProduct not created here (separate Tier 3.7)
- **Rollback:** revert PR; preserve existing products; reseed Category if changed

---

## 6. Decision points for Codex + ChatGPT consult

Before any implementation, decide:

### 6.1 Category model
- (a) Hardcoded enum constant (`AMULETS | PRAY_SET | DONATION | null`) — simpler, no migration
- (b) Seed 3 system categories in Category table — keeps dynamic category support for future
- (c) Hybrid: 3 hardcoded "system" + admin can add custom

**Boss preference:** lock to 3 forever vs allow future expansion?

### 6.2 Bulk create transaction scope
- (a) Single `$transaction` wrapping all N products + N variants (atomic; slower; risk timeout at N=200)
- (b) Per-product transaction in a loop (faster; partial-fail recovery needed)
- (c) Batch insert via `createMany` (fastest; but Prisma `createMany` doesn't return IDs and doesn't cascade to variants)

**Recommendation needed.**

### 6.3 Bulk range cap
- 100? 200? 500?
- Hard cap vs feature flag

### 6.4 Idempotency strategy
- Header `Idempotency-Key`?
- Composite unique constraint `(shopId, stockCode)` already exists → P2002 catch?
- Replay returns existing products or 409?

### 6.5 Empty name in storefront
- Hide from public list?
- Show with placeholder `[Untitled]`?
- Block checkout for empty-name products?

### 6.6 Validation error UX
- Replace generic `Validation failed` toast with per-field inline errors
- Use Zod `safeParse` + render `error.issues` as field-level errors
- Map error paths to form field labels

### 6.7 Migration strategy for existing data
- Existing products that REQUIRED `name` non-empty: keep as-is (no migration touch)
- Existing form route: deprecate or hybrid (toggle "simple mode" vs "full mode")

### 6.8 Live-edit during stream
- Tier 3.8 enables creation
- Edit happens in:
  - Tier 3.6 Edit Product Code dialog (BroadcastProduct level — priceOverride + isPinned)
  - Tier 3.7 Edit Variant nested dialog (Product/Variant level — name + price + quantity)
- Confirm coverage matches Boss's live-edit needs

### 6.9 Image upload optional vs default placeholder
- Skip upload → store `imageUrl: null`?
- Show generic gray placeholder in storefront when null?
- Boss can add image later via edit dialog

### 6.10 Storefront `isActive` default
- Bulk-created products: default `isActive: false` (hidden until Boss fills + activates)?
- OR default `isActive: true` and rely on empty-name hide rule?

---

## 7. Sequencing vs Tier 3.7

Both Tier 3.7 and Tier 3.8 touch:
- `src/lib/validation/product.schemas.ts`
- `/inventory` form
- BroadcastProduct creation flow

**Recommendation:**
1. Land Tier 3.8 FIRST (fixes Boss's live-selling workflow + unblocks empty-stock scenarios)
2. Then Tier 3.7 (inline creation from `/sale`) — Tier 3.7's composite route can reuse Tier 3.8's `productRepository.createBulk` (or `createSimple`) helpers

OR

1. Land Tier 3.7's composite route + Tier 3.8's bulk simultaneously in one larger PR series

Codex + ChatGPT to advise sequence.

---

## 8. Acceptance criteria (Tier 3.8 only)

After Tier 3.8 ships:

1. Boss opens `/inventory/new` on empty shop
2. Form shows minimal required: รหัสสต็อก + รหัสขาย
3. All other fields optional + clearly labeled "edit later"
4. Boss types `รหัสสต็อก = 20.5.2026-CM`, `รหัสขาย = CM`, Start No = `1`, End No = `67`
5. Save → server creates 67 products + 67 variants in one transaction
6. Each: `stockCode = 20.5.2026-CM<N>`, `saleCode = CM<N>`, `name = ''`, `price = 0`, `quantity = 1`
7. `/inventory` list shows 67 rows with `[ไม่มีชื่อ]` placeholder + `RM 0` + qty `1`
8. Filter `incomplete` toggles to show only these 67 (empty name OR price 0)
9. Click any row → edit dialog → fill name + adjust price + qty → save → row updates
10. Boss can use the bulk-created codes in `/sale` `+ เพิ่มสินค้าจาก Stock` immediately (search by `CM` returns 67 matches)
11. During live: Boss edits one code's name+price+qty mid-stream → tile + booking flows reflect new data
12. Validation errors surface per-field (not generic `Validation failed`)
13. `quantity = 0` displays `สินค้าหมด` badge (not "เกิดข้อผิดพลาด")
14. `price = 0` displays `RM 0` (not blocked)
15. `name = ''` displays `[ไม่มีชื่อ]` (not crashed)

---

## 9. What this docs does NOT do

- Does NOT change any runtime code in this commit
- Does NOT modify schema
- Does NOT touch checkout / payment / shipping
- Does NOT block current D4/D6 smoke (Boss continues with manual one-by-one workaround or temporarily stops smoke pending Tier 3.8 ship)
- Does NOT decide between Tier 3.7-first vs Tier 3.8-first
- Does NOT pre-empt Codex + ChatGPT review

---

## 10. Boss + Codex + ChatGPT consult required before implementation

Open separate review thread with:

- This backlog doc (§ 1–9)
- The 10 decision points in § 6
- Boss's workflow context (live-selling, bulk pre-create, edit during stream)
- Tier 3.7 backlog doc (`2026-05-20-tier-3-7-inline-product-variant-creation-backlog.md`) for cross-reference

Reviewers decide:

- [ ] Approve simplified form spec
- [ ] Approve bulk create with Start/End No.
- [ ] Decide 6.1 Category model (a/b/c)
- [ ] Decide 6.2 transaction scope
- [ ] Decide 6.3 bulk cap (100/200/500)
- [ ] Decide 6.4 idempotency strategy
- [ ] Decide 6.5 storefront behavior for empty-name
- [ ] Approve validation UX (per-field errors)
- [ ] Decide 6.7 migration: deprecate old form vs hybrid
- [ ] Decide 6.10 `isActive` default
- [ ] Decide Tier 3.7 vs Tier 3.8 sequencing
- [ ] Approve ~1,950 LOC budget (split into smaller PRs if desired)
- [ ] Approve naming `Tier 3.8 — Quick Bulk Product Code Creation`
- [ ] Approve P0 priority vs deferred until D4/D6 smoke + stock decision land

Until all above checked → backlog stays unimplemented.

---

## 11. Naming + branch

- **Tier number:** 3.8 (after Tier 3.7 Inline Product/Variant Creation)
- **Branch when implementation starts:** `feat/tier3.8-quick-bulk-product-code-creation`
- **Optional feature flag:** `ALLOW_BULK_PRODUCT_CREATE` (default OFF, flip after staging confirm)

---

## 12. Bug to file regardless (image 1 — Validation failed)

Even before Tier 3.8 is decided, Boss hit `Validation failed` on a single-product create with reasonable inputs. This is a **separate fast bug fix** that should ship independently:

**Bug spec:**
- Repro: `/inventory/new` → fill ชื่อ + รหัสสต็อก + รหัสขาย + SKU + price 0.00 + quantity 0 → save → `Validation failed` toast
- Root cause: TBD; likely `quantity.min(1)` or `price.positive()` or `category` required
- Fix: identify Zod schema rejection + relax OR surface per-field error
- Trivial: < 50 LOC, R2 if isolated to schema + form error display
- Should not wait for Tier 3.8 decision

File as separate bug ticket: `bug(inventory): validation failed on quantity=0 / price=0 / empty category` — investigate + fix independently.

---

## 13. Cross-references

- Tier 3.7 backlog: `docs/superpowers/2026-05-20-tier-3-7-inline-product-variant-creation-backlog.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Admin onboarding workbook: `docs/superpowers/2026-05-18-admin-onboarding-workbook.md` (update post-Tier-3.8)
- Sale UI polish backlog: `docs/superpowers/2026-05-15-sale-ui-qa-polish-backlog.md`
- Commerce readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`

---

End of backlog entry. **Do NOT implement until Boss + Codex + ChatGPT explicit approval.**
