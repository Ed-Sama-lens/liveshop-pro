# Tier 3.7 — Inline Product/Variant Creation in Sale Workspace

**Filed:** 2026-05-20 (during Boss D4/D6 smoke Step A, before workaround applied)
**Priority:** **P0** — blocks first-time admin onboarding
**Source:** Boss D4/D6 smoke Step A revealed real UX blocker
**Status:** Backlog, NOT implemented. Boss approved post-smoke implementation.

---

## 1. Problem

During D4/D6 functional smoke Step A, Boss opened `/sale` → Product Codes panel → `+ เพิ่มสินค้าจาก Stock`. Searched `test`. Result: **empty** ("ไม่พบสินค้าที่ตรงกับคำค้น").

Root cause: production stock is empty. Existing `AddFromStockDialog.tsx` assumes ≥1 `ProductVariant` already exists for the shop.

### Pain points (Boss feedback verbatim, translated)

1. First-time admin onboarding cannot complete in `/sale` workspace alone
2. Admin must switch `/sale` → `/inventory` → create Product → create Variant → return `/sale` → search → create BroadcastProduct
3. ≥ 4 tab switches per new SKU + cognitive context-switch
4. Breaks "live-selling operator" workflow — operator during live cannot pause to switch tabs
5. Empty-search dialog returns "no match" without guidance — admin doesn't know what to do next

---

## 2. Required improvements

### 2.1 `AddFromStockDialog` (existing) — empty-search CTA

When `/api/products?search=` returns 0 results AND search term length ≥ 2:
- Show CTA button: `+ สร้างสินค้าใหม่ใน Stock`
- Click → expand dialog to inline 3-step composite create flow (see § 3)

### 2.2 Product Codes empty-state CTA

In `SaleProductGridPlaceholder.tsx` empty state (when shop has 0 BroadcastProduct):
- Add second CTA next to `+ เพิ่มสินค้าจาก Stock`: `+ สร้างสินค้า + รหัส CF (ใหม่ทั้งหมด)`
- Click → open new `CreateProductWithVariantAndCodeDialog`

### 2.3 Unified 3-step create flow

New dialog with stepper:
- **Step 1 — สินค้า (Product):** name, stockCode, category, image, isActive (default true)
- **Step 2 — Variant / SKU:** SKU, attributes (JSON or key-value), price, quantity (initial stock)
- **Step 3 — รหัส CF (BroadcastProduct):** displayCode, priceOverride (optional), isPinned (default false), liveSessionId / evergreen toggle

Submit creates all 3 rows in one transactional API call.

### 2.4 Edit-in-Stock link (Tier 3.6 dialog extension)

In `EditProductCodeDialog.tsx`:
- Add link/button: `แก้ไขข้อมูลสินค้าใน Stock` near the read-only Product/Variant section
- Click → open nested `EditVariantDialog` (drawer or modal-in-modal)
- Fields: Product (name, stockCode, category, isActive), Variant (SKU, attributes, price, quantity)
- Save → PATCH both Product + Variant atomically → close drawer → refresh Edit BP dialog state

### 2.5 Backend transactional safety

**Avoid client-side multi-API partial failure.** If admin's network drops between `POST /api/products` and `POST /api/variants`, dangling Product row.

Preferred: composite route + repository method:
- `POST /api/sale/products-with-variant-and-code` (new public route)
- Repository: `broadcastProductRepository.createWithProductAndVariant({ shop, product, variant, broadcastProduct })`
- Single Prisma `$transaction` wrapping all 3 inserts
- Rollback on any failure

### 2.6 Tenant / shop ownership guards

- Product.shopId = authenticated user's shopId (route gate)
- Variant.productId = newly created Product id (FK)
- BroadcastProduct.shopId = same shopId (route gate)
- Cross-shop FK injection: 409 reject

### 2.7 Tests

