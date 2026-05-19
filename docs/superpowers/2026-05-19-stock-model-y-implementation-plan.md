# Stock model Y — implementation plan

**Filed:** 2026-05-19
**Status:** plan only. Boss must approve X/Y/Z first. No code change in this doc.
**Pairs with:**
- `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
- `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`

This plan turns the recommended **Option Y (decrement on CONFIRMED)** into an actionable PR sequence Boss approves one phase at a time.

---

## 1. Recap of Y

> When **Order status flips to CONFIRMED** (payment slip verified), decrement `ProductVariant.quantity` by the OrderItem quantity and release the StockReservation row (set `releasedAt`).

Reasons (per memo):
- Payment confirm is the most reliable admin touchpoint
- Live commerce: stock counts at point-of-sale, not point-of-delivery
- Simpler audit (single trigger), no carrier-tracking dependency

Side effects to address:
- Refund / Cancel after CONFIRMED → re-increment (Tier 7 returns)
- Concurrent payment-verify races → must be transaction-locked

---

## 2. Schema audit (Phase Y.0) — DONE in matrix

`prisma/schema.prisma` already has the needed timestamp:

| Field | Line | Type |
|---|---|---|
| `Order.confirmedAt` | 299 | `DateTime?` |
| `Order.packedAt` | 300 | `DateTime?` |
| `Order.shippedAt` | 301 | `DateTime?` |
| `Order.deliveredAt` | 302 | `DateTime?` |
| `ProductVariant.quantity` | (model) | `Int` |
| `ProductVariant.reservedQty` | (model) | `Int` |
| `StockReservation.releasedAt` | (model) | `DateTime?` |

**No schema migration needed.** Phase Y.0.5 from the memo is removed.

---

## 3. PR sequence

| Phase | PR title | Risk | Estimated LOC | Tests |
|---|---|---|---|---|
| Y.1 | `feat(stock): pure decrementStockOnOrderConfirm helper` | R2 | ~60 | 1 file, ~150 lines |
| Y.2 | `feat(stock): wire helper into payment verify route behind flag` | R1 | ~30 | route + integration ~120 |
| Y.3 | `test(stock): full vitest + Docker verifier for Y model` | R2 | ~10 | verifier ~250 |
| Y.4 | `chore(env): add STOCK_DECREMENT_ON_CONFIRM env var` | R1 | ~10 | env zod schema 1 line |
| Y.5 | `chore(deploy): deploy + functional smoke flag OFF` | R0 wait | 0 | manual smoke |
| Y.6 | `chore(flag): flip STOCK_DECREMENT_ON_CONFIRM=true in Vercel` | R1 | 0 | 24h observation |
| Y.7 | `chore(default): make STOCK_DECREMENT_ON_CONFIRM default true` | R1 | ~5 | optional |
| Y.8 (Tier 7) | `feat(stock): re-increment on REFUNDED + CANCELLED` | R1 | ~150 | full verifier ~200 |

Each phase = one PR. Boss approves each before next.

---

## 4. Phase Y.1 — pure helper

**Branch:** `feat/stock-decrement-helper`

**New file:** `src/server/services/stock-decrement.ts`

```typescript
import type { Prisma, PrismaClient } from '@/generated/prisma';

interface DecrementInput {
  readonly orderId: string;
  readonly shopId: string;
  readonly changedById: string;
}

interface DecrementResult {
  readonly orderId: string;
  readonly variantDeltas: ReadonlyArray<{
    readonly variantId: string;
    readonly quantityBefore: number;
    readonly quantityAfter: number;
    readonly reservedQtyBefore: number;
    readonly reservedQtyAfter: number;
  }>;
}

/**
 * Decrement variant.quantity for each OrderItem in the Order. Release
 * the StockReservation row(s) linked to the Order. Idempotent: a
 * second call on the same Order is a no-op (reservation.releasedAt
 * already set).
 *
 * MUST run inside a $transaction wrapper. The caller supplies tx.
 */
