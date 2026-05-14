# Tier 3.5 — BroadcastProduct update + delete plan

**Filed:** 2026-05-14
**Status:** Planning only. Implementation can begin after PR #4 merge stabilizes + D4 + D6 functional smoke passes.
**Branch model:** new feature branch `feat/sale-broadcast-product-update-delete` from master.

---

## 1. Why this exists

Tier 3 (PR #4) shipped `create` + `list` for BroadcastProduct. Admins can now create live-bound + evergreen product codes via Add from Stock dialog. Two operations still missing for a complete admin workflow:

1. **Edit pricing / pinning** — admin sets a wrong `priceOverride` or wants to pin/unpin a code without recreating.
2. **Remove obsolete code** — admin retires a product code that no longer applies, especially evergreen codes that accumulated over time.

These operations are deferred from Tier 3 PR scope to keep that PR small + reviewable. Tier 3.5 closes the gap.

## 2. Safety constraints from schema

`prisma/schema.prisma` model BroadcastProduct (line 898):

- Has `bookings: Booking[]` reverse relation (line 916).
- FK from Booking → BroadcastProduct uses **implicit RESTRICT** (Prisma default — no explicit `onDelete:`).
- No `isActive` / `deletedAt` / `status` column — soft-delete requires schema change.

Implication:

- Hard DELETE is **blocked at DB level** when any Booking references the BP. Tier 3.5 DELETE route must catch the unique-violation analog (Prisma Foreign key constraint) and surface as 409 ConflictError.
- Edits that change identity-bearing fields are unsafe:
  - `displayCode` — referenced by future parser + admin chat → changes would corrupt audit trail
  - `variantId` — pricing snapshot semantics depend on variant at booking time
  - `liveSessionId` — flipping live ↔ evergreen scope would bypass the partial unique index
  - `productId` — derived from variantId, should never drift

Safe edits:

- `priceOverride` — applies only to NEW bookings created after the edit; existing bookings keep their captured unitPrice snapshot
- `isPinned` — UI flag, no business impact
- `displayOrder` — UI sort order, no business impact

Safe deletes:

- BP with zero referencing Bookings — hard DELETE
- BP with any referencing Booking — block + suggest "deactivate by editing displayOrder or unpinning"

## 3. Scope

In scope:

- `PATCH /api/sale/broadcast-products/[id]` — body accepts `{priceOverride?, isPinned?, displayOrder?}` only.
- `DELETE /api/sale/broadcast-products/[id]` — hard delete with active-Booking guard.
- Repository helpers `update` + `delete`.
- Zod schemas.
- UI: row edit/delete actions in Product Codes panel + confirmation dialog for delete.
- Tests + Docker verifier coverage.

Out of scope:

- Adding `isActive` / `deletedAt` column (separate schema PR if Boss wants soft-delete model).
- Bulk operations.
- Edit `displayCode` / `variantId` / `liveSessionId` / `productId`.
- Customer-facing changes.

## 4. API design

### 4.1 `PATCH /api/sale/broadcast-products/[id]`

**Auth:** OWNER + MANAGER.

**Body (zod):**

```typescript
{
  priceOverride?: string | null,  // decimal string with ≤2 places, OR explicit null to clear
  isPinned?: boolean,
  displayOrder?: number,          // 0..9999
}
```

At least one field must be set. Empty body returns 400.

**Behavior:**

- `findFirst({ where: { id, shopId } })` — tenant scope. 404 on cross-shop or missing.
- Apply partial update.
- Return updated row in same shape as POST response.

**Errors:**

- 400 — validation failure
- 401 / 403 — auth
- 404 — not found in shop
- 500 — unexpected

### 4.2 `DELETE /api/sale/broadcast-products/[id]`

**Auth:** OWNER only (more restrictive than PATCH — deletion is permanent + audit-relevant).

**Behavior:**

- `findFirst({ where: { id, shopId } })` — tenant scope. 404 if missing.
- Count active bookings: `bookings.count({ where: { broadcastProductId: id, status: { not: 'EXPIRED' } } })`.
- If count > 0: throw `ConflictError("Cannot delete: BroadcastProduct is referenced by N active booking(s)")`.
- Hard `delete()`.
- Return `{ success: true, broadcastProductId: id, deletedAt: <timestamp> }`.

**Errors:**

- 401 / 403 — auth
- 404 — not found in shop
- 409 — active bookings reference the BP
- 500 — FK violation we didn't catch (defense-in-depth)

## 5. Repository helpers

Extend `src/server/repositories/broadcast-product.repository.ts`:

```typescript
update(input: {
  readonly shopId: string;
  readonly id: string;
  readonly priceOverride?: string | null;
  readonly isPinned?: boolean;
  readonly displayOrder?: number;
}): Promise<BroadcastProductRow>;

delete(input: {
  readonly shopId: string;
  readonly id: string;
}): Promise<{ id: string; deletedAt: Date }>;
```

Defensive checks mirror `create`:

- Cross-shop probe returns 404 (not 403) to avoid disclosing existence.
- Active-booking guard inside `delete` runs before the `delete()` call, in same transaction.

## 6. UI plan

### 6.1 Product Codes panel row actions

Each rendered BP row in the grid gets a small action menu (kebab icon) with:

- **แก้ราคา / Edit price** — opens dialog with `priceOverride` input + Save / Clear / Cancel
- **ปักหมุด / Toggle pin** — toggles `isPinned`, no dialog
- **ลบ / Delete** — opens confirm dialog. Shows count of active bookings if any; only enables Delete button when count = 0.

### 6.2 Edit price dialog

- Read current `priceOverride` (or "use variant price" if null).
- Input field accepts decimal with ≤2 places.
- "Clear override" button sets to null + Save.
- "Cancel" closes without save.

### 6.3 Delete confirm dialog

- Title: `ลบรหัสสินค้า "${displayCode}"`
- Body: `แสดงรายการจอง ${count} รายการที่ยังอ้างอิงรหัสนี้`
- If count > 0: render disabled Delete button + helper text "ยกเลิก/หมดอายุการจองทั้งหมดก่อนจึงลบได้"
- If count = 0: enable Delete button.
- Soft cancel button always enabled.

## 7. Test plan

### 7.1 Unit (vitest)

- Update zod schema accept/reject — clear-to-null, partial updates, empty body 400, numeric bounds.
- Repository `update` cross-shop denies (404).
- Repository `delete` cross-shop denies (404).
- Repository `delete` blocks when active bookings exist (409).
- Repository `delete` succeeds when no bookings (200).
- Route 400 / 401 / 403 / 404 / 409 paths.

### 7.2 Docker verifier

Extend `scripts/verify-broadcast-product-crud.ts` with:

- Test J: PATCH priceOverride succeeds.
- Test K: PATCH isPinned toggles.
- Test L: PATCH empty body rejects 400.
- Test M: PATCH cross-shop rejects 404.
- Test N: DELETE with zero bookings succeeds.
- Test O: DELETE with active booking rejects 409.
- Test P: DELETE cross-shop rejects 404.

## 8. Sequencing

1. PR #4 (Tier 3) — DONE per current session.
2. D4 + D6 paired flag flip + functional smoke — current PART B/C of overnight plan.
3. **Tier 3.5 PR ships here** (this plan).
4. Tier 4 inbound runtime — separate epic.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Admin edits priceOverride after bookings exist → unitPrice snapshot doesn't change → confusion | Document: priceOverride applies to NEW bookings only |
| Admin deletes BP referenced by booking → 409 → confusing if booking is in CANCELLED state | Filter `status: { not: 'EXPIRED' }` includes CANCELLED. Should we also exclude CANCELLED? — design decision: keep CANCELLED in count for traceability, document |
| Audit trail loss on hard delete | Tier 3.5 v1 accepts this. Future v2 adds soft-delete column if needed. |
| Bulk operation accidents | Tier 3.5 v1 = single-row only. Bulk left to Tier 3.6. |

## 10. Open decisions for Boss

- Hard delete vs soft `isActive` column — Tier 3.5 v1 ships hard delete (simpler), Boss accepts that retired BPs are gone forever from queryable surface. Switch to soft-delete only if Boss wants restorable archive.
- Should CANCELLED bookings block delete? Current proposal: yes (preserves history). Boss may override to "no" if delete-while-cancelled-bookings-exist is a common case.
- Audit log entry on delete? Current proposal: yes via `logActivity('BROADCAST_PRODUCT_DELETED', ...)`.

## 11. Cross-references

- Tier 3 PR #4: https://github.com/Ed-Sama-lens/liveshop-pro/pull/4
- Tier 3 plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- Tier 3 handoff: `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- D4 / D6 activation runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
