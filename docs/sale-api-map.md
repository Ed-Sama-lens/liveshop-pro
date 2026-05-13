# /sale API map

Reference for every route under `/api/sale/*` and the /sale admin page. Updated 2026-05-13 after Manual Create UI ships (POST `/api/sale/bookings` now reachable from `/sale` workspace via ManualCreateBookingDialog).

## Routes

| Method | Path | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| GET  | `/api/sale/live-sessions` | List shop's live sessions. Paginated. | OWNER / MANAGER / CHAT_SUPPORT | — |
| GET  | `/api/sale/live-sessions/[liveSessionId]/broadcast-products` | BroadcastProduct rows for one session with variant + product + stock. | OWNER / MANAGER / CHAT_SUPPORT | — |
| GET  | `/api/sale/bookings?liveSessionId=…` | Booking queue for one session. `liveSessionId` required. | OWNER / MANAGER / CHAT_SUPPORT | — |
| GET  | `/api/sale/customers/search?q=…&limit=…` | Minimal PII-safe customer lookup for Manual Create. Returns only customerId / name / phone / email / isBanned / orderCount. | OWNER / MANAGER / CHAT_SUPPORT | — |
| POST | `/api/sale/bookings` | Manual booking create. `status: PENDING_REVIEW | CONFIRMED`. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/bookings/[bookingId]/confirm` | Confirm a PENDING_REVIEW booking + reserve stock. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/bookings/[bookingId]/cancel` | Cancel/expire booking + release stock. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/orders/from-bookings` | Convert CONFIRMED bookings into one Order(RESERVED). | OWNER / MANAGER | shared IP bucket |

Rate limit: shared in-process bucket per source IP via `withRateLimit` from [src/lib/validation/middleware.ts](../src/lib/validation/middleware.ts). Default 20 points / 900_000 ms; Vercel Production env `RATE_LIMIT_MAX=60` is **active** (Boss 2026-05-11). All 4 POST mutation routes share one bucket. GET routes intentionally not rate-limited. Env overrides: `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`.

## RBAC matrix

| Action | OWNER | MANAGER | CHAT_SUPPORT | WAREHOUSE | CUSTOMER |
|---|---|---|---|---|---|
| Read `/sale` page | yes | yes | yes (read-level per RBAC §9) | no | no |
| GET sessions / products / bookings | yes | yes | yes | no | no |
| POST create / confirm / cancel / convert | yes | yes | **no** | no | no |

CHAT_SUPPORT can render the /sale page and read the data so they can answer customer questions in chat. They cannot mutate. RBAC source of truth: [src/lib/auth/permissions.ts](../src/lib/auth/permissions.ts).

## Repository methods (`src/server/repositories/booking.repository.ts`)

| Method | Used by |
|---|---|
| `confirm({bookingId, shopId, changedById})` | POST `[id]/confirm` (Commit 2E) + internal `_runConfirmInTx` reuse from `createManual` (2M-a / 2M-b). |
| `cancel({bookingId, shopId, changedById, targetStatus, reason?})` | POST `[id]/cancel` (Commit 2E). |
| `convertToOrder({shopId, liveSessionId, customerId, changedById, bookingIds?})` | POST `/orders/from-bookings` (Commit 2I). |
| `createManual({shopId, liveSessionId, customerId, broadcastProductId, quantity, status, idempotencyKey?, changedById})` | POST `/api/sale/bookings` (Commit 2N). Reuses `_runConfirmInTx` inline for `status='CONFIRMED'`. |

## Response envelopes

### Success
```json
{ "success": true, "data": { ... } }
```

GET list responses (2P, 2Q, 2R) currently set:

- 2P: `data: { sessions: [...] }, meta: { total, page, limit, totalPages }`
- 2Q: `data: { liveSessionId, currency: "MYR", products: [...], filteredInvalidCount }`
- 2R: `data: { liveSessionId, currency: "MYR", bookings: [{ ..., reservationIntegrity, activeReservationCount, activeReservationId }] }`
- 2N (POST): `data: { bookingId, status, quantity, unitPrice, broadcastProductId, customerId, liveSessionId, idempotent, reservation }`

### Booking `reservationIntegrity` discriminator (added Commit 2T)

| Label | Meaning |
|---|---|
| `OK` | `status === 'CONFIRMED'` AND exactly 1 active reservation → `activeReservationId` is set. |
| `MISSING` | `status === 'CONFIRMED'` AND 0 active reservations → data corruption. Confirm/cancel/convert flows raise `RESERVATION_INTEGRITY_ERROR` on this. |
| `MULTIPLE` | ≥2 active reservations regardless of status → data corruption. |
| `NOT_APPLICABLE` | Non-CONFIRMED status (PENDING_REVIEW / CANCELLED / EXPIRED / CONVERTED_TO_ORDER) with 0 or 1 active reservation. `activeReservationId` may still be set when count === 1 (stale-on-terminal hint). |

### Broadcast products `filteredInvalidCount` (added Commit 2T)

Non-zero value means the route rejected one or more BroadcastProduct rows that failed cross-shop defense (null variant, variant.product.shopId mismatch, or product.shopId mismatch). Specific corrupt rows are NOT exposed — admin should investigate via internal data tooling.

### Error
```json
{ "success": false, "error": "message" }
```

Validation errors include `fields: { fieldPath: ["msg"] }`. Status codes:

| Code | Reason |
|---|---|
| 400 | Validation failure (bad query / body) |
| 401 | Unauthenticated |
| 403 | Forbidden — no shopId / wrong role |
| 404 | Customer / BroadcastProduct / LiveSession not found for this shop |
| 409 | Cross-shop / banned customer / insufficient stock / idempotency payload mismatch |
| 422 | VARIANT_REQUIRED |
| 429 | Rate limit exceeded (POST only). Includes `Retry-After` header. |
| 500 | RESERVATION_INTEGRITY_ERROR / unknown |

## /sale page (Commit 2L-a → 2L-b → 2S → 2O-a/b/c2 → Customer Panel → Manual Create)

File: [src/app/(app)/sale/page.tsx](../src/app/(app)/sale/page.tsx) renders [SaleWorkspaceShell](../src/components/sale/SaleWorkspaceShell.tsx) (`'use client'`).

Six panels (each wrapped in `ErrorBoundarySection`) + four dialog surfaces:

| Panel / Surface | Source | Wired in |
|---|---|---|
| Live Sessions / รอบไลฟ์ | GET /api/sale/live-sessions | 2S |
| Product Codes / รหัสสินค้า | GET /api/sale/live-sessions/[id]/broadcast-products | 2S |
| Customer Bookings / รายการจอง | GET /api/sale/bookings?liveSessionId=… | 2S |
| Booking row Confirm action | POST /api/sale/bookings/[id]/confirm | 2O-a |
| Booking row Cancel action | POST /api/sale/bookings/[id]/cancel | 2O-b |
| Booking row Select + Create Order | POST /api/sale/orders/from-bookings | 2O-c2 |
| Manual Create dialog (customer search) | GET /api/sale/customers/search?q= (sale-scoped minimal PII route) | Push harden (2026-05-13) |
| Manual Create dialog (submit) | POST /api/sale/bookings | Manual Create Phase 4 (2026-05-13) |
| Customer Panel / ข้อมูลลูกค้า | GET /api/customers/[id] (existing admin route reused) | Customer Panel (2026-05-12) |
| Inbox (Coming Soon) | static | future phase — see omnichannel discovery doc 2026-05-13 |

Auto-selection picks LIVE → SCHEDULED → first. No interactive selector yet. Mutation surface count: **4 intentional POSTs** (Confirm + Cancel + CreateOrder + ManualCreate). All other action buttons remain `<Button disabled>` until explicit Boss approval.

### Mutation grep contract

```bash
grep -R "method: 'POST'\|method: \"POST\"\|axios\|useMutation" \
  src/components/sale src/app/\(app\)/sale
