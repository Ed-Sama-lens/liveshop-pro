# Sale Summary Range — Open Questions Q&A

**Filed:** 2026-05-24 (autonomous docs block Track B)
**Author:** Claude Sonnet 4.6
**Status:** Q&A for PR #86 §10. NO runtime change. NO new implementation. Recommended defaults proposed for Boss + ChatGPT verdict.

Companion to:
- `docs/superpowers/2026-05-23-sale-summary-range-ui-export-plan.md` (PR #86 §10 — source of 6 open questions)
- `docs/superpowers/2026-05-23-sale-summary-date-range-plan.md` (range API design)
- `docs/superpowers/2026-05-24-sale-summary-range-contract.md` (range endpoint contract)
- `docs/superpowers/2026-05-24-admin-api-index.md` (status: 3.9-G7 + 3.9-G8 held)
- `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` (range UI deferred)

This doc does NOT implement anything. It surfaces each Q with recommended default + risk + sequencing. Boss verdict on §10 unlocks PR `3.9-G7-A` (route shell + picker).

---

## 0. Should range UI ship before Boss UI smoke completes?

**Recommendation: WAIT.**

Reasons:
1. Workbook v5 Sections A–L still owed (12 sections of existing surface). Adding a new `/sale/summary` route while Boss has not validated current `/sale` workspace = compounds smoke debt.
2. Range UI is enhancement, not blocker. Boss can already see single-day summary in compact panel (PR #85).
3. PR sequencing inside 3.9-G7-* + 3.9-G8-* is 7 PRs → adds 7 review cycles for Boss while existing 12 smoke sections still pending.
4. If Boss explicit `EXECUTE RANGE UI NOW` despite smoke debt → proceed per §1–§6 verdicts.

Recommended trigger: after workbook v5 Sections A–L all PASS, then open `3.9-G7-A`.

---

## 1. Q1 — Sidebar entry placement

**Question:** "สรุปการขาย" under Live Selling? Or new top-level item?

| Option | Pros | Cons |
|---|---|---|
| A — Under Live Selling sub-menu | Groups with other sale tools; less top-level clutter | Buried 2 clicks deep; admin uses summary daily |
| B — New top-level item | 1 click; visibility for daily KPI use | Adds top-level item; Live Selling section less coherent |
| C — Under Reports (if a Reports section exists/created) | Conceptually correct grouping | Reports section doesn't exist yet; deferring decision |

**Recommended default:** **Option A — under Live Selling sub-menu, label "สรุปการขาย"**.

**Why:** Lowest blast radius. Existing sidebar IA unchanged. Click depth = 2 acceptable for KPI screen accessed 1–2× daily, not 10×. Easy to promote to top-level later if Boss workflow demands it (R2 IA tweak).

**Risk:** R2 — sidebar entry add only. No new auth surface, no new route besides `/sale/summary`.

---

## 2. Q2 — Default range on first visit

**Question:** today / last 7 days / current month?

| Option | Pros | Cons |
|---|---|---|
| today | Cheapest query; matches compact panel; familiar | Range view defaulting to single day defeats the purpose |
| last 7 days | Matches Boss "how was this week" workflow | Pulls 7 days on every first paint; slightly slower |
| current month | Best for monthly review | 30-day query on first paint; slow on large shops |

**Recommended default:** **last 7 days**.

**Why:** Range view's purpose IS multi-day. Defaulting to "today" wastes the route. 7 days is the natural admin glance ("how was this week"). 30 days is too much for first paint. Per Boss "ขายไลฟ์ทุกวันไหม" workflow — 7 days covers typical operational window.

**Risk:** R1 — default range affects DB query weight. Existing range API already supports 7 days (cap 31 per design). No new infra.

---

## 3. Q3 — Per-customer CSV name visibility

**Question:** include customer name for MANAGER or restrict to OWNER only?

| Option | Pros | Cons |
|---|---|---|
| OWNER only | Tightest PII guard | MANAGER can't reconcile customer-side disputes without name |
| OWNER + MANAGER | Operational reality (MANAGER handles customer ops) | Wider PII export surface |
| Phone / email always hashed regardless of role | Cleanest PII story | Removes operational utility |

**Recommended default:** **OWNER + MANAGER, name only; phone/email masked unless OWNER**.

**Why:** MANAGER role exists specifically to handle customer operations — denying name forces them back to manual lookups. Phone/email are higher-PII so stay OWNER-only. Per existing `customers/search` PII-safe typeahead pattern → name is acceptable for MANAGER, contact details are not.

**Risk:** R1 — RBAC + PII export. Per `security-and-hardening` skill applies. Existing `customer.search` PII gating already differentiates name vs phone/email — reuse same policy. DISSENT 4-bullet required on PR `3.9-G8-C`.

---

## 4. Q4 — Range presets

**Question:** 7d / 30d / custom only — or include "this week" / "this month"?

| Option | Pros | Cons |
|---|---|---|
| 7d / 30d / custom | Simplest; predictable | "this week" = different in TH timezone vs ISO week — admin confusion |
| Add "this week" / "this month" | Matches mental model | Adds timezone semantics; week-start ambiguity (Mon vs Sun) |
| Custom only (no presets) | No semantic disagreement | Admin must always type dates |

**Recommended default:** **7d / 30d / custom, NO "this week" / "this month"**.

**Why:** Calendar-week semantics are timezone + locale dependent. TH admin expects Mon-start; international/JS Date defaults Sun-start; some tools use ISO 8601 Mon-start. Adding "this week" preset creates a recurring "wait, what does this mean" problem. 7d / 30d are unambiguous rolling windows. Custom always available for special ranges.

**Risk:** R2 — preset chips are pure UI.

**Future expand:** if Boss later wants "this month" specifically, add as separate UI affordance with explicit start-of-month label visible. Not in MVP.

---

## 5. Q5 — Daily table default state

**Question:** collapsed (recommended for ranges >7 days) or expanded?

| Option | Pros | Cons |
|---|---|---|
| Always expanded | Boss sees everything immediately | 30-day range = scroll wall |
| Always collapsed | Clean overview; expand on demand | Extra click for short ranges |
| Conditional: expanded if ≤7 days, collapsed if >7 days | Best of both | Slight extra logic |

**Recommended default:** **Conditional — expanded when daysShown ≤ 7, collapsed when daysShown > 7**.

**Why:** Single rule covers both common cases. 7d default range = expanded by default (matches Q2). 30d = collapsed by default. Boss can toggle either way. Implementation = single boolean derived from response.

**Risk:** R2 — UI state default only. No data fetch change.

---

## 6. Q6 — CSV file size cap

**Question:** hard at 31-day max range, or stream truncate at 10MB?

| Option | Pros | Cons |
|---|---|---|
| Hard 31-day max range | Predictable bound; matches existing range API cap | Admin who wants 60 days must split into 2 exports |
| Stream truncate at 10MB | Open-ended ranges; bounded by output size | Truncated CSV is sneaky (Excel opens it as if complete); admin may not notice |
| Hard 31-day + warn at 25MB if shape is huge | Belt + suspenders | Compound logic |

**Recommended default:** **Hard 31-day max range; reject (400) `range_too_long` if requested > 31 days**.

**Why:** Range API already caps at 31 days per existing design (`docs/superpowers/2026-05-23-sale-summary-date-range-plan.md` + range contract). CSV export inherits the same bound — no need to invent a second cap. Truncated CSV is dangerous because admin doesn't see the truncation in Excel — they'd assume complete data and report wrong numbers. Hard reject = safer + simpler.

Admin who needs 60 days runs export twice and concatenates. Acceptable for monthly-level review.

**Risk:** R1 — export endpoint returns 400 vs 200 on > 31 days. Document in CSV PR header. Add unit test for boundary.

---

## 7. Verdict quick-pick (Boss/ChatGPT paste verbatim)

```
Sale summary range — verdicts 2026-05-24

Q0 ship range UI before workbook v5 smoke complete?:
    [WAIT / EXECUTE NOW] = ___

Q1 sidebar entry:
    [A under Live Selling / B top-level / C Reports section] = ___

Q2 default range on first visit:
    [today / 7 days / 30 days] = ___

Q3 per-customer CSV name visibility:
    [OWNER only / OWNER+MANAGER name / always hashed] = ___

Q4 range presets:
    [7d/30d/custom only / add this week+this month / custom only] = ___

Q5 daily table default:
    [always expanded / always collapsed / conditional ≤7d expanded] = ___

Q6 CSV size cap:
    [hard 31-day / stream truncate 10MB / hard 31-day + 25MB warn] = ___

Recommendation taken:           [yes all / partial / custom] = ___
Open 3.9-G7-A route shell PR:   [unblocked / hold] = ___
```

---

## 8. PR sequence if Boss approves all defaults

```
3.9-G7-A — route shell + picker (R1)
  ├─ add Live Selling > สรุปการขาย sidebar entry
  ├─ /sale/summary page client component
  ├─ default range = last 7 days
  ├─ range presets 7d / 30d / custom (no "this week")
  ├─ DISSENT 4-bullet (route + sidebar = >3 files likely)
  └─ Boss UI verify before next PR

3.9-G7-D — range header (R1)
  ├─ totals row using existing /api/sale/summary range mode
  └─ Boss UI verify

3.9-G7-C — per-code table (R1, primary use case)
  ├─ table with codes × days matrix
  ├─ daily-table default = conditional ≤7d expanded
  └─ Boss UI verify

3.9-G7-B — daily totals table (R1)
  └─ supplements per-code

3.9-G8-A — daily CSV (R1)
  ├─ hard 31-day cap
  └─ Boss verify

3.9-G8-B — per-code CSV (R1)
  └─ Boss verify

3.9-G8-C — per-customer CSV (R1, PII-gated)
  ├─ OWNER+MANAGER name; phone/email OWNER only
  ├─ DISSENT 4-bullet mandatory (PII surface)
  └─ Boss verify + ChatGPT security pass
```

7 PRs total. Each ≤ 300 LOC ideally. Each Boss-verified before next opens.

---

## 9. Hard gates (apply to all 3.9-G7-* + 3.9-G8-*)

- ❌ NO range UI PR opened until Boss verdict on Q0–Q6 + workbook v5 A–L complete
- ❌ NO new auth surface beyond existing `requireAuth + role check`
- ❌ NO new PII field exposed beyond Q3 verdict
- ❌ NO range > 31 days accepted by any endpoint (matches existing API cap)
- ❌ NO unbounded query — every page paint hits range API with explicit `from + to`
- ❌ NO stream truncation of CSV (reject, don't truncate)
- ❌ NO pak-ta-kra touch
- ❌ NO Boss-owned untracked note touch
- ❌ NO env / secret change
- ❌ NO schema migration

---

## 10. Cross-references

- `docs/superpowers/2026-05-23-sale-summary-range-ui-export-plan.md` (PR #86 §10 source)
- `docs/superpowers/2026-05-23-sale-summary-date-range-plan.md` (range API design + 31-day cap)
- `docs/superpowers/2026-05-24-sale-summary-range-contract.md` (range contract + status)
- `docs/superpowers/2026-05-24-admin-api-index.md` (G7 + G8 held status)
- `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` (range UI deferred, workbook v5 owed)
- `src/server/repositories/sale-summary.repository.ts` (range repository)
- `src/app/api/sale/summary/route.ts` (range API route, single-day + range mode)
- PR #70 — single-day endpoint
- PR #71 — date-range design + sequence
- PR #77 — range query API
- PR #85 — compact panel single-day UI

---

## 11. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero new tests
- Zero schema / env change
- 6 questions + 1 timing question answered with recommended defaults
- 7-PR implementation sequence laid out
- Awaiting Boss + ChatGPT verdict on Q0–Q6
- After verdict + workbook v5 complete, Claude opens `3.9-G7-A` (R1 + DISSENT 4-bullet)
- pak-ta-kra untouched
