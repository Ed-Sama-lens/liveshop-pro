# Sitemap policy plan

**Filed:** 2026-05-17
**Status:** Docs-only. Boss decides scope. Default recommendation = no sitemap until storefront-public policy clarified.

---

## 1. Current state

- `/robots.txt` is public 200 with content `User-Agent: * Disallow: /` (post PR #8).
- `/sitemap.xml` returns 404 (no `src/app/sitemap.ts` exists). Smoke harness PR #7 asserts 200 or 404 — never 307 — so middleware regression would surface.

Current robots policy = "disallow everything." This is consistent with the app not being in real customer use. Crawlers see the policy and skip.

## 2. Why a sitemap could matter

If Boss decides to flip robots policy to allow `/shop/*` indexing:
- Crawlers need a sitemap to discover shop slugs efficiently
- Without sitemap, crawlers depend on link-following from `/` (currently admin-only, so no public link graph exists)

If Boss keeps admin-only policy:
- No sitemap needed
- Existing 404 is correct
- Smoke harness regression guard sufficient

## 3. Options

### Option A — No sitemap (current, recommended for now)

- Keep `/sitemap.xml` 404
- Robots policy stays disallow-all
- Defer until storefront-public direction is confirmed

**Cost:** zero.
**Risk:** zero.

### Option B — Admin-only sitemap

- Implement `src/app/sitemap.ts` returning EMPTY array
- Documents intent (admin-only product)
- 200 response with valid empty sitemap XML

**Cost:** ~10 lines code.
**Risk:** low — empty sitemap is well-formed XML; some crawler logs might note "no URLs."

### Option C — Storefront-public sitemap

- Implement `src/app/sitemap.ts` returning all active shop slugs
- Each shop URL: `/shop/<slug>`
- Optionally: each product `/shop/<slug>/products/<id>` (large surface)
- Flip robots.txt: allow `/shop/*`, disallow `/sale`, `/api`, `/auth`, `/_next`, `/dashboard`, etc

**Cost:** medium — sitemap implementation + robots policy flip + privacy audit (some shops may not want indexing) + per-shop opt-in field on Shop model.
**Risk:** medium — exposes shop slugs publicly; some businesses prefer unlisted.

### Option D — Per-shop opt-in storefront sitemap

- Add `Shop.isPublicallyListed` field (or similar)
- Sitemap returns only opted-in shops
- Robots allows `/shop/*` but each shop's own check gates indexing

**Cost:** high — schema change + admin UI for opt-in + sitemap query + per-shop robots route
**Risk:** moderate — privacy preserved via opt-in default

## 4. Recommendation

**Option A.** Defer sitemap implementation. Current state is correct for admin-only product.

When Boss decides storefront-public direction:
- If yes: implement Option C or D depending on shop privacy preference
- If no: keep Option A indefinitely

## 5. Implementation snippet (Option B if Boss prefers minimal docs)

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

/**
 * Sitemap — currently empty. App is admin-only and storefront paths
 * are not advertised publicly. Flip to include shop slugs when Boss
 * decides storefront-public policy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
```

Empty sitemap is harmless; would change smoke probe #14b from "200 or 404" to "200 only."

## 6. Implementation snippet (Option C — storefront-public)

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
  });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nazhahatyai.com';
  return shops
    .filter((s) => s.slug !== null)
    .map((s) => ({
      url: `${baseUrl}/shop/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
}
```

Would also require robots.txt flip in `src/app/robots.ts`:

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/shop/',
        disallow: ['/api/', '/auth/', '/_next/', '/dashboard', '/sale', '/orders', '/inventory', '/customers', '/shipping', '/payments', '/storefront/admin', '/settings', '/analytics', '/reports'],
      },
    ],
    sitemap: 'https://nazhahatyai.com/sitemap.xml',
  };
}
```

## 7. Boss decision needed

| Question | Boss action |
|---|---|
| Should `/shop/*` be public-indexable? | yes / no |
| Should shop slugs appear in sitemap? | yes / no / opt-in per shop |
| Should product URLs appear in sitemap? | yes / no |
| Defer until customer launch? | recommended |

## 8. Cross-references

- Robots fix: PR #8 (`fix/public-robots-middleware`)
- Smoke harness sitemap probe: `tests/e2e/prod-unauth-smoke.spec.ts` probe #14b
- Robots route: `src/app/robots.ts`
