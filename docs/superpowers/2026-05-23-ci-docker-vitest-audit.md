# CI Housekeeping Audit — Docker Build + Full Vitest Timeouts

**Filed:** 2026-05-23 (overnight Track 8)
**Author:** Claude Sonnet 4.6 (autonomous overnight block)
**Master baseline:** `a1aef83` (post PR #59 merge)
**Status:** Audit only. Proposes minimal fix PRs. No fix in this PR.

This doc audits the two CI flakes referenced repeatedly across PRs
#51-#65:

1. **Docker Build** job (Track 9 in Boss's notes) — fails consistently
   on master since at least 2026-05-21
2. **Full vitest** — 8/1209 tests time out under parallel load even
   though isolated reruns pass 96/96

Both are CI housekeeping, separate from product work. Boss said: do not
rewrite CI massively tonight. This doc narrows root cause + proposes
the smallest possible follow-up fix PR.

---

## 1. Docker Build failure — root cause

### Symptom

Latest master CI run (run ID 26307116829, sha `a1aef83`) fails at the
Docker Build step with:

```
#20 ERROR: failed to calculate checksum of ref ...: "/app/node_modules/.prisma": not found
ERROR: failed to build: failed to solve: failed to compute cache key: failed to calculate checksum of ref ...: "/app/node_modules/.prisma": not found
```

### Source

`Dockerfile` lines 37-38:

```dockerfile
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
```

These two `COPY` instructions reference paths that **do not exist** in
this project's build output. The reason:

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}
```

Prisma 7's generated client is written to `src/generated/prisma`, NOT
`node_modules/.prisma`. Line 39 already correctly copies
`src/generated`. Lines 37-38 are stale from an older Prisma 5/6 setup.

The runtime IS correct — `src/generated/prisma` is the working path.
The build stage of the Dockerfile just tries to COPY paths that never
existed in this codebase.

### Fix

Drop the two stale COPY lines. Diff:

```diff
- COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
- COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
  COPY --from=builder /app/src/generated ./src/generated
```

This is a 2-line delete. Vercel deploys from source, NOT from Docker —
so this change does NOT affect production. Docker is a CI-only
artifact (build smoke + future Railway deploy if Boss adds one).

### Proposed PR

`fix(ci): drop stale prisma node_modules COPY from Dockerfile`

- 1 file: `Dockerfile`
- -2 lines
- Risk: R1 (CI artifact behavior). Production unaffected.
- Test plan:
  - Local: `docker build .` succeeds
  - CI: Docker Build job turns green
  - Vercel: untouched (separate deploy path)

### Why not fix it tonight?

Boss explicitly: "do not rewrite CI massively tonight". This is small
enough to land safely, but the policy is "audit first, fix on Boss
verdict". Recommend Boss approves the 2-line delete in the morning.

---

## 2. Full vitest 8/1209 timeout — root cause

### Symptom

Local full-suite run on master `c1bb103` showed 8 failures, all
`Test timed out in 5000ms.` Pattern is identical across all 8:

```
returns 401 when unauthenticated
mockGetSession.mockResolvedValue(null);
const { status } = await callRoute({});
```

Files affected:

- `tests/unit/app/api/sale/broadcast-products-error-mapping.test.ts`
- `tests/unit/app/api/sale/broadcast-products-new-routes.test.ts`
- `tests/unit/app/api/sale/customers-search.route.test.ts`
- `tests/unit/app/api/sale/quick-product-codes.route.test.ts`
- `tests/unit/app/api/sale/orders/from-bookings.route.test.ts`

Same files re-run in isolation: **96/96 PASS in 10.9s.**

### Root cause analysis

1. `vitest.config.ts` does NOT set `testTimeout` → defaults to **5000ms**
2. The same config sets `environment: 'jsdom'` for the whole project
3. Test setup file `tests/setup.ts` + module init under parallel
   workers can take >5s on cold caches (observed 60.7s setup time in
   the failed run)
4. The first test in each file is the unauth one — it gets the worst
   slot in the cache warmup

CI does not show this because the CI runner uses different worker
parallelism (single shard, more headroom). Local Windows + jsdom
environment + jsdom `globalSetup` under cold cache is the trigger.

### Fix

Two options:

**Option A — `testTimeout: 15_000`** (defensive, minimal change):

```ts
// vitest.config.ts
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./tests/setup.ts'],
  testTimeout: 15_000,
  include: ['tests/**/*.test.{ts,tsx}'],
  ...
}
```

Trade-off: real bugs that hang now wait 15s instead of 5s. Acceptable
because they would still fail; CI total time grows marginally.

**Option B — `testTimeout: 10_000` + dedicated `node` environment for
route tests** (cleaner; node env doesn't need jsdom dom shims):

```ts
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./tests/setup.ts'],
  testTimeout: 10_000,
  environmentMatchGlobs: [
    ['tests/unit/app/api/**', 'node'],
    ['tests/unit/lib/**', 'node'],
    ['tests/unit/server/**', 'node'],
  ],
  ...
}
```

Trade-off: more config surface; some helpers might need jsdom that we
miss. Faster overall (route tests skip jsdom init).

### Recommended

**Option A** for tonight's fix PR. **Option B** for a later "tests
faster" PR when Boss wants to spend the audit time.

### Proposed PR

`fix(test): set vitest testTimeout to 15s to absorb cold-cache flake`

- 1 file: `vitest.config.ts`
- +1 line (`testTimeout: 15_000,`)
- Risk: R2 (test infra only)
- Test plan:
  - Local: `npm run test` passes 1209/1209
  - CI Tests job: still passes (already passing)
  - No production impact

### Why not fix it tonight?

Same policy. Audit first. 1-line fix in the morning.

---

## 3. Stop-gap behavior tonight

For tonight's overnight block:

- Docker Build failure is **non-blocking** — Vercel deploys independently
- Full vitest 8 failures are **non-blocking** — isolated reruns pass, branch CI is green per PR
- Both are well-understood and have small proposed fixes
- Neither requires Boss to act tonight

---

## 4. Other CI observations (non-fixes)

### 4.1 `test:coverage` only on master CI

CI's `Tests` job runs `npm run test:coverage` which is slower than
`npm run test`. Coverage report uploaded as artifact. Fine.

### 4.2 No e2e in CI

`tests/e2e/` runs locally / on demand. `smoke:prod:unauth` runs from
dev machine. Not in CI. Acceptable for now — Boss should be aware that
production smoke is a manual step.

### 4.3 Docker Build only fires on master push

Line 116: `if: github.ref == 'refs/heads/master'`. Good — PRs skip
Docker.

### 4.4 No `concurrency:` group

`ci.yml` lacks a `concurrency` block. Multiple pushes in quick
succession run concurrent CIs (wasted compute). Optional later PR:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

Not urgent.

---

## 5. Proposed fix PR sequence (Boss verdict required)

| PR | Title | LOC | Risk |
|---|---|---|---|
| 1 | `fix(ci): drop stale prisma node_modules COPY from Dockerfile` | -2 | R1 |
| 2 | `fix(test): set vitest testTimeout to 15s` | +1 | R2 |
| 3 (optional) | `ci: add concurrency group to ci.yml` | +3 | R2 |

Each PR is independently reviewable.

---

## 6. Hard no-go

- ❌ No mass CI rewrite tonight
- ❌ No Vercel env / config change
- ❌ No Railway change
- ❌ No production deploy
- ❌ No schema migration in CI fix
- ❌ pak-ta-kra untouched

---

## 7. Cross-references

- `.github/workflows/ci.yml` — current CI
- `Dockerfile` — line 37-38 = stale COPY
- `vitest.config.ts` — missing `testTimeout`
- `prisma/schema.prisma` — output = `src/generated/prisma`
- Failed run: https://github.com/Ed-Sama-lens/liveshop-pro/actions/runs/26307116829

---

## 8. Decision

This doc lands as `docs(ci): audit Docker build + vitest timeout flakes`.
Boss verdict on §5 unlocks the 2-line + 1-line fix PRs.
