# Inventory Bulk Technical Plan (PR 3.9-D2) — Reuse-Centric Revision

**Filed:** 2026-05-23 (Block 4 — post Boss/ChatGPT Decision 3)
**Author:** Claude Sonnet 4.6
**Master baseline:** `310ddf3`
**Status:** Technical plan — docs only. NO implementation in this PR. Awaits Boss/ChatGPT final verdict on §3 (architecture) and §8 (open questions) before implementation PR opens.
**Supersedes:** `docs/superpowers/2026-05-23-inventory-bulk-range-plan.md` §2 Option A (new route) — Boss verdict 2026-05-23 redirects to reuse approach.

Boss + ChatGPT Decision 3 verdict:

> **Prefer reusing the existing quick bulk product-code route/repository/schema logic if feasible. Do not duplicate backend business logic. Use shared schema/helper. `/inventory/new` bulk range should call or reuse the same safe core logic. If inventory bulk needs a different context from saleDate, add a thin adapter, not a separate parallel implementation. Keep Advanced ProductForm intact. No image upload in this PR. No schema migration unless explicitly approved.**

This plan refactors the original Option A (new route + new repo) into a reuse-centric design using a thin adapter.

---

## 0. Scope rules honored

- Docs-only PR (R2)
- Zero runtime change
- Zero schema migration
- Zero env / flag flip
- Advanced ProductForm untouched
- No image upload added
- pak-ta-kra untouched
- DISSENT 4-bullet not required (R2 docs)
- All R0 protected

---

## 1. Existing reusable surface (audit complete)

Verified by reading:

| File | Lines | Reusable as-is? |
|---|---|---|
| `src/lib/validation/sale.schemas.ts` `quickBulkProductCodesBodySchema` | 169-250 | **YES** — needs thin variant without `saleDate` |
| `src/server/repositories/quick-product-codes.repository.ts` `createBulk` | 161-360 | **PARTIAL** — Product+Variant create/reuse logic reusable; BroadcastProduct insert (lines 295-306) NOT reusable for inventory |
| `src/app/api/sale/quick-product-codes/route.ts` POST handler | 29-76 | **PARTIAL** — auth + RBAC + rate-limit + validation pattern reusable; activity log message must change |
| `src/lib/validation/sale.schemas.ts` `QUICK_BULK_MAX_RANGE = 100` | 167 | **YES** — cap shared |
| `buildCodePairs()` helper | 87-118 | **YES** — pure fn, no DB |
| `resolveName()` helper | 125-134 | **YES** — pure fn |
| `assertDisplayCodeShape()` helper | 137-149 | **YES** — pure fn, displayCode = saleCode in both flows |

**Conclusion:** ~80% of existing logic is reusable. Only BroadcastProduct insert step (~12 lines) is inventory-incompatible.

---

## 2. Architectural decision — thin adapter via shared core

### 2.1 Proposed extraction

Split existing `quickProductCodesRepository.createBulk` into two layers:

**Layer 1: Shared core** (extracted, both flows call)

```ts
// new file: src/server/repositories/product-bulk-core.ts
async function createOrReuseProductVariantPairs(
  tx: PrismaTransactionClient,
  input: SharedProductBulkCoreInput
): Promise<readonly CreatedProductVariantPair[]>
```

Handles:
- `buildCodePairs()`
- `assertDisplayCodeShape()` per pair (kept as displayCode is shared semantic across flows)
- Category cross-shop verification
- Per-pair: `findUnique(shopId, stockCode)` → reuse-or-create Product + reuse-or-create Variant
- Returns `{ productId, variantId, stockCode, saleCode, productCreated, variantCreated }[]`

Does **NOT** create BroadcastProduct. Does **NOT** resolve saleDate.

**Layer 2: Sale flow** (existing repository, refactored)

```ts
// existing: src/server/repositories/quick-product-codes.repository.ts
async function createBulk(input: QuickBulkProductCodesInput) {
  return prisma.$transaction(async (tx) => {
    const saleDate = await resolveSaleDate(input);  // existing logic
    const pairs = await createOrReuseProductVariantPairs(tx, {...input});  // shared core
    return await createBroadcastProductsForPairs(tx, pairs, saleDate);  // sale-specific tail
  });
}
```

**Layer 3: Inventory flow** (new, thin adapter)

```ts
// new file: src/server/repositories/inventory-bulk.repository.ts
async function createBulk(input: InventoryBulkInput): Promise<InventoryBulkResult> {
  return prisma.$transaction(async (tx) => {
    const pairs = await createOrReuseProductVariantPairs(tx, input);
    // No BroadcastProduct. No saleDate.
    return {
      createdCount: pairs.length,
      items: pairs.map((p) => ({
        productId: p.productId,
        variantId: p.variantId,
        stockCode: p.stockCode,
        saleCode: p.saleCode,
        productCreated: p.productCreated,
        variantCreated: p.variantCreated,
      })),
    };
  });
}
```

