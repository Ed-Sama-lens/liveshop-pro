# Test command reference

**Filed:** 2026-05-19
**Status:** developer reference. Mirrors `package.json` scripts. No runtime change.

Quick lookup for "what's the command for X?" Every entry says exactly what runs, where, and any safety caveat.

---

## 1. Production smoke

| Command | What | Target | Auth | Mutation |
|---|---|---|---|---|
| `npm run smoke:prod:unauth` | Playwright 16-probe unauth smoke | `https://nazhahatyai.com` | none | none — all POST/PATCH/DELETE expect 401 |

Use after every Vercel deploy. Expected: 16/16 pass in ~10 seconds.

## 2. Type checking

| Command | What |
|---|---|
| `npx tsc --noEmit` | Full project type check |
| `npm run check:types` | Same, mnemonic alias |

Master baseline: zero errors after PR #20. Any new errors → blocker.

## 3. Linting

| Command | What |
|---|---|
| `npm run lint` | ESLint over project |

## 4. Tests — focused

| Command | What | Files | Cases |
|---|---|---|---|
| `npm run test:sale:routes` | All `/api/sale/*` route tests | `tests/unit/app/api/sale/**` | growing — 100+ |
| `npm run test:sale:components` | Sale component + shared SidebarNav tests | `tests/unit/components/sale/**` + `tests/unit/components/shared/SidebarNav.test.ts` | 50+ |

## 5. Tests — full

| Command | What |
|---|---|
| `npm test` | Full vitest run |
| `npm run test:unit` | Vitest verbose reporter |
| `npm run test:coverage` | Vitest with coverage |
| `npm run test:watch` | Vitest watch mode (developer-only) |

## 6. E2E tests

| Command | What | Auth | Caveat |
|---|---|---|---|
| `npm run test:e2e` | Local Playwright (boots dev server) | none | needs `npm run dev` env |
| `npm run test:e2e:ui` | Playwright UI mode | none | interactive |

## 7. Local verifiers (non-production only — guarded)

ALL verifier scripts require:
- `CONFIRM_NON_PROD_DB=true`
- `DATABASE_URL` pointing at `localhost` or `127.0.0.1`
- DB name `liveshop_pro`
- No `nazhahatyai` / `rlwy.net` in URL

The guard logic itself is unit-tested at `tests/unit/scripts/non-prod-db-guard.test.ts` (29 cases across 7 layers).

| Command | What | Cases |
|---|---|---|
| `npm run verify:booking-flow` | confirm + cancel + integrity | 9 |
| `npm run verify:booking-create` | createManual | 13 |
| `npm run verify:booking-conversion` | V1 + V2 conversion | 8 |
| `npm run verify:order-reservation-cleanup` | reservation cleanup | 5 |
| `npm run verify:expire-reservations-cron` | cron expiration | 1 |
| `npm run verify:sale:d4-d6` | D4/D6 functional flow (Stage A-I) | 9 |

### Verifier prerequisite — Docker postgres

```bash
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy
```

Then run any verifier with:

```bash
CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npm run verify:sale:d4-d6
```

## 8. Database

| Command | What | Caveat |
|---|---|---|
| `npm run db:migrate` | Prisma migrate dev | local only |
| `npm run db:push` | Prisma db push (no migration file) | dev only — never production |
| `npm run db:studio` | Prisma Studio UI | local only |
| `npm run db:generate` | Generate Prisma Client | safe |

NEVER run `db:migrate` or `db:push` against production. Production migrations apply via Vercel build (`npx prisma migrate deploy`).

## 9. Build

| Command | What |
|---|---|
| `npm run build` | Full Next.js build (Prisma generate + next build) |
| `npm run dev` | Dev server |
| `npm start` | Start production server (after build) |

## 10. Common workflows

### After every deploy

```bash
npm run smoke:prod:unauth
```

### Before opening a PR

```bash
npm run check:types
npm run test:sale:routes        # if changing sale routes
npm run test:sale:components    # if changing sale components
```

### Before merging a PR that touches DB or sale runtime

```bash
npm run check:types
npm test                        # full vitest
# If sale flow touched:
docker compose up -d postgres
npm run verify:sale:d4-d6
```

### Investigating production issue

```bash
# 1. Smoke first to confirm prod is alive
npm run smoke:prod:unauth

# 2. Read Vercel logs for the deploy window
# 3. Read Railway DB logs if smoke shows 5xx
```

## 11. NEVER

- ❌ Never run any `verify:*` script without `CONFIRM_NON_PROD_DB=true`
- ❌ Never set `DATABASE_URL` to a Railway host in a verifier shell
- ❌ Never run `db:push` or `db:migrate` against production
- ❌ Never commit `.env`, `.env.local`, `tests/e2e/.auth/*`, screenshots, test-results
- ❌ Never paste production secrets (Vercel env, Railway DATABASE_URL, FB tokens) into terminal/chat

## 12. Cross-references

- Smoke harness runbook: `docs/superpowers/2026-05-18-prod-smoke-harness-runbook.md`
- D4/D6 verifier runbook: `docs/superpowers/2026-05-19-local-d4-d6-verifier-runbook.md`
- Non-prod DB guard tests: `tests/unit/scripts/non-prod-db-guard.test.ts`
- CI plan: `docs/superpowers/2026-05-18-ci-quality-gates-plan.md`
- Engineering rules: `CLAUDE.md`
