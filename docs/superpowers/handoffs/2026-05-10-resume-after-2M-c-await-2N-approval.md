# Handoff — Resume after Commit 2M-c, await 2N approval

**Date:** 2026-05-10
**Session author:** Claude Opus 4.7
**Project:** liveshop-pro (NOT pak-ta-kra)
**Latest master HEAD:** `ebb4f22` — `fix(sale): validate manual booking idempotency reservation integrity`

---

## 1. State at handoff

| | Value |
|---|---|
| Branch | master |
| HEAD | `ebb4f22` |
| Working tree | clean |
| Vercel deploy | ebb4f22 live on https://nazhahatyai.com |
| Production smoke | baseline 6/6 + sale auth gates 3/3 PASS |
| Local Docker postgres | torn down |
| tsc | clean except 2 pre-existing socket errors |
| Full vitest | 602/602 across 33 files |
| verify-booking-flow | 9/9 |
| verify-booking-conversion | 8/8 |
| verify-booking-create | 13/13 |

**Awaiting:** Boss + ChatGPT review verdict on Commit 2M-c. Then GO for Commit 2N (route layer).

---

## 2. Completed commits — Commit 0 → ebb4f22 (sale MVP track)

### Pre-sale infrastructure (already shipped before sale work)
- `eebbd7d` Phase 2 Wave 2 CSV import/export + image upload
- `4e1af11` Phase 3 customers/orders/payments/shipping/live-selling/storefront/Facebook
- `034d72b` Cloudflare R2 image storage
- `3636c6f` shop slug for readable storefront URLs
- `4fc6d9a` cookie-based locale (no URL prefix)
- `912bf61` middleware skips RBAC for API routes
- `ddfb87b` currency switched THB → MYR (RM)
- `290a7de` Privacy Policy + ToS + Data Deletion pages
- `5fc1df4` project-scoped CLAUDE.md + 10-doc CODEMAP

### /sale MVP track (all on master, no feature branches)

| Commit | Hash | Description |
|---|---|---|
| 0 | a1c9a86 | docs: /sale MVP dissent (18 Boss decisions) |
| 1 | bb8b973 | schema additive: Conversation/ChannelIdentity/Message/Booking/BookingHistory/BroadcastProduct (+ enum families) |
| 2A | 7b7f7b6 | docs: booking runtime design |
| 2B | 689a83a | runtime: bookingRepository.confirm() + cancel() with atomic stock SQL |
| 2B-AUDIT-001 | 552562a | reject multi-active reservation integrity states (resolveActiveReservation discriminated union) |
| 2C | 3bf2315 | codemap: Unified Commerce Inbox architecture note |
| 2D | 0c84026 | scripts/verify-booking-flow.ts E2E + production guard |
| 2D-hardened | 3a58db6 | harden booking flow verification |
| 2D-fix | 6681e0d | AppError subclasses must initialize safely (Object.freeze removed) |
| 2E | 90ff382 | route layer POST /api/sale/bookings confirm/cancel |
| 2F | c707391 | sale route permissions tests + RBAC alignment |
| 2G | 9e1a2f9 | docs: Booking → Order conversion dissent |
| 2H | afdd41d | runtime: bookingRepository.convertToOrder() |
| 2I | 3e72e30 | route POST /api/sale/orders/from-bookings |
| CLEANUP-1A | 50d9f1c | hook unit tests added |
| CLEANUP-1B | 890a7ce | client error boundaries + global error capture |
| 2K | 6e30ceb | docs: Manual booking create dissent |
| 2M-a | a74185b | refactor: extract `_runConfirmInTx` helper from confirm() |
| 2M-b | 7429042 | runtime: bookingRepository.createManual() + 12-case Docker E2E |
| 2M-c | **ebb4f22** | fix: createManual replay validates active-reservation cardinality (RESERVATION_INTEGRITY_ERROR on multi-active) + Test 13 |

