# Skills Routing + Context Management System — liveshop-pro

**Filed:** 2026-06-11 · **Status:** OPERATIONAL — canonical skill routing + session-continuity protocol
**Audited:** 271 skills on disk + 4 enabled plugins (verified via `ls ~/.claude/skills` + settings.json)

---

## §1 Skill routing for liveshop-pro (what actually fires here)

### Tier A — auto-fire (bound to triggers, already wired via CLAUDE.md/ROADMAP)

| Trigger | Skill | Note |
|---|---|---|
| Session start / after compaction | `using-superpowers` | global rule |
| Major deliverable done → before merge | **`scrutinize`** | MANDATORY (operating contract) — sole-reviewer era |
| Any bug | `debug-mantra` (recite once) + `systematic-debugging` | T2+ add `diagnose`; cross-route add `trace` |
| MAJOR/R1 change BEFORE first edit | `dissent-4-bullet` | docs/tests-only exempt (CLAUDE.md) |
| Before claiming done / commit | `verification-before-completion` + `git-workflow-and-versioning` | evidence always |
| Any code edit | `karpathy-guidelines` (silent) + `coding-standards` | |
| New API route / contract | `api-and-interface-design` | |
| Auth / payment / upload / FB | `security-and-hardening` | |
| Prisma schema | `database-migrations` + `dissent-4-bullet` | R1 gate |
| UI build | `frontend-ui-engineering` + `ui-styling` | + ux-design-plan §2 checklist |
| Next/Prisma/next-auth behavior question | `documentation-lookup` + context7 MCP | repo Next ≠ training data |
| PR creation | `boss-style-pr` (post-Codex: reviewer = scrutinize) | small R2 = short body OK |
| Context ≥70% or Boss says "handoff" | **`liveshop-handoff`** (NEW — §3) | |

### Tier B — situational (invoke by name when the situation matches)

`tdd` (Matt — behavior changes) · `grill-with-docs` (stress-test plan before R1) · `prototype` (UI variants) · `improve-codebase-architecture` (refactor audit) · `click-path-audit` (UI state bug) · `post-mortem` + `management-talk` (after validated fix) · `triage` / `to-issues` / `to-prd` (backlog shaping) · `deep-research` (external research) · `webapp-testing` / `playwright-cli` (browser probes) · `ai-slop-cleaner` (bulk-code cleanup) · `simplify` / `code-review` (built-ins, quick passes) · `performance-optimization` (perf phase) · `shipping-and-launch` (Phase 15) · `security-review` (Phase 13)

**Gap-fix additions (coverage audit 2026-06-11):**
- `postgres-patterns` — Phase 5/8: transactions, locking, race-condition handling on booking/stock mutations
- `mcp-server-patterns` — Phase 10D stage C3: building the liveshop MCP server
- `claude-api` — Phase 10D: server-side suggestion generators calling the Claude API (models/streaming/caching) — also fires per its own TRIGGER on any Claude-API work
- `prompt-optimizer` — Phase 10D: tuning generator prompts from the feedback loop
- `nextjs-turbopack` — Phase 16 M1: Serwist + Turbopack PWA build specifics
- `canary-watch` — Phase 15: post-deploy monitoring during controlled rollout
- `ai-regression-testing` — Phase 10D: regression strategy where the same model writes + reviews

### §1.5 Phase-coverage matrix (proof of completeness — audited 2026-06-11)

