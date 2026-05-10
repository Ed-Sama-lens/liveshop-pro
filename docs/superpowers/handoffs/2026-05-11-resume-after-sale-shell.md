# Handoff — Resume after /sale shell + workspace skeleton

**Date:** 2026-05-11 (overnight 05:xx GMT+7)
**Session author:** Claude Opus 4.7 (overnight autonomous, Boss asleep)
**Project:** liveshop-pro (NOT pak-ta-kra)
**Latest master HEAD:** `f4bee64` — `feat(sale): add read-only live sale workspace skeleton (Commit 2L-b)`

---

## 1. State at handoff

| | Value |
|---|---|
| Branch | master |
| HEAD | `f4bee64` |
| Working tree | clean |
| Vercel deploy | f4bee64 live on https://nazhahatyai.com |
| Production smoke (baseline 6/6 + /sale 307) | PASS |
| tsc | clean except 2 pre-existing socket errors |
| Full vitest | 602/602 across 33 files |
| verify-booking-flow | 9/9 (last verified 2N-HARDENING) |
| verify-booking-conversion | 8/8 (last verified 2N-HARDENING) |
| verify-booking-create | 13/13 (last verified 2N-HARDENING) |

**Awaiting:** Boss + ChatGPT review of overnight commits (2L-a + 2L-b). Then GO for next step.

---

## 2. Overnight commits

| Commit | Hash | Description |
|---|---|---|
| 2L-a | `2767cd8` | feat(sale): add live sale shell page — single page + nav entry + i18n keys (en/th/zh) |
| 2L-b | **f4bee64** | feat(sale): add read-only live sale workspace skeleton — 8 components under src/components/sale/ |

Pre-overnight sale MVP track (already shipped):
- 0  `a1c9a86` docs: /sale MVP dissent
- 1  `bb8b973` schema additive
- 2A `7b7f7b6` docs: booking runtime design
- 2B `689a83a` confirm/cancel runtime
- 2B-AUDIT-001 `552562a` multi-active integrity reject
- 2C `3bf2315` codemap inbox architecture
- 2D `0c84026` + `3a58db6` verify-booking-flow E2E
- 2D-fix `6681e0d` AppError subclass safety
- 2E `90ff382` route confirm/cancel
- 2F `c707391` permissions + RBAC tests
- 2G `9e1a2f9` docs: conversion dissent
- 2H `afdd41d` convertToOrder runtime
- 2I `3e72e30` route from-bookings
- CLEANUP-1A `50d9f1c` hook tests
- CLEANUP-1B `890a7ce` error boundaries
- 2K `6e30ceb` docs: manual create dissent
- 2M-a `a74185b` _runConfirmInTx extract
- 2M-b `7429042` createManual runtime + 12-case E2E
- 2M-c `ebb4f22` replay integrity patch + Test 13
- 2N `41103fb` POST /api/sale/bookings route
- 2N-HARDENING `8601845` rate limit on 4 sale mutation routes

---

## 3. /sale backend capability (unchanged from prior handoff)

**bookingRepository (4 public methods):**
1. `confirm(...)` — PENDING_REVIEW → CONFIRMED + atomic reserve. Idempotent.
2. `cancel(...)` — release stock if currently CONFIRMED; transition to CANCELLED/EXPIRED. Idempotent.
3. `convertToOrder(...)` — bulk consolidate CONFIRMED bookings into one Order(RESERVED). StockReservation transfer (gain orderId, keep bookingId).
4. `createManual(...)` — admin manual booking entry, PENDING_REVIEW or CONFIRMED, single-tx with _runConfirmInTx inline for CONFIRMED branch. Idempotency replay validates active-reservation cardinality (2M-c).

**Routes shipped (all rate-limited per 2N-HARDENING):**
- `POST /api/sale/bookings` — create (Commit 2N)
- `POST /api/sale/bookings/[bookingId]/confirm` (Commit 2E)
- `POST /api/sale/bookings/[bookingId]/cancel` (Commit 2E)
- `POST /api/sale/orders/from-bookings` (Commit 2I)

**Rate limit (in-process memory, per IP, default 20/15min):**
- `withRateLimit` from [src/lib/validation/middleware.ts](src/lib/validation/middleware.ts)
- Tunable via env `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`
- Vercel serverless limitation: per warm container instance; effective global limit weaker. Redis-backed mitigation explicitly disallowed in 2N-HARDENING.
- Auth-before-rate preserved within budget — first ~20 unauth requests still return 401, subsequent return 429 with `Retry-After: 900`.

---

## 4. /sale UI state (NEW this overnight)

