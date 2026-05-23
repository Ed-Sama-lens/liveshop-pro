# Sale API Reference — Admin UI

**Filed:** 2026-05-23 (Block 3 Track E)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `0c7b6e0`
**Status:** Reference. No runtime change.

One-page reference for every `/api/sale/*` route + auth + request/
response shape. Use during UI development + smoke testing.

NO secrets. NO real Page IDs. NO real tokens. Placeholder values only.

---

## 1. Auth model summary

| Role | Read sale data | Mutate sale data | Hard delete |
|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ❌ (BP DELETE only) |
| CHAT_SUPPORT | ✅ | ❌ | ❌ |
| WAREHOUSE | ❌ | ❌ | ❌ |
| CUSTOMER | ❌ | ❌ | ❌ |

Every route requires `requireAuth()` + valid `user.shopId`. shopId
sourced from session, never from client query/body.

---

## 2. Endpoints

### 2.1 Live Sessions

#### `GET /api/sale/live-sessions`

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | number ≥1 | default 1 | |
| `limit` | number 1-100 | default 20 | |
| `status` | `SCHEDULED \| LIVE \| ENDED` | optional | |

Roles: OWNER / MANAGER / CHAT_SUPPORT.

Response:
```json
{ "success": true, "data": { "sessions": [...], "meta": { "total", "page", "limit" } } }
```

#### `GET /api/sale/live-sessions/[liveSessionId]/broadcast-products`

Legacy live-bound BP listing. Returns BPs scoped to one LiveSession.
Roles same as above.

---

### 2.2 Broadcast Products (date-anchored)

#### `GET /api/sale/broadcast-products`

| Param | Type | Required | Notes |
|---|---|---|---|
| `scope` | `all \| evergreen \| live` | default `all` | |
| `liveSessionId` | string | optional | event filter |
| `q` | string | optional | search by displayCode/product name/SKU |
| `saleDate` | `YYYY-MM-DD` or `untagged` | optional | date filter (Tier 3.9) |
| `limit` | number 1-200 | default 100 | |

Roles: OWNER / MANAGER / CHAT_SUPPORT.

Response:
```json
{
  "success": true,
  "data": {
    "scope": "all",
    "currency": "MYR",
    "saleDate": "2026-05-23" | null,
    "products": [
      {
        "broadcastProductId", "shopId", "liveSessionId",
        "displayCode", "displayOrder", "isPinned",
        "productId", "productName", "variantId", "sku",
        "attributes", "unitPrice", "priceOverride",
        "stockQuantity", "reservedQty", "availableQty",
        "imageUrl", "createdAt", "saleDate"
      }
    ]
  }
}
```

#### `POST /api/sale/broadcast-products`

Create single BP. Roles: OWNER / MANAGER. Schema:
`createBroadcastProductBodySchema`.

#### `POST /api/sale/broadcast-products/batch`

Tier 3.9-C batch create. Roles: OWNER / MANAGER. Atomic — any
duplicate displayCode or missing variant rolls back the entire batch.

Body:
```json
{
  "items": [{ "variantId", "displayCode", "priceOverride?" }],
  "liveSessionId?": "...",
  "saleDate?": "YYYY-MM-DD"
}
```

#### `PATCH /api/sale/broadcast-products/[id]`

Update BP. Roles: OWNER / MANAGER. Validates `[id]` ≤ 128 chars.

#### `DELETE /api/sale/broadcast-products/[id]`

Hard delete. **OWNER only**. MANAGER → 403.

---

### 2.3 Quick Product Codes (Tier 3.8)

#### `POST /api/sale/quick-product-codes`

Atomic Product + Variant + BroadcastProduct create. Single (no
startNo/endNo) or bulk (1-100).

Roles: OWNER / MANAGER.

Body:
```json
{
  "stockCodeBase": "20.5.2026-CM",
  "saleCodeBase": "CM",
  "categoryId?": "...",
  "productName?": "...",
  "productDetails?": "...",
  "imageUrl?": "https://...",
  "startNo?": 1,
  "endNo?": 67,
  "quantity?": 1,
  "lowStockAt?": 5,
  "price?": "10.00",
  "cost?": "7.00",
  "saleDate?": "YYYY-MM-DD"
}
```

Response: `{ createdCount, items: [{ productId, variantId, broadcastProductId, stockCode, saleCode, displayCode }] }`.

---

### 2.4 Bookings

#### `GET /api/sale/bookings`

| Param | Type | Required | Notes |
|---|---|---|---|
| `liveSessionId` | string | one of liveSessionId or saleDate | event filter |
| `saleDate` | `YYYY-MM-DD` | one of liveSessionId or saleDate | Tier 3.9 date filter |
| `status` | BookingStatus | optional | |
| `customerId` | string | optional | |
| `limit` | number 1-100 | default 50 | |

