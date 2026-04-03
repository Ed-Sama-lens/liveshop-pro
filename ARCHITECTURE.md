# Architecture: LiveShop Pro

## Folder Structure

```
src/
├── app/                    # Next.js App Router pages and layouts
│   ├── (app)/              # Authenticated route group (requires session)
│   ├── auth/               # Public auth pages (sign-in, error)
│   ├── api/                # API routes and webhooks
│   └── unauthorized/       # RBAC access denied page
├── components/
│   ├── ui/                 # shadcn/ui primitives (DO NOT modify manually)
│   └── shared/             # App-wide shared components (Sidebar, Header, etc.)
├── lib/
│   ├── api/                # API response helpers (ApiResponse<T>)
│   ├── auth/               # NextAuth config, session helpers, RBAC permissions
│   ├── crypto/             # Encryption utilities (AES-256-GCM)
│   ├── db/                 # Database clients (Prisma, Redis, Bull queues, RLS)
│   ├── errors/             # AppError hierarchy and sanitization
│   ├── logging/            # pino structured logger
│   └── validation/         # Zod middleware (body, query, rate limit, CORS)
├── i18n/                   # next-intl config (routing, request)
├── server/
│   ├── socket/             # Socket.IO server singleton and room helpers
│   └── queues/             # Bull queue processors and job type contracts
└── types/                  # Shared TypeScript types
```

## Conventions

### Adding New Features (Phase 2+)

1. **Pages**: Create under `src/app/(app)/[feature]/page.tsx`
2. **API Routes**: Create under `src/app/api/[feature]/route.ts`
3. **Components**: Feature-specific → `src/components/[feature]/`, shared → `src/components/shared/`
4. **Business Logic**: Create `src/lib/[feature]/` with clear exports
5. **Tests**: Mirror source structure under `tests/` (e.g., `tests/unit/lib/[feature]/`)

### Import Rules

- Always import from `@/lib/env` for environment variables — NEVER use `process.env` directly
- Always use `logger` from `@/lib/logging/logger` — NEVER use `console.log` in production code
- Always return `ApiResponse<T>` from API routes using `ok()`, `error()`, `paginated()`
- Always use `toAppError()` to sanitize errors before returning to clients

### Multi-Tenancy

- Every shop-scoped table has a `shopId` column
- Prisma middleware rejects writes missing `shopId` on shop-scoped models
- PostgreSQL RLS provides defense-in-depth at the database level
- Socket.IO rooms are scoped as `shop:{shopId}` — emitToRoom() never broadcasts globally

### Security

- Security headers set in `next.config.ts` on all responses
- Rate limiting on auth endpoints via `withRateLimit()`
- CORS configured to specific origin — never wildcard
- Facebook tokens encrypted at rest with AES-256-GCM
- JWT maxAge = 24 hours (reduced from default 30 days)
- Input validation via Zod on all API request bodies

### Immutability

- All `ApiResponse<T>` objects are frozen with `Object.freeze()`
- RBAC pure functions return new objects — never mutate source data
- Session callbacks in NextAuth return new objects
