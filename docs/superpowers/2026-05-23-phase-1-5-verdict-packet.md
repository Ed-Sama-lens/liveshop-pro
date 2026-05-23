# Phase 1.5 Verdict Packet

**Filed:** 2026-05-23 (Block 4 — post Boss/ChatGPT Decision 2)
**Author:** Claude Sonnet 4.6
**Master baseline:** `310ddf3`
**Status:** Verdict packet — docs only. NO runtime implementation. NO migration. NO schema change.
**Companion to:** PR #54 (parent design) + PR #81 (refinement) + PR #90 (decision matrix)
**Supersedes:** decision matrix quick-pick (this packet adds risk/migration/impact/sequence/stop conditions per decision)

Boss + ChatGPT Decision 2 (2026-05-23) explicitly authorized: refine decision matrix + recommend defaults + prepare implementation sequence. **NOT authorized:** auto-confirm runtime, auto-order append runtime, multi-code booking runtime, new migration, stock/reservation semantic change.

---

## 0. Scope rules honored

- Docs-only PR
- No `prisma/schema.prisma` edits
- No runtime code edits
- No env / flag flip
- No production probe
- pak-ta-kra untouched
- All R0 protected: no `migrate reset`, no `DROP`, no secrets touch
- DISSENT 4-bullet not required (R2 docs)

---

## 1. The 7 decisions — full verdict

Each decision: question / recommended default / risk / migration y/n / impact on booking/order/stock / PR sequence / stop conditions.

### Decision Q1 — Customer risk model

**Question:** What shape stores per-customer auto-confirm trust signal on `Customer`?

| Field | Value |
|---|---|
| Options | A boolean `autoConfirmEligible` / B integer `riskScore` 0-100 / C string[] `riskTags` / D threshold table |
| **Recommended default** | **A boolean `Customer.autoConfirmEligible Boolean @default(true)`** |
| Risk level | **R1** (additive column, default value, backfill-safe) |
| Migration required | **YES** — `prisma migrate dev` add 1 column with default, single migration file |
| Booking impact | None until Q2 wires it (auto-confirm decision reads this flag) |
| Order impact | None |
| Stock impact | None |
| UI impact | Edit-customer page gets a single toggle "Auto-confirm trust" |
| Why default | Boolean = simplest reversible; future migration to score/tags adds new column, deprecates bool, zero data loss. Boss workflow is binary in practice ("ไว้ใจ / ไม่ไว้ใจ"). |

**PR sequence if approved:**

1. `1.5-B-1-schema` — `prisma/schema.prisma` + migration file + `prisma generate` (R1)
2. `1.5-B-1-repo` — `customerRepository.findById` returns new field (R2 — additive)
3. `1.5-B-1-ui` — edit-customer page toggle + `PATCH /api/sale/customers/[id]` accept new field (R1 — API contract)

**Stop conditions:**

- Existing customer row count > 50,000 → flag for backfill plan
- Migration fails on Vercel preview → revert PR, do NOT merge to master
- Q3 verdict differs from default `true` → adjust column default value before migration

---

### Decision Q2 — Auto-confirm policy

**Question:** When admin clicks Confirm on PENDING_REVIEW booking, should system auto-flip to CONFIRMED based on customer trust?

| Field | Value |
|---|---|
| Options | A trust-gated (auto if `autoConfirmEligible=true`) / B always auto / C never auto (manual only) |
| **Recommended default** | **A trust-gated** |
| Risk level | **R1** (changes booking confirm UX + reservation timing) |
| Migration required | NO (depends on Q1 column) |
| Booking impact | **YES** — PENDING_REVIEW skips manual confirm dialog for eligible customers |
| Order impact | None directly (separate from Q4 auto-order append) |
| Stock impact | **YES** — reservation fires immediately on auto-confirm (no admin click delay) |
| UI impact | Manual Create dialog: "auto-confirm preview" pill showing eligibility |
| Why default | Trust-gated matches Boss admin behavior verbatim. Stock reserved IMMEDIATELY on auto-confirm = no race window. Admin can always override per booking. |

**PR sequence if approved:**

1. `1.5-B-2-repo` — `bookingRepository.confirm` reads `customer.autoConfirmEligible`, branches behavior (R1 — semantic change)
2. `1.5-B-2-route` — `POST /api/sale/bookings` confirm path returns auto-confirm metadata (R1 — response shape change)
3. `1.5-B-2-ui` — Confirm dialog shows "auto-confirm" preview vs "manual confirm" path (R1 — UX change)
4. `1.5-B-2-tests` — repository unit tests + route integration tests + Playwright smoke

**Stop conditions:**

