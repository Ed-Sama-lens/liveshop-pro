# Phase 1.5 — Decision Summary for Boss

**Filed:** 2026-05-24 (autonomous docs block Track 1)
**Author:** Claude Sonnet 4.6
**Status:** Boss-readable verdict table. NO runtime change. Phase 1.5 runtime remains HARD-HELD per Boss Decision 2.
**Supersedes for quick-read:** verdict packet `2026-05-23-phase-1-5-verdict-packet.md` (still authoritative for full detail) + implementation checklist `2026-05-24-phase-1-5-implementation-checklist.md` (still authoritative for tactical steps).

This doc compresses Q1–Q7 into one verdict table so Boss can pick defaults in 60 seconds without re-reading the full packet. Detail lives in the source docs.

---

## 0. One-line summary

**Recommended path:** Accept all 7 defaults → ship B-series first (auto-confirm) → after ≥1 week prod stability → C-series (auto-order append) → D-series (multi-code) any time after Q5/Q6 verdict.

**Total migrations:** 3 (all additive, all R1, none R0).
**Total runtime PRs:** 6 (B-series) + 4 (C-series) + 1 (D-series) = 11.
**Cannot start until:** Boss explicit `IMPLEMENT 1.5-B-1 NOW` verdict.

---

## 1. Q1–Q7 verdict table

| # | Decision | Recommended default | Risk | Migration | Stock impact | Order impact | UI impact | Can ship before UI smoke? | Must wait? |
|---|---|---|---|---|---|---|---|---|---|
| Q1 | Customer trust shape | **boolean `autoConfirmEligible`** | R1 | YES (1 col + default true) | none | none | edit-customer toggle | No — Boss verdict gate | Yes — verdict + UI smoke A-L |
| Q2 | Auto-confirm policy | **trust-gated (read Q1 flag)** | R1 | NO (depends on Q1) | YES (reserves on auto) | none | Confirm dialog preview | No — depends on Q1 | Yes — Q1 landed + verdict |
| Q3 | New-customer default | **optimistic `true`** | R1 | YES (sets default value in Q1 migration) | none | none | none (silent default) | Folded into Q1 | Folded into Q1 |
| Q4 | Append-eligible Order statuses | **`RESERVED` only** | R1 | YES (1 col + index + backfill) | YES (reuses reservations) | YES (Order grows OrderItems post-create) | Order detail "appended" badge | No — B-series must be ≥1 week prod-stable first | Yes — B-series exit criteria |
| Q5 | Multi-code batch cap | **20** | R2 | NO | bounds reservations | none | dialog validation | Yes (forward-only) | No — independent of B/C |
| Q6 | Batch semantics | **all-or-nothing** | R1 | NO | YES (preserves consistency) | none | error msg | No — needs Q5 verdict | Yes — Q5+Q6 verdict |
| Q7 | PR ordering | **B-first → C-second → D parallel** | per-series | per-series | per-series | per-series | per-series | No — needs Q1+Q3 verdict | Yes — verdict |

---

## 2. Migration plan (3 migrations, all additive)

| Migration | Series | Column(s) added | Index added | Backfill required | Rollback cost |
|---|---|---|---|---|---|
| `1.5-B-1-schema` | B | `Customer.autoConfirmEligible Boolean @default(true)` | none | NO (default applies) | DROP COLUMN — safe |
| `1.5-C-1-schema` | C | `Order.saleDate DateTime?` | `(shopId, customerId, saleDate, status)` | YES (separate PR, Boss-run) | DROP INDEX + DROP COLUMN — safe |
| `1.5-C-1-backfill` | C | (data only) | none | YES (Boss runs after schema) | rerun-safe SQL with `WHERE saleDate IS NULL` |

All R1. None R0. All reverse cleanly.

---

## 3. Can Claude ship anything before Boss UI smoke?

**No runtime PR.** All runtime work blocks on Boss explicit `IMPLEMENT NOW` verdict per Boss Decision 2 + global hard no-go list.

**Safe docs-only PRs Claude can prep now (no verdict needed):**

| Prep work | PR title (suggested) | Risk |
|---|---|---|
| Schema migration safety audit | `docs(sale): Phase 1.5 schema migration safety audit` | R2 |
| Order.saleDate backfill SQL audit | `docs(sale): Phase 1.5 Order.saleDate backfill audit` | R2 |
| Multi-code UI wireframe (visual only) | `docs(sale): Phase 1.5 multi-code UI wireframe` | R2 |
| Test fixtures (no runtime wire) | `test(sale): Phase 1.5 fixtures` | R2 |
| Migration rollback procedure | `docs(sale): Phase 1.5 migration rollback procedure` | R2 |
| Reservation race audit | `docs(sale): reservation race audit` | R2 |

