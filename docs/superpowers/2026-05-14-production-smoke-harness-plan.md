# Production smoke harness plan

**Filed:** 2026-05-15
**Status:** Implementation lands in `feat/sale-broadcast-product-update-delete` predecessor + new unauth spec on `test/prod-unauth-smoke-harness`. Future expansion deferred.

---

## 1. Why

Throughout D1 → D3 → D4 → D6 → PR4 → PR6 cycles, every deploy verification used an ad-hoc 11-13 probe curl loop pasted inline. Repeating the same probe set was fast but fragile:

- Easy to drop a probe between sessions.
- No CI signal.
- No structured report.
- No regression-safety after auth/middleware/route changes.

A Playwright spec captures the same probes in a single repeatable file. Boss + ChatGPT can re-run before any merge or flag flip.

## 2. Scope

In scope (this PR):

- New `tests/e2e/prod-unauth-smoke.spec.ts` — 15 test cases covering the 13-probe baseline + 2 extras (security headers + robots.txt known-issue assertion).
- Reuses existing `playwright.prod-smoke.config.ts` (no config change).
- Pure unauth — no storageState load, no auth, no mutation.

Out of scope:

- Authenticated smoke spec (already exists at `manual-create-phase-a.prod-smoke.spec.ts`; Boss-only when storageState valid).
- CI workflow wiring (Boss/ChatGPT can decide cron / on-deploy hook separately).
- Slack / Telegram alerts on failure.
- Performance / latency assertions.

## 3. Test cases

| # | Probe | Expected |
|---|---|---|
| 1 | `GET /` | 307 → `/auth/sign-in` |
| 2 | `GET /favicon.ico` | 200 |
| 3 | `GET /sale` | 307 → `/auth/sign-in` |
| 4 | `GET /api/sale/live-sessions` | 401 |
| 5 | `GET /api/sale/customers/search?q=test` | 401 |
| 6 | `POST /api/sale/bookings` | 401 |
| 7 | `POST /api/sale/orders/from-bookings` | 401 |
| 8 | `GET /api/sale/broadcast-products` | 401 |
| 9 | `POST /api/sale/broadcast-products` | 401 |
| 10 | `PATCH /api/sale/broadcast-products/[id]` | 401 |
| 11 | `DELETE /api/sale/broadcast-products/[id]` | 401 |
| 12 | `GET /api/storefront/<bogus>/products` | 404 not 500 |
| 13 | `GET /api/auth/csrf` | 200 + JSON `{csrfToken: string}` |
| 14 | `GET /robots.txt` | 200 or 307 (known follow-up) |
| 15 | security headers on `/` | CSP + HSTS + Permissions + Referrer present |

## 4. Run command

```
npx playwright test --config=playwright.prod-smoke.config.ts \
  tests/e2e/prod-unauth-smoke.spec.ts
```

Production target: `https://nazhahatyai.com` (baked into `playwright.prod-smoke.config.ts`).

No env vars required. Safe to run from any machine + at any time. No production mutation possible.

## 5. Failure interpretation

| Failure | Likely cause |
|---|---|
| 500 on any probe | New deploy broke runtime. Roll back. |
| 200 instead of 401 on `/api/sale/*` POST | Auth gate regressed. Hotfix immediately. |
| 404 on `/api/auth/csrf` | next-auth wiring broken. Hotfix. |
| 500 on `/api/storefront/<bogus>` | Storefront route handler doesn't validate slug. Hotfix. |
| Missing CSP/HSTS headers | `next.config.ts` regression. Hotfix. |
| Probe #14 flips from 307 → 200 | `/robots.txt` middleware fix shipped. Update expected status to 200 + bump known-issue comment. |

## 6. Maintenance

When adding new sale routes:

- Add a corresponding unauth probe to this spec.
- Keep test cases ordered by URL category for diff clarity.
- Never add authenticated probes here — they live in `*.prod-smoke.spec.ts` paired with `setup-prod-auth.ts`.

When deleting routes:

- Delete the probe in the same PR that deletes the route.

## 7. Why two prod-smoke specs

| Spec | Purpose | Mutation risk |
|---|---|---|
| `prod-unauth-smoke.spec.ts` (this PR) | continuous deploy verification | NONE |
| `manual-create-phase-a.prod-smoke.spec.ts` (existing) | authenticated Phase A smoke (Boss approval) | requires storageState + intentional admin POST |

Both live under the same `playwright.prod-smoke.config.ts` so the existing 1-worker serial setup applies to both. Test naming pattern (`*.prod-smoke.spec.ts`) catches both.

## 8. Cross-references

- Existing config: `playwright.prod-smoke.config.ts`
- Existing auth spec: `tests/e2e/manual-create-phase-a.prod-smoke.spec.ts`
- Auth setup: `tests/e2e/setup-prod-auth.ts`
- Boss D1 runbook (used the curl-based probe loop): `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md`
- D4/D6 activation runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
