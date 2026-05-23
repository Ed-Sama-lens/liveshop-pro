# Phase 1.5 Decision Matrix — Quick Reference

**Filed:** 2026-05-23 (Block 2 Track T7)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `d870931`
**Status:** Quick reference. No runtime in this PR.
**Companion to:** PR #54 (parent design) + PR #81 (refinement packet)

Boss + ChatGPT can answer all 7 Phase 1.5 questions from this single
table. No deep reading required.

---

## 1. Decision matrix (one table to verdict)

| # | Question | Options | Claude default | Risk | Migration? | Order impact | Stock impact | UI impact | What we can do before verdict | What waits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Risk model | A bool / B score / C tags / D thresholds | **A boolean** `Customer.autoConfirmEligible` | R1 | YES (1 column + default true) | none | none | edit page: customer trust toggle | implementation |
| 2 | Auto-confirm policy | A trust-gated / B always / C never | **A trust-gated** | R1 | depends on Q1 | none | yes (reserves immediately on auto-confirm) | Manual Create dialog: risk preview | implementation |
| 3 | New-customer default | optimistic `true` / conservative `false` | **optimistic `true`** | R1 | depends on Q1 (default column value) | none | none | docs / UX copy | column default |
| 4 | Append-eligible Order statuses | A RESERVED only / B RESERVED+CONFIRMED / C other | **A RESERVED only** | R1 | YES (Order.saleDate column) | yes (append vs new order) | yes (shared reservations) | none | implementation |
| 5 | Multi-code batch cap | 20 / 50 / 100 | **20** | R2 | none | none | none | UI batch builder design | implementation |
| 6 | Batch semantics | all-or-nothing / partial-success | **all-or-nothing** | R1 | none | yes ($transaction rollback) | yes (all-or-none reservation) | repo design | implementation |
| 7 | PR ordering | B-first / C-first / parallel | **B-first** (auto-confirm) | R1 | each | each | each | tests + migration plans | implementation |

---

## 2. Quick-pick reply template

Boss/ChatGPT can paste this verbatim, fill answers:

```
Phase 1.5 verdict 2026-05-23

Q1 risk model:                   [A bool / B score / C tags / D thresholds] = ___
Q2 auto-confirm policy:          [A trust-gated / B always / C never] = ___
Q3 new-customer default:         [optimistic true / conservative false] = ___
Q4 append-eligible statuses:     [A RESERVED only / B +CONFIRMED / C other] = ___
Q5 multi-code batch cap:         [20 / 50 / 100] = ___
Q6 batch semantics:              [all-or-nothing / partial-success] = ___
Q7 PR ordering:                  [B-first / C-first / parallel] = ___

Recommendation taken:            [yes / partial / custom] = ___
Open implementation PR sequence: [unblocked / hold] = ___
```

---

## 3. What Claude can prep before verdict (safe)

Without any Boss decision needed, the following can land as
docs/tests-only PRs:

| Prep work | PR title | Risk |
|---|---|---|
| Schema migration audit (UNIQUE constraints, indexes) | `docs(sale): Phase 1.5 schema migration safety audit` | R2 |
| Customer risk-model UI mockup (any option) | already covered by PR #54 design |  |
| Manual Create batch UI wireframe | `docs(sale): multi-code Manual Create UI design` | R2 |
| Auto-confirm + auto-order test fixtures | `test(sale): Phase 1.5 fixtures (no runtime wire)` | R2 |
| Migration rollback procedure | `docs(sale): Phase 1.5 migration rollback procedure` | R2 |

None of these blocks Boss decisions; all can land while Boss reviews.

---

## 4. What blocks until verdict

| Blocked PR | Blocked by |
|---|---|
| 1.5-B-1 migration `Customer.autoConfirmEligible` | Q1 (column shape) + Q3 (default) |
| 1.5-B-2 auto-confirm repo wiring | Q1 + Q2 |
| 1.5-B-3 UI override + risk display | Q1 + Q2 (UI surfaces trust flag) |
| 1.5-C-1 migration `Order.saleDate` + backfill | Q4 (status semantics) |
| 1.5-C-2 orderRepository.upsertFromBooking | Q4 |
| 1.5-C-3 wire confirm → upsert | Q4 |
| 1.5-D Multi-code batch | Q5 + Q6 |

Verdict on Q1 alone unlocks 3 PRs. Verdict on Q4 alone unlocks 3 PRs.
Q5+Q6 unlocks 1 PR.

---

## 5. Why each default is safe

### Q1 boolean
- Easiest to migrate later to score/tags
- Boss's actual workflow is binary in practice ("ไว้ใจ / ไม่ไว้ใจ")
- Future migration adds new column, deprecates boolean — no data loss

### Q2 trust-gated
- Matches Boss UI smoke verbatim
- Stock reserved IMMEDIATELY on auto-confirm (no race window)
- Admin override always available

### Q3 optimistic true
- New customers don't get extra friction
- Bad actors caught at first failure → flag flips to false
- Conservative `false` would punish 95% legitimate first-time buyers

### Q4 RESERVED only
- Any other Order status = physical operation in progress
- Appending past RESERVED creates audit confusion
- New Order for late items = correct admin signal

### Q5 cap 20
- Bounded enough to prevent UI mistakes (admin can't fat-finger 100 lines)
- 20 covers Boss's typical batch (one customer ordering 5-15 items)
- Cap can grow later without breaking existing data

### Q6 all-or-nothing
- Partial-success leaves stock in inconsistent state (some items reserved, some not)
- All-or-nothing matches existing booking transaction semantics
- Admin sees one clear failure or one clear success

### Q7 B-first
- Auto-confirm is the obvious win (no schema migration on Order)
- C-first requires Order.saleDate backfill on production (R0-risk for legacy orders)
- B lands fast, C lands once B is validated in production

---

## 6. Hard no-go reminders

All Phase 1.5 PRs:

- ❌ NO outbound message (Tier 4.5)
- ❌ NO Facebook runtime (Tier 4.1)
- ❌ NO parser auto-booking (Tier 4.7+)
- ❌ NO env / flag flip by Claude (Boss owns Vercel)
- ❌ Migrations land via Vercel auto-deploy (R1; Boss verifies success before wiring PR merge)
- ❌ NO payment / shipping touch
- ❌ pak-ta-kra untouched

---

## 7. Cross-references

- PR #54 — parent design (auto-confirm/auto-order/multi-code)
- PR #81 — refinement packet (full 7-question detail)
- PR #63 — Tier 3.10-A board audit (Phase 1.5 compatibility verified)
- `prisma/schema.prisma` — Customer / Order / Booking / StockReservation

---

## 8. Decision

This doc lands as `docs(sale): Phase 1.5 decision matrix quick reference`.
Zero runtime. Companion to PR #81. Boss + ChatGPT pick 7 verdicts from
§1 table → §2 template → Claude opens implementation PRs.