---

## 3. /sale backend capability (current)

**bookingRepository (3 public methods):**
1. `confirm({bookingId, shopId, changedById})` — PENDING_REVIEW → CONFIRMED + atomic stock reserve + StockReservation row + null→PENDING / PENDING→CONFIRMED audit. Idempotent via active reservation match.
2. `cancel({bookingId, shopId, changedById, targetStatus, reason?})` — release stock if currently CONFIRMED, transition to CANCELLED or EXPIRED. Idempotent on terminal-state replay. CONVERTED_TO_ORDER cannot cancel here.
3. `convertToOrder({shopId, liveSessionId, customerId, changedById, bookingIds?})` — bulk consolidate CONFIRMED bookings into one Order(RESERVED). Stock reservations transfer (gain orderId, keep bookingId). Deterministic idempotency key + payload-set check.
4. **NEW (2M-b/c)** `createManual({shopId, liveSessionId, customerId, broadcastProductId, quantity, status, idempotencyKey?, changedById})` — admin manual booking entry. PENDING_REVIEW or CONFIRMED. CONFIRMED reuses `_runConfirmInTx` inline → rollback-safe on stock fail. Idempotency replay validates active-reservation cardinality (multi-active throws RESERVATION_INTEGRITY_ERROR per 2M-c).

**Pure helpers** ([src/lib/sale/booking-rules.ts](src/lib/sale/booking-rules.ts)): `canTransitionBookingStatus`, `isTerminalBookingStatus`, `computeAvailable`, `hasSufficientStock`, `isAlreadyConfirmedIdempotent`, `preflightConfirm`, `preflightCancel`, `resolveActiveReservation`, `selectConfirmedBookings`, `validateBookingsConvertible`, `groupBookingsForOrderItems`, `computeOrderTotals`, `buildConversionIdempotencyKey`. 82 unit tests.

**Routes shipped:**
- `POST /api/sale/bookings` (action: confirm | cancel) — Commit 2E
- `POST /api/sale/orders/from-bookings` — Commit 2I
- (NOT yet) `POST /api/sale/bookings` (manual create) — Commit 2N pending

**RBAC (route layer):** OWNER/MANAGER write. CHAT_SUPPORT read-only on /sale (mutation denied). WAREHOUSE denied on /sale.

**Stock invariant (intact across all paths):**
- confirm: `reservedQty++`
- cancel from CONFIRMED: `reservedQty--`
- convertToOrder: `reservedQty` unchanged (StockReservation row gains `orderId`, keeps `bookingId`)
- Order RESERVED→CONFIRMED: both `quantity--` and `reservedQty--` exactly once

**Idempotency keys (deterministic):**
- confirm: idempotency via booking status + active reservation match (no key field used)
- cancel: idempotency via terminal-state match
- conversion: `sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}` (SHA-256, sorted booking IDs)
- manual create: optional admin-supplied key, regex `/^[A-Za-z0-9_-]{8,128}$/`, unique on `(shopId, idempotencyKey)`

**No /sale UI yet.** Backend only.

---

## 4. Storefront / inbox / other capability

**Storefront:**
- `/shop/[shopSlug]` browsing, cart, checkout, payment slip upload
- Shop slug resolved from `Shop.slug` (Commit `bafb684` fix)
- Stock display from `quantity - reservedQty` (Commit `3636c6f`)
- R2 image hosting on `images.nazhahatyai.com` (Commit `034d72b`)
- CSP headers cover R2 + Facebook SDK (Commit `44c95bb`)

**Auth:**
- Admin: next-auth credentials login + role management (Commit `d0221d9`)
- Customer: Facebook Login (App ID `780277861568430`, long-lived token rotated)
- Privacy/ToS/Data Deletion pages live for FB App Review (Commit `290a7de`)

