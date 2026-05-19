# CI quality gates — plan + safe npm scripts

**Filed:** 2026-05-18
**Status:** docs + safe npm scripts. CI workflow changes deferred to a separate Boss-approved PR.

This file documents the existing CI gaps and adds safe focused npm scripts that mirror what CI would run in each gate. Boss can flip CI to use these later without rewriting the harness.

---

## 1. Current CI status (`.github/workflows/ci.yml`)

| Job | Trigger | What runs | Status |
|---|---|---|---|
| `lint` | push to `main`/`develop`, PR to `main` | `npm run lint` | OK if main/develop |
| `typecheck` | same | `npx tsc --noEmit` | OK |
| `test` | same | `npm run test:coverage` (postgres + redis services) | OK |
| `build` | same | `npm run build` | OK |
| `docker` | only `refs/heads/main` | docker build | conditional |

## 2. The branch-name mismatch problem

The CI triggers fire on `main` and `develop`. But **the actual repository convention is `master`** (per `CLAUDE.md` Identity section: "Branch: `master` (single-branch flow)"). Therefore:

- PRs targeting `master` → CI **does not run**
- Pushes to `master` → CI **does not run**
- `master` merges effectively bypass the CI gate today

This is a real gap and explains why Boss must run smokes manually after every deploy.

## 3. Fix proposal (deferred — needs Boss approval)

Update `.github/workflows/ci.yml` triggers to use `master`:

```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

Drop `develop` (not used). Drop `main` (not used).

R1 change because:
- It activates ~5 minutes of CI per PR
- May surface latent test/lint/build issues that have been quiet
- Docker job needs `refs/heads/master` not `refs/heads/main` — same edit

Not done in this PR. Boss approves separately.

## 4. Other gaps

| Gap | Today | Proposal |
|---|---|---|
| Production unauth smoke not on cron | Boss runs manually | Vercel Cron or GitHub Action calling `npm run smoke:prod:unauth` hourly |
| Docker verifier not in CI | Manual local run | Add `verify` job that boots local postgres service then runs `npm run verify:sale:d4-d6` |
| Coverage thresholds | none enforced | Add `--coverage --reporter=text --reporter=lcov` + minimum threshold per `coding-standards` rule "80%+" |
| ESLint warnings | not blocking | Decide if `--max-warnings 0` |
| Long-running tests | acceptable | Add `--bail` so the first failure short-circuits |
| Branch protection on `master` | unknown | Require lint+typecheck+test passing before merge |

All deferred. Boss decides ordering.

## 5. Safe npm scripts added in this PR

Three additive scripts. No CI yaml change. Each is a thin alias around tools already installed.

| Script | Command | What it does |
|---|---|---|
| `npm run check:types` | `tsc --noEmit` | Alias for tsc; shorter mnemonic |
| `npm run test:sale:routes` | `vitest run tests/unit/app/api/sale` | Targeted route tests |
| `npm run test:sale:components` | `vitest run tests/unit/components/sale tests/unit/components/shared/SidebarNav.test.ts` | Targeted component tests |

Verification:

- `npm run check:types` → tsc exit 0 against master `85c7a93` after PR #20 socket fix merged
- `npm run test:sale:routes` → 5 files / 87 tests pass on master
- `npm run test:sale:components` → 5 files (4 sale + 1 shared) on `test/sale-component-coverage-hardening`

## 6. Hard guarantees

- ❌ Does NOT change `.github/workflows/ci.yml`
- ❌ Does NOT change branch protection
- ❌ Does NOT add cron / scheduled workflow
- ❌ Does NOT change coverage thresholds
- ❌ Does NOT change ESLint warning treatment
- ❌ Does NOT add Docker compose service spec for CI
- ✅ Adds 3 thin npm aliases
- ✅ Documents the existing master vs main/develop branch mismatch
- ✅ Documents the gap inventory

## 7. Recommended sequence (when Boss approves)

1. **PR-CI-1**: switch CI triggers from `main`/`develop` to `master`. Verify all jobs green.
2. **PR-CI-2**: add `verify` job using `services: postgres` to run `npm run verify:sale:d4-d6`. Verify green.
3. **PR-CI-3**: schedule `prod-unauth-smoke` via GitHub Action `schedule` cron (hourly). Notify on failure via Telegram bot (project memory says one is installed).
4. **PR-CI-4**: enable branch protection requiring lint + typecheck + test green before merge to `master`.
5. **PR-CI-5**: raise coverage threshold to 80% per `coding-standards`.

Each PR small and reversible.

## 8. Cross-references

- Smoke harness runbook: `docs/superpowers/2026-05-18-prod-smoke-harness-runbook.md`
- Observability post-deploy runbook: `docs/superpowers/2026-05-18-observability-post-deploy-runbook.md`
- Existing CI file: `.github/workflows/ci.yml`
- Engineering rules: `CLAUDE.md`
