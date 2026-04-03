# Phase 1: Foundation & Infrastructure — Plan Index

**Phase goal:** Project scaffolding, database schema, authentication, and base UI layout.
**Requirements covered:** R1.1, R1.2, R1.4, R10.1, NF1, NF2, NF6, NF7, NF8
**Total plans:** 8
**Execution waves:** 4
**Replanned:** 2026-04-03 (post cross-AI review — addresses security P0/P1/P2 and architecture P1/P2 findings)

---

## Changes from Cross-AI Review

| Review Concern | Priority | Added To |
|----------------|----------|----------|
| Environment validation (Zod `src/lib/env.ts`) | P0 | PLAN-01 Task 2 |
| API response envelope `ApiResponse<T>` | P1 | PLAN-01 Task 3 |
| Structured error classes + JSON logger | P1 | PLAN-01 Task 3 |
| Security headers in `next.config.ts` | P1 | PLAN-01 Task 1 |
| Socket.IO server singleton + room pattern | P1 | PLAN-01 Task 4 |
| ARCHITECTURE.md folder conventions | P2 | PLAN-01 Task 4 |
| PostgreSQL RLS policies + Prisma middleware | P0 | PLAN-02 Task 3 |
| Bull queue initialization (4 queues) | P1 | PLAN-02 Task 3 |
| Facebook token encryption at rest | P2 | PLAN-02 Task 3 |
| LoginEvent model (session audit) | P2 | PLAN-02 Task 1 |
| Shop membership validation in session | P0 | PLAN-03 Task 2 |
| Rate limiting on auth endpoints | P1 | PLAN-03 Task 3 |
| CORS configuration (specific origin) | P2 | PLAN-03 Task 3 |
| Input validation Zod middleware | P0 | PLAN-03 Task 3 |
| JWT 24h maxAge (reduced from 30d) | P2 | PLAN-03 Task 1 |
| Socket.IO room isolation tests | P1 | PLAN-08 Task 1 |
| Room helper module (shopRoom/isValidRoom) | P1 | PLAN-08 Task 1 |
| Bull queue typed job contracts | P1 | PLAN-08 Task 2 |
| Expanded test suite (10 test files) | — | PLAN-07 Task 1 |

---

## Wave Structure

```
Wave 1 (semi-parallel: PLAN-01 Tasks 1-3 first, then PLAN-02 Tasks 2-3 can start)
  ├── 01-PLAN-01.md — Scaffold + lib infrastructure (env, errors, API envelope, Socket.IO, security headers)
  └── 01-PLAN-02.md — DB schema + migrations + Bull queues + RLS + token encryption
  NOTE: PLAN-02 Task 1 (schema only) can run parallel with PLAN-01.
        PLAN-02 Tasks 2-3 import from src/lib/env.ts and src/lib/logging/logger.ts
        created by PLAN-01 Tasks 2-3. Execute PLAN-01 first or run Task 1 in parallel only.

Wave 2 (parallel, after Wave 1)
  ├── 01-PLAN-03.md — NextAuth.js + Facebook OAuth + rate limiting + CORS + Zod middleware
  └── 01-PLAN-05.md — Sidebar, Header, responsive shell

Wave 3 (sequential: PLAN-04 first, then PLAN-06)
  ├── 01-PLAN-04.md — RBAC middleware + route protection
  └── 01-PLAN-06.md — Dark mode + i18n (Thai + English + Chinese)  [depends on PLAN-04 — both modify middleware.ts]

Wave 4 (parallel, after Wave 3)
  ├── 01-PLAN-07.md — Full test suite (auth + RBAC + all lib modules) + CI/CD pipeline
  └── 01-PLAN-08.md — Real-time infrastructure tests (Socket.IO + room helpers + queue contracts)
```

---

## Plans in Execution Order

