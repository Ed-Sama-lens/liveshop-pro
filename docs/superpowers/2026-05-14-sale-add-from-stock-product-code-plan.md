# Tier 3 — Add from Stock / BroadcastProduct management plan

**Filed:** 2026-05-14
**Status:** Planning only. Implementation must NOT begin before Tier 1 UI ships + Boss approval.
**Branch model:** new feature branch `feat/sale-add-from-stock` from current master.

---

## 1. Why this exists

Today the only path that creates a `BroadcastProduct` row is verifier scripts in `scripts/verify-*.ts` running against Docker Postgres. There is no admin UI, no admin API, and production has zero BPs. The /sale workspace assumes BPs already exist for the active live session — they appear via some out-of-band seeding step that does not yet exist.

For omnichannel bookings to work, admins must be able to:

1. Create live-bound BroadcastProducts (existing behavior, missing UI).
2. Create evergreen BroadcastProducts (new, gated by `ALLOW_EVERGREEN_BROADCAST_PRODUCT`).
3. List shop-wide BPs for the picker.
4. Edit `priceOverride` and `isPinned` flags.

This plan covers items 1-4.

## 2. Scope

In scope:

- `POST /api/sale/broadcast-products` route.
- `GET /api/sale/broadcast-products` route (shop-wide list with optional `liveSessionId` filter).
- `PATCH /api/sale/broadcast-products/[id]` route (priceOverride / isPinned only — displayCode and variantId immutable).
- `DELETE /api/sale/broadcast-products/[id]` route (with safety guard: cannot delete if any non-EXPIRED Booking references it).
- Repository helpers: `createBroadcastProduct`, `listBroadcastProducts`, `updateBroadcastProduct`, `deleteBroadcastProduct`.
- New admin UI page `/sale/products` (list + create dialog + edit/delete actions).
- "Add from Stock" picker variant inside `ManualCreateBookingDialog` (Tier 1 placeholder filled in).
- Zod schemas for all bodies.
- Docker verifier `verify-broadcast-product-crud.ts`.
- Tests covering: cross-shop reject, duplicate displayCode reject (both indexes), evergreen-vs-live mismatch reject, delete-while-referenced reject.

Out of scope:

- Parser / inbound runtime (Tier 4).
- Customer-facing messages (Boss explicit no-go).
- Bulk import.
- pak-ta-kra.

## 3. Schema impact

**None.** PR 2 migration already shipped `BroadcastProduct.shopId` + nullable `liveSessionId` + partial unique index + indexes. Tier 3 only adds new application code.

## 4. API design

### 4.1 `POST /api/sale/broadcast-products`

**Body (zod):**

```typescript
{
  displayCode: string,            // 1..32 chars, [A-Za-z0-9_-]
  variantId: string,              // 1..128 chars
  liveSessionId?: string,         // optional; null = evergreen
  priceOverride?: string,         // decimal-as-string, optional; null = use variant price
  isPinned?: boolean,             // default false
}
```

**Auth:** OWNER or MANAGER only (matches `POST /api/sale/bookings`).

**Behavior:**

- Validate `variantId.product.shopId === user.shopId`. Else 409.
- If `liveSessionId` present: validate `liveSession.shopId === user.shopId`. Else 404.
- If `liveSessionId` absent: require `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`. Else 400.
- Insert via repository helper.
- Catch unique-violation (live: `@@unique([liveSessionId, displayCode])`, evergreen: partial unique index). Map to 409 ConflictError with field `displayCode`.
- Return created row.

**Response:**

```typescript
{
  success: true,
  data: {
    broadcastProductId: string,
    shopId: string,
    liveSessionId: string | null,
    displayCode: string,
    variantId: string,
    priceOverride: string | null,    // formatted fixed-2-decimal
    isPinned: boolean,
    createdAt: string,
  }
}
```

### 4.2 `GET /api/sale/broadcast-products`

**Query:**

```typescript
{
  liveSessionId?: string,    // optional filter
  evergreenOnly?: 'true',    // optional filter (mutually exclusive with liveSessionId)
  limit?: number,            // 1..200, default 50
}
```

**Auth:** OWNER / MANAGER / CHAT_SUPPORT (read).

**Behavior:**

- Filter `where: { shopId: user.shopId, ...filter }` always.
- Return list with variant + product joined for display.

### 4.3 `PATCH /api/sale/broadcast-products/[id]`

**Body:** `{ priceOverride?: string | null, isPinned?: boolean }`. Only these two fields editable.

**Auth:** OWNER / MANAGER.

**Behavior:**

- Verify ownership via `findFirst({ where: { id, shopId } })`. Else 404.
- Apply update. Return new row.

### 4.4 `DELETE /api/sale/broadcast-products/[id]`

**Auth:** OWNER only.

**Behavior:**

- Verify ownership. Else 404.
- Check `bookings.count({ where: { broadcastProductId: id, status: { not: 'EXPIRED' } } })`. If > 0, throw ConflictError "Cannot delete: BroadcastProduct is referenced by active bookings."
- Delete.
- Return `{ success: true }`.

## 5. Repository helpers

In `src/server/repositories/broadcastProduct.repository.ts` (NEW):

```typescript
export interface CreateBroadcastProductInput {
  readonly shopId: string;
  readonly variantId: string;
  readonly liveSessionId?: string;
  readonly displayCode: string;
  readonly priceOverride?: string;
  readonly isPinned?: boolean;
  readonly changedById: string;
}

export interface BroadcastProductRepository {
  create(input: CreateBroadcastProductInput): Promise<{ id: string }>;
  list(input: { shopId: string; liveSessionId?: string; evergreenOnly?: boolean; limit: number }): Promise<readonly BroadcastProductRow[]>;
  update(input: { id: string; shopId: string; priceOverride?: string | null; isPinned?: boolean }): Promise<BroadcastProductRow>;
  delete(input: { id: string; shopId: string }): Promise<void>;
}
```

