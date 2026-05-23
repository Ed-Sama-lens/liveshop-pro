# Session Handoff — Resume After Block 3 PR Hygiene

**Filed:** 2026-05-23 (end of Block 3)
**Author:** Claude Sonnet 4.6
**Session state:** `BLOCK_3_COMPLETE_3_PRS_OPEN_AWAITING_REVIEW`
**Master HEAD:** `0c7b6e0`
**Production:** https://nazhahatyai.com (smoke 17/17 green)
**Next Claude goal:** Wait for Boss + ChatGPT review of #94 / #95 / #96 + accumulated open decisions. Do NOT touch runtime until verdict.

---

## 0. SESSION BOOTSTRAP — READ FIRST

```
pwd                                                # → liveshop-pro
git remote -v                                      # → Ed-Sama-lens/liveshop-pro
git branch --show-current                          # → master (or new branch Boss picks)
git log --oneline origin/master -3                 # confirm HEAD c0c7b6e0 or newer
gh pr list --state open --json number,title --jq '.[] | "#\(.number) \(.title)"'
git status --short                                 # tree clean expected
```

Expected:
- pwd = `/c/Users/Asus/COWORK/code/liveshop-pro`
- branch = `master` or a docs/handoff branch Boss chose to resume
- 3 PRs open (#94 #95 #96)

If pwd wrong → CLOSE session, `cd liveshop-pro`, restart. Memory namespace falls back.

**MANDATORY skill firing at session start (per global CLAUDE.md):**

1. `using-superpowers` — skill discipline gate
2. `codebase-onboarding` — read this doc + MEMORY.md + AGENTS.md
3. **DO NOT touch pak-ta-kra** — sibling project, hard no-go

---

## 1. Project identity reminder

| Field | Value |
|---|---|
| Name | LiveShop Pro |
| Domain | nazhahatyai.com |
| Repo | github.com/Ed-Sama-lens/liveshop-pro |
| Deploy | Vercel (auto on `master`) |
| DB | Railway PostgreSQL |
| Storage | Cloudflare R2 (`images.nazhahatyai.com`) |
| Auth (admin) | next-auth credentials |
| Auth (customer) | Facebook Login (App ID `780277861568430`) |
| Currency | MYR (RM) — NOT THB |
| Branch model | single `master` |
| Stack | Next.js 16 + Turbopack + TS 5 strict + Prisma 7 + Postgres + Tailwind + shadcn + Vitest + Playwright |

**This is NOT pak-ta-kra.** Global `~/.claude/CLAUDE.md` is pak-ta-kra-biased; project `liveshop-pro/CLAUDE.md` overrides.

---

## 2. Engineering rules (Boss-enforced)

Every task. Violation = work rejected.

1. **NO MAGIC** — verify before assert. Code unverified → prefix `ASSUMPTION:` or Read/Grep first.
2. **VERIFY BEFORE DONE** — evidence before claims. Banned: "should work", "this is correct", "fixed".
3. **DISSENT 4-bullet** — BEFORE first edit on MAJOR/R1 (schema / auth / API contract / payment / R2 / CSP / >3 files / >200 LOC / currency).
4. **SCOPE DRIFT GUARD** — STOP + ASK if scope expands silently.
5. **R0/R1/R2 REVERSIBILITY** — R0 = irreversible (ASK), R1 = costly (DO + explain), R2 = cheap (JUST DO).

Verification commands:
```bash
./node_modules/.bin/tsc --noEmit                  # tsc EXIT=0
npm run lint                                       # 0 errors (warnings OK at 57 baseline)
npm run test                                       # full vitest (last full run = 1239/1239)
npm run smoke:prod:unauth                          # 17/17 production unauth smoke
```

---

## 3. State summary at handoff

### 3.1 Master HEAD `0c7b6e0`

Recent commits (latest first):
```
0c7b6e0 feat(sale): compact summary panel above sale workspace (Tier 3.9-G6) (#85)
2dce761 feat(sale): V Rich board component skeleton (Tier 3.10-B/C foundation) (#88)
a8bbb26 docs(handoff): Block 2 T0-T10 final report (#93)
28163ff docs(sale): admin smoke workbook v3 (Block 2 close) (#92)
60d9788 test(meta): webhook parser + fixtures (Tier 4.1-prep) (#91)
2110808 docs(sale): Phase 1.5 decision matrix quick reference (#90)
3b0486c docs(sale): summary + V Rich board integration plan (#89)
7e5a0a2 docs(inventory): D2 bulk range implementation plan (#87)
96409e4 docs(sale): summary range UI + export plan (#86)
d870931 docs(handoff): T0-T9 autonomous continuation final report (#84)
```

### 3.2 Production state

- Vercel deployed `0c7b6e0`
- `npm run smoke:prod:unauth` = **17/17 PASS** (final verified end of Block 3)
- Compact summary panel ("สรุปวันนี้") live above `/sale` workspace
- V Rich board components shipped to `src/components/sale/board/` — **NOT wired** to production layout (future feature flag)
- Inventory `/inventory/new` defaults to Quick Create (PR #60 merged earlier blocks)
- Sale Summary API live: `/api/sale/summary?saleDate=...` (single) + `?from=&to=` (range)
- Vercel env flags TRUE (Tier 3.9): `ALLOW_EVERGREEN_BROADCAST_PRODUCT`, `ALLOW_NON_LIVE_BOOKING`, `ALLOW_BOOKINGIDS_ONLY_CONVERSION`

### 3.3 Open PRs (3) — awaiting Boss + ChatGPT review

| PR | Title | Risk | Type | Created in |
|---|---|---|---|---|
| #94 | docs(codemap): add 14-sale-flow.md for saleDate workflow | R2 | docs | Block 3 Track A |
| #95 | docs(sale): audit stock + booking state machine | R2 | docs | Block 3 Track B |
| #96 | docs(sale): admin API reference for /api/sale/* routes | R2 | docs | Block 3 Track E |

All 3 docs-only. Batch-merge candidates after verdict.

### 3.4 What Boss must verdict (accumulated across blocks)

| Decision | Source | Effect |
|---|---|---|
| UI smoke per PR #92 workbook v3 (sections A-K) | smoke workbook | Verify current production state visually |
| PR #94 / #95 / #96 merge | this block | Low-risk docs batch-mergeable |
| PR #90 §1 — 7 Phase 1.5 decisions | Phase 1.5 packet | Unlocks 1.5-B-1 / B-2 / B-3 / C-1 / C-2 / C-3 / D-1 implementation PRs |
| PR #87 §2 Q1 — inventory bulk backend option | bulk plan | Unlocks 3.9-D2-A route |
| PR #95 §6 — 6 state-machine ambiguities | state machine audit | Sharpens Phase 1.5 + future fulfillment |
| PR #86 §10 — range UI 6 open Qs | range UI plan | Unlocks 3.9-G7-A `/sale/summary` route |
| Future Vercel env: `META_APP_SECRET` + `META_WEBHOOK_VERIFY_TOKEN` | PR #74 + #82 | Tier 4.1-C |
| Future Meta App Dashboard work | PR #74 §1 | Tier 4.1 go-live |

Nothing irreversible. No credentials. No production POST.

---

## 4. UI smoke status

**Pending.** Boss has NOT run authenticated UI smoke yet despite multiple blocks shipping runtime changes. PR #92 workbook v3 is the single-pass canvas:

- Section A — `/sale` date picker
- Section B — Quick Create code
- Section C — AddFromStock multi-select
- Section D — Same/diff date conflict
- Section E — Terminal bookings + history
- Section F — Order detail columns + totals
- Section G — `/inventory/new` Quick form (PR #60)
- Section H — Bulk inventory (NOT applicable; PR #87 plan only)
- Section I — Sale Summary single-day (PR #70)
- Section J — Sale Summary range (PR #77)
- **Section K — Compact summary panel (PR #85)** — needs visual verification

Boss runs at own pace. No Claude action required tonight.

---

## 5. Hard no-go (NEVER violate)

- ❌ Do NOT touch pak-ta-kra (sibling project)
- ❌ Do NOT run authenticated production POST
- ❌ Do NOT mutate production data
- ❌ Do NOT create production Product/Variant/BroadcastProduct/Booking/Order
- ❌ Do NOT change Vercel/Railway env
- ❌ Do NOT flip feature flags
- ❌ Do NOT touch checkout/payment/shipping runtime
- ❌ Do NOT start outbound messaging
- ❌ Do NOT start Facebook/Messenger/WhatsApp/Telegram runtime
- ❌ Do NOT implement Phase 1.5 auto-confirm/auto-order runtime
- ❌ Do NOT touch Meta App Dashboard
- ❌ Do NOT subscribe webhooks
- ❌ Do NOT request Meta secrets / Page tokens
- ❌ Do NOT expose customer phone/email/address in any sale response
- ❌ Do NOT commit secrets, backups, screenshots, storageState, test-results, playwright-report, transient files
- ✅ Keep Boss-owned `test note/` + `sale tab example/` untracked (`.gitignore`)

---

## 6. Stop conditions

Any of these triggers Stop + Report:

- schema migration required
- production migration required
- production mutation required
- authenticated production action required
- env/secret/token required
- unclear stock/reservation/order semantics
- payment/shipping behavior change
- outbound messaging
- Facebook/Meta runtime or App Review action required
- PR grows beyond scope / needs split

---

## 7. Continuation behavior for next Claude session

### 7.1 DEFAULT BEHAVIOR ON RESUME

**WAIT for ChatGPT / Boss review report before any new work.**

Until Boss/ChatGPT explicitly says "continue", do NOT:
- open new PRs
- start new tracks
- merge open PRs
- write new docs
- modify code

Acceptable while waiting:
- read codebase to refresh context (Read/Grep only, no edits)
- re-run baseline verification (tsc / lint / smoke) ONLY if Boss requests
- answer Boss questions about state

### 7.2 IF BOSS RETURNS WITH VERDICTS

Possible verdict pathways and Claude actions:

**Path A — Boss approves batch-merge of #94 #95 #96:**
1. Confirm each PR CLEAN MERGEABLE + CI green
2. `gh pr merge <N> --squash --delete-branch` in order
3. `npm run smoke:prod:unauth` after all merged
4. Report new master HEAD + 17/17 expected
5. Wait for next directive

**Path B — Boss approves Phase 1.5 (#90 §1 verdicts):**
- Open `dissent-4-bullet` per implementation PR
- Open PR 1.5-B-1 migration first (schema R1 — needs Boss to verify migration on Railway after deploy)
- HARD GATE: do NOT proceed past 1.5-B-1 until Boss confirms migration applied successfully
- Hold all C-series until B-series stable in production ≥1 week

**Path C — Boss approves inventory bulk (#87 §2 Q1):**
- Open PR 3.9-D2-A (new route + repo + schema) first
- Then 3.9-D2-B (UI), 3.9-D2-C (tests), 3.9-D2-D (docs)
- Each ≤400 LOC

**Path D — Boss approves range UI (#86 §10 verdicts):**
- Open PR 3.9-G7-A `/sale/summary` route skeleton + range picker
- Sequence per PR #86 §3 (G7-A through G8-C)

**Path E — Boss reports UI smoke failure:**
- Classify section + failure pattern
- Open focused hotfix PR (smallest possible diff)
- HARD GATE: do not touch Phase 1.5 / FB runtime regardless

**Path F — Boss reports UI smoke PASS:**
- Update MEMORY.md with confirmation
- Continue with next track per accumulated verdicts above

### 7.3 IF BOSS REQUESTS ANOTHER AUTONOMOUS BLOCK

Refer to recommended next block from end of Block 3 final report:

1. Batch-merge #94 #95 #96 (R2 docs) once Boss verdicts
2. Schema migration safety audit for Phase 1.5 (Q1 + Q4 + Q6 unblock implementation)
3. Codemap doc 11/12 fill (currently reserved gaps in numbering)
4. MEMORY.md refresh with Block 3 close + #94-#96 doc indices
5. Tier 3.9-G8 CSV export plan refinement
6. Tier 4.1 webhook signature verification helper (only if `META_APP_SECRET` confirmed in Vercel)

---

## 8. Files Boss might want to read first

Sorted by signal:

1. **This handoff doc** — bootstrap
2. `docs/superpowers/2026-05-23-autonomous-block-2-final-handoff.md` (PR #93 merged) — block 2 close
3. `docs/CODEMAP/14-sale-flow.md` (PR #94 open) — current sale workflow map
4. `docs/superpowers/2026-05-23-stock-booking-state-machine-audit.md` (PR #95 open) — state machine + 6 open Qs
5. `docs/superpowers/2026-05-23-sale-api-reference.md` (PR #96 open) — all sale routes one page
6. `docs/superpowers/2026-05-23-phase-1-5-decision-matrix.md` (merged) — 7 Phase 1.5 decisions
7. `docs/superpowers/2026-05-23-admin-smoke-workbook-v3.md` (merged) — UI smoke checklist

---

## 9. Test command reference (verified working)

```bash
# Pre-commit verification
./node_modules/.bin/tsc --noEmit
npm run lint

# Targeted tests (examples)
npx vitest run tests/unit/lib/sale tests/unit/components/sale tests/unit/app/api/sale
npx vitest run tests/unit/components/inventory
npx vitest run tests/unit/lib/meta

# Full vitest
npm run test                          # last full = 1239/1239 PASS (post #69 testTimeout fix)

# Production smoke
npm run smoke:prod:unauth             # 17 tests, vs master 0c7b6e0
```

---

## 10. Project memory file

Update at session end:
`~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md`

Link this handoff doc + master HEAD + open PR status.

---

## 11. Bootstrap message for next Claude session

**Paste this verbatim into the new session:**

```
Resume liveshop-pro work from this handoff:
docs/superpowers/handoffs/2026-05-23-resume-after-block-3-pr-hygiene.md

State summary:
- Master HEAD: 0c7b6e0 (PR #85 compact summary panel merged)
- 3 PRs open: #94 (codemap) #95 (state machine audit) #96 (API reference) — all R2 docs
- Production smoke 17/17 green
- pak-ta-kra untouched
- Boss UI smoke STILL PENDING per PR #92 workbook v3

Mandatory bootstrap:
1. cd C:\Users\Asus\COWORK\code\liveshop-pro
2. Read handoff doc above (11 sections)
3. Read project memory MEMORY.md
4. Read CLAUDE.md + AGENTS.md
5. Verify pwd + git branch + gh pr list
6. Invoke skill: using-superpowers
7. Invoke skill: codebase-onboarding

DEFAULT: WAIT for Boss/ChatGPT review verdict before any new work.

Do NOT:
- open new PRs autonomously
- merge open PRs without verdict
- start new tracks
- touch pak-ta-kra
- run authenticated production POST
- mutate production
- change env/flags
- start outbound messaging
- start Facebook runtime
- implement Phase 1.5 runtime

If Boss authorizes continuation, follow §7 of handoff doc for path A/B/C/D/E/F.

Stand by for Boss + ChatGPT verdict.
```

---

## 12. Final state snapshot

```
master HEAD:    0c7b6e0
open PRs:       3 (#94 #95 #96)
tsc:            EXIT=0
lint:           0 errors / 57 warnings
smoke:          17/17 PASS (post #85 merge)
docker CI:      green
full vitest:    1239+/1239+ (post #69 testTimeout fix)
production:     https://nazhahatyai.com (verified)
schema:         unchanged this session
env:            unchanged this session
pak-ta-kra:     untouched
```

✅ Block 3 complete. Master + production unchanged behavior beyond #85 + #88 merges. Test suite green. Smoke green. Hard no-go honored.

Next Claude session waits for Boss verdict.
