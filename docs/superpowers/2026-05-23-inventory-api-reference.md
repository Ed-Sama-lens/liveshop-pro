# Inventory API Reference

**Filed:** 2026-05-23 (Block 6 — post D2-A merge)
**Author:** Claude Sonnet 4.6
**Master baseline:** `8222a2f`
**Status:** Reference. No runtime change.

One-page reference for the new `/api/inventory/quick-product-bulk`
route (Tier 3.9-D2-A). Use during UI development + smoke testing +
verifier authorship.

NO secrets. NO real Page IDs. NO real tokens. Placeholder values only.

Companion to `docs/superpowers/2026-05-23-sale-api-reference.md`.

---

## 1. Auth model

| Role | POST `/api/inventory/quick-product-bulk` |
|---|---|
| OWNER | ✅ |
| MANAGER | ✅ |
| CHAT_SUPPORT | ❌ 403 |
| WAREHOUSE | ❌ 403 |
| CUSTOMER | ❌ 403 |

Every request requires `requireAuth()` + valid `user.shopId`. shopId
sourced from session, never from client query/body.

Rate-limited via shared `withRateLimit` middleware (same bucket as
sale routes, 20 req / 15 min / IP).

---

## 2. Endpoint

### `POST /api/inventory/quick-product-bulk`

Tier 3.9-D2-A. Creates N Product + ProductVariant pairs per request.
NO `BroadcastProduct` rows. NO `saleDate`. NO image upload. All-or-
nothing transaction. Cap = 100 per request.

#### Request body

```jsonc
{
  // Required
  "stockCodeBase": "STK",          // 1..128 chars
  "saleCodeBase":  "CM",           // 1..128 chars

  // Bulk range (optional — single mode if both omitted)
  "startNo": 1,                    // int ≥ 0
  "endNo":   10,                   // int ≥ 0, must be ≥ startNo, range ≤ 100

  // Optional
  "categoryId":      "cat_abc",    // 1..128 chars
  "productName":     "Hat",        // 0..256 chars (placeholder used if blank)
  "productDetails":  "Wool, blue", // 0..2000 chars
  "quantity":        1,            // int 0..999999 (default 1)
  "lowStockAt":      5,            // int ≥ 0
  "price":           "19.50",      // non-negative decimal string ('' → '0')
  "cost":            "12.00"       // non-negative decimal string
}
```

**Deliberately rejected (silently stripped by Zod):**
- `saleDate` — inventory is stock-only; attach to saleDate later via `/sale` flows
- `imageUrl` — image upload deferred per Boss Decision 3; use `POST /api/products/[id]/images` after rows exist
- `variants[]` — flat field shape only; multi-variant creation uses Advanced ProductForm

#### Success response (201)

```jsonc
{
  "success": true,
  "data": {
    "createdCount": 5,
    "items": [
      {
        "productId":       "prod_...",
        "variantId":       "vrnt_...",
        "stockCode":       "STK1",
        "saleCode":        "CM1",
        "productCreated":  true,   // false if existing Product reused (Tier 3.9-B-Fix-1)
        "variantCreated":  true    // false if existing Variant reused
      }
      // ... N items
    ]
  }
}
```

**Note:** response items deliberately do NOT include `broadcastProductId`
(distinguishes this from the sale-side response shape).

#### Error responses

| Status | When | Body |
|---|---|---|
| 400 | Zod validation fails (missing required, bad range, etc.) | `{ "success": false, "error": "Validation failed", "fields": { ... } }` |
| 400 | Category cross-shop or non-existent | `{ "success": false, "error": "Category not found in this shop" }` |
| 400 | displayCode shape invalid | `{ "success": false, "error": "displayCode 'X' must contain only A-Z, a-z, 0-9, _, -" }` |
| 401 | Unauthenticated | `{ "success": false, "error": "You must be signed in to access this resource" }` |
| 403 | Authenticated but no shopId | `{ "success": false, "error": "No shop associated with your account" }` |
| 403 | Wrong role (CHAT_SUPPORT, WAREHOUSE, CUSTOMER) | `{ "success": false, "error": "Insufficient permissions" }` |
| 409 | Variant SKU collision | `{ "success": false, "error": "Variant SKU collision. The existing product has a conflicting variant. Edit the product before retrying." }` |
| 409 | stockCode unexpected collision (reuse path failed) | `{ "success": false, "error": "Stock code already exists in this shop with different metadata. Reuse logic failed unexpectedly." }` |
| 429 | Rate limit hit | `{ "success": false, "error": "Too many requests" }` |
| 500 | Unexpected | `{ "success": false, "error": "..." }` |