export async function decrementStockOnOrderConfirm(
  tx: Prisma.TransactionClient,
  input: DecrementInput
): Promise<DecrementResult> { /* ... */ }
```

**Tests:** `tests/unit/server/services/stock-decrement.test.ts`

- Decrement single-item order
- Decrement multi-item order
- Idempotent on second call (reservation already released)
- Throws if Order not in shop
- Throws if Order status not CONFIRMED
- Multi-variant atomicity (one failure → rollback)
- Releases StockReservation.releasedAt timestamp
- Updates ProductVariant.reservedQty by same delta as quantity

**Verification:** `npx tsc --noEmit` + targeted vitest. NO DB hits.

---

## 5. Phase Y.2 — wire into payment verify route

**Branch:** `feat/stock-decrement-on-payment-verify`

**Modify:** `src/app/api/payments/[id]/verify/route.ts`

Inside the existing `$transaction` block, after `Order.status` flips to CONFIRMED:

```typescript
if (env.STOCK_DECREMENT_ON_CONFIRM === 'true') {
  await decrementStockOnOrderConfirm(tx, {
    orderId: order.id,
    shopId: user.shopId,
    changedById: user.id,
  });
}
```

**Add OrderAudit entry:** `STOCK_DECREMENT_ON_CONFIRM` action with metadata showing variant deltas.

**Tests:** add to existing `tests/unit/app/api/payments/verify.route.test.ts` (or create if absent)

- Flag OFF → no decrement happens (existing behavior preserved)
- Flag ON + happy path → decrement happens, OrderAudit row added
- Flag ON + repeat verify → idempotent
- Flag ON + Order already CONFIRMED → still passes (verify is admin action; should be idempotent at route level anyway)

---

## 6. Phase Y.3 — Docker verifier

**Branch:** `test/stock-decrement-y-verifier`

**New file:** `scripts/verify-stock-decrement-y.ts`

Mirrors `verify-sale-d4-d6-functional-flow.ts` shape but for Y:

| Case | Asserts |
|---|---|
| A. Setup: shop + variant qty=50 reservedQty=0 | fixtures created |
| B. Booking → confirm (existing flow) | reservedQty=1, quantity=50 |
| C. Convert to Order RESERVED | reservedQty=1, quantity=50 (unchanged) |
| D. Verify payment → Order CONFIRMED | reservedQty=0, quantity=49 |
| E. Re-verify same Order (idempotent) | no further change |
| F. StockReservation.releasedAt set | timestamp present |
| G. OrderAudit row STOCK_DECREMENT_ON_CONFIRM exists | row present with metadata |
| H. Cleanup | all rows removed |

**Production safety:** uses existing `evaluateNonProdDatabase` guard from `scripts/lib/non-prod-db-guard.ts` (PR #30 work).

**NPM script:** `verify:stock:y`.

---

## 7. Phase Y.4 — env var

**Branch:** `chore/env-stock-decrement-flag`

**Modify:** `src/lib/env.ts`

```typescript
STOCK_DECREMENT_ON_CONFIRM: z.enum(['true', 'false']).default('false'),
```

Boss adds to Vercel Production as Sensitive env var, default `false`.

---

## 8. Phase Y.5 — deploy + functional smoke flag OFF

- Vercel auto-deploys on master merge
- Boss runs production unauth smoke 16/16
- Boss runs ONE Boss-customer payment-verify flow manually
- Verifies no stock decrement happens (flag OFF preserves existing behavior)
- 24h observation

---

## 9. Phase Y.6 — flip flag ON in Vercel

- Boss flips `STOCK_DECREMENT_ON_CONFIRM=true`
- Vercel redeploys
- Smoke 16/16 (unchanged — flag is internal, unauth probes unaffected)
- Boss runs ONE payment-verify with Boss customer
- Verifies stock decrement happened
- 24h observation

If anomaly: flip back to `false`, investigate, hotfix branch.

---

## 10. Phase Y.7 — default ON

After 7-day clean observation under flag-ON:

**Modify:** `src/lib/env.ts`

```typescript
STOCK_DECREMENT_ON_CONFIRM: z.enum(['true', 'false']).default('true'),
```

Removes operational toggle burden. Flag can still be flipped to `false` if needed.

---

## 11. Phase Y.8 — re-increment hooks (Tier 7)

**Branch:** `feat/stock-reincrement-on-refund-cancel`

Add inverse hooks:

- When `Payment.status` flips to `REFUNDED` → call `incrementStockOnPaymentRefund` (mirror of Y.1 helper)
- When `Order.status` flips to `CANCELLED` after CONFIRMED → call `incrementStockOnOrderCancel`

Both gated by same flag (or a new dedicated flag if Boss prefers).

Tests:
- Refund after CONFIRMED → quantity restored to pre-decrement value
- Cancel after CONFIRMED → quantity restored
- Cancel before CONFIRMED → no inverse (nothing was decremented)
- Multi-item partial refund → partial increment

Out-of-scope until Tier 7 returns workflow is approved separately.

---

## 12. Risk-mitigation invariants

| Risk | Mitigation |
|---|---|
| Concurrent payment-verify double-decrement | Transaction lock + idempotency via `StockReservation.releasedAt IS NULL` check |
| Failed slip after decrement happened | Manual admin re-increment via `/inventory` until Y.8 lands |
| Flag-flip mid-transaction | Verifier reads flag at top of $transaction; flag-state stable for the duration |
| Stock decremented for Order that gets cancelled | Tier 7 Y.8 hook + admin SOP doc until Y.8 lands |
| Migration drift on existing CONFIRMED Orders pre-Y | One-time backfill script run by Boss (separate plan) |

---

## 13. Pre-existing CONFIRMED Orders backfill

Before Y.6 flag-flip, Boss must decide:

- Option A: leave pre-existing CONFIRMED Orders alone (stock drift remains for them; new ones decrement going forward)
- Option B: one-time backfill script decrements quantity for all already-CONFIRMED Orders

Production currently has zero real Orders so the question is academic. After real Phase B + admin onboarding, Boss revisits.

---

## 14. Boss decisions still pending

- [ ] Approve Option Y (vs X or Z)
- [ ] Approve flag name `STOCK_DECREMENT_ON_CONFIRM`
- [ ] Approve flag-gated rollout sequence Y.4-Y.7
- [ ] Decide pre-existing CONFIRMED Orders policy (A or B above)
- [ ] Approve Tier 7 Y.8 separately

Until these clear, NO code lands.

---

## 15. Cross-references

- Stock decision memo: `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Commerce readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Commerce readiness follow-up: `docs/superpowers/2026-05-18-commerce-readiness-followup.md`
- Phase B execution pack: `docs/superpowers/2026-05-19-phase-b-dry-run-execution-pack.md`
- Schema source: `prisma/schema.prisma`
- Non-prod DB guard: `scripts/lib/non-prod-db-guard.ts`