- Q1 not landed → block (depends on column existence)
- Stock reservation race: if 2 admins click Confirm simultaneously → existing `$transaction` must hold; if not, file race repair PR first
- Customer flag mutation mid-confirm → resolve via `customer.autoConfirmEligible` read inside same `$transaction`

---

### Decision Q3 — New-customer default value

**Question:** What is `autoConfirmEligible` default for newly-created customers?

| Field | Value |
|---|---|
| Options | optimistic `true` (assume eligible) / conservative `false` (require admin manual trust grant) |
| **Recommended default** | **optimistic `true`** |
| Risk level | **R1** (sets migration column default + customer creation policy) |
| Migration required | **YES** — directly determines `@default(true)` vs `@default(false)` on Q1 migration |
| Booking impact | None (Q2 reads the flag) |
| Order impact | None |
| Stock impact | None |
| UI impact | Customer create form: no explicit toggle (defaults silently) OR explicit toggle (Boss decides — recommend silent default) |
| Why default | New customers not punished with extra friction. Bad actors caught on first failure → admin flips flag false. Conservative `false` would punish 95% legitimate first-time buyers. |

**PR sequence if approved:**

- Folded into `1.5-B-1-schema` (single migration with `@default(true)`)

**Stop conditions:**

- Boss/ChatGPT picks conservative `false` → migration default flips, customer create form must surface toggle (R1 UI surface)
- Any existing customer must NOT be backfilled to `false` silently → migration default applies to existing rows = all become `true`, matching new-customer policy

---

### Decision Q4 — Append-eligible Order statuses for auto-order append

**Question:** When same customer confirms second booking same `saleDate`, append to existing Order or create new Order? If append, which Order statuses are eligible?

| Field | Value |
|---|---|
| Options | A `RESERVED` only / B `RESERVED + CONFIRMED` / C other status combinations |
| **Recommended default** | **A `RESERVED` only** |
| Risk level | **R1** (adds `Order.saleDate` column + alters confirm path semantics) |
| Migration required | **YES** — `Order.saleDate DateTime?` column + index `(shopId, customerId, saleDate, status)` |
| Booking impact | Confirm flow either appends OrderItem to existing Order OR creates new Order |
| Order impact | **YES** — Order grows OrderItems post-creation (existing pattern only allows OrderItem creation at Order create time) |
| Stock impact | Append path reuses existing `StockReservation` rows; new-order path creates new reservations |
| UI impact | Order detail: visible "appended" badge or audit log entry |
| Why default | Any Order status past `RESERVED` = physical operation in progress (packed/shipped). Appending to past-RESERVED orders confuses audit + breaks shipping batch. New Order for late items = correct admin signal. |

**PR sequence if approved:**

1. `1.5-C-1-schema` — add `Order.saleDate` + index, write backfill SQL for existing rows (R1 — schema + data migration)
2. `1.5-C-1-backfill` — separate PR with backfill script (Boss verifies on Vercel before next step) (R1)
3. `1.5-C-2-repo` — `orderRepository.upsertFromBooking(shopId, customerId, saleDate)` new fn (R1)
4. `1.5-C-3-route-wire` — `POST /api/sale/orders/from-bookings` calls upsert instead of create (R1 — semantic change)
5. `1.5-C-3-tests` — repository + route + Playwright

**Stop conditions:**

- Backfill leaves any `Order` with `saleDate IS NULL` for production rows → halt before C-2
- Append path produces inconsistent OrderItem unit prices vs existing items → require Boss verdict on pricing policy (snapshot vs latest)
- `idempotencyKey` collision when appending to existing Order → require fresh idempotencyKey per OrderItem batch

---

### Decision Q5 — Multi-code Manual Create batch cap

**Question:** Max number of product codes admin can paste into Manual Create dialog batch?

| Field | Value |
|---|---|
| Options | 20 / 50 / 100 |
| **Recommended default** | **20** |
| Risk level | **R2** (cap is validation-only, easy to raise later) |
| Migration required | NO |
| Booking impact | Bounds batch size for `bookingRepository.createManual` |
| Order impact | None (bookings, not orders) |
| Stock impact | Bounds concurrent reservations per batch |
| UI impact | Manual Create dialog: validation error at cap+1 |
| Why default | 20 covers Boss's typical batch (one customer ordering 5-15 items). Caps fat-finger 100-line paste. Raising 20→50 later is non-breaking. |

**PR sequence if approved:**

- Single PR `1.5-D-1` (R1 because Q6 changes transaction semantics, see below)

**Stop conditions:**

- Boss/ChatGPT chooses 100 → require pagination in Manual Create dialog (UI scope creep)
- Cap breached in existing data (no — cap is forward-only, existing data unaffected)

---

### Decision Q6 — Batch semantics (all-or-nothing vs partial-success)

**Question:** When Manual Create batch contains N codes and 1 fails (stock out, invalid code), what happens to the other N-1?

