# Handoff — Resume after Customer Panel live-data wiring

**Date:** 2026-05-13
**Author:** Claude Opus 4.7
**Project:** liveshop-pro (NOT pak-ta-kra)
**Latest master HEAD:** `458a5db` — `docs(sale): Manual Create design + authenticated manual test checklist`

This is the **full state-restoration doc**. Paste the bootstrap block in §15 into a fresh Claude session for instant context.

---

## 1. State at handoff

| | Value |
|---|---|
| Branch | master (single-branch flow) |
| HEAD | `458a5db` |
| Working tree | clean |
| Vercel deploy | `458a5db` live on https://nazhahatyai.com |
| Last production smoke (13/13) | PASS |
| tsc | clean except 2 pre-existing socket errors |
| Full vitest | 760/760 across 38 files |
| Docker E2E | 36/36 across 5 verifiers (flow 9 + conversion 8 + create 13 + order-reservation-cleanup 5 + expire-reservations-cron 1) |
| Mutation grep on sale UI | EXACTLY 3 POSTs (Confirm + Cancel + CreateOrder) — unchanged |

**Awaiting:** Boss + ChatGPT review of last 10-hour session output (4 commits: `9211ef3` + `298a9cf` + `776938d` + `458a5db`).

---

## 2. Project identity (DO NOT CONFLATE WITH pak-ta-kra)

| Field | Value |
|---|---|
| Name | LiveShop Pro |
| Repo path | `C:\Users\Asus\COWORK\code\liveshop-pro` |
| GitHub | `github.com/Ed-Sama-lens/liveshop-pro` |
| Domain | nazhahatyai.com (Vercel auto-deploy on master push) |
| DB | Railway PostgreSQL |
| Storage | Cloudflare R2 (`images.nazhahatyai.com`) |
| Auth (admin) | next-auth credentials |
| Auth (customer) | Facebook Login (App ID `780277861568430`) |
| Currency | **MYR (RM)** — never THB / ฿ |
| Memory namespace | `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/` |

### Stack

Next.js 16.2.2 + Turbopack + TypeScript 5 strict + Prisma 7.6.0 + @prisma/adapter-pg + Postgres + next-auth 5 beta + next-intl 4.9 (cookie locale, `localePrefix:'never'`) + Tailwind + shadcn/ui + Zod 4 + Vitest 4 + Playwright 1.59.

### Scope vs pak-ta-kra

