# Tier 3.8 implementation handoff

**Filed:** 2026-05-20
**Status:** PRs #42 + #43 OPEN, awaiting Boss/ChatGPT review. D4/D6 smoke remains paused.

---

## 1. Boss problem (verbatim translated)

Boss attempted D4/D6 smoke Step A on production. Stock empty → `AddFromStockDialog` returned 0 results → no path to continue inside `/sale`. Switching to `/inventory/new` to create a product hit `Validation failed` with values that match Boss's actual live-selling workflow:

- name: `Khunpan`
- stockCode: `20.5.2026-CM1`
- saleCode: `CM1`
- SKU: `SKU-001`
- price: `0.00`
- quantity: `0`
- category: empty/default placeholder

Boss explained the actual workflow is **code-first**, not **stock-first**:

1. Before live or chat session: bulk-create empty product code stubs (e.g. `CM1`–`CM100`)
2. During live: customers commit to specific codes (`เอา CM7 ค่ะ`)
3. After confirm: admin edits the code's name + price + quantity inline
4. Each code starts with quantity 0 or 1, price 0 → filled in only when sold

Current `/inventory/new` form was stock-first + required strict values + did not support bulk + did not surface specific validation errors.

---

## 2. Workflow change (old vs new)

### Old (stock-first, broken for live-selling)

```
admin → /sale → Product Codes → + เพิ่มสินค้าจาก Stock → search → 0 results → STUCK
  → ↳ admin must switch to /inventory/new → fill 8 fields → save → fail (Validation failed)
  → ↳ retry with non-zero price + quantity → save → variant created
  → ↳ return to /sale → search → click variant → assign displayCode → BroadcastProduct created
total: 6+ tab switches + cognitive overhead per SKU
```

### New (code-first, single flow inside `/sale`)

```
admin → /sale → Product Codes → + สร้างสินค้า + รหัส CF
  → ↳ fill 2 required fields (stockCode + saleCode) + optional Start/End No.
  → ↳ save → server transaction creates N Product + N Variant + N BroadcastProduct
  → ↳ N tiles appear in Product Codes panel immediately
later (during stream): admin clicks tile → Edit Product Code dialog → adjust priceOverride/isPinned
even later: admin can refine name + base price + quantity from /inventory list
total: 1 dialog, 1 transaction, ready in seconds
```

---

## 3. New fields (Tier 3.8 dialog)

Form layout follows Boss's spec (image 4 reference + verbatim Thai bullet list):

| Field | Required | Default | Notes |
|---|---|---|---|
| รหัสสต็อก | ✅ | — | Product.stockCode (must be unique per shop) |
| รหัสขาย | ✅ | — | Product.saleCode + ProductVariant.sku + BroadcastProduct.displayCode (same value) |
| หมวดหมู่ | ❌ | `ไม่มีหมวดหมู่` | dropdown of admin's ProductCategory rows; cross-shop pre-check before transaction |
| รูปสินค้า URL | ❌ | none | URL field only (full upload integration in Tier 3.9) |
| ชื่อสินค้า | ❌ | empty | repo fills placeholder `saleCode → stockCode` when blank |
| ข้อมูลสินค้า | ❌ | empty | Product.description |
| Start No. | ❌ | — | bulk mode trigger; pair with End No. |
| End No. | ❌ | — | bulk mode upper bound |
| จำนวน | ❌ | 1 | 0 accepted (displays `สินค้าหมด`) |
| แจ้งเตือนสต็อกต่ำที่ | ❌ | none | optional integer threshold |
| ราคา (RM) | ❌ | `'0'` | empty transforms to `'0'`; accepts `0` / `0.00` / non-negative decimal |
| ราคาต้นทุน (RM) | ❌ | none | empty → undefined; non-negative when present |

---

## 4. Category behavior

Tier 3.8 uses the **existing dynamic ProductCategory table** (per-shop). Decision rationale:

- Schema already has `ProductCategory @@unique([shopId, name])`
- Boss's 3 categories (วัตถุมงคล / Pray Set / Donation) can be added per-shop via existing admin UI later
- Hardcoded enum would require migration + lose flexibility for future categories
- Quick-create dialog reuses `/api/categories` (already used by `/inventory/new`)