None of these block any Boss decision. All land while Boss reviews verdict.

---

## 4. Verdict quick-pick (Boss/ChatGPT paste verbatim)

```
Phase 1.5 verdict — 2026-05-24

Q1 customer flag:                [A bool / B score / C tags / D thresholds] = ___
Q2 auto-confirm policy:          [A trust-gated / B always / C never] = ___
Q3 new-customer default:         [optimistic true / conservative false] = ___
Q4 append-eligible statuses:     [A RESERVED only / B +CONFIRMED / C other] = ___
Q5 multi-code batch cap:         [20 / 50 / 100] = ___
Q6 batch semantics:              [all-or-nothing / partial-success] = ___
Q7 PR ordering:                  [B-first / C-first / parallel] = ___

Recommendation taken:            [yes all / partial / custom] = ___
Open implementation PR sequence: [unblocked / hold] = ___
First PR to open:                [1.5-B-1-schema / hold] = ___
```

---

## 5. Exact PR sequence if Boss accepts all defaults

```
Phase 1.5-B (auto-confirm, requires Q1+Q2+Q3 verdict)
├── 1.5-B-1-schema      R1 — Customer.autoConfirmEligible @default(true) + DISSENT
├── 1.5-B-1-repo        R2 — customerRepository surfaces new field
├── 1.5-B-1-ui          R1 — edit-customer toggle + PATCH /api/sale/customers/[id]
├── ─── Boss UI smoke + Vercel migration verified ───
├── 1.5-B-2-repo        R1 — bookingRepository.confirm branches on flag
├── 1.5-B-2-route       R1 — POST /api/sale/bookings returns autoConfirmed meta
├── 1.5-B-2-ui          R1 — Confirm dialog auto-confirm preview pill
├── 1.5-B-2-tests       R2 — unit + integration + Playwright
└── ─── ≥1 week prod-stable + zero false positives ───

Phase 1.5-D (multi-code, requires Q5+Q6 verdict, independent of B/C)
└── 1.5-D-1             R1 — multi-code Manual Create + cap 20 + all-or-nothing

Phase 1.5-C (auto-order append, requires Q4 verdict + B-series stable)
├── 1.5-C-1-schema      R1 — Order.saleDate + index + DISSENT
├── 1.5-C-1-backfill    R1 — separate PR, Boss-run
├── ─── Boss verifies zero NULL saleDate on production Orders ───
├── 1.5-C-2-repo        R1 — orderRepository.upsertFromBooking
├── 1.5-C-3-route       R1 — POST /api/sale/orders/from-bookings wire upsert
├── 1.5-C-3-ui          R1 — Order detail "appended" badge
└── 1.5-C-3-tests       R2 — unit + integration + Playwright
```

---

## 6. Hard gates (cannot cross)

- ❌ NO Phase 1.5 runtime PR opened without Boss explicit `IMPLEMENT 1.5-X-Y NOW` verdict
- ❌ NO migration generated, even on local branch, without verdict
- ❌ NO `prisma migrate dev` / `prisma migrate deploy` invocation
- ❌ NO `Customer` row mutation in production
- ❌ NO `Order` row mutation in production
- ❌ NO outbound messaging (Tier 4.5)
- ❌ NO Facebook runtime (Tier 4.1)
- ❌ NO parser auto-booking (Tier 4.7+)
- ❌ NO env / flag flip by Claude
- ❌ NO Boss-owned untracked notes touched
- ❌ pak-ta-kra untouched

---

## 7. Cross-references

- `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` — full verdict packet (authoritative detail)
- `docs/superpowers/2026-05-24-phase-1-5-implementation-checklist.md` — tactical implementation steps
- `docs/superpowers/2026-05-23-phase-1-5-decision-matrix.md` — original decision matrix
- `docs/superpowers/2026-05-23-phase-1-5-decision-packet-refinement.md` — refined questions
- PR #54 — Phase 1.5 parent design
- PR #81 — refinement packet
- PR #90 — decision matrix
- `prisma/schema.prisma` — Customer (line 239) / Order (line 292) / Booking (line 947) / StockReservation (line 219)

---

## 8. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero schema change
- Zero env change
- Zero secret access
- pak-ta-kra untouched
- Awaiting Boss + ChatGPT verdict on Q1–Q7
- Recommended path = accept all 7 defaults → B-first sequence
- After verdict, Claude opens `1.5-B-1-schema` (R1, requires DISSENT 4-bullet) only on Boss explicit `IMPLEMENT NOW`