| Field | Value |
|---|---|
| Options | all-or-nothing ($transaction rollback) / partial-success (commit valid, report invalid) |
| **Recommended default** | **all-or-nothing** |
| Risk level | **R1** (changes `bookingRepository.createManual` transaction semantics) |
| Migration required | NO |
| Booking impact | **YES** — failure mode shifts from "some bookings created" to "zero bookings created on any failure" |
| Order impact | None |
| Stock impact | **YES** — partial-success leaves stock in inconsistent state (some reserved, some not) |
| UI impact | Error message: single clear failure vs detailed per-code report |
| Why default | All-or-nothing matches existing booking transaction semantics. Partial-success leaks reservations + confuses admin. One clear failure = one clear retry. |

**PR sequence if approved:**

- Combines with Q5 in `1.5-D-1` (single PR for multi-code feature)

**Stop conditions:**

- Boss insists partial-success → require detailed UI error reporting (additional R1 UI scope)
- Existing single-code create path uses `$transaction` → multi-code must preserve same atomicity guarantee
- Reservation TTL: if batch takes > reservation `expiresAt` window, batch rollback must release all partial reservations

---

### Decision Q7 — PR ordering (B-series vs C-series)

**Question:** Ship auto-confirm (B-series, Q1+Q2+Q3) first or auto-order-append (C-series, Q4) first?

| Field | Value |
|---|---|
| Options | B-first (auto-confirm) / C-first (auto-order) / parallel |
| **Recommended default** | **B-first** |
| Risk level | **R1** per series (each contains schema + runtime changes) |
| Migration required | Each series has 1+ migration (B = 1 customer column, C = 1 order column + backfill) |
| Booking impact | B series changes confirm path; C series unchanged |
| Order impact | B unchanged; C changes Order creation |
| Stock impact | B reserves earlier (auto-confirm); C consolidates reservations across appends |
| UI impact | B updates Confirm dialog; C adds Order detail "appended" badge |
| Why default | B = additive Customer column + confirm UX, easy rollback. C = Order schema migration + backfill on production data (R0-adjacent — wrong backfill creates audit holes). B lands fast → validates Phase 1.5 model → C lands with B-stable foundation. |

**PR sequence if approved:**

```
Series B (Q1+Q2+Q3)
├── 1.5-B-1-schema       (migration: Customer.autoConfirmEligible default true)
├── 1.5-B-1-repo         (repository read new field)
├── 1.5-B-1-ui           (edit-customer toggle + PATCH route)
├── ── Boss verifies Vercel migration applied + UI smoke ──
├── 1.5-B-2-repo         (bookingRepository.confirm branches on flag)
├── 1.5-B-2-route        (POST /api/sale/bookings returns auto-confirm meta)
├── 1.5-B-2-ui           (Confirm dialog preview)
├── 1.5-B-2-tests        (unit + integration + Playwright)
└── ── Boss UI smoke + ≥1 week production stability ──

Series D (Q5+Q6) — independent of C, optional parallel with C
└── 1.5-D-1              (multi-code Manual Create, all-or-nothing, cap 20)

Series C (Q4) — STARTS AFTER B-series stable in production
├── 1.5-C-1-schema       (migration: Order.saleDate + index)
├── 1.5-C-1-backfill     (backfill script, separate PR, Boss verifies)
├── ── Boss verifies backfill complete (no NULL saleDate on Orders) ──
├── 1.5-C-2-repo         (orderRepository.upsertFromBooking)
├── 1.5-C-3-route        (POST /api/sale/orders/from-bookings wire upsert)
└── 1.5-C-3-tests        (unit + integration + Playwright)
```

**Stop conditions:**

- B-1-schema fails Vercel migration → halt B-series, do NOT proceed to B-2
- Production B-2 produces incorrect auto-confirm (false positives) → revert B-2, hold all C/D work
- Boss/ChatGPT picks C-first → requires production data audit on existing Orders first (additional R1 PR)

---

## 2. Risk summary table

| Decision | Risk | Migration | Booking | Order | Stock | UI |
|---|---|---|---|---|---|---|
| Q1 customer flag | R1 | YES (1 col) | none | none | none | toggle |
| Q2 auto-confirm | R1 | NO | YES | none | YES | dialog |
| Q3 default true | R1 | YES (default value) | none | none | none | minor |
| Q4 append RESERVED | R1 | YES (col + backfill) | none | YES | YES | badge |
| Q5 cap 20 | R2 | NO | YES | none | YES | validation |
| Q6 all-or-nothing | R1 | NO | YES | none | YES | error msg |
| Q7 B-first | R1 each | each | each | each | each | each |

Net: 3 migrations (Q1+Q3 combined, Q4 schema, Q4 backfill). All additive. None R0.