Empty/`__none__` selection → `categoryId: null` in DB. Admin can categorize later via `/inventory/[id]` form.

**Future:** if Boss wants to lock to 3 system categories, add seed migration + read-only UI flag. Not done in Tier 3.8.

---

## 5. Placeholder name behavior

Boss's workflow: bulk-create codes WITHOUT names. Fill names later.

DB `Product.name` is non-null (no schema change). Repository fills placeholder in priority order:

1. Explicit name (when admin types one)
2. `saleCode` (e.g. `CM1`)
3. `stockCode` (e.g. `20.5.2026-CM1`)

Admin can edit later via `/inventory/[id]` (existing form). The placeholder is visible + obvious so admin knows to replace it.

**Storefront impact:** existing storefront pages display `product.name` directly. If admin lists incomplete products in customer-facing routes, they'll see `CM1` until name is filled. PR-A relaxation of `createProductSchema` + ProductForm error UI lets admin edit and fix later without re-creating.

---

## 6. Bulk range behavior

| Input | Behavior |
|---|---|
| `startNo = endNo = undefined` | Single mode: create exactly 1 trio using base codes as-typed |
| `startNo = 1, endNo = 1` | Bulk mode degenerate: create 1 trio with suffix `1` |
| `startNo = 1, endNo = 5` | Bulk mode: create 5 trios numbered 1, 2, 3, 4, 5 |
| `startNo = 1, endNo = 100` | Bulk mode: max allowed (100 items) |
| `startNo = 1, endNo = 101` | Reject 400 with `Bulk range too large: 101 > 100` |
| `startNo = 10, endNo = 5` | Reject 400 with `endNo must be >= startNo` |
| `startNo = 1, endNo = undefined` (or vice versa) | Reject 400 with `startNo and endNo must be provided together` |
| `startNo = -1` | Reject 400 (Zod min(0)) |

Suffix appended directly (no separator) per Boss's `CM1` / `CM67` pattern. If admin wants `CM-1` they must type the dash in the base.

`QUICK_BULK_MAX_RANGE = 100` exported from `sale.schemas.ts`. Increase requires PR + Boss review.

---

## 7. Quantity 0 behavior

- DB accepts 0 (already allowed pre-Tier-3.8)
- Schema (PR-A + PR-B) accepts 0
- UI does not block submit
- Search results / Product Codes panel display `สินค้าหมด` badge
- AddFromStock variant search includes 0-quantity items (Boss can promote them to live without separate re-stock step)
- Reservation logic unchanged (CONFIRMED booking with `quantity > variant.availableQty` still throws `INSUFFICIENT_STOCK`)

---

## 8. Price 0 behavior

- DB `Decimal(12, 2)` accepts `0`
- Schema (PR-A + PR-B) accepts `'0'` / `'0.00'` / empty (transforms to `'0'`)
- UI displays `RM 0` until admin edits priceOverride via Tier 3.6 dialog
- Order conversion at price 0 succeeds (creates order with total `RM 0`); storefront/checkout policy decides whether to allow zero-total orders (out of Tier 3.8 scope)
- Boss workflow: prices filled when item is confirmed during stream via Edit Product Code dialog

---

## 9. Image upload status (deferred)

Tier 3.8 dialog accepts **URL string only**. Full file upload is deferred to Tier 3.9 because:

- R2 upload requires multipart `FormData` + `/api/products/[id]/images` route which expects existing productId
- Two-step flow (create product → upload image) breaks the all-or-nothing transaction guarantee
- Storefront fallback to placeholder when `images = []` already works
- Boss can paste a URL during bulk-create (rare case) or edit later via `/inventory/[id]`

Schema accepts `imageUrl: z.string().url().optional()`. Repo stores `images: imageUrl ? [imageUrl] : []`.

---

## 10. Route + API

### `POST /api/sale/quick-product-codes`

Auth: `requireAuth` + `OWNER | MANAGER` (matches existing `/api/sale/broadcast-products` policy).

Request body (Zod-validated):
```json
{
  "stockCodeBase": "20.5.2026-CM",
  "saleCodeBase": "CM",
  "categoryId": "cat-id" /* optional */,
  "productName": "" /* optional */,
  "productDetails": "" /* optional */,
  "imageUrl": "https://..." /* optional */,
  "startNo": 1 /* optional, pair with endNo */,
  "endNo": 67 /* optional, pair with startNo */,
  "quantity": 1 /* default 1 */,
  "lowStockAt": 5 /* optional */,
  "price": "0" /* defaults to '0' */,
  "cost": "5.00" /* optional */
}
```