### 2.2 Why thin adapter beats new parallel route

| Concern | New parallel route (original Option A) | Thin adapter (this revision) |
|---|---|---|
| Code duplication | ~280 LOC duplicated | ~30 LOC adapter |
| Bug fix propagation | Manual sync between two repos | Single core fix flows both ways |
| Test surface | Duplicate test suites | Shared core tests + thin adapter tests |
| Category cross-shop check | Duplicated | Centralized in core |
| Product reuse logic (Tier 3.9-B-Fix-1) | Risk of inventory drifting from sale semantics | Identical by construction |
| `P2002` conflict classification | Duplicated friendly message logic | Shared (lives in core or both call shared error mapper) |
| Future schema additions | Two places to update | One place |

### 2.3 Refactor risk

Extracting shared core touches `quick-product-codes.repository.ts`. This is R1 (existing sale flow behavior must not change).

**Risk controls:**
- Refactor PR ships **before** inventory PR
- Refactor PR is **behavior-preserving** — full sale test suite + Playwright smoke must pass identically
- Inventory PR depends on refactor PR; if refactor fails review, inventory PR holds

---

## 3. PR sequence (4 PRs, totals match existing plan)

| PR | Title | LOC est | Risk | Depends on |
|---|---|---|---|---|
| 3.9-D2-R | `refactor(sale): extract createOrReuseProductVariantPairs shared core` | ~300 (mostly moves) | R1 | none |
| 3.9-D2-A | `feat(inventory): POST /api/inventory/quick-product-bulk + thin adapter repo` | ~180 | R1 | D2-R |
| 3.9-D2-B | `feat(inventory): UI bulk range toggle on /inventory/new Quick form` | ~150 | R1 | D2-A |
| 3.9-D2-C | `test(inventory): bulk adapter + UI helpers + atomic transaction` | ~250 | R2 | D2-A + D2-B |

Total ~880 LOC across 4 PRs (was ~1100 in original Option A). Each PR ≤ 400 LOC.

---

## 4. Exact reused functions / routes (per Boss Decision 3 requirement)

| Reuse target | Currently in | Reused by | Mode |
|---|---|---|---|
| `buildCodePairs()` | `quick-product-codes.repository.ts` line 87 | New core | Move to core |
| `resolveName()` | same, line 125 | New core | Move to core |
| `assertDisplayCodeShape()` | same, line 137 | New core | Move to core |
| Category cross-shop check | same, line 172-182 | New core | Move to core |
| Reuse-or-create Product logic (Tier 3.9-B-Fix-1) | same, line 231-289 | New core | Move to core |
| `P2002` friendly classifier | same, line 327-358 | Both flows | Stays in caller-specific repo (BP message differs from inventory message) |
| `QUICK_BULK_MAX_RANGE = 100` | `sale.schemas.ts` line 167 | Both schemas | Reused by ref import |
| Numeric suffix pattern (`stockCodeBase + n`) | `buildCodePairs` | Both flows | Identical |
| Range cap validation (`superRefine` block) | `quickBulkProductCodesBodySchema` line 220-250 | New `inventoryBulkBodySchema` | Reused via Zod schema composition |
| Auth + RBAC pattern | `quick-product-codes/route.ts` line 32-42 | New inventory route | Same pattern, same roles |
| `validateBody` + `withRateLimit` middleware | same | Same | Identical |
| Activity log pattern | same line 55-68 | Same | Different `action` + `entity` + `description` |

---

## 5. Inventory-specific schema (composes from existing)

New `inventoryBulkBodySchema` reuses field defs by composition:

```ts
// src/lib/validation/inventory.schemas.ts (NEW file, ~30 LOC)
import { z } from 'zod';
import {
  QUICK_BULK_MAX_RANGE,
  // re-export individual field shapes from sale.schemas.ts if Boss approves
  // OR copy the field-level Zod defs (slightly less DRY but no cross-file coupling)
} from './sale.schemas';

export const inventoryBulkBodySchema = z
  .object({
    // ── identical to quickBulkProductCodesBodySchema ──
    stockCodeBase: z.string().min(1).max(128),
    saleCodeBase: z.string().min(1).max(128),
    categoryId: z.string().min(1).max(128).optional(),
    productName: z.string().max(256).optional().default(''),
    productDetails: z.string().max(2000).optional().default(''),
    startNo: z.number().int().min(0).optional(),
    endNo: z.number().int().min(0).optional(),
    quantity: z.number().int().min(0).max(999_999).optional().default(1),
    lowStockAt: z.number().int().min(0).optional(),
    price: /* same transform as sale */,
    cost: /* same transform as sale */,
    // ── NOT present (per Boss Decision 3) ──
    // saleDate: omitted by design
    // imageUrl: omitted per Boss "No image upload in this PR"
  })
  .superRefine(/* identical range validation to sale */);

export type InventoryBulkBody = z.infer<typeof inventoryBulkBodySchema>;
```