Defensive checks mirror `bookingRepository.createManual` cross-shop guard at `src/server/repositories/booking.repository.ts:1564`.

## 6. UI design

### 6.1 `/sale/products` page

Server component shell + client child for table + dialog.

| Section | Content |
|---|---|
| Header | "สินค้าและรหัสในไลฟ์" + "+ เพิ่มสินค้า" button (OWNER/MANAGER only) |
| Filter bar | Tabs: ทั้งหมด / ไลฟ์ปัจจุบัน / คลังสินค้า (evergreen only). + ProductVariant search box |
| Table | displayCode / Product name / Variant / liveSession / Price / Stock / Reserved / Actions |
| Row actions | Edit (open dialog) / Pin / Unpin / Delete (OWNER only) |
| Empty state | "ยังไม่มีสินค้าในระบบ — กดเพิ่มสินค้าเพื่อสร้างรหัสสำหรับแอดมินใช้งาน" |

### 6.2 Create dialog

- Step 1: pick ProductVariant from existing `Product` list (server fetch).
- Step 2: choose binding — radio "ผูกกับไลฟ์เซสชัน" / "ไม่ผูก (คลังสินค้า)".
  - "ไม่ผูก" disabled if `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false`.
- Step 3: enter `displayCode` (e.g. "A1", "B12") + optional `priceOverride`.
- Submit → POST → close dialog → refresh list.

### 6.3 Manual Create dialog Add-from-Stock branch

Fill in the Tier 1 placeholder: when admin picks "Stock product (no session)" radio in Manual Create dialog, fetch evergreen BPs via `GET /api/sale/broadcast-products?evergreenOnly=true`, render picker, proceed.

## 7. Test plan

### 7.1 Unit (vitest)

- Repository `create` rejects cross-shop variantId.
- Repository `create` rejects duplicate displayCode within same live session.
- Repository `create` rejects duplicate displayCode within shop when evergreen.
- Repository `create` enforces `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false` rejection at consumer level (or route level — TBD which layer).
- Repository `delete` rejects when active bookings reference BP.
- Route POST validates zod body.
- Route POST returns 409 on duplicate.
- Route GET filters by liveSessionId / evergreenOnly correctly.
- Route PATCH only updates priceOverride + isPinned.
- Route DELETE returns 409 when bookings exist.

### 7.2 Integration

- Route mock prisma + assert call params.
- Auth gate on each route.
- Cross-shop probe returns 404.

### 7.3 Docker verifier `verify-broadcast-product-crud.ts`

- Test A: create live-bound BP, list, find it.
- Test B: create evergreen BP with flag ON, list with `evergreenOnly=true`, find it.
- Test C: create evergreen BP with flag OFF → reject.
- Test D: create duplicate displayCode within same session → reject.
- Test E: create duplicate displayCode evergreen in shop → reject (partial unique index).
- Test F: PATCH priceOverride.
- Test G: DELETE evergreen BP with no booking → success.
- Test H: DELETE BP with active booking → reject 409.
- Test I: Cross-shop create attempt → reject.

### 7.4 E2E (Playwright)

- Admin navigates to `/sale/products`, creates a new product, sees row in list.
- Admin opens Manual Create dialog, selects "Stock product" radio (with evergreen flag on), picks evergreen BP, completes booking.

## 8. Migration / data safety

- No schema change.
- Partial unique index handles uniqueness at DB level (PR 2 step 7).
- DELETE-blocking-rule prevents orphan booking → BP missing scenarios.
- Repository invariants checked at app layer; verified via Docker verifier.

## 9. Rollback

If a route bug ships:

- Quick rollback: revert the route commit. Admin UI page would show error state but other `/sale` panels unaffected.
- Data rollback: any BPs created via the new route remain valid rows. They are not destructive. Existing booking creation still uses the existing repository helper. To "rollback" data, an admin can DELETE via the same route (with empty booking-reference state).

If `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` is flipped before Tier 3 routes ship:
- Repository still rejects (no route exists to create evergreen BPs).
- Flag has no effect on existing data.
- No damage.

## 10. Sequence with other Tiers

| Order | Item |
|---|---|
| 1 | PR 2 schema migration (DONE — D1 complete) |
| 2 | D3 flag flip `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true` (DONE) |
| 3 | Tier 1 UI consolidation PR (planned) |
| 4 | **Tier 3 Add from Stock PR (this plan)** |
| 5 | D6 flag flip `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` |
| 6 | D4 flag flip `ALLOW_NON_LIVE_BOOKING=true` may already be true; verify together |
| 7 | Smoke functional non-live booking + V2 conversion E2E |
| 8 | Tier 4 inbound runtimes (Messenger / WhatsApp / Telegram) — separate epic |
| 9 | Tier 5 parser / comment-to-booking — depends on Tier 4 |

## 11. Cross-references

- PR 2 handoff: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md`
- D6 plan: `docs/superpowers/2026-05-14-sale-evergreen-product-code-d6-plan.md`
- Tier 1 UI plan: `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md`
- Existing booking repo: `src/server/repositories/booking.repository.ts` (use as template for cross-shop guards + transaction patterns)
- Existing GET BP route: `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` (preserve for backward compat; new GET coexists)