#### Atomicity

- Single `prisma.$transaction` covers ALL pairs in the batch
- Any failure (P2002, ValidationError, etc.) rolls back ALL pairs — no partial creates
- Cross-shop category check happens BEFORE the transaction
- displayCode shape check happens BEFORE any DB write inside transaction
- Reuse-or-create Product (Tier 3.9-B-Fix-1) preserves catalog data (name/description/category/images/price) on existing Products

#### Single vs bulk mode

- **Single:** `startNo` + `endNo` both omitted → 1 pair created with `stockCodeBase` / `saleCodeBase` as-typed
- **Bulk:** both provided → N = `endNo - startNo + 1` pairs with suffix `<base><n>`

#### Activity log

Logged action: `INVENTORY_PRODUCT_BULK_CREATED`
Entity: `product`
Entity ID: first item's `productId`
Metadata:
```jsonc
{
  "createdCount":         5,
  "stockCodes":           ["STK1", "STK2", "STK3", "STK4", "STK5"],
  "saleCodes":            ["CM1", "CM2", "CM3", "CM4", "CM5"],
  "productCreatedCount":  5,    // sum of items where productCreated=true
  "variantCreatedCount":  5
}
```

---

## 3. Shared core implementation

Repository delegates Product + Variant creation to
`src/server/repositories/product-bulk-core.ts` (Tier 3.9-D2-R). Same
shared core is used by the sale-side `/api/sale/quick-product-codes`
route, which adds BroadcastProduct + saleDate resolution as its tail.

This guarantees:
- identical reuse-or-create Product semantics across both flows
- identical displayCode shape validation
- identical bulk range cap
- identical pair generation pattern

---

## 4. UI integration (D2-B)

`src/components/inventory/QuickInventoryProductDialog.tsx` toggles
between two submit paths:

| Toggle | Endpoint | Payload shape |
|---|---|---|
| OFF (default) | `POST /api/products` | `{ name, stockCode, variants: [{ sku, attributes, price, quantity, ... }] }` |
| ON | `POST /api/inventory/quick-product-bulk` | flat shape per §2 above |

Toggle default OFF preserves the existing single-product Quick Create
behavior. Boss explicit exclusion: no image upload in either mode.

---

## 5. Non-prod verifier (D2-C)

`scripts/verify-inventory-bulk-product-codes.ts` runs 10 cases against
a local Docker postgres with 6-layer production safety guard:

```bash
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true \
  VERIFY_T39_D2_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:inventory:bulk
```

Cases A-J exit 0 = green. Asserts:
- A — single create + zero BroadcastProduct rows
- B — bulk 1..5 + zero BroadcastProduct rows
- C — quantity 0 preserved
- D — price 0 preserved
- E — no category preserved
- F — reuse-or-create Product (Tier 3.9-B-Fix-1)
- G — bad displayCode shape rolls back full batch
- H — invalid range (endNo < startNo) rejected
- I — max batch (range > 100) rejected
- J — cleanup fixtures

---

## 6. Hard rules (never violate)

- ❌ Inventory bulk MUST NOT create `BroadcastProduct` rows
- ❌ Inventory bulk MUST NOT write `saleDate`
- ❌ Inventory bulk MUST NOT accept image upload in this PR
- ❌ Inventory bulk MUST NOT bypass `requireAuth()` / RBAC / rate-limit
- ❌ Inventory bulk MUST NOT mutate existing Product catalog fields (name/description/category/images/price) on reuse path
- ❌ Inventory bulk MUST be all-or-nothing — partial creates forbidden
- ✅ Inventory bulk MAY reuse existing Product by `(shopId, stockCode)` per Tier 3.9-B-Fix-1
- ✅ Inventory bulk MAY add a missing variant onto existing Product if variant with matching sku does not exist

---

## 7. Cross-references

- PR #101 — D2-R shared core extraction
- PR #104 — D2-A endpoint + repository + schema + tests
- PR #105 — D2-B UI toggle (awaits Boss verdict)
- `src/lib/validation/inventory.schemas.ts` — `inventoryBulkBodySchema`
- `src/server/repositories/inventory-bulk.repository.ts`
- `src/server/repositories/product-bulk-core.ts`
- `src/app/api/inventory/quick-product-bulk/route.ts`
- `tests/unit/app/api/inventory/quick-product-bulk.route.test.ts`
- `tests/unit/lib/validation/inventory.schemas.test.ts`
- `tests/unit/components/inventory/quick-inventory-bulk-payload.test.ts`
- `scripts/verify-inventory-bulk-product-codes.ts` (D2-C)
- `docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md` (plan)
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` (Section L)