**Inbox / messaging (Phase 1 — schema only):**
- Schema models present: `Conversation`, `ChannelIdentity`, `Message`, `CommentParseLog`
- Enums present: `Platform`, `ConversationSource`, `ConversationStatus`, `MessageType`, `MessageStatus`, `ParseStatus`, `ParseAction`
- **NO runtime, NO webhook, NO parser, NO UI** for inbox yet. Schema only ready for future Messenger / WhatsApp / Telegram / Live-comment ingestion.

**Legacy:** old `Chat` / `ChatMessage` models intact (FB-only legacy). New code uses `Conversation` + `Message`.

**Image upload:** R2 via `src/lib/upload/storage.ts`. CORS allowed origins are baked. R2 bucket `images-nazhahatyai`.

---

## 5. Localization direction (accepted)

| Audience | Default | Optional | Currency |
|---|---|---|---|
| Customer-facing storefront / order text | **zh** (Mandarin) | en, th | RM / MYR fixed 2 decimals |
| Admin /admin + /sale UI | **th** (Thai) | en | RM / MYR fixed 2 decimals |

**Locale mechanism:**
- `next-intl` 4.9 with `localePrefix: 'never'`
- Cookie `NEXT_LOCALE=zh|en|th` (Commit `4fc6d9a`)
- No URL prefix; legacy `/zh/...` paths redirect to clean (Commit `6af5c82`)
- Sidebar nav labels translated (Commit `2c04094`)

**Currency rule:** **MYR / RM only**. Old THB / `฿` removed (Commit `ddfb87b`). Customer-facing JSON responses must serialize money as fixed 2 decimals (e.g. `'5.50'` not `'5.5'`) at route boundary — formatter to be added per ChatGPT CN-2 verdict, NOT a broad refactor.

**Translation helper:** future. No translation infrastructure required for 2N. Admin `th` literal strings live where they exist; customer-facing strings come from existing storefront keys.

---

## 6. Pending risks

### Storefront checkout race
- Storefront `/shop/[slug]/checkout` uses orderNumber generation pattern `ORD-${count + 1}` — race-prone under concurrency. Same pattern used by `convertToOrder` for parity. Out of scope to fix.
- Storefront payment slip OCR not enforced server-side; trust slip metadata from client. Future hardening item.

### 2 pre-existing TS errors
- `tests/unit/server/socket/index.test.ts:112` — TS2352 (undefined→string conversion) + TS2493 (tuple index 0 on empty). Acknowledged by Boss + ChatGPT in 2M-a accept. Fix carries socket subsystem risk; deferred.

### Route authenticated E2E gap
- Existing route layer (Commit 2E confirm/cancel + Commit 2I conversion) covered by unit tests but NOT by full authenticated E2E from browser/HTTP layer. Production smoke checks unauth 307 only.
- When 2N ships, must add explicit 401/403 probes against real `/api/sale/bookings` POST. Until 2N exists, Next.js 16 returns 200 + `x-matched-path: /_not-found` for the path (not a security issue, just a probing artifact — DO NOT use it as security signal).

### No /sale UI yet
- `/sale` page exists as auth-gated stub (returns 307 unauth) but no admin code grid or booking management UI. Roadmap: Commit 2L thin shell + 2O code grid + booking management.
- Cannot perform end-to-end manual booking flow until 2L+2N+2O ship.

### CHAT_SUPPORT permission edge
- CHAT_SUPPORT can READ /sale routes per Commit 2F tests. Mutation paths (confirm/cancel/convert/createManual) are OWNER/MANAGER only. Verify on 2N route addition that role check is enforced explicitly, not relying on middleware-only gate.

### Decimal serialization at route boundary
- Repository returns `unitPrice` as raw `Decimal.toString()` which strips trailing zeros (`'5.5'` not `'5.50'`). When 2N route returns money fields, normalize to 2-decimal at response boundary per ChatGPT CN-2. NOT a broad money-formatting refactor.