**Schema reuse strategy decision (D2-R-Q1, awaits Boss verdict):**

| Option | Approach | Trade-off |
|---|---|---|
| A | Extract shared field defs to `src/lib/validation/_shared/product-bulk-fields.ts`, both schemas import | Maximally DRY; adds 1 indirection layer |
| **B (recommended)** | Inventory schema duplicates field defs but reuses `QUICK_BULK_MAX_RANGE` + `superRefine` block by composition | Minor duplication; clearer per-flow ownership; matches existing project convention (sale + product schemas already partially duplicate) |
| C | `quickBulkProductCodesBodySchema.omit({ saleDate, imageUrl })` then re-export | Tightest coupling; sale schema changes break inventory silently |

Recommend B.

---

## 6. Boss verdict required answers (per Decision 3 §)

| Question | Answer |
|---|---|
| Inventory bulk writes `saleDate`? | **NO.** Field omitted from schema. Repository never references it. |
| Inventory bulk writes stock-only Product/Variant or BroadcastProduct? | **Stock-only Product + ProductVariant.** No BroadcastProduct row created. |
| Start/End No. handling | **Identical to sale flow.** Reuse `buildCodePairs()` from shared core. Suffix pattern: `stockCodeBase + n`. Schema enforces `endNo >= startNo` + `count <= QUICK_BULK_MAX_RANGE` (100). |
| All-or-nothing behavior | **All-or-nothing.** Single `prisma.$transaction`. Any duplicate stockCode (within batch or vs existing shop) rolls back entire batch. Identical guarantee to sale flow. |
| Max cap | **100 per request** (`QUICK_BULK_MAX_RANGE`). Shared constant. Matches sale flow. Boss may revise via §8 Q3. |
| Duplicate conflict behavior | **Reuse-or-create Product** (Tier 3.9-B-Fix-1) via shared core — same stockCode reuses Product. Variant collision (`@@unique([productId, sku])`) throws `ConflictError` with friendly message: "Variant SKU collision. The existing product has a conflicting variant. Edit the product before retrying." No BroadcastProduct uniqueness check (no BP created). |

---

## 7. Ambiguity assessment — implementation readiness gate

Per Boss Decision 3: "If this requires schema migration or ambiguous product-code ownership, stop and report."

| Concern | Status | Notes |
|---|---|---|
| Schema migration | **NONE required** | Existing `Product` + `ProductVariant` tables sufficient. No new column. No new index. |
| Product-code ownership ambiguity | **NONE** | Existing Tier 3.9-B-Fix-1 logic (reuse Product on matching `shopId, stockCode`) applies identically. Same stockCode across sale + inventory flows = same Product. No fork. |
| Variant SKU semantics | **CLEAR** | `ProductVariant.@@unique([productId, sku])` — sku = saleCode. Reuse logic identical. |
| `BroadcastProduct` interaction | **CLEAR** | Inventory flow does NOT create BP. Admin attaches BP later via `/sale` AddFromStock or quick-product-codes (existing flow). |
| Stock count semantics | **CLEAR** | Inventory bulk sets `quantity` on new variants. Reuse path does NOT change existing variant `quantity` (catalog data preserved per Tier 3.9-B-Fix-1). |
| Existing variant edge case | **HANDLED** | If Product exists but variant with matching sku does not, core creates variant with caller-provided defaults (mirrors sale flow line 247-261). |
| Image upload | **EXCLUDED** | Boss Decision 3: "No image upload in this PR." Schema omits `imageUrl` field. |
| RBAC | **CLEAR** | OWNER + MANAGER write; CHAT_SUPPORT/WAREHOUSE/CUSTOMER denied 403. Same as sale flow. |
| Rate limit | **CLEAR** | Shared `withRateLimit` (20/15min per IP). |

**Verdict: ZERO ambiguity surfaced. Implementation can proceed once Boss approves the 4-PR sequence.**

---

## 8. Open questions for Boss/ChatGPT (before implementation PR)

