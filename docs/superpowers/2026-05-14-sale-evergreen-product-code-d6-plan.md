# D6 plan — evergreen BroadcastProduct + Add from Stock

**Filed:** 2026-05-14
**Status:** Planning only. **DO NOT enable `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` until items below ship.**

---

## 1. What `ALLOW_EVERGREEN_BROADCAST_PRODUCT` actually unlocks

PR 2 added the flag as a repository-side gate in `bookingRepository.createManual` at `src/server/repositories/booking.repository.ts:1543-1548`:

```typescript
if (isNonLive) {
  if (bp.liveSessionId !== null) {
    throw new ConflictError(/* live-bound BP cannot be used for non-live */);
  }
  if (!allowEvergreenBroadcastProduct()) {
    throw new ValidationError(
      'Evergreen broadcast products are not enabled. Set ALLOW_EVERGREEN_BROADCAST_PRODUCT=true to use evergreen product codes.',
      { broadcastProductId: ['requires ALLOW_EVERGREEN_BROADCAST_PRODUCT=true'] }
    );
  }
}
```

The flag is a **defense-in-depth** consumer gate. It does NOT:

- Create any BroadcastProduct with `liveSessionId IS NULL`.
- Add any UI for managing evergreen product codes.
- Add any route to create / list / edit evergreen BroadcastProducts.
- Surface evergreen products in `ManualCreateBookingDialog`.

It ONLY allows `createManual` to accept a `broadcastProductId` whose `liveSessionId` is null, if such a row already exists in the database.

## 2. Why Add from Stock / product-code UI is needed first

Production state at D1 snapshot (~2026-05-14 06:24 UTC):

| Table | Count |
|---|---|
| Shop | 1 (Boss-owned `Nazha Hatyai`) |
| User | 1 (Boss, OWNER) |
| Customer | 1 (Boss self-record) |
| LiveSession | 2 (1 ENDED, 1 SCHEDULED) |
| ProductVariant | 2 (qty 10 each) |
| **BroadcastProduct** | **0** |
| Booking | 0 |
| Order | 0 |

Zero BroadcastProducts means even toggling `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` cannot unblock anything — there are no evergreen rows to pick from. The flag enables a code path, not a workflow.

To complete the chain "admin creates a non-live booking against a stock product," the system needs:

1. A way to **create** an evergreen BroadcastProduct (POST route or admin workflow).
2. A way to **list** evergreen BroadcastProducts for a shop (GET route).
3. A way to **pick** an evergreen BroadcastProduct in the Manual Create UI.
4. The repository-side flag gate to allow the resulting booking shape.

Today only item 4 exists. Items 1-3 are part of the "Add from Stock" Tier 3 PR — see `2026-05-14-sale-add-from-stock-product-code-plan.md` (sibling planning doc).

## 3. Current API capability: can existing code create evergreen BP?

Grep of `src/app/api/sale/**` shows BroadcastProduct creation routes: **none**.

- `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` — GET only.
- `src/app/api/sale/bookings/route.ts` — consumes BP, does not create.
- `src/server/repositories/booking.repository.ts` — uses `broadcastProduct.findFirst`; no `.create`.

Existing BroadcastProduct rows in any environment come from:

- Verifier scripts (`scripts/verify-booking-create.ts`, `scripts/verify-booking-conversion.ts`, `scripts/verify-omnichannel-booking.ts`) — all live in Docker non-prod only with `CONFIRM_NON_PROD_DB=true` guard.
- Direct migration backfill — but PR 2 migration only added the `shopId` column; it did not seed BP rows.

So production has zero BPs and there is no application-level path to add them yet.

## 4. UI capability: does Manual Create support evergreen?

Current `src/components/sale/ManualCreateBookingDialog.tsx`:

- Reads `products: readonly SaleBroadcastProductRow[]` from props.
- Caller `SaleBookingQueuePlaceholder` is rendered inside `SaleWorkspaceShell`, which fetches via `GET /api/sale/live-sessions/[id]/broadcast-products` only.
- No fetch path for "evergreen BPs for this shop."
- No fallback for "no live session selected → show stock products."
- "No Live Session Selected" state hides the Manual Create entry point.

Net effect: admin literally cannot reach a UI that would surface evergreen BPs even if the data existed.

## 5. Required deliverables before D6 enablement