| Phase | Primary skills (Tier A implied everywhere) | Crew agents |
|---|---|---|
| 1 merge #154 | git-workflow · verification | — |
| 2 WIRE-4 tests | tdd · webapp-testing · playwright-cli | ls-test-writer, ls-reviewer |
| 3 V Rich stabilize | frontend-ui-engineering · ui-styling · prototype | ls-implementer, ls-ux-auditor |
| 4 workbook triage | debug-mantra · systematic-debugging · click-path-audit | ls-scout |
| 5 fill/cancel | grill-with-docs (spec) · api-and-interface-design · **postgres-patterns** · tdd | Opus implements (money zone) + ls-test-writer |
| 6 product polish | coding-standards · simplify | ls-implementer, ls-scout |
| 7 summary/dashboard | api-design · performance-optimization | ls-implementer |
| 8 Phase 1.5 automation | database-migrations · dissent · **postgres-patterns** · security-and-hardening | Opus (money) + adversarial verify pair |
| 9 FB receive-only | security-and-hardening · documentation-lookup/context7 · api-and-interface-design | ls-security-auditor |
| 10A–C inbox | backend-patterns · frontend-ui-engineering · database-migrations | ls-implementer, ls-test-writer, ls-reviewer |
| 10D AI assist | **claude-api** · **prompt-optimizer** · **ai-regression-testing** · **mcp-server-patterns** (C3) | Opus designs, ls-test-writer pins invariants |
| 11 TG/WA | same as 9 + provider abstraction (api-and-interface-design) | ls-security-auditor |
| 12 hardening | security-review · postgres-patterns · ai-regression-testing | ls-security-auditor sweeps |
| 13 readiness | security-scan · security-review · deployment-patterns | ls-security-auditor |
| 14 UX polish | frontend-ui-engineering · ui-styling · article-writing (admin manual) | ls-ux-auditor batches + Workflow sweep |
| 15 launch | shipping-and-launch · **canary-watch** | — |
| 16 PWA | **nextjs-turbopack** · performance-optimization · documentation-lookup | ls-implementer + ls-test-writer |
| any session end | **liveshop-handoff** | — |

No phase lacks a skill or agent. New-skill creation NOT needed — all gaps were routing omissions of skills already on disk.

### Tier IGNORE — exists on disk, never relevant here (do not invoke, do not read)

- **Language packs (38):** cpp\*, golang\*, rust\*, kotlin\*, swift\*, django\*, laravel\*, perl\*, springboot\*, java\*, jpa\*, android\*, flutter\*, compose\*, pytorch\*, clickhouse-io, nuxt4-patterns, foundation-models-on-device
- **Domain packs (8):** carrier-relationship-management, customs-trade-compliance, energy-procurement, inventory-demand-planning, production-scheduling, quality-nonconformance, returns-reverse-logistics, visa-doc-translate
- **SEO suite (~40 incl. duplicates):** seo-\* + claude-seo:\* — not in liveshop scope (storefront SEO = post-launch candidate at best)
- **Content/marketing (13):** protected for pak-ta-kra future use — ignore here
- **pak-ta-kra-specific:** graphify, notebooklm, fal-ai-media, video-\*, ai-image-prompts, banner-design, canvas-design, tiktok-automation, x-api, crosspost
- **Agent-framework alternates:** gsd:\* (~40), omc-\*, autopilot, ralph\*, ultrawork, swarm/team/multi-\* — we use ROADMAP-file orchestration + project sub-agents instead; do NOT mix two orchestration systems

**Rule: routing solves context, not deletion.** The skill LIST in the system prompt is harness-injected — repo docs can't shrink it. What this table does: stop wasted invocations + wasted SKILL.md reads. Actual removal = §2 (Boss-gated).

---

## §2 Disable plan (Boss approval per batch — global blast radius includes pak-ta-kra)

Skills dir is GLOBAL (`~/.claude/skills/`). Archiving affects every project. Global CLAUDE.md: no archive without per-batch Boss approval + 18 never-archive + 13 future-use protected. Therefore: recommendation only, execute on Boss word.

| Batch | Contents | Risk | Est. context saved |
|---|---|---|---|
| **D1** | 38 language packs (list §1 IGNORE) | ZERO — both projects are TS/Next | ~38 lines of skill list + zero accidental reads |
| **D2** | 8 logistics/domain packs | ZERO | ~8 lines |
| **D3** | SEO duplicate registration (seo-\* appears TWICE: bare + claude-seo: prefix) | LOW — investigate plugin double-load first; dedupe ≠ delete | ~20 lines |
| **HOLD** | gsd:\*/omc/ralph/swarm orchestration packs | MEDIUM — Boss may use elsewhere | — |
| **NEVER** | 18 never-archive + 13 future-use (global CLAUDE.md) | — | — |

