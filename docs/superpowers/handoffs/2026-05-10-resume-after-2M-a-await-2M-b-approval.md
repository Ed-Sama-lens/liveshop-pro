# LiveShop Pro — Session Handoff (2026-05-10)

**Project: liveshop-pro ONLY.** This handoff covers no other project. If you ever see references to pak-ta-kra or any other repo, ignore them — this session is liveshop-pro exclusive.

---

## Section 1 — Where to start (read me first when session opens)

You are continuing the `/sale` Live Commerce admin work for liveshop-pro. The last shipped commit is **`a74185b`** (Commit 2M-a refactor). The next planned commit is **2M-b** which adds `bookingRepository.createManual()` runtime.

**DO NOT START 2M-b CODE YET.** Boss + ChatGPT must review the 2M-a report from the prior session before you proceed. When the new session opens:

1. Read this handoff file end-to-end.
2. Verify boundary state with this exact command sequence:
   ```bash
   cd /c/Users/Asus/COWORK/code/liveshop-pro
   pwd
   git remote -v | head -1
   git branch --show-current
   git log -1 --oneline
   git status --short
   ```
   Expected: `/c/Users/Asus/COWORK/code/liveshop-pro`, master, `a74185b refactor(sale): extract booking confirm transaction helper (Commit 2M-a)`, working tree clean (no `M` / `??` lines).
3. Reply to Boss with: "Resumed liveshop-pro session at `a74185b`. Working tree clean. Awaiting Boss/ChatGPT verdict on Commit 2M-a + GO on Commit 2M-b runtime."
4. Wait for Boss/ChatGPT verdict before any file edits.

---

## Section 2 — Hard rules / safety boundaries

### Project isolation (R0)

- **liveshop-pro ONLY.** Never edit, read-modify, delete, move, or stage any file outside `C:/Users/Asus/COWORK/code/liveshop-pro/`.
- Never reference, import from, copy patterns from, or coordinate with any other project unless Boss explicitly names it in this session.
- Verify isolation at every boundary check by confirming `pwd` shows `/c/Users/Asus/COWORK/code/liveshop-pro`.

### Pak-ta-kra zero-touch contract

If pak-ta-kra exists as a sibling folder, you MUST NOT:
- Read its files
- Modify any of its files
- Stage / commit / push to its repo
- Reference its conventions, codemap, dissent docs, brand DNA, sentinels, providers, or any pak-ta-kra-specific concepts in liveshop-pro work

If anything in this session prompts you to look at pak-ta-kra: STOP and ask Boss.

### Operational rules (always)

- **Use Caveman mode**: drop articles, filler, pleasantries, hedging. Fragments OK. Code / commits / security messages: write in full sentences. Boss can disable with "stop caveman" or "normal mode".
- **No console.log** in production code; use `clientLogger` (browser) or `pino` (server) instead. ESLint rule enforces this.
- **No production database** access except via Boss-driven `prisma migrate deploy` from a local terminal Boss controls.
- **No production booking/order/payment data mutations.** Smoke must use unauthenticated probes only.
- **No customer-facing message auto-send** (Messenger, WhatsApp, Telegram, email) without explicit Boss approval.

---

## Section 3 — Boss / ChatGPT cadence (how decisions get made)

Every commit follows this loop:

1. Claude (this AI) inspects code or writes plan.
2. Claude proposes commit and shares structured report.
3. Boss + ChatGPT review and lock decisions.
4. Claude writes minimal code per locked decisions.
5. Claude verifies (`tsc`, `vitest`, local Docker E2E if applicable, production smoke after Vercel auto-deploy).
6. Claude reports back. Boss + ChatGPT verify.
7. Next commit only after explicit GO.

**Never skip Boss approval.** When in doubt, file a STOP and ask. Existing dissent docs in `docs/superpowers/` capture locked decisions; never re-debate them.

When you draft reports, ALWAYS append a brief `## Brief for ChatGPT` section with consultation items (CC1, CD1, CN1 etc) — Boss explicitly wants you to proactively raise concerns and proposals you think might improve the work.

