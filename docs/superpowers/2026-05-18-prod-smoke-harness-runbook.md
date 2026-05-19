# Production smoke harness runbook

**Filed:** 2026-05-18
**Branch:** `test/prod-smoke-harness-hardening`
**Status:** active

## What

`npm run smoke:prod:unauth` runs all 16 unauth probes against `https://nazhahatyai.com`. No auth. No mutation. No storageState. ~10 seconds.

## Configs

| Config | Target | Specs picked up | Auth |
|---|---|---|---|
| `playwright.prod-smoke.config.ts` | `nazhahatyai.com` | `*.prod-smoke.spec.ts` (authenticated Phase A) | requires storageState |
| `playwright.prod-unauth-smoke.config.ts` | `nazhahatyai.com` | `prod-unauth-smoke.spec.ts` only | NO auth, NO storageState |
| `playwright.config.ts` | `localhost:3000` | every `*.spec.ts` | dev server |

The two prod configs are intentionally separate so the unauth smoke can never accidentally pick up an authenticated spec.

## Probes (16)

1. `GET /` → 307 → `/auth/sign-in`
2. `GET /favicon.ico` → 200
3. `GET /sale` → 307 → `/auth/sign-in`
4. `GET /api/sale/live-sessions` → 401
5. `GET /api/sale/customers/search?q=test` → 401
6. `POST /api/sale/bookings` → 401
7. `POST /api/sale/orders/from-bookings` → 401
8. `GET /api/sale/broadcast-products` → 401
9. `POST /api/sale/broadcast-products` → 401
10. `PATCH /api/sale/broadcast-products/bogus-id` → 401
11. `DELETE /api/sale/broadcast-products/bogus-id` → 401
12. `GET /api/storefront/nonexistent-shop-slug-xyz/products` → 404 (not 500)
13. `GET /api/auth/csrf` → 200
14. `GET /robots.txt` → 200 + body has `User-Agent` and `Disallow`
15. `GET /sitemap.xml` → 200 or 404 (never 307 — middleware regression guard)
16. `GET /` response carries CSP + HSTS + Permissions-Policy + Referrer-Policy headers

## When to run

- After every `master` merge
- After every Vercel deploy
- Before opening a release branch
- After flipping a feature flag
- As a sanity check before authenticated functional smoke

## Safety guarantees by construction

- `testMatch: /prod-unauth-smoke\.spec\.ts$/` — only one file accepted
- `use.storageState: undefined` — Playwright cannot load auth state even if a `.auth/state.json` exists locally
- POST/PATCH/DELETE bodies are empty `{}` against routes that reject 401 before touching DB
- No webServer block — Playwright will not boot Next.js dev
- Reporter limited to `list` — no HTML report directory written, nothing to commit accidentally

## Hard guard

Each new probe added to `prod-unauth-smoke.spec.ts` must:

- Use `request.<method>` (Playwright APIRequest), not `page.goto` followed by interaction.
- Assert HTTP status only, plus optional response body markers.
- Never read or write `tests/e2e/.auth/` files.
- Never assert that an authenticated body shape exists.
- Pass against a freshly deployed master with zero data setup.

## Quick curl fallback

For situations where Playwright is unavailable (e.g. shell-only environment), the equivalent curl set is documented inline in this file. The Playwright spec is authoritative.

```bash
BASE=https://nazhahatyai.com
curl -sS -o /dev/null -w "%{http_code}\n" -X GET --max-redirs 0 "$BASE/"
# expect 307
# ... (one line per probe, same as the spec)
```

The maintained list lives in `tests/e2e/prod-unauth-smoke.spec.ts` — keep that in sync, not this file.

## Failure response

Any non-PASS:

1. Capture the exact HTTP status and response body
2. Note the deploy SHA (`git log --oneline -1`) and Vercel deployment ID
3. Open an issue or revert the offending deploy
4. Do NOT push a fix-forward without re-running smoke after the fix lands

A failing smoke is treated as a production incident.

## Cross-references

- `docs/superpowers/2026-05-14-production-smoke-harness-plan.md` — original plan
- `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md` — functional smoke (authenticated, Boss-side)