| | liveshop-pro | pak-ta-kra |
|---|---|---|
| Type | E-commerce live-selling SaaS | AI video pipeline (Get It Stories) |
| Stack | Next.js + Postgres + Prisma | Next.js + SQLite + Drizzle |
| Deploy | Vercel | Railway |
| Currency | **MYR** | THB |
| Storage | R2 | local /data |
| Branch | single master | feat/* per task |

Global `~/.claude/CLAUDE.md` is pak-ta-kra-biased. liveshop-pro/CLAUDE.md OVERRIDES it for this project.

---

## 3. Engineering rules (Boss-enforced — EVERY task)

### Rule 1 — NO MAGIC
ห้ามเดา. Verify before assert.
- Code unverified → prefix `ASSUMPTION:` before claiming
- Infra unseen → no claim of existence before verify
- API shape unverified → no invented fields
- Library behavior unsure → read source / Context7 docs first

### Rule 2 — VERIFY BEFORE DONE
Evidence before claims. Banned phrases: "should work" / "this is correct" / "fixed".

| Scope | Min verification |
|---|---|
| Single file < 20 lines | `npx tsc --noEmit` |
| Logic/behavior | `npm run test -- <file>` pass |
| Schema/auth/payment/R2/FB Login | full `npm run test` + tsc + manual probe |
| Vercel deploy | wait for **Ready**, hit nazhahatyai.com |

Replace banned phrases with "tsc clean (ran)" / "X/Y tests pass (paste)" / "verified by reading file:line".

### Rule 3 — DISSENT (4 bullets BEFORE first edit on MAJOR)

MAJOR triggers:
- Prisma schema change / migration
- Auth boundary (next-auth, FB Login, RBAC, session)
- Public API contract (`/api/*` route signature, response envelope)
- Payment / order / commerce policy
- R2 / storage path / CSP header
- > 3 files OR > 200 LOC
- Currency / pricing logic

4 bullets:
1. **Blast radius** — กระทบใคร?
2. **Assumptions** — สมมติอะไร?
3. **Reversibility** — R0/R1/R2? rollback cost?
4. **Blind spots** — momentum ปิดตาอะไร?

Skip dissent: single file < 50 lines / comment / typo / internal helper / test / doc / formatting.

### Rule 4 — SCOPE DRIFT GUARD
Flag: "while I'm here" / "let's also..." / bug fix → refactor / one-page → multi-page / Boss asked X → ทำ X+Y+Z.
Protocol: STOP + ASK "Scope expanding from <X> to also <Y>. Proceed?"

### Rule 5 — R0/R1/R2 reversibility

**R0 — Irreversible. STOP, ASK FIRST.**
- `git push --force` to master
- `prisma migrate reset` / `DROP TABLE` / `DELETE` without WHERE
- Rotate / delete secrets (Vercel env, R2 keys, FB App secret)
- R2 bucket delete / mass `DeleteObject`
- Production order data deletion
- Charge customer card / send mass email
- Vercel deploy with failing tests
- Change FB App `live` mode

**R1 — Costly. DO + explain.**
- Prisma migration (auto-apply on Vercel)
- Public API route signature change
- CSP header change (`next.config.ts`)
- Currency / pricing logic
- Add Vercel env var
- Rename feature flag

**R2 — Cheap. JUST DO.**
- Comment / docstring / typo / internal helper refactor / test / codemap entry / lint / log line

---

## 4. Hard no-go list (cumulative across sessions)

- NO pak-ta-kra edits
- NO production backfill (ORDER-RESERVATION-CLEANUP Commit 2 — design only)
- NO production DB mutation except unauth smoke probes that stop at auth gate
- NO `schema.prisma` edits
- NO migrations
- NO payment/slip/shipment behavior changes
- NO Messenger/WhatsApp/Telegram
- NO parser/webhook
- NO customer-facing message generation (no zh/en/th order text, no auto-send)
- NO Vercel env changes
- NO authenticated production mutations unless Boss manually picks safe test booking
- NO 61-request rate-limit burst
- NO Playwright full infra unless explicit cleanup phase
- NO unrelated ErrorBoundary/logger/provider edits
- NO pre-existing socket TS error fix unless dedicated cleanup phase scoped

---

## 5. Full commit chain since project start

(Most recent on top. Sale MVP track + ORDER-RESERVATION-CLEANUP series only — pre-sale infrastructure omitted; see `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md` for earlier Phase 1-3.)

### Last 10-hour session (2026-05-12 → 2026-05-13)
- `458a5db` docs(sale): Manual Create design + auth manual test checklist
- `776938d` feat(sale): wire customer panel to selected booking (Phase 4+5)
- `298a9cf` docs(sale): customer panel live-data design (docs only)
- `9211ef3` fix(stock): make reservation expiry resilient to row failures (ORDER-RESERVATION-CLEANUP Commit 3)

### Prior sessions
- `520410d` fix(order): mark consumed reservations released on confirmation (ORDER-RESERVATION-CLEANUP Commit 1)
- `0bf869b` docs(order): backfill plan + cron resilience design (docs only)
- `d980c48` test(order): add verify-order-reservation-cleanup verifier scaffolding
- `45baa1a` docs(order): ORDER-RESERVATION-CLEANUP design/dissent (docs only)
- `7a6a8b1` feat(sale): enable Create Order from selected bookings (Commit 2O-c2)
- `152a615` feat(sale): add Create Order selection UI (no POST yet) — Commit 2O-c1
- `f70c51c` docs(sale): Commit 2O-c-DESIGN — Create Order from confirmed bookings (design only)
- `defd8a0` feat(sale): enable Cancel button for single CONFIRMED booking (Commit 2O-b)
- `fd4d10e` test(sale): cover isBookingConfirmable + extend smoke doc (Commit 2O-a.1)
- `7643060` feat(sale): enable Confirm button for single PENDING_REVIEW booking (Commit 2O-a)
- `9ccdca1` feat(sale): surface reservation + product integrity in /sale UI (Commit 2U)
- `492543c` test(sale): verify read-only sale API auth/RBAC + integrity fields (Commit 2T)
- `cbe421f` docs(sale): add handoff index + sale API map
- `cc8a213` feat(sale): wire live sale shell to read-only data (Commit 2S)
- `5a1b229` feat(sale): add read-only bookings API (Commit 2R)
- `ab1861b` feat(sale): add read-only broadcast products API (Commit 2Q)
- `e1306e5` feat(sale): add read-only live sessions API (Commit 2P)
- `f4bee64` feat(sale): add read-only live sale workspace skeleton (Commit 2L-b)
- `2767cd8` feat(sale): add live sale shell page (Commit 2L-a)
- `8601845` fix(sale): apply rate limit middleware to sale mutation routes (Commit 2N-HARDENING)
- `41103fb` feat(sale): expose manual booking create via authenticated API route (Commit 2N)
- `ebb4f22` fix(sale): validate manual booking idempotency reservation integrity (Commit 2M-c)
- `7429042` feat(sale): add manual booking create runtime (Commit 2M-b)
- `a74185b` refactor(sale): extract booking confirm transaction helper (Commit 2M-a)
- `3e72e30` feat(sale): Commit 2I — POST /api/sale/orders/from-bookings route
- `afdd41d` feat(sale): Commit 2H — bookingRepository.convertToOrder() runtime
- `9e1a2f9` docs(sale): Commit 2G — Booking → Order conversion dissent (doc only)
- `c707391` test(auth): add sale route permissions and align route tests (Commit 2F)
- `90ff382` feat(sale): add /api/sale/bookings confirm/cancel route layer (Commit 2E)
- `6681e0d` fix(errors): allow AppError subclasses to initialize safely
- `3a58db6` test(sale): harden booking flow verification script
- `0c84026` test(sale): add non-production booking flow verification script (Commit 2D)
- `552562a` fix(sale): reject invalid booking reservation integrity states (Commit 2B-AUDIT-001)
- `3bf2315` docs(codemap): Commit 2C — Unified Commerce Inbox architecture note
- `689a83a` feat(sale): add booking reservation runtime foundation (Commit 2B)
- `7b7f7b6` docs(sale): Commit 2A — booking runtime design
- `bb8b973` feat(db): Commit 1 — Unified Commerce Inbox + /sale MVP schema (additive)
- `a1c9a86` docs(sale): Commit 0 — /sale MVP dissent doc

---

## 6. Backend capability (current)

### `bookingRepository` (5 public methods)
1. `confirm({bookingId, shopId, changedById})` — PENDING_REVIEW → CONFIRMED + atomic stock reserve. Idempotent.
2. `cancel({bookingId, shopId, changedById, targetStatus, reason?})` — release stock if currently CONFIRMED; transition to CANCELLED/EXPIRED. Idempotent on terminal-state replay.
3. `convertToOrder({shopId, liveSessionId, customerId, changedById, bookingIds?})` — bulk consolidate CONFIRMED bookings into one Order(RESERVED). StockReservation transfer (gain orderId, keep bookingId).
4. `createManual({shopId, liveSessionId, customerId, broadcastProductId, quantity, status, idempotencyKey?, changedById})` — admin manual entry. PENDING_REVIEW or CONFIRMED. CONFIRMED reuses `_runConfirmInTx` inline (rollback-safe). Idempotency replay validates active-reservation cardinality (2M-c).
5. `_runConfirmInTx` (private helper) — extracted at Commit 2M-a so create-and-confirm uses same code path as standalone confirm.

### Pure helpers ([src/lib/sale/booking-rules.ts](../../src/lib/sale/booking-rules.ts))
`canTransitionBookingStatus`, `isTerminalBookingStatus`, `computeAvailable`, `hasSufficientStock`, `isAlreadyConfirmedIdempotent`, `preflightConfirm`, `preflightCancel`, `resolveActiveReservation` (discriminated union), `selectConfirmedBookings`, `validateBookingsConvertible`, `groupBookingsForOrderItems`, `computeOrderTotals`, `buildConversionIdempotencyKey`. 82 unit tests.

### Routes shipped
All sale mutation routes wrapped with `withRateLimit` (60/15min per IP after Boss-set `RATE_LIMIT_MAX=60`).

| Method | Path | Commit | RBAC |
|---|---|---|---|
| GET | `/api/sale/live-sessions` | 2P | OWNER/MANAGER/CHAT_SUPPORT |
| GET | `/api/sale/live-sessions/[id]/broadcast-products` | 2Q | OWNER/MANAGER/CHAT_SUPPORT |
| GET | `/api/sale/bookings?liveSessionId=…` | 2R | OWNER/MANAGER/CHAT_SUPPORT |
| POST | `/api/sale/bookings` (create) | 2N | OWNER/MANAGER |
| POST | `/api/sale/bookings/[id]/confirm` | 2E | OWNER/MANAGER |
| POST | `/api/sale/bookings/[id]/cancel` | 2E | OWNER/MANAGER |
| POST | `/api/sale/orders/from-bookings` | 2I | OWNER/MANAGER |

`GET /api/customers/[id]` (existing admin route) — reused by Customer Panel since Phase 4 (2026-05-12). CHAT_SUPPORT can read.

### Stock invariants (intact across all paths)
- `confirm`: `reservedQty++`
- `cancel` from CONFIRMED: `reservedQty--`
- `convertToOrder`: `reservedQty` unchanged (StockReservation row gains `orderId`, keeps `bookingId`)
- `Order.RESERVED→CONFIRMED` via `orderRepository.transition`: `quantity--` + `reservedQty--` + `StockReservation.releasedAt = now` (added Commit 1 `520410d`)
- `Order.RESERVED→CANCELLED`: `reservedQty--` (StockReservation.releasedAt NOT yet set — Boss-narrowed scope; CANCELLED branch is recommended next step or follow-up)
- `expireReservations()` cron: `Promise.allSettled` per-row resilience (added Commit 3 `9211ef3`)

### Idempotency keys
- confirm: based on booking status + active reservation match (no key field)
- cancel: idempotent on terminal-state match
- conversion: `sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash16}` (SHA-256, sorted)
- manual create: admin-supplied optional key, regex `^[A-Za-z0-9_-]{8,128}$`, unique on `(shopId, idempotencyKey)`

### Rate limit
- Helper: `withRateLimit` in [src/lib/validation/middleware.ts](../../src/lib/validation/middleware.ts)
- Default 20/15min per IP; env override `RATE_LIMIT_MAX=60` SET on Vercel Production (2026-05-11)
- `withRateLimit` shared single in-process `RateLimiterMemory` per warm Vercel container
- Returns `{success:false, error:"Too many requests..."}` + `Retry-After: 900` header
- Auth-before-rate within budget: first ~60 unauth requests return 401, subsequent return 429

---

## 7. /sale UI capability (current)

### Page + components
- `/sale` page at [src/app/(app)/sale/page.tsx](../../src/app/(app)/sale/page.tsx) (server component, 6 lines)
- Renders `SaleWorkspaceShell` (`'use client'`, orchestrator)
- Middleware-gated for OWNER/MANAGER/CHAT_SUPPORT (per [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts))

### 6 panels (all wrapped in `ErrorBoundarySection`)

| Panel | Status | Data source |
|---|---|---|
| Live Sessions / รอบไลฟ์ | LIVE | GET `/api/sale/live-sessions` (auto-pick LIVE > SCHEDULED > first) |
| Product Codes / รหัสสินค้า | LIVE + filteredInvalidCount warning | GET `/api/sale/live-sessions/[id]/broadcast-products` |
| Customer Bookings / รายการจอง | LIVE + checkboxes + Confirm/Cancel buttons + integrity badges | GET `/api/sale/bookings?…` |
| Customer Panel / ข้อมูลลูกค้า | **LIVE since 2026-05-12** | GET `/api/customers/[id]` (existing admin route reused) |
| Create Order / สร้างออเดอร์ (Booking Queue strip) | LIVE — selection + Create Order modal | POST `/api/sale/orders/from-bookings` |
| Inbox (Coming Soon) | Static placeholder | none (Phase 2+ future) |

### 3 mutation dialogs
- `ConfirmBookingDialog.tsx` — POST `/api/sale/bookings/[id]/confirm` (Commit 2O-a)
- `CancelBookingDialog.tsx` — POST `/api/sale/bookings/[id]/cancel` with required reason (Commit 2O-b)
- `CreateOrderDialog.tsx` — POST `/api/sale/orders/from-bookings` (Commit 2O-c2)

### Booking row gating helpers ([src/components/sale/booking-queue.helpers.ts](../../src/components/sale/booking-queue.helpers.ts))
- `isBookingConfirmable(row)` — PENDING_REVIEW + integrity {OK,NOT_APPLICABLE,undefined}
- `isBookingCancellable(row)` — CONFIRMED + integrity {OK,NOT_APPLICABLE,undefined}
- `isBookingSelectable(row)` — same as cancellable
- `isBookingSelectableInContext(row, lock)` — adds customerId + liveSessionId match
- `deriveSelectionLock(rows)` — throws on mismatched customer/session (defensive)
- 93 unit tests covering full status × integrity matrix + mutual exclusivity

### Customer Panel UI (Phase 4+5, 2026-05-12)
- Customer name link in Booking Queue row → click sets `selectedCustomerId` in shell state
- Customer Panel fetches `GET /api/customers/[id]`
- Renders: name / phone / email / shippingType / lifetimeValue / orderCount / BANNED+reason badge
- Hidden in MVP: address / labels / notes / channel / createdAt / facebookId (PII gate)
- Edit button disabled (no mutation)

### Mutation grep (current)
| Pattern | Count | Locations |
|---|---|---|
| `method: 'POST'` | **3** | ConfirmBookingDialog + CancelBookingDialog + CreateOrderDialog |
| `axios` | 0 | — |
| `useMutation` | 0 | — |
| `onClick=` | ~12 | dialog buttons + row triggers + selection clear link |

---

## 8. ORDER-RESERVATION-CLEANUP status

| Commit | Status | Notes |
|---|---|---|
| Commit 1 — runtime fix in `orderRepository.transition('CONFIRMED')` | ✅ shipped (`520410d`) | Marks `StockReservation.releasedAt` atomically with stock decrement. CANCELLED branch NOT in scope per Boss narrowing. |
| Commit 3 — cron resilience | ✅ shipped (`9211ef3`) | `Promise.allSettled` + per-row logging. Return shape preserved (`Promise<number>`). |
| Commit 2 — historical orphan backfill | ⏸ PENDING | Plan at [docs/superpowers/2026-05-12-order-reservation-backfill-plan.md](../2026-05-12-order-reservation-backfill-plan.md). Should run after Commits 1+3 stable ≥1 week. Requires Railway snapshot + dry-run-by-default script (~150 LOC). |

**Pre-existing bug acknowledged but out of scope (Boss narrowed):** `orderRepository.transition('CANCELLED')` decrements `reservedQty` but does NOT mark `StockReservation.releasedAt`. Same pattern. Boss spec explicit: CONFIRMED only. Could be follow-up `fix(order): mark cancelled orders' reservations released` mirroring Commit 1.

---

## 9. Pending design docs / decisions

| Doc | Path | Status |
|---|---|---|
| ORDER-RESERVATION-CLEANUP dissent | [2026-05-12-order-reservation-cleanup-dissent.md](../2026-05-12-order-reservation-cleanup-dissent.md) | Design + Implementation status logged. Commits 1+3 shipped. Commit 2 pending. |
| Backfill plan | [2026-05-12-order-reservation-backfill-plan.md](../2026-05-12-order-reservation-backfill-plan.md) | Plan: dry-run-by-default + Railway snapshot + reverse mode log. Pending Boss approval. |
| Cron resilience plan | [2026-05-12-expire-reservations-cron-resilience.md](../2026-05-12-expire-reservations-cron-resilience.md) | Option A shipped (Commit 3). Option B (orphan guard in release) deferred. |
| Customer Panel design | [2026-05-12-sale-customer-panel-design.md](../2026-05-12-sale-customer-panel-design.md) | Phase 4+5 shipped (`776938d`). Per-session booking count + channel identities deferred. |
| Manual Create modal design | [2026-05-12-sale-manual-create-booking-design.md](../2026-05-12-sale-manual-create-booking-design.md) | Design only. Awaits Boss + ChatGPT GO. ~500 LOC. M1-M6 open questions. |
| Auth manual test checklist | [2026-05-12-sale-authenticated-manual-test-checklist.md](../2026-05-12-sale-authenticated-manual-test-checklist.md) | 6 scenarios (A-F). Boss runs at own discretion. |
| Living manual smoke | [2026-05-11-sale-read-only-manual-smoke.md](../2026-05-11-sale-read-only-manual-smoke.md) | Living doc. Changelog table tracks 14+ commits. |
| Sale API map | [docs/sale-api-map.md](../../sale-api-map.md) | Full route + RBAC matrix + envelope shapes. |

---

## 10. Verification checklist (run before any "done" claim)

### Static
```bash
npx prisma generate
npx tsc --noEmit
```
Expected: clean except 2 pre-existing socket errors at `tests/unit/server/socket/index.test.ts:112` (TS2352 + TS2493).

### Unit
```bash
npx vitest run
```
Expected: **760/760 pass**, 38 files.

### Local Docker E2E (when Docker daemon up)
```bash
docker compose up -d postgres
DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx prisma migrate deploy

CONFIRM_NON_PROD_DB=true \
  VERIFY_BOOKING_FLOW_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-booking-flow.ts          # 9/9

CONFIRM_NON_PROD_DB=true \
  VERIFY_BOOKING_CONVERSION_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-booking-conversion.ts    # 8/8

CONFIRM_NON_PROD_DB=true \
  VERIFY_BOOKING_CREATE_RUN_ID=$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-booking-create.ts        # 13/13

CONFIRM_NON_PROD_DB=true \
  VERIFY_ORDER_RESERVATION_CLEANUP_RUN_ID=ord-$(date +%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-order-reservation-cleanup.ts   # 5/5

CONFIRM_NON_PROD_DB=true \
  VERIFY_EXPIRE_RESERVATIONS_CRON_RUN_ID=cron-$(date +%Y%m%d-%H%M%S) \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-expire-reservations-cron.ts    # 1/1

docker compose down
```
**Total Docker E2E: 36/36** across 5 verifiers.

### Mutation grep (sale UI)
```bash
grep -rn "method:\s*['\"]POST\|method:\s*['\"]PUT\|method:\s*['\"]DELETE" src/components/sale "src/app/(app)/sale"
grep -rn "axios" src/components/sale "src/app/(app)/sale"
grep -rn "useMutation" src/components/sale "src/app/(app)/sale"
```
Expected: **EXACTLY 3 POSTs** (ConfirmBookingDialog + CancelBookingDialog + CreateOrderDialog). 0 axios. 0 useMutation.

### Production smoke (13 probes vs https://nazhahatyai.com)
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/                              # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/favicon.ico                   # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=th"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=zh"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/login                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/sale                          # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions        # 401
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions/dummy/broadcast-products  # 401
curl -sS -o /dev/null -w "%{http_code}\n" 'https://nazhahatyai.com/api/sale/bookings?liveSessionId=dummy'           # 401
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings/dummy/confirm -H "Content-Type: application/json" -d '{}'   # 401
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings/dummy/cancel -H "Content-Type: application/json" -d '{"targetStatus":"CANCELLED","reason":"test"}'   # 401
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/orders/from-bookings -H "Content-Type: application/json" -d '{"liveSessionId":"dummy","customerId":"dummy","bookingIds":["x"]}'   # 401
```

**Rate-limit caution:** do NOT hammer `/api/sale/*` probes more than ~5 per 15min per IP. Bucket shared per warm Vercel container. Auth-before-rate within 60-point budget preserves 401.

---

## 11. Critical contracts (DO NOT VIOLATE)

- **Stock invariant** (per §6 above): mutations decrement/increment exactly once across the full lifecycle.
- **Idempotency keys** are deterministic SHA-256-based or admin-supplied unique constraints. Repeating an idempotency-keyed request returns the existing row.
- **`AppError` subclasses** use `new.target.name` + `setPrototypeOf` + `captureStackTrace`. NEVER reintroduce `Object.freeze(this)` — breaks subclass `this.name` (fix from Commit `6681e0d`).
- **`resolveActiveReservation`** discriminated union (`'none' | 'one' | 'multiple'`). `'multiple'` MUST throw `RESERVATION_INTEGRITY_ERROR`. NEVER silent pick-first.
- **Atomic stock SQL** uses `tx.$executeRaw` with `WHERE quantity - reservedQty >= ?` predicate inside `prisma.$transaction`. NEVER read-then-update outside transaction.
- **`reservedQty`** is source of truth for available stock. `StockReservation.releasedAt` is audit anchor only.
- **`orderRepository.transition`** decrements `reservedQty` once + sets `releasedAt` once (CONFIRMED branch). DO NOT add second decrement path.
- **POST mutation routes** share single in-process `RateLimiterMemory` bucket per warm Vercel container. Default 20/15min; env override `RATE_LIMIT_MAX=60` ACTIVE in production.
- **Schema** is frozen. NO new migrations until explicit Boss approval.

---

## 12. Open risks / follow-ups

| Risk / item | Status |
|---|---|
| ORDER-RESERVATION-CLEANUP Commit 2 (backfill) | Plan ready; awaits ≥1 week post-Commits-1/3 stability + Boss approval |
| `transition('CANCELLED')` reservedQty release without `releasedAt` set | Same pattern bug; Boss narrowed scope to CONFIRMED only; could be small follow-up |
| Manual Create modal (2O-d) | Design ready (`458a5db`); ~500 LOC UI work; awaits Boss + ChatGPT GO |
| Authenticated production manual test | Checklist ready; Boss runs at own discretion using safe test data |
| Customer Panel: address / per-session booking count / channel identities | Intentionally deferred for PII / scope reasons; can add when concrete admin need surfaces |
| Pre-existing 2 socket TS errors | Acknowledged in 2M-a accept; not touched |
| Pre-existing storefront `orderNumber` race (`ORD-${count+1}`) | Same pattern in convertToOrder; out of scope |
| Cron resilience edge case | Cannot simulate "deleted-variant" failure due to FK restrict; multi-row test only |
| `expireReservations()` pre-Commit-1 reservedQty double-decrement risk | Mitigated by Commit 3 cron resilience + Commit 1 future-only fix; historical rows persist until backfill (Commit 2) |
| Inbox panel | Static placeholder; webhook + parser future phase |
| Playwright / automated smoke | Deferred; manual checklist authoritative |
| Per-IP rate limit shared across all sale mutation routes | Documented in handoffs; default 20→60 OK for current admin volume |
| Vercel serverless memory limiter | Per warm container, not global; mitigated only by Redis (Boss-disallowed) |

---

## 13. Recommended next steps (in order of safety)

1. **`docs(handoff): write session-migration handoff doc`** — THIS commit (you're reading it). Get reviewed in next session before code work.
2. **ORDER-RESERVATION-CLEANUP CANCELLED branch fix** — small follow-up mirroring Commit 1. Same pattern. Test with extension to `verify-order-reservation-cleanup.ts`.
3. **ORDER-RESERVATION-CLEANUP Commit 2 (backfill)** — after Commits 1+3 stable ≥1 week (currently ~2 days). Plan ready.
4. **2O-d Manual Create modal** — design ready; ~500 LOC. Split into 2O-d1/2/3/4 commits per design recommendation.
5. **Per-session booking count on Customer Panel** — small enhancement; depends on whether admin asks for it.

**Boss decides priority.** Strongest single recommendation: ship CANCELLED branch fix next (small, mirrors known-good pattern, completes the cleanup symmetry).

---

## 14. pak-ta-kra zero-touch reminder

This project is **liveshop-pro**. NOT pak-ta-kra.

DO NOT:
- Edit `~/.claude/skills/`, `~/.claude/CLAUDE.md`, or sibling pak-ta-kra repo from this project
- Apply pak-ta-kra path-specific routing (no `src/app/api/generate/image/**`, no castContext, no imagegenIntegrity, no brand DNA, no Imagen/Gemini/Fal here)
- Use THB / `฿` symbol — replaced with MYR / RM project-wide
- Write liveshop-pro memory entries to `~/.claude/projects/C--Users-Asus-COWORK-code/memory/` (that's pak-ta-kra-biased shared dir)

Memory namespace for liveshop-pro: `~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/`.

Start session from `liveshop-pro/` directory (NOT parent `COWORK/code/`) → memory namespace auto-isolates.

---

## 15. Bootstrap block — copy into next session

Paste everything below into the prompt of a fresh Claude session for instant context restore:

```
PROJECT: liveshop-pro (NOT pak-ta-kra)
Repo: C:\Users\Asus\COWORK\code\liveshop-pro
Branch: master @ 458a5db
Domain: nazhahatyai.com (Vercel auto-deploy on master push)
DB: Railway Postgres
Storage: Cloudflare R2 (images.nazhahatyai.com)
Currency: MYR (RM) — never THB / ฿

READ FIRST (in order):
1. docs/superpowers/handoffs/2026-05-13-resume-after-customer-panel-await-next-go.md
2. CLAUDE.md (project root)
3. AGENTS.md (project root)
4. docs/CODEMAP/README.md
5. docs/sale-api-map.md
6. docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md (living manual smoke)
7. docs/superpowers/2026-05-12-order-reservation-cleanup-dissent.md (cleanup status)
8. docs/superpowers/2026-04-06-sale-mvp-dissent.md (18 Boss decisions)
9. docs/superpowers/2026-05-09-sale-booking-runtime-design.md
10. docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md

ENGINEERING RULES (Boss-enforced — every task):
1. NO MAGIC — ห้ามเดา. Verify before assert.
2. VERIFY BEFORE DONE — paste tsc + vitest counts. Banned: "should work" / "fixed" / "this is correct".
3. DISSENT (4 bullets) — BEFORE first edit on MAJOR (schema / auth / API / payment / R2 / >3 files / >200 LOC / currency).
   Bullets: blast radius / assumptions / reversibility (R0/R1/R2) / blind spots.
4. SCOPE DRIFT GUARD — flag "while I'm here". Boss asked X, do X only. STOP + ASK to expand.
5. R0/R1/R2 REVERSIBILITY:
   - R0 irreversible (force push master / migrate reset / DROP / rotate secret / R2 delete / FB App live mode / Vercel deploy with failing tests / mass DELETE) — STOP, ASK FIRST.
   - R1 costly (Prisma migration / public API change / CSP / pricing / env var) — DO + EXPLAIN.
   - R2 cheap (comment / typo / test / log) — JUST DO.

PROJECT ISOLATION (zero-touch):
- pak-ta-kra paths / brands / sentinels / Imagen / Gemini / Fal / castContext / imagegenIntegrity / Drizzle / SQLite — DO NOT exist here.
- Global ~/.claude/CLAUDE.md is pak-ta-kra-biased. liveshop-pro/CLAUDE.md OVERRIDES.
- Memory namespace: ~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/ (NOT shared COWORK dir).
- Never edit ~/.claude/skills/, ~/.claude/CLAUDE.md, or sibling pak-ta-kra repo from this project.

STACK:
Next.js 16.2.2 + Turbopack + TS 5 strict + Prisma 7.6.0 + @prisma/adapter-pg + Postgres + next-auth 5 beta + next-intl 4.9 (cookie locale, localePrefix:'never') + Tailwind + shadcn/ui + Zod 4 + Vitest 4 + Playwright 1.59.

CURRENT STATE (HEAD = 458a5db):
- 4 commits shipped 2026-05-12 → 2026-05-13:
  - 9211ef3 fix(stock): expireReservations Promise.allSettled (ORDER-RESERVATION-CLEANUP Commit 3)
  - 298a9cf docs(sale): customer panel discovery
  - 776938d feat(sale): wire customer panel to /api/customers/[id] (Phase 4+5)
  - 458a5db docs(sale): Manual Create design + auth manual test checklist
- Last 13/13 production smoke PASS vs 458a5db deploy.
- tsc clean (2 pre-existing socket errors only).
- Full vitest 760/760 across 38 files.
- Docker E2E 36/36 across 5 verifiers (booking-flow 9 + booking-conversion 8 + booking-create 13 + order-reservation-cleanup 5 + expire-reservations-cron 1).
- Mutation grep on sale UI: EXACTLY 3 POSTs (Confirm + Cancel + CreateOrder).
- RATE_LIMIT_MAX=60 ACTIVE on Vercel Production (Boss set 2026-05-11).

BACKEND CAPABILITY:
- bookingRepository: confirm + cancel + convertToOrder + createManual (+ private _runConfirmInTx).
- Pure helpers in src/lib/sale/booking-rules.ts (82 unit tests).
- 7 sale routes shipped: 3 GET + 4 POST (all rate-limited per Commit 2N-HARDENING).
- orderRepository.transition('CONFIRMED') marks StockReservation.releasedAt atomically (ORDER-RESERVATION-CLEANUP Commit 1).
- expireReservations() cron uses Promise.allSettled + pino logger (Commit 3).

/sale UI CAPABILITY:
- 6 panels in workspace shell. 3 mutation dialogs (Confirm/Cancel/CreateOrder).
- Customer Panel reads /api/customers/[id] live since 2026-05-12.
- Booking row gating helpers (isBookingConfirmable/Cancellable/Selectable) + 93 unit tests.
- All 3 mutation dialogs use parallel error mapping (8 cases each) with Thai admin messages.

PENDING (NOT shipped, design only):
- ORDER-RESERVATION-CLEANUP Commit 2 (historical backfill) — awaits ≥1 week stability + Boss approval.
- transition('CANCELLED') branch — same bug pattern as Commit 1; Boss narrowed scope; could be small follow-up.
- 2O-d Manual Create modal — design at docs/superpowers/2026-05-12-sale-manual-create-booking-design.md.
- Per-session booking count enrichment on Customer Panel.
- Inbox panel webhook + parser (Phase 2+ future).

HARD NO-GO (cumulative):
- NO pak-ta-kra edits.
- NO production backfill (Commit 2 design only).
- NO production DB mutation except auth-gated unauth probes.
- NO schema.prisma edits.
- NO migrations.
- NO payment/slip/shipment behavior changes.
- NO Messenger/WhatsApp/Telegram.
- NO parser/webhook.
- NO customer-facing message generation.
- NO Vercel env changes.
- NO authenticated production mutations unless Boss explicit safe-booking test.
- NO 61-request rate-limit burst.
- NO Playwright full infra unless explicit cleanup phase.
- NO unrelated ErrorBoundary/logger/provider edits.
- NO pre-existing socket TS error fix unless dedicated scoped cleanup.

CRITICAL CONTRACTS (do not violate):
- Stock invariant: confirm reservedQty++. cancel from CONFIRMED reservedQty--. convertToOrder reservedQty unchanged. Order RESERVED→CONFIRMED quantity-- + reservedQty-- + releasedAt set. Order RESERVED→CANCELLED reservedQty-- (releasedAt NOT yet set — known follow-up).
- Idempotency keys deterministic SHA-256 16-char where applicable; manual create uses admin-supplied /^[A-Za-z0-9_-]{8,128}$/ unique on (shopId, idempotencyKey).
- AppError uses new.target.name + setPrototypeOf + captureStackTrace. NEVER reintroduce Object.freeze(this).
- resolveActiveReservation discriminated union ('none' | 'one' | 'multiple'). 'multiple' → throw RESERVATION_INTEGRITY_ERROR. NEVER silent pick-first.
- Atomic stock SQL: tx.$executeRaw with WHERE quantity - reservedQty >= ? predicate inside prisma.$transaction. NEVER read-then-update outside transaction.
- POST mutation routes share single in-process RateLimiterMemory per warm Vercel container. Default 20/15min; env RATE_LIMIT_MAX=60 ACTIVE.

VERIFICATION BEFORE "DONE":
- npx prisma generate
- npx tsc --noEmit (paste exit code; only 2 pre-existing socket errors allowed)
- npx vitest run (paste 760/760)
- Docker E2E (when needed):
  - npx tsx scripts/verify-booking-flow.ts (9/9)
  - npx tsx scripts/verify-booking-conversion.ts (8/8)
  - npx tsx scripts/verify-booking-create.ts (13/13)
  - npx tsx scripts/verify-order-reservation-cleanup.ts (5/5)
  - npx tsx scripts/verify-expire-reservations-cron.ts (1/1)
- Production smoke after master push: baseline 6/6 + /sale 307 + 3 GET unauth 401 + 3 POST unauth 401 = 13/13
- Mutation grep on src/components/sale + src/app/(app)/sale: EXACTLY 3 POSTs (no axios, no useMutation)
- Caveman mode active level: full. Drop articles + filler + pleasantries. Code/commits/security in normal sentences.
- After every report: proactively raise CD/CC/CN consultation items for Boss to forward to ChatGPT.

COMMUNICATION:
- Boss: Thai (with English code/error/file path). ChatGPT roundtrip: Thai-English mixed.
- All commits Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>.
- Production smoke must verify nazhahatyai.com after every Vercel deploy.
- Any contract change → update relevant docs/CODEMAP/<num>-*.md in same commit.

RECOMMENDED NEXT STEPS (in order of safety, Boss decides):
1. ORDER-RESERVATION-CLEANUP CANCELLED branch fix (small follow-up mirroring Commit 1)
2. ORDER-RESERVATION-CLEANUP Commit 2 historical backfill (after ≥1 week stable)
3. 2O-d Manual Create modal (~500 LOC, design ready)
4. Per-session booking count on Customer Panel

START WORK ONLY AFTER:
- Boss returns with ChatGPT review verdict
- Boss types GO for next commit
- Until then: idle, wait, do not edit code.
```

---

## 16. Memory namespace update

After ChatGPT review of this handoff, future Claude sessions should also update [~/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md](file:///C:/Users/Asus/.claude/projects/C--Users-Asus-COWORK-code-liveshop-pro/memory/MEMORY.md) "LATEST HANDOFF" section to point at this doc.

---

## Refs

- Project rules: [CLAUDE.md](../../../CLAUDE.md), [AGENTS.md](../../../AGENTS.md)
- Codemap index: [docs/CODEMAP/README.md](../../CODEMAP/README.md)
- Sale API map: [docs/sale-api-map.md](../../sale-api-map.md)
- Handoff index: [docs/superpowers/handoffs/README.md](README.md)
- Living smoke: [docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md](../2026-05-11-sale-read-only-manual-smoke.md)
- Prior handoffs:
  - 2026-05-11: [resume-after-sale-shell.md](2026-05-11-resume-after-sale-shell.md)
  - 2026-05-10: [resume-after-2M-c-await-2N-approval.md](2026-05-10-resume-after-2M-c-await-2N-approval.md)
  - 2026-05-10: [resume-after-2M-a-await-2M-b-approval.md](2026-05-10-resume-after-2M-a-await-2M-b-approval.md)

Working tree clean. HEAD `458a5db`. Awaiting Boss + ChatGPT review.