Response (`201 Created`):
```json
{
  "success": true,
  "data": {
    "createdCount": 67,
    "items": [
      {
        "productId": "cm...",
        "variantId": "cm...",
        "broadcastProductId": "cm...",
        "stockCode": "20.5.2026-CM1",
        "saleCode": "CM1",
        "displayCode": "CM1"
      },
      /* ... 66 more */
    ]
  }
}
```

Error codes:
- `400` validation failed (with `body.fields` field-level details)
- `401` unauthenticated
- `403` missing shopId or read-only role
- `409` duplicate stockCode or displayCode within shop (transaction rolled back)
- `500` unexpected

---

## 11. Transaction safety

Repository `quickProductCodesRepository.createBulk()` wraps the entire batch in one `prisma.$transaction`:

```typescript
const items = await prisma.$transaction(async (tx) => {
  const results = [];
  for (const pair of pairs) {
    const product = await tx.product.create({ ... });
    const variant = await tx.productVariant.create({ ... });
    const bp = await tx.broadcastProduct.create({ ... });
    results.push({ productId, variantId, broadcastProductId, ... });
  }
  return results;
});
```

Guarantees:
- All-or-nothing: any failure (duplicate, FK violation, network) rolls back all N pairs
- Cross-shop categoryId pre-check **outside** the transaction prevents wasted DB work
- `P2002` (unique constraint) caught + mapped to `ConflictError 409` with safe message

Limitation: serial inserts inside transaction (not batched). At N=100 + ~10ms per insert = ~1s. Acceptable for admin tool. Future optimization: `createMany` (loses returned IDs) or parallel + idempotency-key dedup.

---

## 12. Tests

### Schema (`tests/unit/lib/validation/quick-product-codes.schemas.test.ts`)
**34 cases:**
- Single mode: minimal body, full body, missing fields, length limits
- Bulk mode: valid range, max range, range > max, endNo < startNo, lone startNo, lone endNo, equal start=end, startNo=0, negative startNo
- Price transforms: empty → '0', omitted → '0', valid '9.99', whitespace, negative reject, non-numeric reject
- Cost transforms: omitted → undefined, empty → undefined, valid, negative reject
- Quantity: 0, negative reject, > 999999 reject, default 1
- imageUrl: valid URL, malformed reject, omitted
- productName/details: default empty, > max char reject

### Route (`tests/unit/app/api/sale/quick-product-codes.route.test.ts`)
**15 cases:**
- Auth: 401 unauth
- RBAC: 403 missing shopId, 403 CHAT_SUPPORT, 403 WAREHOUSE, allow OWNER, allow MANAGER
- Validation: 400 missing stockCodeBase, 400 missing saleCodeBase, 400 bulk > 100, 400 endNo < startNo
- Happy path (mocked repo): 201 single, 201 bulk 5, optional fields forwarded
- Error propagation: 409 ConflictError, 400 ValidationError from repo

### PR-A schema (`tests/unit/lib/validation/product.schemas.test.ts`)
**25 cases:**
- createVariantSchema: price 0/0.00/empty/whitespace, quantity 0, costPrice empty/0/negative, lowStockAt 0, missing SKU
- createProductSchema: minimal, empty name, missing stockCode, missing categoryId, Boss's exact failed input

---

## 13. Verifier

`scripts/verify-sale-quick-bulk-product-codes.ts` — 9 cases against Docker postgres:

| Case | Asserts |
|---|---|
| A | Single create with defaults |
| B | Bulk 1..5 creates exactly 5 trios with correct suffixes |
| C | Quantity 0 stored as 0 |
| D | Price 0 stored as 0 |
| E | No category → `product.categoryId = null` |
| F | Duplicate displayCode → ConflictError + transaction rolled back (product count unchanged) |
| G | endNo < startNo → ValidationError |
| H | Range > 100 → ValidationError |
| I | Cleanup |

**Status:** Code committed + guard test PASSES (exits 2 without `CONFIRM_NON_PROD_DB`). Full e2e run pending Docker daemon availability on dev machine.

