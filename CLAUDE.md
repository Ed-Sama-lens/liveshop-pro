@AGENTS.md

# Project: liveshop-pro

**This is NOT pak-ta-kra.** Different repo, stack, deploy, currency, scope.

---

## 🗺️ ROADMAP CONTRACT — read FIRST, every session (MANDATORY)

**Before ANY roadmap/feature/UX/inbox/mobile work in this repo:**

1. Read **`docs/ROADMAP.md`** — THE single source of truth: 17 phases (0–16), current statuses, hard no-go list, Boss action queue, verification commands. Its §0 tells you exactly how to operate. Do NOT plan from memory or chat history — the file is the contract.
2. Detail specs it points to (read when working that area):
   - `docs/superpowers/2026-06-10-unified-inbox-feature-spec.md` — inbox F1–F20 + AI/Claude HITL integration (Phase 10)
   - `docs/superpowers/2026-06-10-ux-design-plan.md` — UX standards §2 (EVERY UI PR must pass), page disposition, wireframes
   - `docs/superpowers/2026-06-10-mobile-app-plan.md` — PWA M1–M3 (Phase 16)

**Operating contract (Boss directive 2026-06-10 — supersedes older review flow):**

- **Codex + ChatGPT review RETIRED** (token exhausted). Claude = sole reviewer.
- **Mandatory self-review:** after every major deliverable → `scrutinize` skill (intent → simpler-alternative → full code-path trace) → fix findings → only then merge.
- **Merge authority:** Claude merges own PRs when ALL: R2 scope + CI 5/5 green + scrutinize pass + not on ROADMAP §2 hard no-go list. R1 needs the phase's Boss verdict; R0 needs per-action Boss token.
- **Reports/questions/teaching Boss = ภาษาไทย เข้าใจง่าย.** Code/commits/paths/errors stay English.
- **Never claim done without fresh verification output** (tsc exit, vitest counts, build exit — commands in ROADMAP §8).
- Update ROADMAP §4 statuses when phases change state. ROADMAP is living — keep it true.

**State right now (refresh from `git log`/`gh pr list` — do not trust this line blindly):** PR #154 (V Rich WIRE-3) open, blocked on Boss UI smoke; everything else merged through #165.

---

## Identity

| Field | Value |
|---|---|
| Name | LiveShop Pro |
| Domain | nazhahatyai.com |
| Repo | github.com/Ed-Sama-lens/liveshop-pro |
| Deploy | Vercel (auto on `master` push) |
| DB | Railway PostgreSQL |
| Storage | Cloudflare R2 (`images.nazhahatyai.com`) |
| Auth (admin) | next-auth credentials |
| Auth (customer) | Facebook Login (App ID `780277861568430`) |
| Currency | MYR (RM) — NOT THB |
| Branch | `master` (single-branch flow) |

## Stack

Next.js 16 + Turbopack + TypeScript 5 strict + Prisma 7 + PostgreSQL + next-intl (cookie locale, `localePrefix: 'never'`) + Tailwind + shadcn/ui + Vitest + Playwright.

## Scope boundary vs pak-ta-kra

