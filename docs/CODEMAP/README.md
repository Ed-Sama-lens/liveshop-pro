# LiveShop Pro Codemap

E-commerce live-selling SaaS reference. Read this BEFORE answering "where is X" / "how does Y work" questions.

**Project: liveshop-pro** — NOT pak-ta-kra. Different stack (Postgres+Prisma vs SQLite+Drizzle), different deploy (Vercel vs Railway), different domain (nazhahatyai.com).

---

## Table of Contents

| # | Document | Focus |
|---|---|---|
| 01 | [app-overview.md](./01-app-overview.md) | Tech stack, directory layout, entry points, env vars |
| 02 | [pages-routes.md](./02-pages-routes.md) | Page structure, admin vs public vs storefront |
| 03 | [api-routes.md](./03-api-routes.md) | All 80 API endpoints with auth + RBAC |
| 04 | [database.md](./04-database.md) | 29 Prisma models, relations, key indexes |
| 05 | [auth-rbac.md](./05-auth-rbac.md) | next-auth + Facebook Login + role-based access |
| 06 | [storefront-checkout.md](./06-storefront-checkout.md) | Customer flow: shop → cart → checkout → order |
| 07 | [storage-r2.md](./07-storage-r2.md) | Cloudflare R2 image upload + CSP + delete |
| 08 | [i18n-currency.md](./08-i18n-currency.md) | next-intl cookie locale + MYR currency |
| 09 | [components.md](./09-components.md) | UI components, shadcn primitives, feature dirs |
| 10 | [ops-deploy.md](./10-ops-deploy.md) | Vercel deploy, Railway DB, env vars, rollback |
| 13 | [unified-commerce-inbox.md](./13-unified-commerce-inbox.md) | /sale MVP + platform-agnostic inbox foundation (Conversation/ChannelIdentity/Message + Booking) |

(Docs 11-12 reserved for future phases.)

---

## Quick Start by Task

### Feature implementation
01 (stack) → 02 (routes) → 04 (DB) → 03 (API) → 09 (components)

### Bug investigation
03 (API) → 04 (DB) → 05 (auth) → 10 (deploy logs)

### Storefront work
06 (storefront flow) → 03 (storefront APIs) → 07 (R2 images) → 08 (currency)

### Admin work
02 (admin pages) → 05 (RBAC) → 03 (admin APIs) → 04 (DB)

### Schema change
04 (DB) → MAJOR change → invoke `dissent-4-bullet` → migrate → 03 (impacted APIs)

### FB App Review
05 (auth flow) → 07 (CSP for FB SDK) → `/privacy` `/terms` `/data-deletion` pages

---

## Cross-cutting concerns

### Slug resolve (storefront)
All `/api/storefront/[shopId]/**` routes call `resolveShopId()` first to convert slug ("nazha-hatyai") → cuid. See 03 + 06.

### Currency
Hardcoded `RM` (MYR) across UI + email + invoice + CSV export. `defaultCurrency` from branding API also hardcoded MYR. See 08.

### CSP
`next.config.ts` whitelist: `images.nazhahatyai.com` (R2), `connect.facebook.net` (FB SDK), `graph.facebook.com` (FB API). See 07.

### Middleware (`src/proxy.ts`)
Skips `/api/*` (use `requireAuth()` instead). Redirects legacy `/en|/th|/zh/...`. RBAC for page routes only. See 05.

---

## Maintenance

- Update codemap after every shipped feature touching its scope.
- Schema migration → update 04 + impacted route doc.
- New env var → update 01 + 10.
- New dependency → update 01.
- Bug fixes that don't change behavior → no codemap update.

See `MANIFEST.txt` for last-touched dates.
