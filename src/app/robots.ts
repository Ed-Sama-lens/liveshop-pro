import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` — Next.js metadata route.
 *
 * The app's `/` and `/sale` routes are admin-only and behind sign-in.
 * The storefront paths `/shop/<slug>/*` are publicly indexable IF Boss
 * activates them later, but currently no real shop is live and the
 * product is not yet in customer use.
 *
 * Current policy: `Disallow: /` for all user-agents. Crawlers should
 * skip the entire site until Boss flips to a storefront-public policy
 * by editing this file (allow `/shop/*`, disallow `/sale`, `/api`,
 * `/auth`, `/_next`).
 *
 * Filed alongside fix `/robots.txt` middleware gating
 * (PUBLIC_PATHS update in src/lib/auth/permissions.ts).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