```

Must return exactly 4 hits, all confined to:
- `src/components/sale/ConfirmBookingDialog.tsx`
- `src/components/sale/CancelBookingDialog.tsx`
- `src/components/sale/CreateOrderDialog.tsx`
- `src/components/sale/ManualCreateBookingDialog.tsx`

Any additional hit is a regression — investigate before merge.

## Money formatting

Shared helper: [src/lib/api/money.ts](../src/lib/api/money.ts) `formatMoney2(raw)` → fixed-2-decimal string. Used by GET 2Q, GET 2R, POST 2N. Confirm/cancel/conversion responses still return raw `Decimal.toString()` (e.g. `5.5`) — adopting the shared helper there is a future TEST-CLEANUP item.

## Verifiers (Docker, non-production only)

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
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-order-reservation-cleanup.ts  # 5/5

CONFIRM_NON_PROD_DB=true \
  DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
  npx tsx scripts/verify-expire-reservations-cron.ts   # 1/1
```

Total Docker E2E coverage: **36/36** across 5 verifiers (9 + 8 + 13 + 5 + 1).

Production database is OFF-LIMITS for these scripts — guard refuses to run unless `CONFIRM_NON_PROD_DB=true` and host is local.

## Production smoke probes

```bash
# Baseline (6/6)
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/                              # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/favicon.ico                   # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=th"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=zh"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/login                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin                         # 307

# /sale gate
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/sale                          # 307

# Sale API auth gates (GET — not rate-limited)
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions                                  # 401
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions/dummy/broadcast-products         # 401
curl -sS -o /dev/null -w "%{http_code}\n" 'https://nazhahatyai.com/api/sale/bookings?liveSessionId=dummy'                 # 401
curl -sS -o /dev/null -w "%{http_code}\n" 'https://nazhahatyai.com/api/sale/customers/search?q=ab'                        # 401

# POST mutation auth gates (rate-limited — probe SPARINGLY, one shot each)
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings                       -H "Content-Type: application/json" -d '{}'   # 401 within budget
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings/dummy/confirm         -H "Content-Type: application/json" -d '{}'   # 401 within budget
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings/dummy/cancel          -H "Content-Type: application/json" -d '{"targetStatus":"CANCELLED"}'   # 401 within budget
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/orders/from-bookings           -H "Content-Type: application/json" -d '{}'   # 401 within budget
```