| # | Plan File | Title | Dependencies | Wave |
|---|-----------|-------|-------------|------|
| 1 | [01-PLAN-01.md](./01-PLAN-01.md) | Project Scaffold + Core Lib Infrastructure | None | 1 |
| 2 | [01-PLAN-02.md](./01-PLAN-02.md) | Database Schema + Bull Queues + RLS + Encryption | None | 1 |
| 3 | [01-PLAN-03.md](./01-PLAN-03.md) | NextAuth.js + Facebook OAuth + Rate Limiting + Validation | PLAN-01, PLAN-02 | 2 |
| 4 | [01-PLAN-05.md](./01-PLAN-05.md) | Base Layout — Sidebar, Header, Responsive Shell | PLAN-01 | 2 |
| 5 | [01-PLAN-04.md](./01-PLAN-04.md) | RBAC — Middleware + Route Protection | PLAN-03 | 3 |
| 6 | [01-PLAN-06.md](./01-PLAN-06.md) | Dark Mode + i18n (Thai + English + Chinese) | PLAN-01, PLAN-04, PLAN-05 | 3 |
| 7 | [01-PLAN-07.md](./01-PLAN-07.md) | Full Test Suite + CI/CD Pipeline | PLAN-03, PLAN-04 | 4 |
| 8 | [01-PLAN-08.md](./01-PLAN-08.md) | Real-Time Infrastructure Tests + Queue Contracts | PLAN-01, PLAN-02 | 4 |

---

## Dependency Graph

```
PLAN-01 (scaffold + lib infra) ────────────────────┬──────────> PLAN-03 (auth + rate limiting) ──> PLAN-04 (RBAC) ──> PLAN-07 (tests + CI)
                                                    │
PLAN-02 (database + queues + RLS) ─────────────────┘

PLAN-01 (scaffold) ─────────────────────────────────┬──────────> PLAN-05 (layout) ─┐
                                                                                     └──> PLAN-06 (dark mode + i18n)

PLAN-01 ──────────────────────────────────────────────────────────────────────────────────────────> PLAN-08 (RT tests)
PLAN-02 ──────────────────────────────────────────────────────────────────────────────────────────> PLAN-08 (RT tests)
```

---

## Key Decisions (from STATE.md)

| Decision | Plan(s) |
|----------|---------|
| Next.js 16 + React 19 | PLAN-01 |
| PostgreSQL + Prisma ORM | PLAN-02 |
| NextAuth.js with Facebook OAuth | PLAN-03 |
| shadcn/ui for components | PLAN-01, PLAN-05 |
| Vitest for testing | PLAN-01, PLAN-07, PLAN-08 |
| Zod for env + input validation | PLAN-01, PLAN-03 |
| Bull for job queues | PLAN-02, PLAN-08 |
| Socket.IO 4.8+ for real-time | PLAN-01, PLAN-08 |
| PostgreSQL RLS for multi-tenancy | PLAN-02 |
| pino for structured logging | PLAN-01 |
| rate-limiter-flexible for rate limiting | PLAN-03 |

---

## Phase Success Criteria

