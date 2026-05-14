# Tier 3 Add from Stock — implementation handoff

**Filed:** 2026-05-14
**Branch:** `feat/sale-add-from-stock`
**Base:** `master @ 985c72a` (post-PR-3 Tier 1 merge)
**Plan ref:** `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`

---

## 1. Code inventory snapshot

### Schema (`prisma/schema.prisma`)

- `Product` (line 152) — `shopId`, `stockCode`, `saleCode?`, `name`, `images[]`, `isActive`, variants.
- `ProductVariant` (line 190) — `sku`, `attributes` (Json), `price` Decimal, `quantity`, `reservedQty`.
- `BroadcastProduct` (line 898) post-PR-2 — `shopId` (NOT NULL), `liveSessionId` (nullable), `productId`, `variantId?`, `displayCode`, `displayOrder`, `priceOverride?`, `isPinned`. Indexes: `@@unique([liveSessionId, displayCode])` + partial unique `(shopId, displayCode) WHERE liveSessionId IS NULL` (added via raw SQL in migration).

### Existing API routes touching BroadcastProduct

- `GET /api/sale/live-sessions/[liveSessionId]/broadcast-products` — read live-bound BPs for a session. Scoped to user's shop.

### Missing API routes

- `GET /api/sale/broadcast-products` — shop-wide list with optional scope filter
- `POST /api/sale/broadcast-products` — create live-bound OR evergreen
- `PATCH /api/sale/broadcast-products/[id]` — deferred (priceOverride + isPinned only)
- `DELETE /api/sale/broadcast-products/[id]` — deferred (active-booking guard)

### Existing patterns to follow

- Auth: `requireAuth()` → `user.shopId` check → role check (`OWNER` / `MANAGER` for write, +`CHAT_SUPPORT` for read).
- Validation: `validateBody(request, schema)` from `src/lib/validation/middleware.ts`.
- Errors: `toAppError(err)` from `src/lib/errors`. Throws map to status codes.
- Money: `formatMoney2` from `src/lib/api/money.ts`.
- Activity log: `logActivity({...}).catch(() => {})` non-blocking pattern.

### UI components

- `SaleWorkspaceShell` (post-Tier-1) — orchestrates fetches + filter chips.
- `SaleProductGridPlaceholder` — displays live-bound BPs from selected session.
- `ManualCreateBookingDialog` — receives `products: readonly SaleBroadcastProductRow[]` prop. No fetch path for evergreen BPs yet.

## 2. Tier 3 scope confirmation

| Item | In scope | Notes |
|---|---|---|
| Create live-bound BP | ✅ | works without evergreen flag |
| Create evergreen BP | ✅ | gated by `ALLOW_EVERGREEN_BROADCAST_PRODUCT` |
| List shop-wide BPs | ✅ | scope filter `live` / `evergreen` / `all` |
| Update (priceOverride, isPinned) | DEFER | low-priority, larger UI surface |
| Delete | DEFER | needs active-booking guard; UX TBD |
| Manual Create picker integration | ✅ | thread evergreen BPs when flag on |
| UI page `/sale/products` | DEFER | inline panel within `/sale` enough for Tier 3 MVP |
| Inline Add from Stock CTA in Product Codes panel | ✅ | minimal dialog |
| Docker verifier | ✅ | `verify-broadcast-product-crud.ts` |

## 3. Implementation plan in this run

| Step | File | Status |
|---|---|---|
| 1 | `src/server/repositories/broadcast-product.repository.ts` (NEW) | TODO |
| 2 | `src/lib/validation/broadcast-product.schemas.ts` (NEW) | TODO |
| 3 | `src/app/api/sale/broadcast-products/route.ts` (NEW) — GET + POST | TODO |
| 4 | `src/components/sale/AddFromStockDialog.tsx` (NEW) | TODO |
| 5 | `src/components/sale/SaleProductGridPlaceholder.tsx` (MOD) — Add CTA | TODO |
| 6 | `src/components/sale/SaleWorkspaceShell.tsx` (MOD) — wire dialog | TODO |
| 7 | `tests/unit/lib/validation/broadcast-product.schemas.test.ts` (NEW) | TODO |
| 8 | `tests/unit/app/api/sale/broadcast-products.route.test.ts` (NEW) | TODO |
| 9 | `scripts/verify-broadcast-product-crud.ts` (NEW) | TODO |

## 4. Open questions / decisions

- **Update / Delete:** deferred. Repository will support `create` + `list` only this PR. Editing priceOverride and deleting BPs can ship in a Tier 3.5 follow-up.
- **Variant search endpoint:** reuse existing `GET /api/products?search=` (already paginated + auth-gated). Avoid new sale-scoped variant search until UX clarity.
- **Auth roles:** OWNER + MANAGER for write; OWNER + MANAGER + CHAT_SUPPORT for read (mirrors `/api/sale/bookings` rule).
- **Default scope filter:** `'all'` returns both live + evergreen; clients filter further.