---

## 3. Global stop conditions (apply to all 7 decisions)

Halt Phase 1.5 implementation if any of the following surfaces during work:

1. **Schema drift** — migration produces unexpected diff vs `prisma migrate diff --from-empty`
2. **Backfill data loss** — any row count mismatch pre vs post backfill
3. **Reservation race** — stock count goes negative or duplicate reservations created
4. **Auth boundary breach** — any new route bypasses `requireAuth`
5. **API contract break** — existing response shape mutates without versioning
6. **Test regression** — any pre-existing test breaks (e.g. confirm path tests)
7. **TS error** — `tsc --noEmit` not EXIT=0
8. **Production migration not idempotent** — re-running migration produces different result
9. **Customer PII exposure** — new response shape leaks phone/email/address beyond existing scope
10. **idempotencyKey collision** — `Order.idempotencyKey` or `Booking.idempotencyKey` unique constraint violation

On any stop condition: revert PR, file `docs/superpowers/<date>-phase-1-5-stop-<topic>.md`, await Boss/ChatGPT verdict before resume.

---

## 4. What Claude can prep before any Boss implementation verdict

Safe docs/tests-only PRs (R2):

| Prep work | PR title | Risk | Depends on |
|---|---|---|---|
| Schema migration audit (UNIQUE/index/cascade) | `docs(sale): Phase 1.5 schema migration safety audit` | R2 | none |
| Backfill SQL audit (Order.saleDate path) | `docs(sale): Phase 1.5 Order.saleDate backfill audit` | R2 | none |
| Manual Create batch UI wireframe (visual only) | `docs(sale): Phase 1.5 multi-code UI wireframe` | R2 | none |
| Auto-confirm + auto-order test fixtures (no runtime wire) | `test(sale): Phase 1.5 fixtures` | R2 | none |
| Migration rollback procedure | `docs(sale): Phase 1.5 migration rollback procedure` | R2 | none |
| Reservation race audit (current $transaction guarantees) | `docs(sale): reservation race audit` | R2 | none |

None of these blocks Boss decisions. All can land while Boss reviews.

---

## 5. What blocks until Boss/ChatGPT verdict

| Blocked PR | Blocked by |
|---|---|
| 1.5-B-1-schema | Q1 + Q3 (column shape + default value) |
| 1.5-B-1-repo | 1.5-B-1-schema landed |
| 1.5-B-1-ui | 1.5-B-1-schema landed + Q1 verdict |
| 1.5-B-2-* | Q1 + Q2 |
| 1.5-C-1-schema | Q4 (status semantics) |
| 1.5-C-1-backfill | 1.5-C-1-schema landed |
| 1.5-C-2-repo | 1.5-C-1-backfill verified by Boss |
| 1.5-C-3-* | 1.5-C-2-repo |
| 1.5-D-1 | Q5 + Q6 |

Verdict on Q1+Q3 alone unlocks 3 PRs. Verdict on Q4 alone unlocks 4 PRs. Q5+Q6 unlocks 1 PR.

---

## 6. Hard gates (do NOT cross without Boss verdict)

- ❌ NO Phase 1.5 runtime PR opened without Boss explicit `IMPLEMENT 1.5-X-Y NOW`
- ❌ NO migration generated, even on local branch, without verdict
- ❌ NO `prisma migrate dev` / `prisma migrate deploy` invocation
- ❌ NO `Customer` row mutation in production
- ❌ NO `Order` row mutation in production
- ❌ NO outbound message (Tier 4.5)
- ❌ NO Facebook runtime (Tier 4.1)
- ❌ NO parser auto-booking (Tier 4.7+)
- ❌ NO env / flag flip by Claude
- ❌ NO Boss-owned untracked notes touched
- ❌ pak-ta-kra untouched

---

## 7. Verdict quick-pick reply template

Boss/ChatGPT can paste this verbatim, fill answers:

```
Phase 1.5 verdict packet — 2026-05-23

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

## 8. Cross-references

- PR #54 — parent design (auto-confirm/auto-order/multi-code)
- PR #81 — refinement packet (full 7-question detail)
- PR #90 — decision matrix quick reference (merged in Block 2)
- PR #63 — Tier 3.10-A board audit (Phase 1.5 compatibility verified)
- `prisma/schema.prisma` — Customer (line 239) / Order (line 292) / Booking (line 947) / StockReservation (line 219)
- Boss/ChatGPT verdict 2026-05-23 — Decision 2 authorization for this packet

---

## 9. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero schema change
- Zero env change
- Awaiting Boss + ChatGPT verdict on 7 questions
- Recommended path = take all 7 defaults → B-first sequence
- After verdict, Claude opens first PR `1.5-B-1-schema` (R1, requires DISSENT 4-bullet)