---

## Section 4 — Project identity

| Field | Value |
|---|---|
| Name | LiveShop Pro |
| Domain | https://nazhahatyai.com |
| Repo | github.com/Ed-Sama-lens/liveshop-pro |
| Owner | Solo dev "Boss" (Edsama) |
| Customer | Nazha Hatyai shop (Master Nivest 合艾哪吒三太子 FB page) |
| Branch model | Single `master` (no feat/* yet) |
| Currency | MYR (RM) hardcoded; NO THB / `฿` allowed in customer-facing output |
| i18n customer-facing | zh default, en, th (3 locales) |
| i18n admin-facing | th default, en secondary |

---

## Section 5 — Stack

- Next.js 16.2.2 + Turbopack (default `next build`; do NOT add `--no-turbopack` flag)
- React 19.2.4
- TypeScript 5 strict
- Prisma 7.6.0 + `@prisma/adapter-pg`
- PostgreSQL via Railway (production), local Docker for dev/E2E
- next-auth 5.0.0-beta.30 (admin)
- Facebook Login App ID `780277861568430` (storefront customer)
- Cloudflare R2 via `@aws-sdk/client-s3`
- Zod 4.3.6
- Vitest 4.1.2 + Playwright 1.59.1 (configured)
- Tailwind v4 + shadcn/ui + lucide-react
- next-intl 4.9 (cookie-based, `localePrefix: 'never'`)
- Resend 6.10 (email)
- Cloudflare Email Routing (`contact@nazhahatyai.com` → Gmail)
- Socket.io 4.8 + SSE for real-time admin features
- Bull 4.16 + ioredis 5.10 (Redis on Railway, queue not yet wired)
- Pino 10.3 logger (server)
- sharp (image optimization)
- rate-limiter-flexible (defined but not yet wired to routes)

---

## Section 6 — Infra & deploy

| Service | Vendor | Purpose |
|---|---|---|
| App | Vercel | Auto-deploy on `master` push |
| Database | Railway | PostgreSQL — connection via `<RAILWAY_DATABASE_URL>` env. Credential rotated 2026-05-09. |
| Redis | Railway | Connection via `<RAILWAY_REDIS_URL>` env |
| Storage | Cloudflare R2 | Bucket `liveshop-images`, public via `images.nazhahatyai.com` |
| DNS | Cloudflare | nazhahatyai.com |
| Email send | Resend | Order confirmations, slip notifications |
| Email receive | Cloudflare Email Routing | `contact@nazhahatyai.com` → Gmail |

**DB credential rotation 2026-05-09**: Railway Postgres password was exposed in chat once and rotated via `ALTER USER postgres WITH PASSWORD '<new>'` directly on the DB engine + sync to Railway `POSTGRES_PASSWORD` variable + Vercel `DATABASE_URL` env var. Lesson: editing Railway's `POSTGRES_PASSWORD` env var alone does NOT change the DB password (init-only). Use ALTER USER if rotating again.

**Vercel env vars** (do NOT paste values back to chat — they live in Vercel dashboard only): `DATABASE_URL` `REDIS_URL` `NEXTAUTH_URL` `NEXTAUTH_SECRET` `FACEBOOK_APP_ID` `FACEBOOK_APP_SECRET` `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET_NAME` `R2_PUBLIC_URL` `RESEND_API_KEY` `APP_AUTH_TOKEN`.

---

## Section 7 — Codebase shape

- **API routes**: 84 (after Commit 2I added `/api/sale/orders/from-bookings`)
- **Prisma models**: 36 (29 production + 7 from Commit 1 inbox/sale schema)
- **Repositories**: 20 in `src/server/repositories/`
- **Services**: 3 in `src/server/services/` (activity, notification, webhook outbound)
- **Pages**: admin `(app)/*`, public `(legal)/*`, storefront `shop/[shopId]/*`, auth `auth/*`
- **Hooks**: 3 in `src/hooks/` (useChatStream, useDebounce, useNotificationStream — tests now committed in CLEANUP-1A)
- **R2 storage**: image uploads at `images.nazhahatyai.com` via `saveFile()` helper
- **CSP**: locked down in `next.config.ts` (allows R2 + Facebook SDK)

### Codemap

`docs/CODEMAP/` has 11 docs (numbered):
- 01 app-overview
- 02 pages-routes
- 03 api-routes
- 04 database
- 05 auth-rbac
- 06 storefront-checkout
- 07 storage-r2
- 08 i18n-currency
- 09 components
- 10 ops-deploy
- 13 unified-commerce-inbox

Read those when you need to ground claims about the codebase.

### Dissent docs (binding decisions)

In `docs/superpowers/`:
- `2026-04-06-sale-mvp-dissent.md` — Initial /sale dissent + 18 Boss locks (Commit 0)
- `2026-05-09-sale-booking-runtime-design.md` — Confirm/cancel runtime design (Commit 2A)
- `2026-05-09-booking-to-order-conversion-dissent.md` — Convert-to-order locks (Commit 2G)
- `2026-05-09-manual-booking-create-dissent.md` — Manual booking create locks (Commit 2K)

When in doubt about /sale design, read these. They contain locked answers to Q1–Q15 + CC / CD / CN consultation items.

---

## Section 8 — Engineering rules (`liveshop-pro/CLAUDE.md`)

5 hard rules from `CLAUDE.md`:

1. **NO MAGIC** — verify before assert. Prefix unverified claims with `ASSUMPTION:`. Verify infra existence before claiming. Read source / Context7 before assuming library behavior.
2. **VERIFY BEFORE DONE** — banned phrases: "should work now", "this is correct", "fixed". Replace with evidence: "tsc clean (ran)", "X/Y tests pass (paste)", "verified by reading file:line". Min verification per change scope:
   - <20 lines: `npx tsc --noEmit`
   - Logic change: `npm run test -- <file>` pass
   - Schema/auth/payment/R2/CSP: full `npm run test` + tsc + manual probe
   - Vercel deploy: wait for **Ready**, hit nazhahatyai.com
3. **DISSENT (4 bullets BEFORE first edit on MAJOR)** — MAJOR triggers: Prisma schema change/migration, auth boundary, public API contract, payment/order/commerce policy, R2/storage path/CSP header, >3 files OR >200 LOC, currency/pricing logic. 4 bullets: blast radius / assumptions / reversibility / blind spots. Skip dissent: <50 lines single file, comment, typo, internal helper, test, doc, formatting.
4. **SCOPE DRIFT GUARD** — flag silent expansion ("while I'm here"). Bug fix → refactor = STOP. Boss asked X, doing X+Y+Z = STOP and ask.
5. **R0/R1/R2 REVERSIBILITY**:
   - R0 = irreversible, STOP and ASK FIRST. Examples: `git push --force` to master, `prisma migrate reset`, `DROP TABLE`, `DELETE` without WHERE, rotate/delete secrets, R2 mass delete, prod data deletion, charge customer card, mass email, Vercel deploy with failing tests, FB live-mode toggle.
   - R1 = costly to reverse, DO + explain. Examples: Prisma migration auto-apply, public API route signature, CSP header, currency logic, env var rename.
   - R2 = cheap reverse, JUST DO. Examples: comment, docstring, internal helper refactor, test, codemap entry, lint/log line.

---

## Section 9 — Skill routing (project-specific high-risk paths)

When editing these paths, invoke skills before code:

| Path / concept | Required skills |
|---|---|
| `src/app/api/products/[id]/images/**` | dissent-4-bullet, security-and-hardening, verification-before-completion |
| `src/lib/upload/storage.ts` (R2) | security-and-hardening, verification-before-completion |
| `src/app/api/auth/**` / `src/lib/auth/**` | dissent-4-bullet, security-and-hardening |
| `src/app/api/storefront/[shopId]/**` | api-and-interface-design, security-and-hardening (slug resolve required) |
| `src/app/shop/[shopId]/checkout/**` | dissent-4-bullet, security-and-hardening, verification-before-completion |
| `prisma/schema.prisma` | dissent-4-bullet, database-migrations |
| `src/proxy.ts` (middleware) | dissent-4-bullet, security-and-hardening |
| `next.config.ts` (CSP / images) | dissent-4-bullet, security-and-hardening |
| `src/server/repositories/booking.repository.ts` | dissent-4-bullet, verification-before-completion (touches stock) |
| `src/server/repositories/order.repository.ts` (transition) | DO NOT modify in /sale work |
| `src/server/repositories/checkout.repository.ts` | DO NOT modify (race-prone but separate hardening dissent later) |

---

## Section 10 — `/sale` roadmap status

### Shipped (in commit order)

| Commit | Hash | Title |
|---|---|---|
| 0 | `a1c9a86` | docs(sale): /sale MVP dissent doc |
| 1 | `bb8b973` | feat(db): Unified Commerce Inbox + /sale MVP schema (additive) |
| 1.1 | `67415d5` | docs(security): redact Railway host/port |
| 2A | `7b7f7b6` | docs(sale): booking runtime design |
| 2B | `689a83a` | feat(sale): booking reservation runtime foundation |
| 2B-AUDIT-001 | `552562a` | fix(sale): reject invalid booking reservation integrity states |
| 2C | `3bf2315` | docs(codemap): Unified Commerce Inbox architecture note |
| 2D | `0c84026` | test(sale): non-production booking flow verification script |
| 2D-AUDIT | `3a58db6` | test(sale): harden booking flow verification script |
| 2D-FIX | `6681e0d` | fix(errors): allow AppError subclasses to initialize safely |
| 2E | `90ff382` | feat(sale): /api/sale/bookings confirm/cancel route layer |
| 2F | `c707391` | test(auth): /sale route permissions + align route tests |
| 2G | `9e1a2f9` | docs(sale): booking → order conversion dissent |
| 2H | `afdd41d` | feat(sale): bookingRepository.convertToOrder() runtime |
| 2I | `3e72e30` | feat(sale): POST /api/sale/orders/from-bookings route |
| 2K | `6e30ceb` | docs(sale): manual booking create dissent |
| CLEANUP-1A | `50d9f1c` | test(hooks): missing hook unit tests |
| CLEANUP-1B | `890a7ce` | feat(observability): client error boundaries + global error capture |
| **2M-a** | **`a74185b`** | **refactor(sale): extract booking confirm transaction helper** |

### Next (BLOCKED until Boss + ChatGPT GO)

- **2M-b** — `bookingRepository.createManual()` runtime + tests + verify-booking-create.ts
- 2N — POST /api/sale/bookings route layer
- 2L — thin /sale UI shell
- 2O — /sale code grid + booking management UI
- Phase 2: manual /inbox UI
- Phase 3: Meta inbound webhook + signature verify
- Phase 4: FB Live/Post comments parser + review queue
- Phase 5: WhatsApp Cloud API
- Phase 6: Telegram Bot
- Future hardening: storefront checkout race fix (separate dissent), `Customer.locale` schema, MessageTemplate model

### Locked Phase boundaries

- **No customer-facing auto-send** in any phase until human-preview-required adapter exists.
- **No platform integration code** until Phase 3+ dissent docs ship per integration.
- **No webhook receivers** built; inbound platform messages must wait for HMAC SHA256 + raw-body signature verify implementation per dissent §14 in 2026-04-06 file.
- **No parser** until Phase 4 dissent.

---

## Section 11 — Critical contracts (must preserve)

### Stock invariant

`reservedQty` is incremented exactly once per stock unit committed and decremented exactly once when commitment ends.

- Booking confirm: `reservedQty +=` via atomic `$executeRaw` UPDATE with `WHERE quantity - reservedQty >= ?` predicate
- Booking cancel/expire (CONFIRMED → CANCELLED/EXPIRED): `reservedQty -=` via atomic UPDATE with `WHERE reservedQty >= ?` guard
- Booking convert-to-order: `reservedQty` UNCHANGED (existing reservation row gains `orderId`)
- Order RESERVED → CONFIRMED: existing `orderRepository.transition()` decrements both `quantity` and `reservedQty` exactly once

**Never decrement `quantity` outside `orderRepository.transition()`.** Never re-increment `reservedQty` during conversion.

### Idempotency contracts

- **Booking confirm**: re-call on already-CONFIRMED booking with matching active StockReservation = no-op success; mismatch = `RESERVATION_INTEGRITY_ERROR`
- **Booking cancel**: re-call on already-target-terminal = no-op success; cross-terminal flip CANCELLED ↔ EXPIRED = `BOOKING_INVALID_STATUS`; CONVERTED_TO_ORDER cancel = `BOOKING_INVALID_STATUS`
- **Convert-to-order**: deterministic key `sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}`. Explicit-bookingIds path does early lookup before preflight (added in Commit 2I repo adjustment)
- **Manual booking create (Commit 2M-b future)**: optional `idempotencyKey` regex `/^[A-Za-z0-9_-]{8,128}$/`, scoped via `@@unique([shopId, idempotencyKey])`

### `Booking.unitPrice` contract (CN3 / CC11)

When manual booking create lands (2M-b), it MUST capture:
```
Booking.unitPrice = BroadcastProduct.priceOverride ?? ProductVariant.price
```
at creation time. Conversion (already shipped) reads `Booking.unitPrice` directly. Future booking-creation paths (parser, etc) MUST follow same rule.

### Helper contract: `_runConfirmInTx` (added in Commit 2M-a)

`_runConfirmInTx(tx: Prisma.TransactionClient, input: ConfirmBookingInput)` is a private file-scope helper in `src/server/repositories/booking.repository.ts`. Receives an existing transaction client. MUST NOT call `prisma.$transaction()` internally.

`bookingRepository.confirm()` is a thin wrapper opening its own transaction. `bookingRepository.createManual()` (Commit 2M-b future) will reuse `_runConfirmInTx` inline within its own transaction when admin requests `status: 'CONFIRMED'` on create.

### Error class fix (Commit 2D-FIX `6681e0d`)

`AppError` subclasses (NotFoundError, ConflictError, ValidationError, AuthError, ForbiddenError, RateLimitError) work correctly. `AppError` constructor sets `name` from `new.target.name`, sets prototype via `Object.setPrototypeOf`, and does NOT freeze the instance. Production error mapping returns correct 4xx codes.

---

## Section 12 — Verification protocols

### Standard verification (every commit)

```bash
npx prisma generate
npx tsc --noEmit                          # must show 0 NEW errors
                                          # known pre-existing: 2 errors in tests/unit/server/socket/index.test.ts
                                          # commit 62b2824 — DO NOT FIX in /sale work
npx vitest run tests/unit/lib/sale/booking-rules.test.ts  # 82/82 pass
npx vitest run                            # full suite 602/602 pass / 0 fail
```

### Local Docker E2E (when /sale runtime touched)

```bash
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_FLOW_RUN_ID="$(date +%Y%m%d-%H%M%S)" \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx -y tsx scripts/verify-booking-flow.ts            # 9/9 PASS

CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_FLOW_RUN_ID="$(date +%Y%m%d-%H%M%S)" \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx -y tsx scripts/verify-booking-conversion.ts      # 8/8 PASS

# Future: scripts/verify-booking-create.ts (Commit 2M-b)

docker compose down                       # always clean up
```

The script has 8 production safety guards (CONFIRM_NON_PROD_DB env, host/port/db-name allowlist, prod host deny list, runId regex). If guards fail, exit 2.

### Production smoke (after Vercel auto-deploy)

```bash
curl -sIL -o /dev/null -w "/ HTTP=%{http_code}\n" https://nazhahatyai.com/                    # 200 (after redirect)
curl -sI -o /dev/null -w "/auth/sign-in HTTP=%{http_code}\n" https://nazhahatyai.com/auth/sign-in    # 200
curl -sI -o /dev/null -w "/shop/nazha-hatyai HTTP=%{http_code}\n" https://nazhahatyai.com/shop/nazha-hatyai  # 200
curl -s -o /dev/null -w "/api/storefront/nazha-hatyai/products HTTP=%{http_code}\n" https://nazhahatyai.com/api/storefront/nazha-hatyai/products  # 200
curl -s -o /dev/null -w "/api/storefront/nazha-hatyai/branding HTTP=%{http_code}\n" https://nazhahatyai.com/api/storefront/nazha-hatyai/branding  # 200
curl -sI -o /dev/null -w "/privacy HTTP=%{http_code}\n" https://nazhahatyai.com/privacy        # 200
curl -sI -o /dev/null -w "/sale HTTP=%{http_code}\n" https://nazhahatyai.com/sale              # 307 → /auth/sign-in
curl -s -o /dev/null -w "POST /api/sale/bookings/<bogus>/confirm HTTP=%{http_code}\n" -X POST https://nazhahatyai.com/api/sale/bookings/bogus/confirm    # 401
curl -s -o /dev/null -w "POST /api/sale/orders/from-bookings HTTP=%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{}' https://nazhahatyai.com/api/sale/orders/from-bookings  # 401
```

**Never call sale routes with authenticated session in production.** No real booking IDs, no real customer IDs.

---

## Section 13 — Last verification before this handoff

| Check | Result |
|---|---|
| `git log -1 --oneline` | `a74185b refactor(sale): extract booking confirm transaction helper (Commit 2M-a)` |
| `git status --short` | empty (clean working tree) |
| `git remote -v | head -1` | `origin https://github.com/Ed-Sama-lens/liveshop-pro.git (fetch)` |
| `git branch --show-current` | `master` |
| `npx tsc --noEmit` | 0 new errors. 2 pre-existing socket test errors only. |
| `npx vitest run` | 602/602 pass / 0 fail |
| Local Docker E2E `verify-booking-flow.ts` | 9/9 PASS |
| Local Docker E2E `verify-booking-conversion.ts` | 8/8 PASS |
| Production smoke 6 baseline endpoints | all HTTP 200 |
| Sale auth gates (3 routes) | all 401 |

---

## Section 14 — Commit 2M-b spec (NEXT, BLOCKED until GO)

When Boss + ChatGPT GO on 2M-b, scope is locked from `docs/superpowers/2026-05-09-manual-booking-create-dissent.md`:

### Allowed files
- `src/server/repositories/booking.repository.ts` (extend with `createManual` method)
- `src/lib/sale/booking-rules.ts` (add pure helpers if any)
- `tests/unit/lib/sale/booking-rules.test.ts` (add pure helper tests)
- `scripts/verify-booking-create.ts` (NEW, ~8 cases)
- `package.json` (add `verify:booking-create` script)

### NOT allowed
- No API route (Commit 2N)
- No UI (Commit 2L+)
- No schema / migration
- No checkout / payment / order behavior changes
- No customer-facing message generation
- No platform integration
- No service layer (`booking.service.ts`)
- No pre-existing untracked files (cleared in CLEANUP-1)
- No pak-ta-kra changes

### `createManual` algorithm (locked)

```ts
async createManual(input: CreateManualBookingInput): Promise<CreateManualBookingResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Validate Customer (exists, shopId match, isBanned=false)
    // 2. Fetch BroadcastProduct + variant + product, validate:
    //    - liveSessionId match in body
    //    - variantId not null
    //    - variant.product.shopId === shopId (cross-shop defense)
    // 3. Resolve unitPrice = priceOverride ?? variant.price
    // 4. If idempotencyKey provided: lookup existing by (shopId, idempotencyKey)
    //    - return idempotent if shape matches
    //    - throw BOOKING_INTEGRITY_ERROR (500) if mismatch
    // 5. Insert Booking { status: 'PENDING_REVIEW', source: 'MANUAL', createdById, idempotencyKey?, ... }
    // 6. Insert BookingHistory { fromStatus: null, toStatus: 'PENDING_REVIEW', changedById, metadata: { source: 'manual_create' } }
    // 7. If statusOnCreate === 'CONFIRMED':
    //    - call _runConfirmInTx(tx, { bookingId: newBooking.id, shopId, changedById })
    //    - reservation + status flip + 2nd history row inside same transaction
    //    - if reserve fails, entire transaction rolls back (no orphan)
    // 8. Return result
  });
}
```

### Validation rules (Zod-ready for 2N route)

- `liveSessionId: string` non-empty, FK
- `broadcastProductId: string` non-empty, FK
- `customerId: string` non-empty, FK
- `quantity: number` int, 1..999
- `status: 'PENDING_REVIEW' | 'CONFIRMED'` default `'PENDING_REVIEW'`
- `notes?: string` max 500
- `idempotencyKey?: string` regex `/^[A-Za-z0-9_-]{8,128}$/`

### New error code (per CD6)

`BOOKING_INTEGRITY_ERROR` — distinct from `RESERVATION_INTEGRITY_ERROR` and `CONVERSION_INTEGRITY_ERROR`. Add to `BOOKING_ERROR_CODES` in `booking-rules.ts`.

### Test cases for `verify-booking-create.ts` (8+)

1. Create PENDING_REVIEW booking — no reservation, unitPrice captured, history written
2. Create CONFIRMED booking — reservation created, reservedQty incremented, two history rows
3. Insufficient stock on create-and-confirm — full rollback, no orphan booking
4. Cross-shop BroadcastProduct/variant rejected
5. Banned customer rejected
6. idempotencyKey replay returns existing booking
7. idempotencyKey shape mismatch (or document as deferred)
8. Duplicate create without idempotencyKey → separate booking rows

Plus: existing `verify-booking-flow.ts` 9/9 + `verify-booking-conversion.ts` 8/8 must continue passing identically.

### Stop conditions for 2M-b

- `_runConfirmInTx` extraction broke any existing E2E (already verified clean in 2M-a; should hold)
- Customer.isBanned check requires broader storefront/auth changes
- BroadcastProduct/variant shop scoping unclear at runtime
- unitPrice source unclear
- idempotencyKey duplicate handling unsafe
- Create-and-confirm requires duplicate stock SQL
- Schema change becomes necessary
- API route / UI becomes tempting
- Customer-facing messaging becomes necessary
- Checkout / order / payment code needs changes

---

## Section 15 — Pending future questions for Boss/ChatGPT

These were raised in prior reports but are not blocking 2M-b. Re-raise when relevant:

- **CN3 banned-customer enforcement**: storefront checkout currently doesn't check `Customer.isBanned`. Adding the check at booking-create only creates inconsistency. Decision deferred. Inspect during 2M-b implementation, document gap, do NOT retro-fix storefront.
- **Authenticated production smoke**: deferred until /sale UI ships (Commit 2L+). Manual API curl with admin session not approved for production.
- **Phase 2 inbox UI vs Phase 1C convert-to-order priority**: convert-to-order shipped (2H+2I). Next major Phase 1 work is /sale UI. Phase 2 inbox after.
- **Commit 2J summary template route**: deferred. No customer-facing message generation in Phase 1.
- **`Customer.locale` schema**: deferred. Phase 1 default zh.
- **`Order.channel = 'LIVE_SALE'` enum addition**: deferred. Currently using `'MANUAL'` + `OrderAudit.action = 'CREATED_FROM_SALE_BOOKINGS'` for traceability.
- **Storefront checkout race-prone reservedQty**: known tech debt, separate hardening dissent later.
- **Test DB harness with vitest**: still using script-style E2E. Defer until CI lands.

---

## Section 16 — Communication norms

- Report format: structured markdown with sections (Files changed, Verification, Confirmation matrix, Recommended next step, Brief for ChatGPT).
- Boss explicitly asked: "เพิ่มคำถาม-ปรึกษา-คำแนะนำ-การให้ข้อมูลเพิ่มเติมไปบอก chatgpt ได้เองเลยถ้าจำเป็น" — proactively raise consultation items at end of every report.
- Caveman mode: enabled by default per session-start hook. Drop articles/filler/pleasantries. Code/commits/security in normal sentences.
- Never claim "done" / "fixed" / "should work" without evidence. Use exact pass counts, file:line references, command outputs.
- When user asks Thai, respond Thai (Boss uses Thai for normal chat, English for technical content).

---

## Section 17 — Files in `docs/superpowers/`

Read these for context (in order of relevance to current work):

1. `2026-05-09-manual-booking-create-dissent.md` — Locks for the next commit (2M-b)
2. `2026-05-09-booking-to-order-conversion-dissent.md` — Convert-to-order locks (already shipped 2H+2I but useful reference)
3. `2026-05-09-sale-booking-runtime-design.md` — Confirm/cancel design (already shipped 2B+2D-FIX)
4. `2026-04-06-sale-mvp-dissent.md` — Original 18 Boss decisions (binding)
5. `handoffs/2026-05-10-resume-after-2M-a-await-2M-b-approval.md` — THIS FILE

---

## Section 18 — Bootstrap message for new session

When the new session opens, copy-paste this to Claude:

```
Resume liveshop-pro session. Read docs/superpowers/handoffs/2026-05-10-resume-after-2M-a-await-2M-b-approval.md end-to-end before doing anything. After reading, run boundary check:

cd /c/Users/Asus/COWORK/code/liveshop-pro
pwd
git remote -v | head -1
git branch --show-current
git log -1 --oneline
git status --short

Expected: liveshop-pro repo, master branch, latest commit a74185b (Commit 2M-a refactor), clean working tree.

Then reply: "Resumed liveshop-pro session at a74185b. Working tree clean. Awaiting Boss/ChatGPT verdict on Commit 2M-a + GO on Commit 2M-b runtime."

Wait for Boss/ChatGPT verdict before any file edits. No 2M-b code until explicit GO.
```

---

## Section 19 — Final repo state at handoff

```
master:
a74185b refactor(sale): extract booking confirm transaction helper (Commit 2M-a)   ← current HEAD
890a7ce feat(observability): add client error boundaries and global error capture (CLEANUP-1B)
50d9f1c test(hooks): add missing hook unit tests (CLEANUP-1A)
6e30ceb docs(sale): Commit 2K — Manual booking create dissent (doc only)
3e72e30 feat(sale): Commit 2I — POST /api/sale/orders/from-bookings route
afdd41d feat(sale): Commit 2H — bookingRepository.convertToOrder() runtime
9e1a2f9 docs(sale): Commit 2G — Booking → Order conversion dissent (doc only)
c707391 test(auth): add sale route permissions and align route tests (Commit 2F)
90ff382 feat(sale): add /api/sale/bookings confirm/cancel route layer (Commit 2E)
6681e0d fix(errors): allow AppError subclasses to initialize safely
3a58db6 test(sale): harden booking flow verification script
0c84026 test(sale): add non-production booking flow verification script
552562a fix(sale): reject invalid booking reservation integrity states
3bf2315 docs(codemap): Commit 2C — Unified Commerce Inbox architecture note
689a83a feat(sale): add booking reservation runtime foundation (Commit 2B)
7b7f7b6 docs(sale): Commit 2A — booking runtime design (doc only)
67415d5 docs(security): redact Railway host/port from codemap after credential rotation
bb8b973 feat(db): Commit 1 — Unified Commerce Inbox + /sale MVP schema (additive)
a1c9a86 docs(sale): Commit 0 — /sale MVP dissent doc
```

19 commits across the /sale roadmap arc. Phase 1 booking confirm/cancel/convert/route runtime is complete. Phase 1B manual booking create runtime is the next planned commit.

---

End of handoff. New session resumes here.