- New route auth + RBAC (OWNER/MANAGER allow; CHAT_SUPPORT/WAREHOUSE deny)
- New route validation (Zod schema for composite body)
- New route transaction rollback test (force variant insert fail → verify Product NOT created)
- New repo method unit tests
- New `CreateProductWithVariantAndCodeDialog` component test
- Updated `EditProductCodeDialog` with edit-in-stock link
- Updated `AddFromStockDialog` empty-search CTA

---

## 3. PR scope estimate

| Component | New / Modified | LOC est |
|---|---|---|
| `src/app/api/sale/products-with-variant-and-code/route.ts` | NEW | ~150 |
| `src/server/repositories/broadcast-product.repository.ts` | MOD (`createWithProductAndVariant`) | ~120 |
| `src/lib/validation/sale.schemas.ts` | MOD (`createCompositeProductBodySchema`) | ~60 |
| `src/components/sale/AddFromStockDialog.tsx` | MOD (empty-search CTA) | ~40 |
| `src/components/sale/SaleProductGridPlaceholder.tsx` | MOD (empty-state CTA) | ~20 |
| `src/components/sale/EditProductCodeDialog.tsx` | MOD (edit-in-stock link) | ~30 |
| `src/components/sale/CreateProductWithVariantAndCodeDialog.tsx` | NEW | ~350 |
| `src/components/sale/EditVariantDialog.tsx` | NEW | ~250 |
| `tests/unit/app/api/sale/products-with-variant-and-code.route.test.ts` | NEW | ~180 |
| `tests/unit/server/repositories/broadcast-product-composite.test.ts` | NEW | ~150 |
| `tests/unit/components/sale/CreateProductWithVariantAndCodeDialog.test.ts` | NEW | ~120 |
| Handoff doc | NEW | ~150 |

**Total estimate: ~1,620 LOC** across ~12 files. Multi-file, R1.

---

## 4. Risk + reversibility

- **R-level:** R1 (new composite public API route + multi-step UI + Prisma transaction across 3 tables)
- **Blast radius:** new admin-only feature; existing routes unchanged; existing dialogs additive only
- **Rollback:** revert PR (no schema change). Composite route is brand new — no consumer to migrate
- **Schema impact:** ZERO. Uses existing Product / ProductVariant / BroadcastProduct tables
- **Auth surface:** new route uses existing `requireAuth` + RBAC (OWNER/MANAGER)
- **CSP / R2 / payment impact:** none
- **Tenant safety:** must reuse `Shop.id` from session; cross-shop reject

---

## 5. Dependencies

| Dependency | Status |
|---|---|
| Tier 3.6 (Edit Product Code dialog) merged | ✅ done (commit `6a035e5`) |
| Tier 3 (Add from Stock + BroadcastProduct repo) merged | ✅ done |
| `POST /api/products` route exists | needs verification (likely yes per /inventory) |
| `POST /api/variants` route exists | needs verification |
| `PATCH /api/products/[id]` route exists | needs verification |
| `PATCH /api/variants/[id]` route exists | needs verification |
| D4/D6 functional smoke pass | in progress (Boss using workaround A) |
| Stock decrement decision X/Y/Z | orthogonal (does NOT block) |

---

## 6. Implementation phase plan

| Phase | Item | LOC | Risk |
|---|---|---|---|
| 3.7.0 | Verify existing `/api/products` + `/api/variants` POST/PATCH routes; document API shape | 0 (audit) | R0 |
| 3.7.1 | Add Zod composite schema in `sale.schemas.ts` | ~60 | R2 |
| 3.7.2 | Add `broadcastProductRepository.createWithProductAndVariant` (Prisma transaction) | ~120 | R1 |
| 3.7.3 | Add `POST /api/sale/products-with-variant-and-code` route + auth + RBAC + validation | ~150 | R1 |
| 3.7.4 | Add repo + route unit tests | ~330 | R2 |
| 3.7.5 | NEW `CreateProductWithVariantAndCodeDialog.tsx` (stepper UI) | ~350 | R2 |
| 3.7.6 | MOD `SaleProductGridPlaceholder.tsx` empty-state CTA | ~20 | R2 |
| 3.7.7 | MOD `AddFromStockDialog.tsx` empty-search CTA | ~40 | R2 |
| 3.7.8 | NEW `EditVariantDialog.tsx` | ~250 | R2 |
| 3.7.9 | MOD `EditProductCodeDialog.tsx` edit-in-stock link | ~30 | R2 |
| 3.7.10 | Component tests | ~120 | R2 |
| 3.7.11 | Docker verifier `verify-tier3-7-composite-create.ts` (full 9-case A-I against local Docker) | ~250 | R2 |
| 3.7.12 | Handoff doc | ~150 | R2 |

