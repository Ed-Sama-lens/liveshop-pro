# Phase 1.5 — Final Implementation-Ready Verdict Packet

**Filed:** 2026-05-24 (autonomous Phase 3)
**Author:** Claude Sonnet 4.6
**Status:** Implementation-ready packet. Reflects Boss's 7 explicit recommended defaults from Phase 3 authorization. NO runtime change. NO migration generated. Boss explicit `IMPLEMENT 1.5-X-Y NOW` still required per-PR before any runtime opens.

Supersedes for implementation reference:
- `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` (full Q&A detail still authoritative)
- `docs/superpowers/2026-05-24-phase-1-5-implementation-checklist.md` (tactical steps still authoritative)
- `docs/superpowers/2026-05-24-phase-1-5-decision-summary.md` (60-sec table)

This packet adds: rollback plan / smoke plan / tests / explicit IMPLEMENT-NOW requirement per Q.

---

## 0. Boss's 7 recommended defaults (Phase 3 authorization)

| # | Decision | Boss's recommended answer | Source |
|---|---|---|---|
| Q1 | Customer trust shape | **Auto-confirm opt-in by customer/trust flag, NOT global default** | Phase 3 §1 |
| Q2 | Auto-confirm policy | **Risky customers stay PENDING; trust-gated auto-confirm for eligible** | Phase 3 §2 |
| Q3 | New-customer default | **(implicit from Q1+Q2)** opt-in = NEW customers default to **NOT eligible** (admin grants trust manually) | derived |
| Q4 | Auto-order append | **Group by shopId + customerId + saleDate**, MUST NOT append to PAID/CANCELLED orders | Phase 3 §3 |
| Q5 | Multi-code Manual Create | **Multiple Booking rows transactionally, no schema migration initially** (cap 20) | Phase 3 §4 |
| Q6 | Outbound confirmation | **Disabled; preview/manual-send only later** | Phase 3 §5 |
| Q7 | Stock reservation semantics | **Remain current until explicit stock model change** | Phase 3 §6 |
| Q8 | Migration policy | **Phase 1.5 migrations MUST be split and reversible** | Phase 3 §7 |

**Note:** Boss's Q1 defaults SWITCH the conservative-vs-optimistic verdict from the original packet (which recommended `default true`). Per Phase 3 verdict: default to **NOT eligible** = customer-by-customer trust grant by admin. Safer + matches Boss's intent.

---

## 1. Q1 — Customer trust shape (FINAL)

| Field | Value |
|---|---|
| Decision | Boolean `Customer.autoConfirmEligible` |
| Default value | **`false`** (was `true` in original packet — switched per Boss Phase 3 verdict) |
| Risk | **R1** (additive column, default value, no backfill semantic shift) |
| Migration required | YES — single column |
| Booking impact | None until Q2 wires it |
| Order impact | None |
| Stock impact | None |
| UI impact | Edit-customer page renders toggle (defaults OFF for new customer; admin grants trust) |
| Boss explicit `IMPLEMENT 1.5-B-1 NOW` required? | **YES** before PR opens |

### Q1 PR sequence

1. `1.5-B-1-schema` — `prisma migrate dev` add column with `@default(false)` (R1)
2. `1.5-B-1-repo` — `customerRepository` surfaces new field (R2)
3. `1.5-B-1-ui` — edit-customer toggle + `PATCH /api/sale/customers/[id]` accept new field (R1)

### Q1 rollback plan

```sql
ALTER TABLE "Customer" DROP COLUMN "autoConfirmEligible";
DROP INDEX IF EXISTS "Customer_shopId_autoConfirmEligible_idx";
```

Safe — column is additive with `default false`. Backfill = all existing rows get `false`. Rollback removes column; no data loss because nothing else reads it yet.

### Q1 smoke plan

- Boss UI smoke: create new customer → verify toggle = OFF default
- Edit customer → flip toggle → verify reads back ON after reload
- Vercel migration verified in production via `prisma migrate status`

### Q1 tests

- Migration applies cleanly to fresh Docker postgres
- `customerRepository.findById` returns new field
- `PATCH /api/sale/customers/[id]` accepts + rejects per RBAC
- New customer create defaults `autoConfirmEligible: false`

---

## 2. Q2 — Auto-confirm policy (FINAL)

