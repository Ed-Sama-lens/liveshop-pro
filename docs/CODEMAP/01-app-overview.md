# 01 — App Overview

## Tech Stack

| Component | Tech | Version |
|---|---|---|
| Framework | Next.js (App Router + Turbopack) | 16.2.2 |
| Runtime | Node.js | >=20 |
| UI | React | 19.2.4 |
| Language | TypeScript (strict) | 5 |
| ORM | Prisma + `@prisma/adapter-pg` | 7.6.0 |
| Database | PostgreSQL | Railway-managed |
| Auth | next-auth (beta) | 5.0.0-beta.30 |
| Validation | Zod | 4.3.6 |
| Testing | Vitest | 4.1.2 |
| E2E | Playwright | 1.59.1 |
| Styling | Tailwind v4 + shadcn/ui | 4.0 |
| i18n | next-intl (cookie-based) | 4.9 |
| Storage | Cloudflare R2 (`@aws-sdk/client-s3`) | 3.1024 |
| Logger | Pino | 10.3 |
| Real-time | Socket.io | 4.8 |
| Email | Resend | 6.10 |
| Queue | Bull + ioredis | 4.16 / 5.10 |
| Image opt | sharp | (transitive) |
| Rate limit | rate-limiter-flexible | 10.0 |

## Deploy

- **App**: Vercel (auto-deploy on `master` push)
- **DB**: Railway PostgreSQL (`junction.proxy.rlwy.net:18292/railway`)
- **Redis**: Railway Redis (`junction.proxy.rlwy.net:13900`)
- **Storage**: Cloudflare R2 bucket `liveshop-images`, public via `images.nazhahatyai.com`
- **Email routing**: Cloudflare Email Routing (`contact@nazhahatyai.com` → Gmail forward)

## Directory Layout

```
liveshop-pro/
  src/
    app/
      (app)/              Admin UI (auth required) — dashboard, inventory, orders, etc.
      (legal)/            Public legal pages — privacy, terms, data-deletion
      api/                80 API routes (admin + storefront)
      auth/               Login pages
      shop/[shopId]/      Public storefront — cart, checkout, orders
      unauthorized/       403 page
      layout.tsx          Root layout
      page.tsx            Root redirect
    components/
      ui/                 shadcn primitives
      shared/             Sidebar, MobileNav, LanguageSwitcher
      inventory/          ProductForm, VariantForm
      orders/             OrderForm, OrderTable, PaymentSection
      storefront/         StorefrontAuth (FB Login), CurrencySelector
      customers/, chat/, live/, notification/, providers/, shipping/
    lib/
      auth/               session helpers, permissions
      db/                 Prisma client
      shop/               resolve-shop.ts (slug → cuid)
      upload/             storage.ts (R2 client)
      email/              templates (Resend)
      currency/           constants (CURRENCY_SYMBOLS map)
      validation/         Zod schemas + validateBody/validateQuery
      facebook/, errors/, logger/, csv/, export/, env.ts
    server/
      repositories/       19 Prisma repos (one per model area)
      services/           activity, notification, webhook
      queues/, socket/
    i18n/
      routing.ts          locales: en/th/zh, localePrefix: 'never'
      request.ts          reads NEXT_LOCALE cookie
    proxy.ts              middleware (RBAC, locale redirect)
    generated/prisma/     generated Prisma client (gitignored)
  prisma/
    schema.prisma         29 models
    migrations/           SQL migrations
  messages/{en,th,zh}.json  i18n translations
  docs/CODEMAP/           THIS DIR
  scripts/                ops scripts (set-shop-slug.ts, etc.)
  tests/                  Vitest unit + integration
  e2e/                    Playwright (if present)
```

## Entry Points

| File | Purpose |
|---|---|
| `src/proxy.ts` | Middleware — runs before every request (locale redirect, RBAC for page routes, skips `/api/*`) |
| `src/app/layout.tsx` | Root layout, providers, Toaster |
| `src/app/api/auth/[...nextauth]/route.ts` | next-auth handler |
| `src/lib/db/prisma.ts` | Prisma client singleton (uses `PrismaPg` adapter for Edge compat) |
| `src/lib/auth/session.ts` | `requireAuth()` — used in API routes |
| `src/lib/shop/resolve-shop.ts` | slug → cuid resolver |
| `src/lib/upload/storage.ts` | R2 saveFile/deleteFile |

## Env Vars (required)

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel + local | Postgres connection (Railway) |
| `REDIS_URL` | Vercel | Bull queue + rate limit |
| `NEXTAUTH_URL` | Vercel | next-auth callback base |
| `NEXTAUTH_SECRET` | Vercel | JWT sign |
| `FACEBOOK_APP_ID` | Vercel | FB Login (storefront) |
| `FACEBOOK_APP_SECRET` | Vercel | FB token exchange |
| `R2_ACCOUNT_ID` | Vercel | Cloudflare account |
| `R2_ACCESS_KEY_ID` | Vercel | R2 API key |
| `R2_SECRET_ACCESS_KEY` | Vercel | R2 API secret |
| `R2_BUCKET_NAME` | Vercel | `liveshop-images` |
| `R2_PUBLIC_URL` | Vercel | `https://images.nazhahatyai.com` |
| `RESEND_API_KEY` | Vercel | Email send |
| `APP_AUTH_TOKEN` | Vercel | Admin auth fallback |

## Build / Test Scripts

```
npm run dev           Next dev server
npm run build         prisma generate && next build  (Turbopack)
npm run test          vitest run
npm run test:watch    vitest watch
npm run test:e2e      playwright test
npm run db:migrate    prisma migrate dev
npm run db:push       prisma db push (DEV ONLY)
npm run db:studio     prisma studio
```

## Critical Constraints

- **Vercel serverless = read-only FS.** No `fs.writeFile` to local paths. Use R2 for uploads.
- **next-intl `localePrefix: 'never'`** — locale via `NEXT_LOCALE` cookie. No `[locale]` route segment.
- **Prisma client output** → `src/generated/prisma/` (gitignored, regenerated on `postinstall`).
- **Turbopack** is default for `next build` in Next.js 16. `--no-turbopack` flag is INVALID.
