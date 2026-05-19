# Phase B dry-run — execution pack

**Filed:** 2026-05-19
**Pairs with:**
- `docs/superpowers/2026-05-15-phase-b-unblock-criteria.md` (criteria)
- `docs/superpowers/2026-05-18-phase-b-dry-run-test-data-plan.md` (data shape)

**Status:** Phase B remains **BLOCKED**. This pack makes it executable later without ambiguity.

---

## 1. Why this pack

Earlier docs cover criteria + test-data shape. Boss still needs:

- An ordered step list with explicit checkboxes
- Stop conditions (when to halt + report Claude)
- Expected outputs (what PASS looks like)
- Rollback plan (what to undo if Phase B trips)
- Claude-side safe checks (what Claude does between Boss steps)

This pack consolidates all five.

---

## 2. Prerequisites — must ALL be true before starting

| # | Prerequisite | Where verified |
|---|---|---|
| 1 | Boss D4/D6 functional smoke PASS (Stage A-G via admin UI) | `2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md` |
| 2 | Local Docker D4/D6 verifier 9/9 PASS | `2026-05-19-local-d4-d6-verifier-runbook.md` |
| 3 | Stock decrement decision X/Y/Z made (default: Y) | `2026-05-15-stock-decrement-decision-matrix.md` |
| 4 | Production unauth smoke 16/16 PASS at current master HEAD | `npm run smoke:prod:unauth` |
| 5 | Tsc baseline zero errors | `npx tsc --noEmit` |
| 6 | No 5xx in Vercel logs in last 24h | Vercel dashboard |
| 7 | Boss + ChatGPT explicit Phase B start verdict | chat |

If any row blank → STOP. Phase B does not start.

---

## 3. Roles during Phase B

| Actor | What they do | What they do NOT do |
|---|---|---|
| Boss | All admin UI actions; auth; capture IDs; report PASS/FAIL per round | Don't share credentials; don't deviate from the round script |
| ChatGPT | Pre-flight review; reasonable-sense check during reporting | No admin actions |
| Claude | Smoke + unauth-side validation between rounds; hotfix branch if FAIL | No authenticated POST; no Boss credentials |

---

## 4. Phase B rounds (in order)

### Round 1 — Happy path × 10

For each of 10 iterations:

- [ ] Boss creates BroadcastProduct via Add-from-Stock (displayCode `PHASE-B-001` … `-010`)
- [ ] Boss creates manual booking for Boss customer, qty 1, PENDING_REVIEW
- [ ] Boss confirms booking → reservedQty +1
- [ ] Boss converts via per-row UI OR DevTools Console V2 path
- [ ] Boss captures IDs in notepad
- [ ] Boss reports round-N result to Claude

Between each round Claude:

- [ ] Runs `npm run smoke:prod:unauth` → expects 16/16 still pass
- [ ] Confirms no master deploy in between (master HEAD unchanged)

Expected after 10: 10 Orders RESERVED, 10 distinct orderIds, 10 distinct booking IDs.

### Round 2 — Cross-shop guard × 4

| Scenario | Customer | Variant | Expected |
|---|---|---|---|
| 2a Boss shop ✕ Boss customer | Boss | Boss shop | 200 PASS |
| 2b Boss shop ✕ Boss customer (second variant) | Boss | Boss shop | 200 PASS |
| 2c Other-shop customer ✕ Boss shop variant (if available) | other shop | Boss shop | 409 cross-shop |
| 2d Boss shop ✕ other-shop variant (if available) | Boss | other shop | 409 cross-shop |

- [ ] Boss runs each scenario
- [ ] Boss notes HTTP status + error text per scenario
- [ ] Claude validates between: production smoke still green

If 2c or 2d returns 200 → bug → STOP, report, hotfix branch.

### Round 3 — Multi-session contention × 1

- [ ] Boss opens TWO browsers (or one + Incognito), both logged in as OWNER
- [ ] Both try to Confirm the same PENDING_REVIEW booking within 5 seconds
- [ ] Expected: one 200, one 409 or stale-state UI
- [ ] reservedQty must end at +1, not +2

If reservedQty = +2 → critical bug. STOP. Report. Hotfix branch.

### Round 4 — Cancel-after-confirm × 1

- [ ] Boss creates booking + confirms → reservedQty +1
- [ ] Boss cancels the confirmed booking
- [ ] Expected: reservedQty back to baseline; reservation `releasedAt` set
- [ ] No orphan StockReservation row

### Round 5 — Idempotency × 5 replays on one booking

- [ ] Boss converts one CONFIRMED booking via V2 Console fetch
- [ ] Boss replays the same fetch 5 times in quick succession
- [ ] Expected: same orderId × 5, `idempotent: true` on replays 2-5

If a new orderId on any replay → critical V2 bug. STOP. Hotfix.

### Round 6 — Reservation integrity badge sweep

- [ ] Boss opens Booking Queue
- [ ] Boss filters / scrolls through all bookings created during Phase B
- [ ] Expected: every row has badge `OK`, none `MISSING`/`MULTIPLE`/`NOT_APPLICABLE`

If any non-OK badge → investigate offline; Boss reports IDs.

---

## 5. Observation window (post-rounds)

After all 6 rounds PASS:

- [ ] 24h passive observation
- [ ] No new 5xx in Vercel logs
- [ ] No stuck PENDING_REVIEW > 4h (none expected since rounds done)
- [ ] No stuck RESERVED Orders > 24h
- [ ] reservedQty stable
- [ ] Activity log shows ~14 events per round (BP-create + booking-create + confirm + convert ≈ 4 per round × 10 + cross-shop variants + cancel + replays)

