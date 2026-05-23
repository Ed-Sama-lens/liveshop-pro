# Inventory Bulk Start/End No. — Implementation Plan (PR 3.9-D2)

**Filed:** 2026-05-23 (Block 2 Track T4)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `d870931`
**Status:** Plan only. Implementation deferred — see §3 risk gate.

PR #60 default-flipped `/inventory/new` to Quick Create + held bulk
range as PR 3.9-D2 follow-up. This doc enumerates implementation
options + recommends docs-only land tonight; runtime PR opens after
Boss + ChatGPT verdict on §2 Q1.

---

## 1. Scope

Add Start/End No. bulk range to `/inventory/new` Quick form. Mirrors
the `/sale` quick-create bulk UX (PR #43 + #44, `CreateQuickProductCodeDialog`).

Inventory bulk semantics differ from sale bulk in ONE critical way:
**inventory must NOT create BroadcastProduct rows.**

Sale bulk = Product + Variant + BroadcastProduct (date-bound, ready to live-sell).
Inventory bulk = Product + Variant only (stock-managed; admin attaches to a saleDate later via `/sale` AddFromStock).

---

## 2. Backend options (Boss + ChatGPT decision required)

### Q1: Which backend supports inventory bulk?

| Option | Pros | Cons |
|---|---|---|
| **A — New `/api/inventory/quick-product-bulk` route** | Clean separation; sale + inventory bulk evolve independently | New route + repo + schema; more code |
| B — Extend `/api/sale/quick-product-codes` with `skipBroadcastProduct=true` | Less code | R1 API contract change on a route used by `/sale`; double-purpose route harder to reason about |
| C — Loop existing `/api/products` POST N times client-side | No backend change | N HTTP round-trips; not atomic; partial-failure handling on client |

### Claude recommendation: **Option A (new route)**

Rationale:
- Existing `/api/sale/quick-product-codes` route + repo is already 76+363 lines (route + repo). Forking the BP creation step via flag risks silent semantic drift.
- Inventory bulk is a real domain (stock prep before sale) — a dedicated route makes intent obvious.
- New route can re-use schema fragments from `quickBulkProductCodesBodySchema` (price/cost/quantity/lowStockAt/startNo/endNo) without inheriting BP-creation semantics.
- Migration path: when V Rich board / Tier 3.10 lands a separate "inventory prep" panel, the same backend serves it.

---

## 3. Risk gate (why this doc lands first)

Implementation = 4 reviewable PRs:

| PR | Title | LOC est | Risk |
|---|---|---|---|
| 3.9-D2-A | `feat(inventory): new route POST /api/inventory/quick-product-bulk + repo` | ~400 | R1 |
| 3.9-D2-B | `feat(inventory): UI bulk range toggle + preview count` | ~250 | R1 |
| 3.9-D2-C | `test(inventory): bulk range + atomic transaction tests` | ~300 | R2 |
| 3.9-D2-D | `docs(inventory): D2 handoff + smoke section update` | ~150 | R2 |

Total ~1100 LOC across 4 PRs. Too broad to land tonight without Boss verdict on Q1.

---

## 4. Frontend design (locked, ready for D2-B)

### `/inventory/new` Quick form additions

```
+ ─────────────────────────────────────── +
| Quick Create form (existing fields)    |
| รหัสสต็อก / รหัสขาย / ราคา / ...      |
| ─────────────────────────────────────── |
| ▢ สร้างหลายรหัส (Bulk range)           |   <- new toggle, default OFF
|                                         |
|   ↓ when toggled on                     |
|   Start No. [ 1 ]   End No. [ 67 ]      |
|   Preview: จะสร้าง 67 รายการ:           |
|     CM1, CM2, ... CM67                  |
|   Cap: max 100 per request              |
+ ─────────────────────────────────────── +
```

### Shared with sale quick-create

The existing `QuickProductFormFields` (PR #60) already supports
`showBulkRange={true}`. PR 3.9-D2-B passes this prop true on inventory
side. UI wiring = 1-line change in `QuickInventoryProductDialog`.

### What changes vs sale bulk

- Submit hits `/api/inventory/quick-product-bulk` (NEW) NOT `/api/sale/quick-product-codes`
- No `saleDate` field anywhere
- No BroadcastProduct row created
- Success message: "สร้างสินค้า N รายการ" (not "+ รหัส CF")

---

## 5. Backend design (locked, ready for D2-A)

### Route

```ts
POST /api/inventory/quick-product-bulk
Body: {
  stockCodeBase: string (required),
  saleCodeBase: string (required),
  categoryId?: string,
  productName?: string,
  productDetails?: string,
  imageUrl?: string,
  startNo?: number,
  endNo?: number,
  quantity?: number (default 1),
  lowStockAt?: number,
  price?: string (default '0'),
  cost?: string,
  // NOTE: no `saleDate` field
}
Response: {
  success: true,
  data: {
    createdCount: number,
    items: [{ productId, variantId, stockCode, saleCode }]
  }
}
```

### Repo method

`inventoryQuickProductRepository.createBulk()` — mirrors
`quickProductCodesRepository.createBulk()` but skips the BroadcastProduct
insert step. Same single-vs-bulk branching, same range cap (100), same
atomicity (Prisma transaction).

### RBAC

- OWNER + MANAGER write
- CHAT_SUPPORT denied 403 (read-only role; inventory creation = managerial)
- WAREHOUSE + CUSTOMER denied

### Rate limit

Existing `withRateLimit` middleware (20/15min per IP, shared with sale routes).

---

## 6. Conflict handling

### Unique constraints to honor

| Constraint | Action on conflict |
|---|---|
| `Product.stockCode` per-shop UNIQUE (verify schema) | 409 "Stock code already exists" |
| `ProductVariant.sku` per-product UNIQUE | 409 "Variant SKU already exists" |
| NO BroadcastProduct constraints — none created |

Atomicity: any conflict rolls back the entire batch (Prisma
transaction default).

---

## 7. Tests (PR 3.9-D2-C)

### Route-level

- 401 unauth
- 403 no shopId
- 403 CHAT_SUPPORT / WAREHOUSE / CUSTOMER
- 201 OWNER + MANAGER create
- 400 missing stockCodeBase
- 400 missing saleCodeBase
- 400 bad range (start > end)
- 400 range > 100
- 409 duplicate stockCode within batch
- 409 conflict with existing Product
- Cross-shop isolation
- Response shape: createdCount + items[]
- NO BroadcastProduct row created (verify via prisma mock call count)

### Repo-level

- single mode (startNo/endNo omitted) → 1 product
- bulk mode CM1..CM5 → 5 products with sequential stockCode/saleCode
- transaction rollback on mid-batch failure
- BP repository never touched

### UI helper-level

- toggle hidden by default
- toggle on → preview count helper
- displayCode generation
- payload shape (NO saleDate)

---

## 8. Implementation order

1. **3.9-D2-A** (route + repo + schema) — backend lands first
2. **3.9-D2-C** (tests) — alongside or immediately after backend
3. **3.9-D2-B** (UI) — depends on backend
4. **3.9-D2-D** (docs + smoke update) — last

Each PR independently reviewable. Each ≤ 400 LOC.

---

## 9. Open questions for Boss + ChatGPT

1. **Backend option** — A (new route, recommended) / B (flag on existing) / C (client loop)?
2. **Image URL on bulk** — do we accept `imageUrl` field on bulk inventory, or defer? (sale bulk does; inventory single does NOT)
3. **Category required for bulk** — same as sale bulk (optional)?
4. **Bulk range cap** — keep 100 (matches sale bulk) or lower for inventory (e.g. 50)?
5. **Sequential stockCode pattern** — `20.5.2026-CM1` style (date-prefixed sale-bulk pattern) or simple `CM-001` zero-padded?

Defaults proposed in §5 above are conservative.

---

## 10. Hard no-go

All 3.9-D2-* PRs:

- ❌ No BroadcastProduct row creation
- ❌ No saleDate field
- ❌ No schema migration (existing tables sufficient)
- ❌ No env / flag flip by Claude
- ❌ No outbound / Facebook / payment touch
- ❌ pak-ta-kra untouched

---

## 11. Cross-references

- PR #60 — inventory quick-create default flip (parent)
- PR #43 + #44 — sale quick-create bulk (reference impl)
- `src/components/shared/QuickProductFormFields.tsx` — `showBulkRange` prop ready
- `src/server/repositories/quick-product-codes.repository.ts` — reference for atomic bulk pattern
- `src/lib/validation/sale.schemas.ts` — `quickBulkProductCodesBodySchema` schema source

---

## 12. Decision

This doc lands as `docs(inventory): D2 bulk range implementation plan`.
Zero runtime. Boss + ChatGPT verdict on §9 Q1 (backend option) unlocks
PR 3.9-D2-A.