### Convert order RESERVED→CONFIRMED stock decrement
- Path exists in `orderRepository.transition()` but not exercised by /sale flow yet. End-to-end booking → order → confirmed-order pending future commit (out of 2N scope).

---

## 7. Exact next recommended commit — 2N

**Goal:** expose `bookingRepository.createManual()` via authenticated API route.

**Scope:**
- New: `src/app/api/sale/bookings/route.ts` (or extend existing if 2E shares the path) — POST handler routes to either `confirm` / `cancel` / `createManual` based on `action` discriminator OR add a separate `/api/sale/bookings/create` path. Decision: ChatGPT prefers separate path `POST /api/sale/bookings` for `createManual` with no action discriminator (the route is the action), with confirm/cancel routed via `POST /api/sale/bookings/[id]/confirm` and `/cancel`. **VERIFY current 2E route shape before edit** — may already use a verb pattern that needs reconciling.
- Auth: `requireAuth()` → user.shopId present → role ∈ {OWNER, MANAGER}. CHAT_SUPPORT/WAREHOUSE rejected with 403.
- Body validation via Zod schema:
  ```ts
  z.object({
    liveSessionId: z.string().min(1),
    customerId: z.string().min(1),
    broadcastProductId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
    status: z.enum(['PENDING_REVIEW', 'CONFIRMED']),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/).optional(),
  })
  ```
- Response envelope:
  ```ts
  { success: true, data: { bookingId, status, quantity, unitPrice, broadcastProductId, customerId, liveSessionId, idempotent, reservation } }
  ```
- **Money formatting at route boundary**: normalize `unitPrice` to fixed 2 decimals. Apply small helper, NOT broad refactor.
- Error mapping: route `toAppError` → status code (404/409/400/500) + JSON body.

**Allowed files (estimate):**
- `src/app/api/sale/bookings/route.ts` (or `/create/route.ts`) NEW
- `src/lib/api/decimal.ts` (small money formatter) NEW or inline helper
- `tests/unit/app/api/sale/bookings/route.test.ts` NEW
- `tests/unit/lib/api/decimal.test.ts` NEW (if helper extracted)

**Not allowed:**
- no UI
- no schema/migration
- no checkout/order/payment behavior changes
- no platform integration
- no customer-facing message generation
- no production booking create call against prod DB
- no pak-ta-kra

**Verification:**
- `npx prisma generate`
- `npx tsc --noEmit`
- `npx vitest run tests/unit/app/api/sale/bookings/route.test.ts`
- `npx vitest run` (full)
- `npm run verify:booking-flow` (regression)
- `npm run verify:booking-conversion` (regression)
- `npm run verify:booking-create` (regression)
- production smoke after Vercel auto-deploy:
  - baseline 6/6
  - sale auth: `/sale` 307 + `/api/sale/bookings` POST unauth 401 + `/api/sale/bookings` POST authed-wrong-role 403 + `/api/sale/bookings` POST authed-right-role-bad-body 400

**Commit message draft:**
> `feat(sale): expose manual booking create via authenticated API route (Commit 2N)`

---

## 8. No-go scopes (DO NOT touch)

- Schema / migration changes — current schema is locked through 2N
- Customer-facing message generation (zh/en/th order text, Messenger/WhatsApp/Telegram send)
- Storefront checkout / cart / payment slip behavior
- Order workflow (RESERVED → CONFIRMED → PACKED → SHIPPED → DELIVERED)
- Platform integration (Messenger webhook, WhatsApp Cloud API, Telegram Bot, FB Live comments parser)
- /sale UI implementation (Commit 2L+2O scope)
- Auth boundary changes (next-auth, FB Login, RBAC matrix)
- R2 / CSP header / next.config.ts
- pak-ta-kra repo / paths / brands / sentinels / castContext / imagegenIntegrity / Imagen / Gemini / Fal / Drizzle / SQLite — **DO NOT EXIST HERE**
- Global `~/.claude/CLAUDE.md` or `~/.claude/skills/` — pak-ta-kra-biased, project CLAUDE.md OVERRIDES

