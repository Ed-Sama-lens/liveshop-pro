# Sitemap policy — verdict log

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-sitemap-policy-plan.md`
**Status:** Boss decision log entry. Default = Option A indefinitely.

The 2026-05-17 plan laid out four options (A no sitemap, B empty admin-only sitemap, C public storefront, D per-shop opt-in). This file records the current verdict + the decision deadline.

---

## 1. Current verdict — Option A

Production state today:

- `/robots.txt` → 200 with `User-Agent: * / Disallow: /`
- `/sitemap.xml` → 404 (no `src/app/sitemap.ts`)
- Smoke harness probe #15 asserts `200 or 404` (allows future Option B/C without rewriting smoke)

**Decision:** Keep Option A. No sitemap until storefront-public direction is decided.

**Rationale:**

1. App is not yet in real customer use.
2. Disallow-all robots is correct for an admin tool.
3. Implementing sitemap before customer-facing storefront ships would advertise URLs that aren't ready for traffic.
4. Smoke harness already guards against accidental `/sitemap.xml` regression to 307 (middleware error).

---

## 2. Decision triggers

Option A holds until one of these:

| Trigger | Likely option |
|---|---|
| Boss decides to launch storefront for at least one shop publicly | C or D |
| Boss decides to keep nazhahatyai.com as admin-tool-only forever | A (permanent) OR B (empty for tidiness) |
| Search engine starts indexing parts of admin UI despite robots.txt | A (no change) + investigate |
| Customer asks "where is your sitemap?" | C (provide bare minimum) |

The decision is reversible — Option A → B → C is additive and each step adds files without removing.

---

## 3. Phase B / admin onboarding cross-cut

Sitemap policy does NOT block:

- D4/D6 functional smoke
- Phase B authenticated production smoke
- Admin onboarding (admins access via direct URL + sidebar, no SEO involvement)
- Tier 4.1 Messenger webhook (different concern entirely)

Sitemap policy DOES block:

- Public storefront launch
- Any "Find your shop in Google" feature
- Customer-facing organic traffic

Boss should not feel pressure to decide before admin onboarding.

---

## 4. Suggested decision deadline

| Stage | Sitemap decision needed? |
|---|---|
| D4/D6 functional smoke | NO |
| Stock decrement decision | NO |
| Tier 4.1 implementation | NO |
| First admin invite | NO |
| First real customer order (closed beta) | NO |
| Public storefront launch announcement | **YES** |
| First marketing campaign | **YES** |

So the practical deadline is: before any public-facing announcement of `nazhahatyai.com` as a shoppable destination.

---

## 5. If/when Boss switches to Option C

Pre-flight checklist (do all before flipping):

- [ ] Audit `/shop/[shopId]` page for production-readiness under organic traffic
- [ ] Add per-shop `isPubliclyListed` opt-in (Option D pattern even if Option C chosen — defaults can flip later)
- [ ] Update `src/app/robots.ts` per the snippet in the plan § 6
- [ ] Add `src/app/sitemap.ts` per the snippet
- [ ] Update smoke harness probe #15 expectation to `200 only`
- [ ] Add unit test for sitemap helper (mocks Prisma `findMany`)
- [ ] Confirm `NEXT_PUBLIC_APP_URL` env var is set in Vercel
- [ ] Performance test sitemap query if Shop count > 100
- [ ] Document policy in `/storefront/admin` so per-shop admins understand indexing

Open this as a single PR: `feat(seo): storefront-public sitemap + robots`.

---

## 6. Cross-references

- Original sitemap plan: `docs/superpowers/2026-05-15-sitemap-policy-plan.md`
- Robots fix PR #8 (merged): `fix/public-robots-middleware`
- Smoke harness runbook: `docs/superpowers/2026-05-18-prod-smoke-harness-runbook.md`
- Admin onboarding: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