| | liveshop-pro | pak-ta-kra |
|---|---|---|
| Type | E-commerce live-selling SaaS | AI video pipeline (Get It Stories) |
| Stack | Next.js + Postgres + Prisma | Next.js + SQLite + Drizzle |
| Deploy | Vercel | Railway |
| Currency | MYR | THB |
| Storage | R2 | local /data |
| Branch model | single `master` | feat/* per task |

**Global `~/.claude/CLAUDE.md` + `skill-routing.md` + `skill-inventory.md` are pak-ta-kra-biased.** Project-specific routing there (e.g. `src/app/api/generate/image/**`, `castContext`, `imagegenIntegrity`, brand DNA, Imagen/Gemini/Fal) DOES NOT apply here. Treat global as default; this file overrides.

---

# Engineering Rules (Boss-enforced)

Every task. Violation = work rejected.

## 1. NO MAGIC

ห้ามเดา. Every assumption explicit.

- Code unverified → prefix `ASSUMPTION:` before claiming
- Infra unseen (env vars, services, endpoints) → no claim of existence before verify
- API shape unverified → no invented fields
- Library behavior unsure → read source / Context7 docs first

Workflow: not-verified → grep / Read / Context7 → assert.

## 2. VERIFY BEFORE DONE

Evidence before claims. Banned: "should work", "this is correct", "fixed".

| Change scope | Min verification |
|---|---|
| Single file < 20 lines | `npx tsc --noEmit` |
| Logic / behavior | `npm run test -- <file>` pass |
| Schema / auth / payment / R2 / FB Login | full `npm run test` + tsc + manual probe |
| Vercel deploy | wait for **Ready**, hit nazhahatyai.com |

Replace banned phrases with: "tsc clean (ran)", "X/Y tests pass (paste)", "verified by reading file:line".

## 3. DISSENT (4 bullets BEFORE first edit on MAJOR)

MAJOR triggers:
- Prisma schema change / migration
- Auth boundary (next-auth, FB Login, RBAC, session)
- Public API contract (`/api/*` route signature, response envelope)
- Payment / order / commerce policy
- R2 / storage path / CSP header
- > 3 files OR > 200 LOC
- Currency / pricing logic

4 bullets:
1. **Blast radius** — break กระทบใคร?
2. **Assumptions** — สมมติอะไร?
3. **Reversibility** — R0/R1/R2? rollback cost?
4. **Blind spots** — momentum ปิดตาอะไร?

Skip dissent: single file < 50 lines, comment, typo, internal helper, test, doc, formatting.

## 4. SCOPE DRIFT GUARD

ห้าม expand scope เงียบ. Flag:
- "while I'm here" / "let's also..."
- Bug fix → refactor
- One-page edit → multi-page sweep
- Boss asked X, ทำ X+Y+Z

Protocol: STOP. Ask:
> "Scope expanding from <X> to also <Y>. Proceed?"

## 5. R0/R1/R2 REVERSIBILITY

### R0 — Irreversible. STOP, ASK FIRST.
- `git push --force` to master
- `prisma migrate reset` / `DROP TABLE` / `DELETE` without WHERE
- Rotate / delete secrets (Vercel env, R2 keys, FB App secret)
- R2 bucket delete / mass `DeleteObject`
- Production order data deletion
- Charge customer card / send mass email
- Vercel deploy with failing tests
- Change FB App `live` mode

### R1 — Costly. DO + explain.
- Prisma migration (auto-apply on Vercel)
- Public API route signature change
- CSP header change (`next.config.ts`)
- Currency / pricing logic
- Add Vercel env var
- Rename feature flag

### R2 — Cheap. JUST DO.
- Comment / docstring
- Typo
- Internal helper refactor
- Test
- Codemap entry update
- Lint / formatting / log line

---

## Skill routing (liveshop-pro-specific)

| Task | Skills |
|---|---|
| Any code edit | `karpathy-guidelines`, `coding-standards` |
| MAJOR change | `dissent-4-bullet` BEFORE first edit |
| API route / response shape | `api-and-interface-design` |
| Auth / FB Login / customer data / payment | `security-and-hardening` |
| Prisma schema / migration | `database-migrations`, `dissent-4-bullet` |
| UI component / shadcn | `frontend-ui-engineering`, `ui-styling`, `webapp-testing` |
| Vercel build fail | `documentation-lookup` (Next.js 16 / Prisma 7 docs) |
| Storefront / cart / checkout / order flow | `webapp-testing`, `verification-before-completion` |
| R2 / CSP / Storage | `dissent-4-bullet`, `security-and-hardening` |
| FB App Review (privacy/terms/data-deletion) | `security-and-hardening`, `documentation-lookup` |
| Before commit | `git-workflow-and-versioning`, `verification-before-completion` |
| PR / refinement comment | `boss-style-pr` |
| New code from scratch | `search-first` |
| Bug investigation | `systematic-debugging` |
| Multi-hop bug (cross-route / DB / R2 / CSP) | `systematic-debugging`, `trace` |
| Memory write | `verification-before-completion` |

**Project-specific high-risk paths:**

| Path / concept | Required skills |
|---|---|
| `src/app/api/products/[id]/images/**` | `dissent-4-bullet`, `security-and-hardening`, `verification-before-completion` |
| `src/lib/upload/storage.ts` (R2) | `security-and-hardening`, `verification-before-completion` |
| `src/app/api/auth/**` / `src/lib/auth/**` | `dissent-4-bullet`, `security-and-hardening` |
| `src/app/api/storefront/[shopId]/**` | `api-and-interface-design`, `security-and-hardening` (slug resolve required) |
| `src/app/shop/[shopId]/checkout/**` | `dissent-4-bullet`, `security-and-hardening`, `verification-before-completion` |
| `prisma/schema.prisma` | `dissent-4-bullet`, `database-migrations` |
| `src/proxy.ts` (middleware) | `dissent-4-bullet`, `security-and-hardening` |
| `next.config.ts` (CSP / images) | `dissent-4-bullet`, `security-and-hardening` |

---

## Hybrid Navigation (no graphify here)

liveshop-pro is small enough that grep + codemap suffices. No graphify build.

| Question type | Tool |
|---|---|
| Known symbol / string | Grep |
| Known feature / business logic | `docs/CODEMAP/<num>-*.md` |
| Single-file edit | Grep + Read |
| Cross-module ("how does X connect to Y") | Grep + codemap cross-refs |
| Architecture overview | `docs/CODEMAP/01-app-overview.md` |

Update codemap when: new feature shipped, route added, schema migration, env var added. NOT for bug fixes that don't change business logic.

---

## Never assume (project-specific)

- pak-ta-kra paths / commands / brands / sentinels DO NOT exist here
- Drizzle / SQLite / `castContext` / `imagegenIntegrity` / Production Mode / Imagen / Gemini / Fal DO NOT exist here
- THB / `฿` symbol — replaced with MYR / RM
- Railway deploy — DB only; app deploys to Vercel

---

## Memory

Project memory: `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md`

DO NOT write liveshop-pro entries to `C--Users-Asus-COWORK-code/memory/` (that's pak-ta-kra-biased shared dir).

Start session from `liveshop-pro/` directory (NOT parent `COWORK/code/`) → memory namespace auto-isolates.

---

## Cross-references

- `docs/CODEMAP/` — feature-level navigation (10 docs)
- `docs/CODEMAP/README.md` — index + quick-start by task type
- `~/.claude/CLAUDE.md` — global rules (pak-ta-kra-biased — read with this lens)
- `pak-ta-kra/CLAUDE.md` — sibling project (different scope, do NOT conflate)