---

## 9. Verification commands (copy-paste)

```bash
# Static + unit
npx prisma generate
npx tsc --noEmit
npx vitest run tests/unit/lib/sale/booking-rules.test.ts
npx vitest run

# Local Docker E2E (requires postgres up + migrations applied)
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_FLOW_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-flow.ts
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_CONVERSION_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-conversion.ts
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_CREATE_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-create.ts

# Or via npm scripts (require DATABASE_URL + CONFIRM_NON_PROD_DB env)
npm run verify:booking-flow
npm run verify:booking-conversion
npm run verify:booking-create

# Production smoke (Vercel auto-deploys on master push)
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/                         # expect 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/favicon.ico              # expect 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=th"  # expect 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=zh"  # expect 200
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/login                    # expect 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin                    # expect 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/sale                     # expect 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin/products           # expect 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/auth/session         # expect 200
```

---

## 10. Engineering rules reminder (Boss-enforced)

1. **NO MAGIC** — verify before assert. Read source / Context7 / grep before claiming.
2. **VERIFY BEFORE DONE** — paste tsc exit code + vitest pass/fail count. Banned: "should work" / "fixed" / "this is correct".
3. **DISSENT (4 bullets)** — BEFORE first edit on MAJOR (schema / auth / API / payment / R2 / >3 files / >200 LOC / currency).
4. **SCOPE DRIFT GUARD** — flag "while I'm here". Boss asked X, do X only. STOP + ASK to expand.
5. **R0/R1/R2 reversibility:**
   - R0 irreversible (force push master / migrate reset / DROP / rotate secret / R2 delete) — STOP, ASK FIRST
   - R1 costly (Prisma migration / public API change / CSP / pricing) — DO + EXPLAIN
   - R2 cheap (comment / typo / test / log) — JUST DO

---

## 11. pak-ta-kra zero-touch reminder

**This project is liveshop-pro. NOT pak-ta-kra.**