- [ ] User can log in with Facebook OAuth → PLAN-03
- [ ] Role-based access restricts pages per role → PLAN-04
- [ ] Database migrations run cleanly → PLAN-02
- [ ] Base layout renders on mobile and desktop → PLAN-05
- [ ] Dark mode works across all base components → PLAN-06
- [ ] 80%+ test coverage on auth, RBAC, and all security utilities → PLAN-07
- [ ] Missing env vars crash with clear Zod error at startup → PLAN-01
- [ ] All API responses use ApiResponse<T> envelope → PLAN-01
- [ ] Rate limiting blocks >20 auth req/15min per IP → PLAN-03
- [ ] CORS headers set to specific origin, never wildcard → PLAN-03
- [ ] PostgreSQL RLS prevents cross-shop data access → PLAN-02
- [ ] Bull queues initialize and accept typed jobs → PLAN-02, PLAN-08
- [ ] Socket.IO server starts and accepts shop-scoped connections → PLAN-01, PLAN-08
- [ ] Security headers present on all responses → PLAN-01
- [ ] emitToRoom never broadcasts globally (shop isolation) → PLAN-08
- [ ] Facebook tokens stored encrypted (AES-256-GCM) → PLAN-02
- [ ] LoginEvent written on each successful sign-in → PLAN-03
- [ ] Shop membership validated before shop-scoped access → PLAN-03
- [ ] i18n works for Thai, English, and Chinese → PLAN-06
- [ ] CUSTOMER role exists but cannot access admin routes → PLAN-04
- [ ] /store/* is public (storefront accessible without login) → PLAN-04
- [ ] Storefront schema models (StorefrontProduct, Cart, CartItem, ShopBranding) migrate cleanly → PLAN-02

---

## Environment Variables Required

All must exist in `.env.local` before running. See `.env.example` (created in PLAN-01).

```
DATABASE_URL              — PostgreSQL connection string
REDIS_URL                 — Redis connection string
NEXTAUTH_URL              — App base URL
NEXTAUTH_SECRET           — Random secret (openssl rand -base64 32, min 32 chars)
FACEBOOK_CLIENT_ID        — From Facebook Developer Console
FACEBOOK_CLIENT_SECRET    — From Facebook Developer Console
FACEBOOK_APP_ID           — From Facebook Developer Console (optional at startup)
FACEBOOK_APP_SECRET       — From Facebook Developer Console (optional at startup)
FACEBOOK_WEBHOOK_VERIFY_TOKEN — Random string for webhook verification (optional)
TOKEN_ENCRYPTION_KEY      — 32-byte hex for AES-256 encryption (openssl rand -hex 32)
NEXT_PUBLIC_APP_URL       — Public app URL (used in CORS headers)
RATE_LIMIT_MAX            — Max auth requests per window (default: 20)
RATE_LIMIT_WINDOW_MS      — Window in ms (default: 900000 = 15min)
```

---

## File Ownership by Plan

| Plan | Files Created / Modified |
|------|--------------------------|
| PLAN-01 | `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `tests/setup.ts`, `.env.example`, `.gitignore`, `ARCHITECTURE.md`, `src/app/layout.tsx`, `src/lib/utils.ts`, `src/lib/env.ts`, `src/lib/api/response.ts`, `src/lib/errors/index.ts`, `src/lib/logging/logger.ts`, `src/server/socket/index.ts`, `components.json`, all `src/components/ui/*` (shadcn) |
| PLAN-02 | `prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/db/prisma.ts`, `src/lib/db/redis.ts`, `src/lib/db/queues.ts`, `src/lib/db/rls.ts`, `src/lib/crypto/token.ts` |
| PLAN-03 | `src/lib/auth/auth.ts`, `src/lib/auth/types.ts`, `src/lib/auth/session.ts`, `src/lib/auth/index.ts`, `src/lib/validation/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/auth/sign-in/page.tsx`, `src/app/auth/error/page.tsx`, `src/components/shared/FacebookSignInButton.tsx` |
| PLAN-04 | `src/lib/auth/permissions.ts`, `src/middleware.ts`, `src/app/unauthorized/page.tsx` |
| PLAN-05 | `src/types/navigation.ts`, `src/components/shared/Sidebar.tsx`, `src/components/shared/SidebarItem.tsx`, `src/components/shared/SidebarNav.tsx`, `src/components/shared/Header.tsx`, `src/components/shared/MobileNav.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx` |
| PLAN-06 | `src/components/shared/ThemeProvider.tsx`, `src/components/shared/ThemeToggle.tsx`, `src/components/shared/LanguageSwitcher.tsx`, `messages/en.json`, `messages/th.json`, `messages/zh.json`, `src/i18n/routing.ts`, `src/i18n/request.ts`, `next.config.ts` (update), `src/middleware.ts` (update), `src/app/layout.tsx` (update) |
| PLAN-07 | `tests/unit/lib/auth/session.test.ts`, `tests/unit/lib/auth/permissions.test.ts`, `tests/unit/lib/auth/auth.test.ts`, `tests/unit/lib/env.test.ts`, `tests/unit/lib/api/response.test.ts`, `tests/unit/lib/errors/index.test.ts`, `tests/unit/lib/crypto/token.test.ts`, `tests/unit/lib/db/queues.test.ts`, `tests/unit/lib/db/rls.test.ts`, `tests/unit/lib/validation/middleware.test.ts`, `tests/integration/auth/middleware.test.ts`, `tests/integration/i18n/middleware-locale.test.ts`, `.github/workflows/ci.yml` |
| PLAN-08 | `tests/unit/server/socket/index.test.ts`, `tests/unit/server/queues/processors.test.ts`, `src/server/socket/rooms.ts`, `src/server/queues/processors.ts` |