| Field | Value |
|---|---|
| Decision | Trust-gated auto-confirm via Q1 flag |
| Risky-customer behavior | **Stays PENDING** (no auto-flip) per Boss Phase 3 §2 |
| Risk | **R1** (changes booking confirm UX + reservation timing for eligible customers) |
| Migration required | NO (depends on Q1 column) |
| Booking impact | **YES** — PENDING_REVIEW skips manual confirm dialog when `autoConfirmEligible=true` |
| Order impact | None directly (separate from Q4 append) |
| Stock impact | **YES** — reservation fires immediately on auto-confirm (no admin click delay) |
| UI impact | Confirm dialog shows "auto-confirm preview" pill for eligible customers |
| Boss explicit `IMPLEMENT 1.5-B-2 NOW` required? | **YES** + Q1 must be production-stable ≥1 week first |

### Q2 PR sequence

1. `1.5-B-2-repo` — `bookingRepository.confirm` reads `customer.autoConfirmEligible`, branches (R1)
2. `1.5-B-2-route` — `POST /api/sale/bookings` confirm path returns auto-confirm metadata (R1)
3. `1.5-B-2-ui` — Confirm dialog auto-confirm preview pill (R1)
4. `1.5-B-2-tests` — repo + route + Playwright

### Q2 rollback plan

Revert `1.5-B-2-*` PRs in reverse order. No schema rollback needed (Q1 column unaffected). Existing manual confirm path unchanged.

### Q2 smoke plan

- Boss flips test customer `autoConfirmEligible=true`
- Manual Create booking for that customer → verify auto-confirms without dialog
- Manual Create for `autoConfirmEligible=false` customer → verify stays PENDING_REVIEW + dialog opens

### Q2 tests

- Trust-gated path: eligible → CONFIRMED + reservation in same tx
- Untrusted path: ineligible → stays PENDING_REVIEW
- Idempotent auto-confirm replay returns `{ idempotent: true }`
- Concurrent confirm race: 2 admins click → existing `$transaction` lock holds

---

## 3. Q3 — New-customer default (FOLDED into Q1)

Q3 verdict is derived from Q1 + Q2: new customers default to `autoConfirmEligible: false` = NOT auto-confirmed. Admin grants trust per-customer via Q1 UI toggle.

No separate migration. No separate PR. Q1 schema covers it.

---

## 4. Q4 — Auto-order append (FINAL)

| Field | Value |
|---|---|
| Decision | Group by `shopId + customerId + saleDate`; append OrderItem to existing Order |
| Append-eligible Order statuses | **NOT PAID/CANCELLED** (Boss Phase 3 §3). RESERVED is eligible. Other interim statuses TBD per existing OrderStatus enum |
| Risk | **R1** (Order.saleDate column + index + backfill + tx-semantic change) |
| Migration required | YES — column + index + backfill (3 separate PRs) |
| Booking impact | None |
| Order impact | **YES** — Order grows OrderItems post-creation (was: items created at Order create time only) |
| Stock impact | Append path reuses existing reservation; no new reservation row per append |
| UI impact | Order detail shows "appended" badge / audit log entry |
| Boss explicit `IMPLEMENT 1.5-C-1 NOW` required? | **YES** + Q1+Q2 B-series production-stable ≥1 week first |

### Q4 PR sequence (3 R1 + 1 R2 = 4 PRs)

1. `1.5-C-1-schema` — `prisma migrate dev` add `Order.saleDate DateTime?` + index `(shopId, customerId, saleDate, status)` (R1 + DISSENT 4-bullet)
2. `1.5-C-1-backfill` — separate Boss-run SQL backfill PR (R1)
3. `1.5-C-2-repo` — `orderRepository.upsertFromBooking(shopId, customerId, saleDate)` new fn (R1)
4. `1.5-C-3-route` — `POST /api/sale/orders/from-bookings` calls upsert instead of create (R1)
5. `1.5-C-3-ui` — Order detail "appended" badge (R1)
6. `1.5-C-3-tests` — repo + route + Playwright (R2)

### Q4 rollback plan

```sql
DROP INDEX "Order_shopId_customerId_saleDate_status_idx";
ALTER TABLE "Order" DROP COLUMN "saleDate";
```

Safe — column is additive, no foreign keys, no other table touched. Backfill is reversible because original data still in source Booking rows.

### Q4 backfill verification

```sql
-- Count rows where saleDate IS NULL post-backfill
SELECT COUNT(*) FROM "Order" WHERE "saleDate" IS NULL;
-- Target: 0 for Orders with converted bookings
```