Roles: OWNER / MANAGER / CHAT_SUPPORT.

Response items include `reservationIntegrity` field
('OK' | 'MISSING' | 'MULTIPLE' | 'NOT_APPLICABLE') per booking.

#### `POST /api/sale/bookings`

Manual create. Roles: OWNER / MANAGER. Body:
`createBookingBodySchema` — broadcastProductId + customerId +
quantity + status (PENDING_REVIEW default) + idempotencyKey?.

#### `POST /api/sale/bookings/[bookingId]/confirm`

Roles: OWNER / MANAGER. Reserves stock atomically. Idempotent on
already-CONFIRMED.

#### `POST /api/sale/bookings/[bookingId]/cancel`

Roles: OWNER / MANAGER. Body: `{ targetStatus: 'CANCELLED' | 'EXPIRED', reason?: string }`.
Releases stock when transitioning from CONFIRMED.

---

### 2.5 Order conversion

#### `POST /api/sale/orders/from-bookings`

Roles: OWNER / MANAGER. Body:

V1 legacy:
```json
{ "liveSessionId", "customerId", "bookingIds": ["..."] }
```

V2 omnichannel (flag-gated):
```json
{ "bookingIds": ["..."] }
```

Cap: 100 bookings per call.

---

### 2.6 Customer search (PII-safe)

#### `GET /api/sale/customers/search`

| Param | Type | Required | Notes |
|---|---|---|---|
| `q` | string 2-128 chars | YES | |
| `limit` | number 1-20 | default 20 | |

Roles: OWNER / MANAGER / CHAT_SUPPORT.

Returns 6-field minimal Customer shape (id / name / phone last 4 /
hasOpenBookings / lifetimeValue / labels). NO full phone, NO email,
NO address, NO notes.

---

### 2.7 Sale Operations Summary

#### `GET /api/sale/summary` — single day mode

| Param | Type | Required |
|---|---|---|
| `saleDate` | `YYYY-MM-DD` | YES |

Roles: OWNER / MANAGER / CHAT_SUPPORT.

Response: `{ saleDate, shopId, currency, items[], totals }`.

`items[].stock`, `items[].bookings`, `items[].orders` blocks.
`totals.totalOrders` = distinct order count.
`totals.totalOrderTouches` = sum of per-BP order count.

#### `GET /api/sale/summary` — range mode

| Param | Type | Required |
|---|---|---|
| `from` | `YYYY-MM-DD` | YES |
| `to` | `YYYY-MM-DD` ≤ from + 31 days | YES |

Mutually exclusive with `saleDate`. Ambiguous combo → 400.

Response: `{ from, to, shopId, currency, days[], byCode[], totals, stockSnapshotNote }`.

`days[]` = per-day summary, `byCode[]` = per-displayCode rollup across
range. `stockSnapshotNote` documents that stock fields are current,
NOT historical.

---

## 3. Error envelope

All routes return `{ success: false, error: "<msg>", fields?: Record<string, string[]> }` on error.

| Status | Cause |
|---|---|
| 400 | validation failure (Zod schema or repo guard) |
| 401 | unauth |
| 403 | wrong role / no shopId |
| 404 | resource not found / cross-shop attempt |
| 409 | duplicate (displayCode / sku / stockCode) |
| 422 | semantic conflict (e.g. cancel terminal booking) |
| 500 | unexpected |

---

## 4. Rate limits

Most mutation routes wrap with `withRateLimit()` middleware: 20 calls
per 15 min per IP, shared bucket. Adjustable via `RATE_LIMIT_MAX` env
(current production: 60).

Read routes (GET) NOT rate-limited.

---

## 5. Hard rules

- ❌ Never include customer phone / email / address in any sale response
- ❌ Never accept client-supplied shopId
- ❌ Never trust client status (server transitions enforce state machine)
- ❌ Never delete BroadcastProduct from MANAGER role
- ❌ Never auto-create bookings from parser (Tier 4.7+)
- ❌ Never send outbound message (Tier 4.5+)

---

## 6. Cross-references

- Route security audit: `2026-05-22-sale-route-security-permissions-audit.md` (PR #56)
- Sale flow codemap: `docs/CODEMAP/14-sale-flow.md` (PR #94)
- State machine audit: `2026-05-23-stock-booking-state-machine-audit.md` (PR #95)
- Sale summary design: `2026-05-23-sale-operations-summary-design.md`
- Sale summary range design: `2026-05-23-sale-summary-date-range-plan.md`

---

## 7. Decision

This doc lands as `docs(sale): route/API reference for admin UI`. Zero
runtime. Future UI work references this when consuming sale endpoints.