Claude runs smoke every 6 hours during observation:
- [ ] T+6h smoke 16/16 PASS
- [ ] T+12h smoke 16/16 PASS
- [ ] T+18h smoke 16/16 PASS
- [ ] T+24h smoke 16/16 PASS

If any smoke fails → STOP. Phase B marked FAIL. Hotfix branch.

If 24h clean → Phase B PASS.

---

## 6. Boss-side step template (copy into notepad)

```
=== Phase B Round 1 — Iter 1 ===
displayCode: PHASE-B-001
broadcastProductId: cm__________
bookingId: cm__________
confirm 200 at: __:__
convert response:
  orderId: cm__________
  orderNumber: ORD-______
  totalAmount: RM__________
  idempotent: false
reservedQty before/after confirm: ___ / ___
reservedQty after convert: ___ (same as confirm)
notes: ___

=== Phase B Round 1 — Iter 2 ===
... (same template, displayCode PHASE-B-002, ...)

=== Phase B Round 2 — Scenario 2a ===
customer: ___
variant: ___
result: 200 PASS
bookingId: cm__________

=== Phase B Round 2 — Scenario 2c ===
customer: other-shop
variant: Boss-shop
result: ___ HTTP status
expected: 409 cross-shop
PASS/FAIL: ___

=== Phase B Round 3 — Multi-session ===
booking under contention: cm__________
session 1 result: ___ HTTP status
session 2 result: ___ HTTP status
reservedQty end-state: ___ (expected baseline + 1)

=== Phase B Round 4 — Cancel-after-confirm ===
bookingId: cm__________
after confirm reservedQty: ___ (+1)
after cancel reservedQty: ___ (back to baseline)
reservation releasedAt: ___ (timestamp present)

=== Phase B Round 5 — Idempotency × 5 ===
bookingId: cm__________
orderId run 1: cm__________ idempotent:false
orderId run 2: cm__________ idempotent:true (same as run 1)
orderId run 3: cm__________ idempotent:true (same as run 1)
orderId run 4: cm__________ idempotent:true (same as run 1)
orderId run 5: cm__________ idempotent:true (same as run 1)

=== Phase B Round 6 — Integrity badges ===
total bookings inspected: ___
non-OK badges found: ___ (expected 0)
if non-OK: list IDs + badge label

=== 24h observation ===
T+6h smoke: 16/16 PASS / FAIL
T+12h smoke: 16/16 PASS / FAIL
T+18h smoke: 16/16 PASS / FAIL
T+24h smoke: 16/16 PASS / FAIL
new 5xx in Vercel logs: yes / no
```

---

## 7. Stop conditions

Halt Phase B immediately on any of:

- Any 5xx response from any sale route
- reservedQty drifts unexpectedly (e.g. Round 3 ends at +2)
- A replay returns a NEW orderId (Round 5 critical bug)
- A cross-shop attempt returns 200 (Round 2 critical bug)
- An orphan StockReservation row appears (Round 4)
- ActivityLog count diverges by >5 from expectation
- Production unauth smoke drops below 16/16 during a round

On halt:

1. Boss STOPS clicking
2. Screenshot the failing state
3. Note the round + iteration + exact failure
4. Report to Claude
5. Claude opens `fix/sale-phase-b-<topic>` branch
6. Claude diagnoses, proposes fix, awaits Boss + ChatGPT approval
7. Once fix merged + deployed, Phase B restarts from Round 1

---

## 8. Rollback / cleanup

Test data created during Phase B becomes the **regression fixture set**. Do NOT delete unless Boss explicitly opts in.

If Boss decides to clean up:

| Row type | Action |
|---|---|
| Orders (10 from Round 1) | Cancel via admin UI; no `DELETE /api/orders/:id` exists |
| Bookings (~16) | Already CONVERTED_TO_ORDER or CANCELLED; leave |
| BroadcastProducts (10 PHASE-B-XXX) | Delete via Tier 3.5 dialog (active-booking guard passes for CONVERTED bookings) |
| Customer | DO NOT delete (Boss + other future runs depend on it) |
| ProductVariant | DO NOT delete (real inventory) |

NEVER run raw SQL on production to clean up. If a row gets stuck, escalate to Claude.

---

## 9. What remains forbidden during Phase B

- ❌ No real customer touch
- ❌ No payment slip upload with real bank
- ❌ No shipping with real carrier
- ❌ No raw SQL on production
- ❌ No `prisma migrate reset`
- ❌ No env flag flip during Phase B (changing mid-run invalidates results)
- ❌ No Tier 4 / Tier 5 implementation work concurrent
- ❌ No admin invite during Phase B
- ❌ No CI/workflow changes mid-run
- ❌ No pak-ta-kra touch

---

## 10. Exit decision

Phase B PASS when:
- All 6 rounds PASS
- 24h observation clean
- Boss + ChatGPT explicit PASS verdict

Phase B FAIL when:
- Any round triggers a stop condition
- Observation window shows anomaly
- Boss + ChatGPT explicit FAIL verdict

After PASS: next decisions are
- Tier 4.1 implementation start (separate gates G1-G10)
- First real admin invite (workbook Day 0 prerequisites)
- Stock decrement implementation (if Y chosen)
- Phase C (closed-beta with 1 real customer)

---

## 11. Cross-references

- Phase B unblock criteria: `docs/superpowers/2026-05-15-phase-b-unblock-criteria.md`
- Phase B dry-run test data: `docs/superpowers/2026-05-18-phase-b-dry-run-test-data-plan.md`
- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Local verifier runbook: `docs/superpowers/2026-05-19-local-d4-d6-verifier-runbook.md`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Stock model Y impl plan: `docs/superpowers/2026-05-19-stock-model-y-implementation-plan.md`
- Admin onboarding workbook: `docs/superpowers/2026-05-18-admin-onboarding-workbook.md`