Each phase = one PR. Sequence allows Boss to merge incrementally + verify CI green per step.

---

## 7. Acceptance criteria

After Tier 3.7 ships, first-time admin should be able to do this **without leaving `/sale`**:

1. Open `/sale` on empty shop
2. Click `+ เพิ่มสินค้าจาก Stock` OR `+ สร้างสินค้า + รหัส CF (ใหม่ทั้งหมด)`
3. Fill 3-step form (Product → Variant → Product Code)
4. Submit → 201 with all 3 rows created in transaction
5. Tile appears in Product Codes panel immediately
6. Click tile → Edit Product Code dialog opens
7. Click `แก้ไขข้อมูลสินค้าใน Stock` → nested dialog opens
8. Edit Product/Variant fields → save → atomic PATCH
9. Close → back to Edit BP dialog with fresh data
10. D4/D6 functional smoke flow can complete on truly empty shop

---

## 8. What this docs does NOT do

- Does NOT change runtime code in this commit
- Does NOT block current D4/D6 smoke (Boss uses workaround A — manual `/inventory` → `/sale`)
- Does NOT modify schema
- Does NOT change auth surface beyond reusing existing patterns
- Does NOT touch checkout / payment / shipping
- Does NOT impact stock decrement decision X/Y/Z

---

## 9. Boss + ChatGPT consult required before implementation

After D4/D6 smoke completes (with workaround), Boss + ChatGPT review:

- [ ] Approve composite route shape vs split client-side chain
- [ ] Approve dialog UX (stepper vs single long form)
- [ ] Approve "edit-in-stock" placement (link inside Edit dialog vs separate /inventory deep-link)
- [ ] Approve P0 priority vs deferred until Tier 4.1 / stock decrement decision lands
- [ ] Approve 1620 LOC budget (or split into smaller standalone PRs)
- [ ] Approve sequence in § 6
- [ ] Decide whether to ship behind feature flag `ALLOW_INLINE_VARIANT_CREATE` (recommended for safety)

Until all above checked → backlog stays unimplemented.

---

## 10. Naming / file references

- **Tier number:** 3.7 (after Tier 3.6 Edit Product Code which is at commit `6a035e5`)
- **Branch when implementation starts:** `feat/tier3.7-inline-product-variant-creation`
- **Tier 4.1 (Messenger receive-only) is separate** — runs in parallel, no dependency

---

## 11. Cross-references

- Tier 3 plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- Tier 3.5 plan: `docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md`
- Tier 3.6 PR #12 (merged `6a035e5`): Edit + delete BP dialog
- Sale UI polish backlog: `docs/superpowers/2026-05-15-sale-ui-qa-polish-backlog.md`
- Admin onboarding workbook: `docs/superpowers/2026-05-18-admin-onboarding-workbook.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`

---

## 12. Append to admin onboarding readiness checklist

When Tier 3.7 ships, update `2026-05-15-admin-onboarding-readiness-checklist.md` § 7 (Product code / CF code setup):

```
- Add from Stock + Create Product+Variant+Code inline (Tier 3.7) ✅
- Edit-in-Stock nested dialog (Tier 3.7) ✅
```

And § 2.4 — current "Boss creates admin User row via Prisma Studio" can be paired with Boss creating first Product+Variant via `/sale` directly (no `/inventory` round-trip).

---

End of backlog entry.