Execution method when approved: `mkdir ~/.claude/skills-archived && mv` (reversible R1, NOT delete). Boss says `ARCHIVE D1` / `ARCHIVE D1+D2` → Claude executes + verifies pak-ta-kra routing untouched (never-archive list intact).

---

## §3 Session continuity + context management protocol

### The 4-layer state system (already live — this section makes the PROTOCOL explicit)

| Layer | File | Update when |
|---|---|---|
| 1. Contract | `CLAUDE.md` § ROADMAP CONTRACT (auto-loads) | rules change only |
| 2. Truth | `docs/ROADMAP.md` §4 statuses | EVERY phase-state change, same PR |
| 3. Memory | `~/.claude/projects/...-liveshop-pro/memory/MEMORY.md` § CURRENT CONTRACT | every session end / major milestone |
| 4. Handoff doc | `docs/superpowers/handoffs/<date>-*.md` | context pressure or session end with in-flight work |

### Context budget rules (token efficiency)

1. **Watch the gauge:** at ~60% context used → finish current task, then run `liveshop-handoff`. At ~75% → handoff NOW even mid-task (record exact stop point). Never push past 85% on multi-file work (global performance.md).
2. **Don't re-read what's pinned:** ROADMAP/specs read ONCE per session; afterwards reference by section number. Re-read only the section you're editing.
3. **Delegate context-heavy reads:** wide grep/log dumps → `ls-scout`; test output floods → run via Bash redirect to file + parse summary; review sweeps → `ls-reviewer`/`ls-ux-auditor` return verdicts not dumps.
4. **Output discipline:** subagent briefs name files + acceptance, demand structured short returns. No verbose pastes back into Boss thread.
5. **Compaction survival:** all 4 layers are file-based — `/compact` or auto-compaction loses nothing that matters IF layer 2+3 are current. The handoff skill's job = make them current BEFORE compaction hits.

### Fresh-session resume sequence (what the next Opus 4.8 does — zero memory of this chat needed)

1. CLAUDE.md auto-loads → ROADMAP CONTRACT section
2. `docs/ROADMAP.md` §4 → find ▶ ACTIVE / READY phase
3. `ls docs/superpowers/handoffs/ | tail -1` → read latest handoff IF in-flight work was recorded
4. `gh pr list` + `git log --oneline -5` → verify file claims against repo truth
5. Resume the recorded next-step. Total boot cost: ~3 file reads.

---

## §4 Handoff skill spec (installed at `~/.claude/skills/liveshop-handoff/SKILL.md`)

Trigger: `/liveshop-handoff` · Boss says "handoff" / "เก็บงาน" / "จะปิด session" · self-trigger at context ≥70%.

Produces (in order):
1. **ROADMAP §4 sync** — statuses match reality (merged PRs ticked, active phase correct) → commit direct to master if docs-only delta
2. **Handoff doc** `docs/superpowers/handoffs/YYYY-MM-DD-<topic>.md` from template: state table (master SHA, open PRs, CI), DONE list with evidence, IN-FLIGHT work with exact stop point + next command, BLOCKED-ON-BOSS list, files touched, gotchas discovered this session
3. **Memory refresh** — liveshop MEMORY.md § CURRENT CONTRACT: update state line + handoff pointer (keep ≤15 lines; history stays in handoff docs, NOT memory)
4. **Boss line** — 2-3 ประโยคไทย: ทำอะไรเสร็จ, ค้างอะไร, Boss ต้องทำอะไร

Hard rules: no secrets in handoff docs · handoff doc = repo-tracked (PR or direct docs commit) · never duplicate spec content into handoff (reference by path+section) · template kept inside the SKILL.md itself.

---

*Routing + protocol operational now. §2 batches await Boss word.*