### File structure
```
src/app/(app)/sale/page.tsx                              [server component, 6 lines]
src/components/sale/
├── SaleWorkspaceShell.tsx                               [grid composer + amber banner]
├── SalePanelCard.tsx                                    [reusable presentational shell]
├── SaleSessionPickerPlaceholder.tsx                     [LIVE + SCHEDULED sample rows]
├── SaleProductGridPlaceholder.tsx                       [6-tile demo code grid]
├── SaleBookingQueuePlaceholder.tsx                      [4 lifecycle status demo rows]
├── SaleCustomerPanelPlaceholder.tsx                     [demo customer + preferredLocale='zh']
├── SaleOrderConversionPlaceholder.tsx                   [demo OrderItem summary + totals]
└── SaleInboxPlaceholder.tsx                             [4-channel coming-soon list]
```

### What EXISTS
- Server-rendered shell page at `/sale`, gated by middleware for OWNER/MANAGER/CHAT_SUPPORT
- Bilingual header "Live Sale / ขายผ่านไลฟ์" with Thai tagline
- Amber test-mode banner stating "ระยะทดสอบ: หน้านี้ยังไม่ส่งคำสั่งจริง"
- 6 placeholder panels in responsive grid (md:2, xl:3)
- Each panel wrapped in `ErrorBoundarySection`
- Top-right variant pill on each panel: `demo` / `placeholder` / `coming-soon`
- Sample data covers: 2 live sessions, 6 product codes (incl out-of-stock + low-stock styling), 5 booking lifecycle rows, 1 demo customer (Wang Lijuan, preferredLocale=zh, lifetime RM1248.50), 3 OrderItem summary with subtotal/shipping/total, 4-channel inbox list
- Sidebar nav entry `liveSale` added in 'sales' group with i18n keys for en/th/zh

### What is PLACEHOLDER
- Every action button is `<Button disabled>` with `ยังไม่เปิดใช้งาน` or `Coming soon` label
- All data is hard-coded sample data inline
- No fetch, no state, no event handlers
- No router.push from any control
- "Confirm", "Cancel", "Create Order" buttons on booking + conversion panels — disabled

### What is NOT WIRED
- No call to `POST /api/sale/bookings` (create)
- No call to `POST /api/sale/bookings/[id]/confirm`
- No call to `POST /api/sale/bookings/[id]/cancel`
- No call to `POST /api/sale/orders/from-bookings`
- No fetch from any GET endpoint (no GET sale endpoints exist yet either)
- No client-side state machine
- No optimistic UI

### Localization in UI
- Admin UI labels: Thai primary with English secondary inline ("Live Sale / ขายผ่านไลฟ์")
- Customer panel demo card notes accepted direction:
  - customer-facing: **zh default**, en/th optional, RM/MYR fixed 2 decimals
  - admin-facing: **th default**, en optional
- Future Commit 2O can extract to scoped i18n keys when more dynamic content lands

### Confirmation: NO mutation calls
Verified by grep: zero `fetch(`, zero `axios`, zero `useMutation`, zero `useSWR`, zero event handlers attached to any button in `src/components/sale/` or `src/app/(app)/sale/`.

---

## 5. Storefront / inbox / other (unchanged)

- Storefront `/shop/[slug]` browsing, cart, checkout, payment slip upload — intact
- Customer Facebook Login (App ID `780277861568430`) — intact, long-lived token rotated
- Admin next-auth credentials — intact
- Inbox schema (Conversation/ChannelIdentity/Message) — landed in Commit 1, NO runtime/webhook/parser/UI for inbox yet
- Privacy/ToS/Data Deletion legal pages — live
- Currency: MYR/RM project-wide

---

## 6. Pending risks (carried forward)

### From prior handoff
1. **Storefront checkout race** — `ORD-${count + 1}` orderNumber generation pattern still race-prone. Same pattern used by `convertToOrder`. Out of scope.
2. **2 pre-existing TS errors** — `tests/unit/server/socket/index.test.ts:112` (TS2352 + TS2493). Acknowledged in 2M-a accept.
3. **Authenticated route E2E gap** — production smoke only covers 401 unauth + 429 hammer. 403 (wrong role) + 200 (valid authed flow) require session-cookie injection in a verifier OR /sale UI smoke (UI exists now but no admin login probed). Carrying forward.
4. **No route-level vitest** — coverage via verifier scripts hitting repository directly. Worth a TEST-CLEANUP commit.
5. **Decimal serialization at route boundary** — `formatMoney2` is private to 2N route. confirm/cancel/conversion routes still return raw Decimal strings. Boss-deferred per CN-2.

