# /sale API map

Reference for every route under `/api/sale/*` and the /sale admin page. Updated 2026-05-11 after Commit 2S (UI wiring to read-only APIs).

## Routes

| Method | Path | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| GET  | `/api/sale/live-sessions` | List shop's live sessions. Paginated. | OWNER / MANAGER / CHAT_SUPPORT | — |
| GET  | `/api/sale/live-sessions/[liveSessionId]/broadcast-products` | BroadcastProduct rows for one session with variant + product + stock. | OWNER / MANAGER / CHAT_SUPPORT | — |
| GET  | `/api/sale/bookings?liveSessionId=…` | Booking queue for one session. `liveSessionId` required. | OWNER / MANAGER / CHAT_SUPPORT | — |
| POST | `/api/sale/bookings` | Manual booking create. `status: PENDING_REVIEW | CONFIRMED`. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/bookings/[bookingId]/confirm` | Confirm a PENDING_REVIEW booking + reserve stock. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/bookings/[bookingId]/cancel` | Cancel/expire booking + release stock. | OWNER / MANAGER | shared IP bucket |
| POST | `/api/sale/orders/from-bookings` | Convert CONFIRMED bookings into one Order(RESERVED). | OWNER / MANAGER | shared IP bucket |

Rate limit: 20 points / 900_000 ms per source IP (`withRateLimit` from [src/lib/validation/middleware.ts](../src/lib/validation/middleware.ts)). All 4 mutation routes share one in-process bucket. GET routes are intentionally not rate-limited. Env overrides: `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`.

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
- 2Q: `data: { liveSessionId, currency: "MYR", products: [...] }`
- 2R: `data: { liveSessionId, currency: "MYR", bookings: [...] }`
- 2N (POST): `data: { bookingId, status, quantity, unitPrice, broadcastProductId, customerId, liveSessionId, idempotent, reservation }`

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

## /sale page (Commit 2L-a → 2L-b → 2S)

File: [src/app/(app)/sale/page.tsx](../src/app/(app)/sale/page.tsx) renders [SaleWorkspaceShell](../src/components/sale/SaleWorkspaceShell.tsx) (`'use client'`).

Six panels, each wrapped in `ErrorBoundarySection`:

| Panel | Source | Wired in |
|---|---|---|
| Live Sessions / รอบไลฟ์ | GET /api/sale/live-sessions | 2S |
| Product Codes / รหัสสินค้า | GET /api/sale/live-sessions/[id]/broadcast-products | 2S |
| Customer Bookings / รายการจอง | GET /api/sale/bookings?liveSessionId=… | 2S |
| Customer Panel / ข้อมูลลูกค้า | demo data only | pending |
| Create Order / สร้างออเดอร์ | demo data only | pending |
| Inbox (Coming Soon) | static | future phase |

Auto-selection picks LIVE → SCHEDULED → first. No interactive selector yet. All action buttons are `<Button disabled>` per the strict no-mutation contract.

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
```

Production database is OFF-LIMITS for these scripts — guard refuses to run unless `CONFIRM_NON_PROD_DB=true` and host is local.

## Production smoke probes

```bash
# Baseline
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/                              # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/favicon.ico                   # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=th"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" -L https://nazhahatyai.com/ -H "Cookie: NEXT_LOCALE=zh"  # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/login                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/admin                         # 307
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/sale                          # 307

# Sale API auth gates (GET — not rate-limited)
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions                                  # 401
curl -sS -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/live-sessions/dummy/broadcast-products         # 401
curl -sS -o /dev/null -w "%{http_code}\n" 'https://nazhahatyai.com/api/sale/bookings?liveSessionId=dummy'                 # 401

# POST mutation auth gates (rate-limited — probe SPARINGLY)
curl -sS -X POST -o /dev/null -w "%{http_code}\n" https://nazhahatyai.com/api/sale/bookings -H "Content-Type: application/json" -d '{}'   # 401 within budget, else 429
```

Never call authenticated POSTs against production.

## Refs

- Boss decision doc: [docs/superpowers/2026-04-06-sale-mvp-dissent.md](superpowers/2026-04-06-sale-mvp-dissent.md)
- Runtime design: [docs/superpowers/2026-05-09-sale-booking-runtime-design.md](superpowers/2026-05-09-sale-booking-runtime-design.md)
- Conversion design: [docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md](superpowers/2026-05-09-booking-to-order-conversion-dissent.md)
- Manual create dissent: [docs/superpowers/2026-05-09-manual-booking-create-dissent.md](superpowers/2026-05-09-manual-booking-create-dissent.md)
- Handoff index: [docs/superpowers/handoffs/README.md](superpowers/handoffs/README.md)