| # | Question | Recommended answer |
|---|---|---|
| Q1 | Schema reuse strategy (§5) — A extract / B compose / C omit-derive | **B compose** |
| Q2 | Refactor PR scope: extract core only, or also unify `P2002` error mapper? | **Extract core only.** P2002 mapper stays per-flow (sale BP message ≠ inventory message) |
| Q3 | Max cap: keep 100 (matches sale) or lower for inventory (e.g. 50)? | **Keep 100.** Matches sale. Lowering later is non-breaking. |
| Q4 | Category required for bulk inventory? | **Optional** (same as sale bulk) |
| Q5 | Sequential stockCode pattern: `CM` + n simple, OR date-prefixed `20.5.2026-CM1`? | **Simple `CM` + n** (inventory has no date context) |
| Q6 | Should refactor PR (3.9-D2-R) ship without inventory dependency, or hold until inventory PR ready? | **Ship D2-R independently.** Sale flow benefits from cleaner separation immediately. Inventory PR follows after D2-R lands + smoke. |
| Q7 | New inventory route path: `/api/inventory/quick-product-bulk` vs `/api/inventory/bulk-create-products` vs other? | **`/api/inventory/quick-product-bulk`** for naming consistency with `/api/sale/quick-product-codes` |

---

## 9. Implementation gate

**Implementation may NOT begin until ALL of the following are true:**

1. Boss + ChatGPT approve this plan
2. Boss verdict on §8 Q1-Q7 (or accept all 7 defaults)
3. Boss authorizes PR 3.9-D2-R first
4. After D2-R merge + smoke pass, Boss authorizes D2-A
5. After D2-A merge + smoke pass, Boss authorizes D2-B + D2-C

Each PR requires:
- DISSENT 4-bullet (R1 PRs)
- `tsc --noEmit` EXIT=0
- `npm run lint` 0 errors
- Targeted vitest pass + full suite no regression
- `npm run smoke:prod:unauth` 17/17 after Vercel deploy

---

## 10. Stop conditions (per Boss Decision 3 rule)

Halt implementation if any of the following surfaces:

1. **Schema migration required** — current audit says NO, but if refactor surfaces hidden constraint, STOP
2. **Product-code ownership ambiguity** — current audit says NO, but if test reveals divergent behavior between sale + inventory flows, STOP
3. **Sale flow regression** — refactor PR breaks any pre-existing sale test, STOP
4. **`P2002` classification drift** — if extracted core's error path produces wrong friendly message for either flow, STOP
5. **Transaction atomicity loss** — if shared core breaks `$transaction` rollback guarantee, STOP
6. **RBAC drift** — if shared core leaks role check, STOP
7. **Stock count drift** — if inventory reuse path mutates existing variant `quantity` against catalog-preservation policy, STOP
8. **BroadcastProduct created in inventory flow** — assertion failure, STOP
9. **`saleDate` field reaches inventory route** — schema/validation failure, STOP

On any stop: revert PR, file `docs/superpowers/<date>-inventory-bulk-stop-<topic>.md`, await Boss verdict.

---

## 11. Hard no-go

- ❌ No new schema migration without explicit Boss approval
- ❌ No `BroadcastProduct` row creation in inventory flow
- ❌ No `saleDate` field in inventory schema or repository
- ❌ No image upload added (Boss explicit exclusion)
- ❌ No Advanced ProductForm modification (Boss explicit exclusion)
- ❌ No duplicated business logic (Boss explicit reuse requirement)
- ❌ No env / flag flip by Claude
- ❌ No outbound / Facebook / payment touch
- ❌ pak-ta-kra untouched

---

## 12. Cross-references

- PR #60 — `/inventory/new` Quick Create default (parent)
- PR #43 + #44 — sale quick-create bulk (reference impl)
- Original plan — `docs/superpowers/2026-05-23-inventory-bulk-range-plan.md` (Option A new route, now superseded)
- `src/server/repositories/quick-product-codes.repository.ts` — to be refactored in D2-R
- `src/app/api/sale/quick-product-codes/route.ts` — reference for new inventory route
- `src/lib/validation/sale.schemas.ts` lines 167-252 — schema reuse source
- `src/components/shared/QuickProductFormFields.tsx` — `showBulkRange` prop ready (PR #60)
- Boss/ChatGPT verdict 2026-05-23 — Decision 3 reuse mandate

---

## 13. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero schema change
- Reuse-centric architecture per Boss verdict
- Implementation readiness: **READY** (zero ambiguity surfaced)
- Implementation authorization: **HELD** awaiting Boss §8 verdicts + per-PR approval
- Conditional next step: if Boss approves §8 defaults + opens D2-R authority, Claude opens PR 3.9-D2-R as refactor-only (behavior-preserving) with DISSENT 4-bullet