Total probe count = **14/14** when all pass: 6 baseline + 1 /sale + 4 sale GET (incl new customers/search) + 3+1 POST.

Never call authenticated POSTs against production. Boss runs the [authenticated manual test checklist](superpowers/2026-05-12-sale-authenticated-manual-test-checklist.md) for production write-side validation.

## Refs

- Living manual smoke (incl. Manual Create section): [docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md](superpowers/2026-05-11-sale-read-only-manual-smoke.md)
- Authenticated manual test checklist: [docs/superpowers/2026-05-12-sale-authenticated-manual-test-checklist.md](superpowers/2026-05-12-sale-authenticated-manual-test-checklist.md)
- Boss decision doc: [docs/superpowers/2026-04-06-sale-mvp-dissent.md](superpowers/2026-04-06-sale-mvp-dissent.md)
- Runtime design: [docs/superpowers/2026-05-09-sale-booking-runtime-design.md](superpowers/2026-05-09-sale-booking-runtime-design.md)
- Conversion design: [docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md](superpowers/2026-05-09-booking-to-order-conversion-dissent.md)
- Manual create dissent (Phase 2N route): [docs/superpowers/2026-05-09-manual-booking-create-dissent.md](superpowers/2026-05-09-manual-booking-create-dissent.md)
- Manual create design (UI): [docs/superpowers/2026-05-12-sale-manual-create-booking-design.md](superpowers/2026-05-12-sale-manual-create-booking-design.md)
- Manual create Phase 1 audit: [docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md](superpowers/2026-05-13-sale-manual-create-booking-readiness.md)
- Customer Panel design: [docs/superpowers/2026-05-12-sale-customer-panel-design.md](superpowers/2026-05-12-sale-customer-panel-design.md)
- Order reservation cleanup design: [docs/superpowers/2026-05-12-order-reservation-cleanup-dissent.md](superpowers/2026-05-12-order-reservation-cleanup-dissent.md)
- Omnichannel inbox discovery (future runtime): [docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md](superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md)
- Handoff index: [docs/superpowers/handoffs/README.md](superpowers/handoffs/README.md)