npm script: `npm run verify:sale:quick-bulk`

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Cross-shop categoryId injection | HIGH | pre-check before transaction; ValidationError if not in shop |
| Empty name reaches storefront | MEDIUM | repo fills placeholder; admin can edit later; storefront displays saleCode/stockCode |
| Bulk transaction timeout at N=100 | LOW | serial inserts ~1s expected; Prisma default timeout 5s |
| Duplicate displayCode within shop | HANDLED | partial unique index in schema; ConflictError 409 + rollback |
| Storefront empty-image | HANDLED | existing fallback to placeholder |
| R2 upload integration gap | DEFERRED | Tier 3.9 |
| Edit-in-stock nested dialog gap | DEFERRED | Tier 3.9 |

---

## 15. What remains deferred (Tier 3.9 + later)

- **Tier 3.9 backlog:**
  - Image upload via R2 in quick-create dialog (currently URL only)
  - Edit-in-Stock nested dialog from `EditProductCodeDialog` (currently only priceOverride + isPinned editable)
  - Inventory list "incomplete products" filter (sort empty-name to top)
  - Bulk-undo / batch-delete created codes if Boss typos
  - Storefront empty-name display policy
- **D4/D6 smoke** — Boss resumes after Tier 3.8 PRs merge
- **Stock decrement X/Y/Z** — orthogonal, separate Boss decision
- **Tier 4.1 Messenger** — orthogonal, separate Boss approval gates

---

## 16. Exact smoke steps after merge

Once PR #42 + PR #43 land on master + Vercel deploys:

1. Boss opens `/sale` on empty shop
2. Product Codes panel shows new `+ สร้างสินค้า + รหัส CF` button (above existing Add-from-Stock)
3. Click → dialog opens
4. Fill minimum: `stockCodeBase = TEST-D6`, `saleCodeBase = TEST-D6`
5. Save → 201 response, 1 tile appears
6. Optional: try bulk: `stockCodeBase = SMK-CM`, `saleCodeBase = SMK-CM`, Start = 1, End = 5 → 5 tiles
7. Click a tile → Edit Product Code dialog → adjust priceOverride to `9.99` + check isPinned → save
8. Tile reflects RM9.99 + pinned position
9. Resume D4/D6 smoke Step B onward (booking + confirm + convert)
10. Cleanup: do NOT delete test BPs; keep as Boss fixture per smoke checklist

If `Validation failed` on any field → PR-A relaxation should accept; if still failing, check exact error text + open hotfix.

---

## 17. PRs in this Tier 3.8 batch

| PR | Branch | Scope | Risk |
|---|---|---|---|
| #42 | `fix/sale-inventory-validation-allow-live-defaults` | PR-A: relax Zod schema + name placeholder + per-field error UI | R1 |
| #43 | `feat/sale-quick-bulk-product-codes` | PR-B: route + repo + dialog + tests + verifier | R1 |
| #44 (this) | `docs/tier-3-8-implementation-handoff` | PR-D: this handoff | R2 |

**No PR-C** — the verifier ships with PR-B per single-file scope.

---

## 18. Recommended Boss/Codex/ChatGPT next actions

1. **Review PR-A** — minimal schema relaxation; verify storefront/order semantics OK with empty-name placeholder
2. **Review PR-B** — composite transaction safety + UI flow + verifier coverage
3. **Merge PR-A first** — unblocks both `/inventory/new` and any cross-route reuse
4. **Merge PR-B** — activates `/sale` quick-create
5. **Merge PR-D** (this) — session record
6. **Run D4/D6 smoke** via UI per § 16
7. **Decide Tier 3.9 priority** — image upload vs edit-in-stock vs both vs neither

---

## 19. Cross-references

- Backlog: `docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md`
- Tier 3.7 backlog: `docs/superpowers/2026-05-20-tier-3-7-inline-product-variant-creation-backlog.md` (superseded by Tier 3.8 scope)
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Sale UI polish backlog: `docs/superpowers/2026-05-15-sale-ui-qa-polish-backlog.md`
- Admin onboarding workbook: `docs/superpowers/2026-05-18-admin-onboarding-workbook.md`
- Commerce readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`

---

End of handoff.