### NEW after overnight
6. **/sale UI has zero data fetching** — even read-only listing (real live sessions, real bookings) needs at least a GET API. Currently NO GET endpoint exists for /sale. Before 2O can wire real lists, GET endpoints must land (e.g. `GET /api/sale/live-sessions?status=LIVE`, `GET /api/sale/bookings?liveSessionId=...`).
7. **Rate-limit budget shared across smoke probes + admin clicks** — single in-process memory limiter per Vercel container. Smoke today already burned 30+ requests on one IP. Future smoke must stagger or skip /api/sale probes.
8. **Live sale env tuning not applied** — Boss agreed `RATE_LIMIT_MAX=60` is appropriate before real live-selling but explicitly deferred Vercel env change to awake-Boss decision.
9. **lucide-react brand icons removed** — Facebook icon import failed in SaleInboxPlaceholder.tsx (replaced with generic Radio). Brand-icon swap requires SVG asset + custom component if Boss wants real brand marks.
10. **Sidebar nav addition** — `liveSale` now appears in sidebar for OWNER/MANAGER/CHAT_SUPPORT. Visible side effect for any logged-in admin. Page itself is safe (no mutations), but the nav presence is a UX commitment.

---

## 7. Exact next recommended step

### Top recommendation: GET endpoints + 2O wiring

Before /sale UI can show REAL data:
1. **Commit 2P (proposed) — GET /api/sale/live-sessions**
   - Returns list of LiveSession rows where `shopId === user.shopId`
   - Filter by status (`status=LIVE`, `status=SCHEDULED`, `status=ENDED`)
   - Auth: OWNER/MANAGER/CHAT_SUPPORT (read-level)
   - Rate-limited per existing pattern
2. **Commit 2Q (proposed) — GET /api/sale/live-sessions/[id]/broadcast-products**
   - Returns BroadcastProduct rows for a session
   - Returns variant + product info for the product code grid
3. **Commit 2R (proposed) — GET /api/sale/bookings**
   - Returns Booking rows filtered by `shopId + liveSessionId + status`
   - For the booking queue panel
4. **Commit 2O — wire all 6 panels in /sale to real GET endpoints**
   - Replace hard-coded demo data with `useSWR` or React Server Component data fetches
   - Add loading skeletons (already imported in dashboard pattern)
   - Add empty-state messaging
   - Still NO mutation buttons enabled

Alternative simpler next step:
- **TEST-CLEANUP** — extract `formatMoney2` to shared helper, add per-route vitest tests, document handoff index file (CN-3 deferred), unify sale route money formatting.

### Boss should decide which path
- Real-data path (2P → 2Q → 2R → 2O) is bigger but unblocks practical MVP demo.
- TEST-CLEANUP path is smaller, lower risk, deferred items closure.

---

## 8. No-go scopes (DO NOT touch)

- Schema / migration changes
- Customer-facing message generation (zh/en/th order text, Messenger/WhatsApp/Telegram send)
- Storefront checkout / cart / payment slip behavior
- Order workflow (RESERVED → CONFIRMED → PACKED → SHIPPED → DELIVERED)
- Platform integration (Messenger webhook, WhatsApp Cloud API, Telegram Bot, FB Live comments parser)
- Mutation button wiring in /sale UI (still gated on Boss/ChatGPT review of 2L-a/2L-b)
- Auth boundary changes (next-auth, FB Login, RBAC matrix)
- R2 / CSP / next.config.ts
- Vercel env changes (RATE_LIMIT_MAX tuning awaits awake Boss)
- pak-ta-kra repo / paths / brands / sentinels / castContext / imagegenIntegrity / Imagen / Gemini / Fal / Drizzle / SQLite — **DO NOT EXIST HERE**
- Global `~/.claude/CLAUDE.md` or `~/.claude/skills/`

---

## 9. Verification commands (copy-paste)

```bash
# Static + unit
npx prisma generate
npx tsc --noEmit
npx vitest run tests/unit/lib/sale/booking-rules.test.ts
npx vitest run

# Local Docker E2E (requires postgres + migrations)
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx prisma migrate deploy
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_FLOW_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-flow.ts
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_CONVERSION_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-conversion.ts
CONFIRM_NON_PROD_DB=true VERIFY_BOOKING_CREATE_RUN_ID=$(date +%Y%m%d-%H%M%S) DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' npx tsx scripts/verify-booking-create.ts

# Production smoke (Vercel auto-deploys on master push)
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/                                              # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/favicon.ico                                   # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=th"               # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=zh"               # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/login                                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin                                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/sale                                          # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/auth/session                              # 200

# DO NOT hammer /api/sale/* unauth probes more than ~5 per 15min per IP
# unless willing to wait for limiter window. Auth-before-rate within budget
# preserves 401; over-budget returns 429 with Retry-After: 900.
```

