# Session Handoff: Resume After Overnight Tier 3.9 Follow-up

**Filed:** 2026-05-22 (post overnight run)
**Author:** Claude Sonnet 4.6 (Cline-style session)
**Session state:** OVERNIGHT_COMPLETE_8_PRS_OPEN
**Master HEAD baseline:** `bef98aa`
**Production:** https://nazhahatyai.com (stable, smoke 16/16 against `1beb99f`)
**Next Claude session goal:** Wait for Boss + ChatGPT review of overnight report. Then proceed per Boss verdict.

---

## 0. SESSION BOOTSTRAP — READ FIRST

```
pwd                    # → must be C:/Users/Asus/COWORK/code/liveshop-pro
git remote -v          # → liveshop-pro repo
git branch --show-current
git log --oneline -5
gh pr list --state open --json number,title,headRefName --jq '.[] | "\(.number) \(.title) [\(.headRefName)]"'
```

Expected:
- pwd = `/c/Users/Asus/COWORK/code/liveshop-pro`
- Branch likely master OR a specific branch Boss chose to resume
- 8 PRs open (#51-#58)

If pwd is wrong → CLOSE session, `cd liveshop-pro`, restart. Memory namespace falls back otherwise.

**MANDATORY skill firing at session start (per global CLAUDE.md):**
1. `using-superpowers` (skill discipline)
2. `codebase-onboarding` (project context — read this doc + MEMORY.md)
3. **DO NOT touch pak-ta-kra** — sibling project, different scope, hard no-go

---

## 1. Project identity reminder

| Field | Value |
|---|---|
| Name | LiveShop Pro |
| Domain | nazhahatyai.com |
| Repo | github.com/Ed-Sama-lens/liveshop-pro |
| Deploy | Vercel auto on `master` push |
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
./node_modules/.bin/tsc --noEmit        # tsc EXIT=0
npm run lint                            # 0 errors (warnings OK)
npm run test:sale:routes                # 142/142
npm run test:sale:components            # 167+/167+
npm run test                            # full vitest
npm run smoke:prod:unauth               # 16/16 production unauth smoke
```

---

## 3. Tier 3 / Sale Core full timeline summary

### 3.1 Tier 3.7 — Inline product/variant creation in /sale (Boss original)
Skipped — bypassed by Tier 3.8 quick-create direction.

### 3.2 Tier 3.8 — Quick bulk product code creation
- PR #42 PR-A: relaxed Zod validation (price ≥ 0, name optional, empty-string transforms)
- PR #43 PR-B: `/api/sale/quick-product-codes` route + repo + UI dialog (composite Product + Variant + BroadcastProduct in $transaction; bulk start/end)
- PR #44 PR-D: backlog + handoff
- ALL MERGED.

### 3.3 Tier 3.9 — Sale Date as primary context (MAJOR pivot)
- PR #45 PR-A: Phase 0 audit (445 lines doc)
- PR #46 PR-A2: Sale Date context addendum (370 lines doc)
- PR #47 PR-B: **MIGRATION** — `Shop.timezone` + `BroadcastProduct.saleDate` + new partial unique `(shopId, saleDate, displayCode) WHERE saleDate IS NOT NULL` + backfill from createdAt/LiveSession dates. Boss ran `prisma migrate deploy` against Railway manually (B1 sequence)
- PR #48 PR-B2: post-deploy bug audit
- PR #49 Phase 1 batch: Fix-1 (reuse Product) + Fix-2 (evergreen booking + saleDate filter) + Fix-3 (stock guard) + Fix-4 (PENDING cancel) + Fix-6 (Create Order V2 dispatch)
- PR #50 Phase 1 post-smoke audit
- ALL MERGED → master `bef98aa`.

### 3.4 Vercel env flags set 2026-05-21 by Boss
- `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`
- `ALLOW_NON_LIVE_BOOKING=true`
- `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true`

These remain TRUE. Do NOT ask Boss to re-verify unless runtime behavior contradicts.

### 3.5 Overnight 2026-05-22 (this run) — 8 PRs OPEN awaiting review

| PR | Title | Type | Files |
|---|---|---|---|
| #51 | fix(sale): pass selected saleDate from stock (C4) | fix | 2 src |
| #52 | fix(sale): hide terminal bookings + Order detail (C1 + D1) | fix | 5 src |
| #53 | feat(sale): AddFromStock multi-select + defaults (3.9-C) | feat | 6 src |
| #54 | docs(sale): Phase 1.5 design auto-confirm + auto-order + multi-code | docs | 1 doc |
| #55 | test(sale): saleDate + grouping invariants (D2 lock) | test | 2 test |
| #56 | docs(sale): route security + RBAC audit | docs | 1 doc |
| #57 | docs(meta): Facebook receive-only Tier 4.1 readiness | docs | 1 doc |
| #58 | docs(sale): overnight Sale Core follow-up handoff (W10) | docs | 1 doc |

Boss is reviewing these with ChatGPT now.

---

## 4. UI smoke result that triggered W1-W10 work

Boss UI smoke 2026-05-22 (post PR #49 deploy):

| Step | Result |
|---|---|
| 1 Date picker | PASS |
| 2 Same code today/tomorrow | PASS |
| 3 Manual book quick-created | PASS (B6 reiterated — 1 code per booking) |
| 4 Bookings filter by saleDate | PASS |
| 5 OOS blocked | PASS |
| 6 PENDING cancel visible | PASS |
| 7 Cancel works | PARTIAL — C1 cancelled rows stay |
| 8 Confirm works | PASS — C2 redesign request |
| 9 Create Order V2 | PASS — C3 redesign + D2 question |

### 4.1 New issues from smoke

| ID | Severity | Title | Resolution |
|---|---|---|---|
| C1 | HIGH | Cancelled bookings clutter active list | PR #52 — hide terminal + history toggle |
| C2 | HIGH | Auto-confirm trusted customers | PR #54 design only — awaiting Boss verdict |
| C3 | HIGH | Auto-create-order + append same-day same-customer | PR #54 design only — awaiting Boss verdict |
| C4 | CRITICAL | AddFromStock doesn't send saleDate | PR #51 narrow fix + PR #53 superset (rewrite) |
| C5 | MEDIUM | AddFromStock forces displayCode retype | PR #53 — auto-default from saleCode/SKU |
| D1 | MEDIUM | Order detail missing columns | PR #52 — No./stockCode/saleCode/totals + summary |
| D2 | NEEDS VERIFY | Order item count question | PR #55 invariant tests prove BY DESIGN (grouping by productId/variantId/unitPrice) |
| B6 | HIGH | Multi-code Manual Booking | PR #54 design only |
| B8 | MEDIUM | AddFromStock shows already-added codes | PR #53 — hide by default + toggle |

---

## 5. Production state

- Master HEAD: `bef98aa` (PR #50 merged)
- Vercel: Latest deploy from `bef98aa` (last verified green)
- Database: Railway Postgres, migrated through `20260521000000_sale_date_grouping` (Tier 3.9-B)
- Smoke unauth: 16/16 vs `1beb99f` pre-overnight
- pg_dump local snapshot: `C:\Users\Asus\liveshop-pro-pre-3-9-b-snapshot.sql` (185KB, from PR #47 deploy procedure)

---

## 6. Boss decision queue

### 6.1 Awaiting verdict on (in priority order)

| ID | Question | Recommendation |
|---|---|---|
| **PR #51-#58 merge order** | Boss + ChatGPT confirm merge sequence | Option A (safest) §10.1 of PR #58 |
| **D-1.5-Approve-C2** | Auto-confirm direction + risk signal storage | YES per Boss UI smoke verbatim |
| **D-1.5-Approve-C3** | Auto-order-append + Order.saleDate migration | YES per Boss UI smoke verbatim |
| **D-1.5-Approve-B6** | Multi-code batch UI without schema change (Option B) | recommended |
| **D-1.5-Risk-Default** | New customer default: optimistic auto-confirm or conservative PENDING | recommend optimistic |
| **D-1.5-Order-Append-Status** | Which Order statuses accept append? | recommend RESERVED only |
| **D-1.5-Outbound-Gate** | Confirm outbound stays gated this phase | YES (HARD NO) |

### 6.2 Decisions already made (do not re-ask)

- Sale Date as primary grouping (PR #46 + #47)
- Asia/Kuala_Lumpur default timezone (PR #47)
- Reuse-Product pattern for cross-date stockCode (PR #49 Fix-1)
- PR #49 deploy via B1 sequence (snapshot → migrate → merge → smoke)
- Vercel env flags = TRUE (set 2026-05-21)

---

## 7. Hard no-go (NEVER violate)

- ❌ Do NOT touch pak-ta-kra (sibling project)
- ❌ Do NOT run authenticated production POST
- ❌ Do NOT mutate production data
- ❌ Do NOT create production Product/Variant/BroadcastProduct/Booking/Order
- ❌ Do NOT run Phase B
- ❌ Do NOT start outbound messaging (HARD GATE)
- ❌ Do NOT start Messenger/WhatsApp/Telegram runtime
- ❌ Do NOT change Vercel/Railway env
- ❌ Do NOT flip feature flags
- ❌ Do NOT touch checkout/payment/shipping runtime
- ❌ Do NOT expose secrets/tokens/DATABASE_URL/cookies/session/storageState
- ❌ Do NOT commit secrets, backups, screenshots, test-results, playwright-report, transient PR body files
- ✅ Keep Boss-owned `test note/` + `sale tab example/` untracked (in .gitignore)

---

## 8. Tools + skills loaded in environment

### 8.1 Anthropic plugins enabled (settings.json)
- `telegram@claude-plugins-official`
- `claude-code-setup@claude-plugins-official`
- `context7@claude-plugins-official` — Next.js 16 + Prisma 7 + next-auth docs
- `playwright@claude-plugins-official` — browser automation MCP

### 8.2 Skills available
- 9arm-skills (Tier B): debug-mantra / scrutinize / post-mortem / management-talk
- Matt Pocock skills (Tier B): diagnose / tdd / grill-me / grill-with-docs / handoff / zoom-out / improve-codebase-architecture / prototype / to-issues / to-prd / triage / write-a-skill

### 8.3 Memory
- Project memory: `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md`
- 9arm + Matt Pocock skills integration documented there
- Plugin trigger map documented there

---

## 9. Test command reference (verified working)

```bash
# Pre-commit verification
./node_modules/.bin/tsc --noEmit
npm run lint

# Targeted tests
npm run test:sale:routes              # 142 tests across 8 files
npm run test:sale:components          # 167 tests across 6 files
npx vitest run tests/unit/lib/sale/   # invariant tests
npx vitest run tests/unit/lib/validation/  # schema tests

# Full vitest
npm run test                          # 1209+ tests projected post-overnight merges

# Production smoke
npm run smoke:prod:unauth             # 16 tests, must all pass before declaring done

# Verifiers (non-prod guard required)
npm run verify:sale:d4-d6
npm run verify:sale:quick-bulk
npm run verify:booking-flow
```

---

## 10. Documents Boss + ChatGPT must reference

| Doc | Purpose |
|---|---|
| `docs/superpowers/2026-05-21-tier-3-9-phase-0-audit.md` | Original 5-issue catalog (PR #45) |
| `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` | Date-first model basis (PR #46) |
| `docs/superpowers/2026-05-21-tier-3-9-b-migration-safety-audit.md` | Migration deploy procedure (PR #47) |
| `docs/superpowers/2026-05-21-tier-3-9-b-post-deploy-bug-audit.md` | Phase 1 catalog (PR #48) |
| `docs/superpowers/2026-05-22-tier-3-9-phase-1-post-smoke-audit.md` | Phase 1 smoke result (PR #50, merged) |
| `docs/superpowers/2026-05-22-sale-auto-confirm-auto-order-design.md` | Phase 1.5 design (PR #54) |
| `docs/superpowers/2026-05-22-sale-route-security-permissions-audit.md` | Route audit (PR #56) |
| `docs/superpowers/2026-05-22-facebook-receive-only-readiness-audit.md` | Tier 4.1 prep (PR #57) |
| `docs/superpowers/2026-05-22-overnight-sale-core-followup-handoff.md` | Overnight summary (PR #58) |

---

## 11. Recommended morning action (per PR #58 §10)

**Option A — Boss has 30 min:**
1. Merge #55 + #56 + #57 (docs/tests, low-risk)
2. Merge #52 (C1 + D1)
3. `npm run smoke:prod:unauth` after Vercel auto-deploys → expect 16/16
4. UI smoke C1 + D1 per PR #58 §7.4-§7.5
5. Report back

**Option B — Boss has 1 hour:**
- Above + merge #51 + #53 → UI smoke C4 + C5 + B8 + multi-select

**Option C — Boss has 2 hours:**
- Above + verdict on PR #54 (Phase 1.5 C2/C3/B6) → authorize implementation OR defer

---

## 12. Files Boss might want to read first

Sorted by signal/noise ratio:

1. **`docs/superpowers/2026-05-22-overnight-sale-core-followup-handoff.md`** — PR #58 — overnight summary with merge order + smoke checklist
2. **`docs/superpowers/2026-05-22-sale-auto-confirm-auto-order-design.md`** — PR #54 — verdict-blocking design doc
3. **`docs/superpowers/2026-05-22-tier-3-9-phase-1-post-smoke-audit.md`** — PR #50 merged — bug catalog source-of-truth
4. **This session-handoff doc** — bootstrap for next Claude

---

## 13. Continuation behavior for next Claude session

### 13.1 If Boss + ChatGPT approve merge sequence

Continue work autonomously per PR #58 §13 next autonomous block:

- Phase 3 — PR 3.9-D `/inventory/new` shared quick-create pattern
- Phase 4 — PR 3.9-E verifier + handoff
- Tier 3.10-A — V Rich pill+board design audit

### 13.2 If Boss approves Phase 1.5 (PR #54)

Implement in this order:
1. PR 1.5-B-1 migration: `Customer.autoConfirmEligible BOOLEAN DEFAULT true`
2. PR 1.5-B-2 repo: auto-confirm path in `bookingRepository.createManual`
3. PR 1.5-B-3 UI: Manual Create dialog risk preview + override
4. PR 1.5-C-1 migration: `Order.saleDate DATE?` + index + backfill from BP.saleDate
5. PR 1.5-C-2 repo: `orderRepository.upsertFromBooking`
6. PR 1.5-C-3 wire: `bookingRepository.confirm` calls upsert
7. PR 1.5-D Multi-code Manual Booking batch ($transaction)

Each step needs dissent-4-bullet for R1 work.

### 13.3 If Boss requests Track 9 (Docker CI failure)

Read `.github/workflows/ci.yml` docker job + GitHub Actions logs. Isolate root cause. Open separate `fix(ci)` PR if safe; else docs report.

### 13.4 If Boss requests Track 13-15

Docs-only. Pattern: read existing code/schema → write `docs/superpowers/2026-MM-DD-*.md` → no runtime change.

---

## 14. Bootstrap message for next Claude session

**Paste this verbatim into the new session:**

```
Resume liveshop-pro work from this handoff:
docs/superpowers/handoffs/2026-05-22-resume-after-overnight-tier-3-9-followup.md

State summary:
- Master HEAD: bef98aa (PR #50 merged)
- 8 PRs open (#51-#58) awaiting Boss + ChatGPT review
- Overnight tracks W1-W10 complete; zero hard-no-go violations
- Production smoke green; Vercel env flags TRUE
- Phase 1.5 design (#54) awaiting verdict

DO NOT touch pak-ta-kra.

Mandatory bootstrap:
1. Read this handoff doc
2. Read project memory MEMORY.md
3. Verify pwd = liveshop-pro
4. Standby for Boss + ChatGPT verdict on PR #51-#58

If Boss explicitly authorizes continuation, follow §13 of this handoff.
```

---

## 15. Final sign-off

✅ Overnight Tier 3.9 follow-up complete. All work in PR branches awaiting Boss + ChatGPT review. Master + production unchanged. Test suite green. Smoke baseline green. Hard no-go honored across all 7 work units (W1-W10).

Boss is reviewing the overnight report with ChatGPT. Next Claude session resumes from here after Boss verdict.

**No further autonomous work until Boss confirms direction.**