| # | Deliverable | Owner | Note |
|---|---|---|---|
| D6-1 | `POST /api/sale/broadcast-products` route (create live-bound OR evergreen BP) | new PR | Tier 3 |
| D6-2 | `GET /api/sale/broadcast-products` route (list shop-wide, optional `liveSessionId` filter) | new PR | Tier 3 |
| D6-3 | Zod schema for create body (displayCode, variantId, optional liveSessionId, optional priceOverride) | new PR | Tier 3 |
| D6-4 | Repository helper `createBroadcastProduct` (live-bound + evergreen branches, uniqueness checks against both `@@unique([liveSessionId, displayCode])` and the partial unique index) | new PR | Tier 3 |
| D6-5 | Admin UI page `/sale/products` (list + create dialog) OR inline picker in Manual Create dialog | new PR | Tier 3 / PR 3 |
| D6-6 | Cross-shop / cross-session boundary tests in vitest | new PR | Tier 3 |
| D6-7 | Docker verifier `verify-broadcast-product-create.ts` covering live + evergreen + duplicate displayCode rejection | new PR | Tier 3 |
| D6-8 | Update `ManualCreateBookingDialog` to support "evergreen mode" — no liveSessionId, fetches shop-wide evergreen BPs | new PR | PR 3 |

After D6-1..D6-8 ship + smoke pass, then flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` in Vercel Production.

## 6. Test data requirements for D6 smoke

At minimum, before flag flip:

- One ProductVariant with stock > 0 (production already has 2 such variants).
- One evergreen BroadcastProduct created via D6-1 route — verifies the create path itself works.
- Then with flag flipped: one non-live MANUAL booking via Manual Create dialog using that evergreen BP.
- Then V2 conversion via existing `/api/sale/orders/from-bookings` with `bookingIds[]` (already enabled via `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`).

Each step uses Boss / test data only (current production state).

## 7. Migration / tenant safety

- Partial unique index `BroadcastProduct_shop_evergreen_displayCode_key` (PR 2 migration step 7) already enforces uniqueness of `(shopId, displayCode) WHERE liveSessionId IS NULL`. D6-1 route must catch the unique-violation error and surface a 409 ConflictError.
- `BroadcastProduct.shopId FK ON DELETE RESTRICT` (PR 2 step 4) prevents accidental Shop deletion while BPs exist.
- Repository createBP helper (D6-4) must validate `variantId.product.shopId === shopId` to prevent cross-shop variant binding (mirrors existing `bookingRepository.createManual` defense at line 1564).

## 8. Rollback

If D6 enablement causes regression:

1. Flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false` in Vercel Production. Redeploy.
2. `bookingRepository.createManual` non-live path immediately rejects new bookings against evergreen BPs (the flag check at line 1543 fires).
3. Existing evergreen BP rows remain — they are inert without the flag.
4. Existing non-live bookings (if any were created during the enabled window) remain. They are still readable, confirmable, cancellable, convertible via V2 (the flag only gates NEW creations).
5. To fully remove evergreen BPs created during the enabled window, an admin-side cleanup workflow is needed (D6-9 — TBD; not blocking enablement).

## 9. Recommended D6 timing

- **D6 NOT during D2-D5.** Wait until D6-1..D6-8 deliverables land in master + verifier smoke + Boss/ChatGPT review pass.
- **D6 GO criteria:**
  - All Tier 3 PRs merged.
  - Docker verifier `verify-broadcast-product-create.ts` 100% pass.
  - Full vitest still 821+ pass.
  - Manual smoke against staging-equivalent (production with Boss test data acceptable per current /goal context).
  - Boss + ChatGPT explicit approval.
- **D6 sequence:**
  - Add Vercel Production env `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`.
  - Redeploy.
  - 9-probe unauth smoke (expected unchanged).
  - Authenticated admin smoke: create one evergreen BP, create one non-live booking against it, confirm it, convert it to Order via V2.
  - Document IDs in handoff doc.

## 10. Why NOT enable now (D4 window)

- Zero BroadcastProducts exist in production → flag flip has no effect on existing data.
- No API route to create them → flag flip cannot be functionally exercised.
- No UI to surface them → admin cannot reach the workflow.
- Flipping a flag with no corresponding workflow is dead config that adds confusion at incident-response time.
- Keeping flag OFF preserves the "no surprise" property: every flag-on environment must have a tested workflow behind it.

## 11. Cross-references

- PR 2 implementation handoff: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md`
- Migration SQL: `prisma/migrations/20260514000000_sale_omnichannel_booking/migration.sql`
- Repository gate: `src/server/repositories/booking.repository.ts:1543-1548`
- UI gap: `src/components/sale/ManualCreateBookingDialog.tsx`, `src/components/sale/SaleWorkspaceShell.tsx`
- Add from Stock plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md` (sibling)
- Tier 1 UI plan: `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md` (sibling)