| | liveshop-pro | pak-ta-kra |
|---|---|---|
| Type | E-commerce live-selling SaaS | AI video pipeline (Get It Stories) |
| Stack | Next.js + Postgres + Prisma | Next.js + SQLite + Drizzle |
| Deploy | Vercel | Railway |
| Currency | **MYR** | THB |
| Storage | Cloudflare R2 | local /data |
| Branch | single master | feat/* per task |

**Do NOT:**
- Edit `~/.claude/skills/`, `~/.claude/CLAUDE.md`, or sibling pak-ta-kra repo from this project.
- Apply pak-ta-kra path-specific routing (no `src/app/api/generate/image/**`, no castContext, no imagegenIntegrity, no brand DNA, no Imagen/Gemini/Fal here).
- Use THB / `฿` symbol — replaced with MYR / RM project-wide.
- Conflate global `~/.claude/CLAUDE.md` (pak-ta-kra-biased) with project `liveshop-pro/CLAUDE.md` (which OVERRIDES).
- Write liveshop-pro memory entries to `C--Users-Asus-COWORK-code/memory/` (that's pak-ta-kra-biased shared dir).

**Memory namespace for liveshop-pro:** `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/`

Start session from `liveshop-pro/` directory (NOT parent `COWORK/code/`) → memory namespace auto-isolates.

---

## 12. Bootstrap block (paste into next session prompt)

```
PROJECT: liveshop-pro (NOT pak-ta-kra)
Repo: C:\Users\Asus\COWORK\code\liveshop-pro
Branch: master @ ebb4f22
Domain: nazhahatyai.com (Vercel auto-deploy on master push)
DB: Railway Postgres
Storage: Cloudflare R2 (images.nazhahatyai.com)
Currency: MYR (RM) — never THB / ฿

READ FIRST:
1. docs/superpowers/handoffs/2026-05-10-resume-after-2M-c-await-2N-approval.md
2. CLAUDE.md (project root)
3. AGENTS.md (project root)
4. docs/CODEMAP/README.md
5. docs/superpowers/2026-05-09-manual-booking-create-dissent.md
6. docs/superpowers/2026-04-06-sale-mvp-dissent.md (18 Boss decisions)
7. docs/superpowers/2026-05-09-sale-booking-runtime-design.md
8. docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md

CURRENT STATE:
- 2M-c shipped (ebb4f22): createManual replay validates active-reservation cardinality (RESERVATION_INTEGRITY_ERROR on multi-active).
- Production smoke 6/6 baseline + 3/3 sale auth gates verified.
- tsc clean (2 pre-existing socket errors). 82/82 booking-rules unit. 602/602 full vitest.
- Verifiers: flow 9/9, conversion 8/8, create 13/13.

BLOCKED ON BOSS + CHATGPT REVIEW: Commit 2N
- POST /api/sale/bookings (manual create) — thin controller around bookingRepository.createManual().
- Auth: requireAuth + user.shopId + OWNER/MANAGER only.
- Body: zod-validated {liveSessionId, customerId, broadcastProductId, quantity, status, idempotencyKey?}.
- Response: {success, data: {...}} envelope, money formatted to fixed 2 decimals.
- Verify route shape vs Commit 2E (confirm/cancel) — may need path reconciliation.
- DO NOT START until Boss + ChatGPT GO.

ROADMAP:
2N: POST /api/sale/bookings manual-create route
2L: thin /sale UI shell (admin-only)
2O: /sale code grid + booking management UI

ENGINEERING RULES:
1. NO MAGIC — verify before assert.
2. VERIFY BEFORE DONE — paste tsc + vitest counts.
3. DISSENT (4 bullets) BEFORE first edit on MAJOR.
4. SCOPE DRIFT GUARD — flag "while I'm here".
5. R0 stop/ask, R1 do/explain, R2 just do.

CRITICAL CONTRACTS (do not violate):
- Stock invariant: confirm reservedQty++. cancel from CONFIRMED reservedQty--. convertToOrder reservedQty unchanged. Order RESERVED→CONFIRMED both decrement once.
- Idempotency keys deterministic SHA-256 16-char where applicable; manual create uses admin-supplied /^[A-Za-z0-9_-]{8,128}$/ unique on (shopId, idempotencyKey).
- AppError uses new.target.name + setPrototypeOf + captureStackTrace. NEVER reintroduce Object.freeze(this).
- ResolveActiveReservation discriminated union ('none' | 'one' | 'multiple'). 'multiple' → throw RESERVATION_INTEGRITY_ERROR. NEVER silent pick-first. (Now applied to createManual replay per 2M-c.)
- Atomic stock SQL: $executeRaw with WHERE quantity - reservedQty >= ? predicate. NEVER read-then-update outside transaction.

VERIFICATION BEFORE "DONE":
- npx tsc --noEmit (paste exit code)
- npm run test (paste pass/fail)
- npx tsx scripts/verify-booking-flow.ts (9/9)
- npx tsx scripts/verify-booking-conversion.ts (8/8)
- npx tsx scripts/verify-booking-create.ts (13/13)
- Production smoke after master push: 6/6 baseline + sale auth gates 3/3
- Caveman mode: drop articles + filler. Code/commits/security normal.
- After every report: proactively raise CD/CC/CN consultation items for Boss to forward to ChatGPT.

COMMUNICATION:
- Boss: Thai (with English code/error/file path).
- ChatGPT roundtrip: Thai-English mixed.
- All commits Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>.
- Production smoke must verify nazhahatyai.com after every Vercel deploy.

START WORK ONLY AFTER:
- Boss returns with ChatGPT review verdict on Commit 2M-c
- Boss types GO for Commit 2N
- Until then: idle, wait, do not edit code.
```