Boss runs manually after `1.5-C-1-backfill` merges + Vercel migrates.

### Q4 smoke plan

- Create 2 bookings same customer same saleDate → confirm both
- Verify second booking conversion APPENDS to existing RESERVED Order (not new Order)
- Verify PAID Order receives NEW Order (does NOT append)
- Verify CANCELLED Order also does NOT append (new Order created)
- Verify Order detail "appended" badge surfaces

### Q4 tests

- Same-saleDate same-customer second batch appends to RESERVED Order
- Different-saleDate creates new Order
- PAID Order does NOT receive append (new Order)
- CANCELLED Order does NOT receive append
- Stock reservations released atomically per booking convertToOrder

---

## 5. Q5 — Multi-code Manual Create (FINAL)

| Field | Value |
|---|---|
| Decision | Create multiple Booking rows transactionally in single $transaction |
| Cap | 20 codes per batch (Boss recommended default in Phase 3 §4) |
| Batch semantics | All-or-nothing (any failure rolls back entire batch) |
| Risk | **R1** (transaction semantic change in `bookingRepository.createManual`) |
| Migration required | **NO initially** (Boss Phase 3 §4 — no schema migration initially) |
| Booking impact | **YES** — failure mode shifts from "some bookings created" to "zero on any failure" |
| Order impact | None |
| Stock impact | **YES** — all-or-nothing preserves consistency |
| UI impact | Manual Create dialog: paste N codes, single submit button |
| Boss explicit `IMPLEMENT 1.5-D-1 NOW` required? | **YES** — independent of B/C series |

### Q5 PR sequence

1. `1.5-D-1-impl` — `bookingRepository.createManualBatch(input)` new fn + route + UI (R1)
2. `1.5-D-1-tests` — unit + integration + Playwright (R2)

### Q5 rollback plan