---

## 10. Engineering rules reminder (Boss-enforced)

1. **NO MAGIC** — verify before assert.
2. **VERIFY BEFORE DONE** — paste tsc exit code + vitest pass/fail count. Banned: "should work" / "fixed" / "this is correct".
3. **DISSENT (4 bullets)** — BEFORE first edit on MAJOR.
4. **SCOPE DRIFT GUARD** — flag "while I'm here". Boss asked X, do X only.
5. **R0/R1/R2 reversibility:**
   - R0 irreversible — STOP, ASK FIRST
   - R1 costly — DO + EXPLAIN
   - R2 cheap — JUST DO

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

DO NOT edit `~/.claude/skills/`, `~/.claude/CLAUDE.md`, or sibling pak-ta-kra repo from this project.

Memory namespace for liveshop-pro: `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/`

---

## 12. Bootstrap block (paste into next session prompt)

```
PROJECT: liveshop-pro (NOT pak-ta-kra)
Repo: C:\Users\Asus\COWORK\code\liveshop-pro
Branch: master @ f4bee64
Domain: nazhahatyai.com (Vercel auto-deploy on master push)
DB: Railway Postgres
Storage: Cloudflare R2 (images.nazhahatyai.com)
Currency: MYR (RM) — never THB / ฿

READ FIRST:
1. docs/superpowers/handoffs/2026-05-11-resume-after-sale-shell.md
2. CLAUDE.md (project root)
3. AGENTS.md (project root)
4. docs/CODEMAP/README.md
5. docs/superpowers/2026-05-09-manual-booking-create-dissent.md
6. docs/superpowers/2026-04-06-sale-mvp-dissent.md (18 Boss decisions)
7. docs/superpowers/2026-05-09-sale-booking-runtime-design.md
8. docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md

CURRENT STATE:
- /sale backend: confirm + cancel + convert + createManual runtime + 4 rate-limited routes.
- /sale UI: shell page (2L-a) + 6-panel read-only workspace skeleton (2L-b) under
  src/app/(app)/sale/page.tsx and src/components/sale/. Zero mutations wired.
- Sidebar nav entry liveSale added for OWNER/MANAGER/CHAT_SUPPORT (en/th/zh i18n).
- Production smoke baseline 6/6 + /sale 307 verified for f4bee64.
- tsc clean except 2 pre-existing socket errors. Full vitest 602/602.
- Verifiers (last verified at 2N-HARDENING): flow 9/9, conversion 8/8, create 13/13.

BLOCKED ON BOSS + CHATGPT REVIEW of overnight commits 2L-a + 2L-b.

LIKELY NEXT COMMITS (Boss decides):
Path A (real-data wiring):
  2P: GET /api/sale/live-sessions
  2Q: GET /api/sale/live-sessions/[id]/broadcast-products
  2R: GET /api/sale/bookings
  2O: wire 6 /sale panels to real GET endpoints (still no mutations)
Path B (cleanup):
  TEST-CLEANUP: per-route vitest, formatMoney2 shared, handoff index

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
- ResolveActiveReservation discriminated union ('none' | 'one' | 'multiple'). 'multiple' → throw RESERVATION_INTEGRITY_ERROR.
- Atomic stock SQL: $executeRaw with WHERE quantity - reservedQty >= ? predicate. NEVER read-then-update outside transaction.
- 4 sale mutation routes share one in-process IP-keyed RateLimiterMemory bucket. Default 20/15min. Auth-before-rate within budget. Tunable via env.

VERIFICATION BEFORE "DONE":
- npx tsc --noEmit (paste exit code)
- npm run test (paste pass/fail)
- npx tsx scripts/verify-booking-flow.ts (9/9)
- npx tsx scripts/verify-booking-conversion.ts (8/8)
- npx tsx scripts/verify-booking-create.ts (13/13)
- Production smoke after master push: baseline 6/6 + /sale 307
- Do NOT hammer /api/sale/* probes — shared per-IP rate limit budget.

COMMUNICATION:
- Boss: Thai (with English code/error/file path).
- ChatGPT roundtrip: Thai-English mixed.
- All commits Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>.

START WORK ONLY AFTER:
- Boss returns and reviews 2L-a + 2L-b
- Boss types GO for next commit (path A or path B)
- Until then: idle, wait, do not edit code.
```
