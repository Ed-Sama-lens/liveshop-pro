# Phase B dry-run — exact test data plan

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-phase-b-unblock-criteria.md`
**Status:** Plan only. Phase B remains BLOCKED. This file makes the data shape unambiguous so Boss + Claude can execute when prerequisites are met.

---

## 1. Prerequisites (must ALL be true before Phase B starts)

| # | Prerequisite | Status today |
|---|---|---|
| 1 | D4/D6 functional smoke (Stage A-G) PASS | NOT done — blocked by Boss admin auth |
| 2 | Stock decrement decision X/Y/Z made | NOT done |
| 3 | Local Docker verifier `verify:sale:d4-d6` run end-to-end PASS | NOT done — Docker daemon unavailable on current machine |
| 4 | `npm run smoke:prod:unauth` 16/16 PASS at current master HEAD | PASS as of 2026-05-19 master `85c7a93` |
| 5 | Boss + ChatGPT explicit Phase B start verdict | NOT given |

If any row blank → Phase B does not start.

---

## 2. Exact test data shape

Phase B needs the **same fixture topology** the local verifier already uses, but in production. Because Claude cannot create production rows, Boss creates them via admin UI per the D4/D6 visual guide.

### 2.1 Shop

Already exists. One Shop record per `Shop.slug = nazha-hatyai` (or whatever Boss has configured). Boss does NOT create a new Shop for Phase B.

### 2.2 Customer

Boss test customer = **Warut Thaworn** (already in production per the readiness checklist § 4). One row, used as the "buyer" for all Phase B bookings. NOT a real customer.

### 2.3 ProductVariant

Existing production has 2 ProductVariants (Boss snapshot from D1 migration). Pick ONE for Phase B. Note variant `id` from `/inventory`.

Required `productVariant`:
- `quantity` ≥ 50 (Phase B can do ~10 bookings × 5 qty + headroom)
- `reservedQty` baseline (record before starting)
- `price` finite Decimal (e.g. `9.99`)

### 2.4 BroadcastProduct

NEW row to create at Phase B start.

| Field | Value |
|---|---|
| `displayCode` | `PHASE-B-001` (or `-002`, `-003`... if `-001` taken) |
| `liveSessionId` | `null` (evergreen) |
| `shopId` | Boss's shop |
| `productVariantId` | the variant chosen in 2.3 |
| `priceOverride` | optional — Boss decides |
| `isPinned` | optional — Boss decides |

Capture `broadcastProductId` (`cm...`) into MEMORY.md.

### 2.5 Bookings (multiple)

Phase B test rounds (per `phase-b-unblock-criteria.md` § 4.1):

| Round | Booking count | Action | Status target |
|---|---|---|---|
| Happy path × 10 | 10 | create → confirm → convert | CONVERTED_TO_ORDER each |
| Cross-shop guard × 4 | 4 | create with mixed shop/customer | 1 should 409 |
| Multi-session contention × 1 | 1 | two admins try confirm at once | one 409 or stale |
| Cancel-after-confirm × 1 | 1 | create + confirm + cancel | CANCELLED with reservation released |
| Idempotency × 5 | 1 booking, 5 replay convert | replay V2 conversion 5 times | same orderId × 5 |

Total ~16 distinct Booking rows + 5 replay calls on the same booking.

### 2.6 Orders

Each happy-path booking → one Order. Phase B should produce 10 Orders (one per booking).

The cancelled-after-confirm booking → 0 Orders (cancel before convert).

Replay conversions on the same booking → no new Orders (idempotency).

---

## 3. What Claude can verify (unauth + read-only)

Without Boss credentials, Claude can:

- Run `npm run smoke:prod:unauth` after each round
- Inspect master HEAD + deploy state via `git` + Vercel public API
- Read `prisma/schema.prisma` for assertion shape
- Read `MEMORY.md` if Boss writes the captured IDs there
- Verify NO unauthenticated mutation against `/api/sale/*` (always returns 401)

Claude CANNOT:

- Query production DB
- Read OrderAudit rows
- Read BookingHistory rows
- Inspect `Order.idempotencyKey` value
- Verify `ProductVariant.reservedQty` deltas

These require Boss to query and paste the result.

---

## 4. What requires Boss auth

Per `phase-b-unblock-criteria.md` § 3, Phase B test rounds:

- All Booking creation
- All Booking confirm
- All Booking cancel
- All Order conversion
- All V2 replay
- All `/inventory` reservedQty inspection
- All `/orders` order list inspection
- All `/activity` audit inspection

Boss runs all 16+ flows through the admin UI + DevTools Console (per D4/D6 visual guide pattern).

---

## 5. ID capture template

Boss pastes back per round. Empty fields = NOT YET captured.

```
=== Phase B Round 1 happy path ===
BroadcastProduct displayCode: PHASE-B-001
BroadcastProduct id: cm___________
Booking 1 id: cm___________
Booking 1 confirm at: __________
Booking 1 convert orderId: cm___________
reservedQty before round: ___
reservedQty after confirm: ___
reservedQty after convert: ___ (expect same as after confirm)

=== Phase B Round 2-10 ===
... (similar template per round)

=== Phase B Round 11 cross-shop ===
Attempt: Boss's shop variant + Boss's shop customer
  result: 200 OK
Attempt: Boss's shop variant + DIFFERENT shop customer
  result: 409 cross-shop ✅

=== Phase B Round 12 contention ===
Two browser tabs both confirm same booking #X
  result: first 200, second 409 or stale ✅

=== Phase B Round 13 cancel-after-confirm ===
Booking id: cm___________
After confirm: reservedQty +qty
After cancel: reservedQty back to baseline ✅

=== Phase B Round 14 idempotency × 5 ===
Booking id: cm___________
1st convert: orderId cm___________ idempotent:false
2nd convert: orderId same idempotent:true
3rd convert: orderId same idempotent:true
4th convert: orderId same idempotent:true
5th convert: orderId same idempotent:true

=== Observation window 24-72h ===
Vercel 5xx count: ___
Stuck PENDING_REVIEW > 4h: ___
Stuck RESERVED orders > 24h: ___
reservedQty drift: ___ vs sum of CONFIRMED + RESERVED
```

---

## 6. Rollback / cleanup after Phase B

Test data created during Phase B becomes the regression fixture set. Do NOT delete unless Boss explicitly opts in.

If Boss decides to clean up:

1. STOP using fixtures for further smoke
2. Delete CONVERTED orders via admin UI Cancel (no DELETE endpoint exists for Orders)
3. Cancel CONFIRMED bookings → reservation releases
4. Delete BroadcastProduct via Tier 3.5 dialog (Boss UI) — active-booking guard must pass
5. Do NOT touch the Customer record (shared with future runs)
6. Do NOT touch the ProductVariant (shared with real inventory)

If a row gets stuck (e.g. order in PACKED but no shipment), Boss escalates rather than running raw SQL.

---

## 7. What remains forbidden during Phase B

Same hard no-go as the rest of the session:

- ❌ no real customer touch
- ❌ no payment slip upload with real bank
- ❌ no shipping with real carrier
- ❌ no raw SQL on production
- ❌ no `prisma migrate reset`
- ❌ no env flag flip during Phase B (changing during the test invalidates the run)
- ❌ no concurrent Tier 4 / Tier 5 implementation work
- ❌ no admin invite during Phase B

---

## 8. Phase B exit decision

Phase B is COMPLETE when:

- All 14 rounds (10 happy + 4 cross-shop + 1 contention + 1 cancel-after-confirm + 5 idempotency replays on one row) PASS
- 24-72h observation shows no anomaly
- Boss + ChatGPT explicit verdict

Phase B is FAILED when:

- Any round produces a 5xx
- reservedQty drifts unexpectedly
- Orphan StockReservation row appears
- Idempotency returns a different orderId

On FAIL → roll back deploy → open hotfix branch → re-run Phase B from scratch.

---

## 9. Decision points after Phase B PASS

- Decide Tier 4.1 implementation start (separate gates)
- Decide first real admin invite
- Decide stock decrement implementation order (if Y chosen)
- Decide whether Phase C (closed-beta with 1 real customer) starts

---

## 10. Cross-references

- Phase B unblock criteria: `docs/superpowers/2026-05-15-phase-b-unblock-criteria.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Local verifier: `scripts/verify-sale-d4-d6-functional-flow.ts`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Commerce readiness follow-up: `docs/superpowers/2026-05-18-commerce-readiness-followup.md`