Revert PR. Existing single-code create path unaffected (new fn added alongside, doesn't replace).

### Q5 smoke plan

- Manual Create dialog → paste 5 valid codes → verify 5 bookings created
- Paste 5 codes where 1 has insufficient stock → verify 0 bookings created (all-or-nothing)
- Paste 21 codes → verify 400 cap-exceeded error

### Q5 tests

- 1 valid code → 1 booking (parity with existing single-code path)
- 5 valid codes → 5 bookings in same tx
- 5 codes with 1 invalid → 0 bookings (all-or-nothing rollback)
- 21 codes → 400 cap rejection
- Idempotency: same batch replay returns existing bookings

---

## 6. Q6 — Outbound confirmation (FINAL)

| Field | Value |
|---|---|
| Decision | **Disabled. Preview/manual-send only later.** |
| Boss explicit `IMPLEMENT NOW` required? | **N/A — runtime explicitly held** |

No PR scope in Phase 1.5. Boss may later authorize "preview the message admin would send" UI without actual outbound. Outbound runtime remains globally hard-no-go per receive-only architecture.

No migration. No schema. No runtime change.

---

## 7. Q7 — Stock reservation semantics (FINAL)

| Field | Value |
|---|---|
| Decision | **Remain current until explicit stock model change.** |
| Boss explicit `IMPLEMENT NOW` required? | **N/A — no change in scope** |

Auto-confirm path uses existing reservation create-on-confirm semantics. Auto-order append reuses existing reservation. Multi-code batch creates one reservation per booking inside the all-or-nothing tx.

No migration. No schema. No runtime change to stock model.

---

## 8. Q8 — Migration policy (FINAL)

| Field | Value |
|---|---|
| Decision | **Split and reversible per migration.** No multi-table migration without explicit Boss verdict per migration. |
| Recap | Q1 (1 migration), Q4 schema (1 migration), Q4 backfill (1 separate PR). All R1, all reversible. None R0. |

Migration rules:
- Every migration ships in its own PR with DISSENT 4-bullet
- Boss-runs backfill SQL separately after schema migration verified on Vercel
- Rollback SQL documented in PR body
- No production data deletion (`DROP TABLE`, `DELETE` without WHERE) — R0 hard stop

---

## 9. Full PR sequence (Boss accepts all 7 defaults)

```
Phase 1.5-B (auto-confirm, requires Q1+Q2 verdict + Boss IMPLEMENT NOW)
├── 1.5-B-1-schema      R1 + DISSENT — Customer.autoConfirmEligible @default(false)
├── 1.5-B-1-repo        R2 — customerRepository surfaces new field
├── 1.5-B-1-ui          R1 — edit-customer toggle + PATCH route
├── ─── Boss Vercel migrate verified + UI smoke ───
├── 1.5-B-2-repo        R1 — bookingRepository.confirm branches on flag
├── 1.5-B-2-route       R1 — POST /api/sale/bookings returns autoConfirmed meta
├── 1.5-B-2-ui          R1 — Confirm dialog auto-confirm preview pill
├── 1.5-B-2-tests       R2 — unit + integration + Playwright
└── ─── ≥1 week prod-stable + zero false positives ───

Phase 1.5-D (multi-code, requires Q5 verdict + Boss IMPLEMENT NOW, independent of B/C)
├── 1.5-D-1-impl        R1 + DISSENT — multi-code batch + cap 20 + all-or-nothing
└── 1.5-D-1-tests       R2

Phase 1.5-C (auto-order append, requires Q4 verdict + B-series stable)
├── 1.5-C-1-schema      R1 + DISSENT — Order.saleDate + index
├── 1.5-C-1-backfill    R1 — separate Boss-run SQL backfill PR
├── ─── Boss verifies zero NULL saleDate on production Orders ───
├── 1.5-C-2-repo        R1 — orderRepository.upsertFromBooking
├── 1.5-C-3-route       R1 — POST /api/sale/orders/from-bookings wire upsert
├── 1.5-C-3-ui          R1 — Order detail "appended" badge
└── 1.5-C-3-tests       R2

Phase 1.5 outbound + stock model
└── HELD — no PR in Phase 1.5 scope
```

Total: 13 PRs (3 R1 schemas + 1 R1 backfill + 6 R1 runtime/UI + 3 R2 repo/test).

---

## 10. Verdict quick-pick (Boss can confirm or modify defaults)

```
Phase 1.5 verdict — Final 2026-05-24

Q1 customer trust shape:           [BOOL false default / BOOL true default / OTHER] = ___
Q2 auto-confirm policy:            [trust-gated / always / never] = ___
Q3 new-customer default:           [folded into Q1] = ___
Q4 auto-order append:              [shopId+customerId+saleDate; NOT PAID/CANCELLED / other] = ___
Q5 multi-code Manual Create:       [tx multi-row, cap 20, no migration / cap N / other] = ___
Q6 outbound:                       [DISABLED preview-only / other] = ___
Q7 stock reservation:              [UNCHANGED / other] = ___
Q8 migration policy:               [split + reversible per migration / other] = ___

Recommendation taken:              [yes all / partial / custom] = ___
Open implementation PR sequence:   [unblocked / hold] = ___
First PR to open:                  [1.5-B-1-schema / hold] = ___
```

---

## 11. Hard gates (NONE cleared without Boss explicit IMPLEMENT NOW)

- ❌ NO Phase 1.5 runtime PR opened without Boss explicit `IMPLEMENT 1.5-X-Y NOW` verdict per PR
- ❌ NO migration generated, even on local branch, without verdict
- ❌ NO `prisma migrate dev` / `prisma migrate deploy` invocation
- ❌ NO Customer / Order / Booking row mutation in production
- ❌ NO outbound messaging (Q6 hard-held)
- ❌ NO Facebook runtime
- ❌ NO parser auto-booking (Tier 4.7+)
- ❌ NO env / flag flip by Claude
- ❌ NO Boss-owned untracked note touched
- ❌ pak-ta-kra untouched

---

## 12. Cross-references

- `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` (full Q&A original)
- `docs/superpowers/2026-05-24-phase-1-5-implementation-checklist.md` (tactical)
- `docs/superpowers/2026-05-24-phase-1-5-decision-summary.md` (60-sec)
- PR #54 — Phase 1.5 parent design
- PR #81 — refinement packet
- PR #90 — decision matrix
- `prisma/schema.prisma` — Customer (line 239) / Order (line 292) / Booking (line 947) / StockReservation (line 219)
- Boss Phase 3 authorization 2026-05-24 — 7 recommended defaults source

---

## 13. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero schema change
- Zero env change
- Zero migration generated
- Reflects Boss Phase 3 explicit 7 recommended defaults
- Q1 default value SWITCHED from `true` → `false` per Boss Phase 3 §1
- 13-PR sequence laid out (3 schemas + 1 backfill + 6 R1 + 3 R2)
- Awaiting Boss explicit `IMPLEMENT 1.5-X-Y NOW` per PR before any runtime opens
- pak-ta-kra untouched
