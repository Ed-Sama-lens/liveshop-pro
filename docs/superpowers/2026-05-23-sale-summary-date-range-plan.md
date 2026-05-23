# Sale Summary — Date Range Plan

**Filed:** 2026-05-23 (Block D — daytime autonomous continuation)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `8503b2f` (post #68 #69 merge)
**Status:** Design only. Builds on PR #70 single-date implementation.

This doc sequences the analytics buildup on top of the single-date
`GET /api/sale/summary?saleDate=YYYY-MM-DD` that ships in PR #70.

---

## 1. Scope of this doc

Define the next 4-5 PRs that turn the single-day summary into a useful
admin reporting surface. **No runtime code in this PR.**

In-scope topics (covered by this doc):

- 7-day range query
- Custom range query
- Per-product-code totals (within range)
- Per-customer totals (within range, with PII gates)
- Per-admin totals (audit-style, later)
- Per-channel totals (FB / Telegram / WA / etc, later — depends on Tier 4.x)
- CSV export
- Relationship to the Oho-style inbox analytics (Tier 5+)

Out-of-scope:

- Implementation
- Schema changes
- UI mockups
- Real-time / streaming aggregation
- Cross-shop analytics (intentionally never)

---

## 2. PR sequence (locked)

| PR | Title | Risk | Depends |
|---|---|---|---|
| 3.9-G5 | `feat(sale): summary range query (?from=...&to=...)` | R1 | PR #70 merged |
| 3.9-G6 | `feat(sale): summary per-product-code totals within range` | R1 | G5 |
| 3.9-G7 | `feat(sale): summary per-customer totals (PII-gated)` | R1 | G5 |
| 3.9-G8 | `feat(sale): summary per-admin attribution` | R1 | G5 + audit log surface |
| 3.9-G9 | `feat(sale): summary CSV export` | R1 | G5 |
| 5.x-A | `feat(inbox+sale): channel-level analytics rollup` | R1 | Tier 4.x channel data |

Each PR independently reviewable. None of them modifies the single-day
path landed in PR #70.

---

## 3. PR 3.9-G5 — range query

### Route

`GET /api/sale/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Co-exists with the single-date path. The route handler picks the
schema based on which params are present:

- `?saleDate=...` only → single-date schema (existing)
- `?from=...&to=...` → range schema (new)
- Other combinations → 400

### Schema

```ts
export const saleSummaryRangeQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({
        code: 'custom',
        message: 'to must be >= from',
        path: ['to'],
      });
    }
  });
```

### Response shape

```json
{
  "success": true,
  "data": {
    "from": "2026-05-17",
    "to": "2026-05-23",
    "shopId": "...",
    "currency": "MYR",
    "days": [
      { "saleDate": "2026-05-17", "items": [...], "totals": {...} },
      { "saleDate": "2026-05-18", "items": [...], "totals": {...} },
      ...
    ],
    "rangeTotals": {
      "broadcastProductCount": 12,    // union of distinct BPs in range
      "totalBookings": 134,
      "totalOrders": 41,
      "totalOrderedQuantity": 187,
      "totalGross": "5230.00"
    }
  }
}
```

### Query strategy

- Cap range at **31 days** to bound query cost (configurable later)
- For each day in range, call existing `summarizeByDate({ shopId, saleDate })` — simplest implementation; reuses existing code path
- Optimization (later PR): single query with date grouping, but not in G5

### Auth

Same as single-date: OWNER / MANAGER / CHAT_SUPPORT.

### Tests

- 401 unauth / 403 no shopId / 403 wrong role
- 400 `from` missing / 400 `to` missing / 400 `to < from` / 400 bad format
- 400 when range > 31 days
- 400 when both `saleDate` and `from/to` supplied
- Cross-shop isolation
- Repository called N times for N-day range

---

## 4. PR 3.9-G6 — per-product-code totals within range

### Endpoint

`GET /api/sale/summary/by-code?from=...&to=...`

Returns one row per distinct `displayCode` aggregating across the range.

### Response shape

```json
{
  "success": true,
  "data": {
    "from": "...",
    "to": "...",
    "items": [
      {
        "displayCode": "CM1",
        "totalBookings": 24,
        "totalOrders": 8,
        "totalOrderedQuantity": 12,
        "totalGross": "150.00",
        "appearedOn": ["2026-05-17", "2026-05-19", "2026-05-23"]
      }
    ]
  }
}
```

### Implementation

- Fan out single-date queries; fold by `displayCode` in JS (max 31 days × ~50 codes/day = ~1500 rows)
- Future: dedicated SQL aggregation if perf matters

---

## 5. PR 3.9-G7 — per-customer totals (PII-gated)

### Endpoint

`GET /api/sale/summary/by-customer?from=...&to=...`

### PII rules

- Returns `customerId` (opaque)
- Returns `customerName` ONLY for OWNER / MANAGER roles (NOT CHAT_SUPPORT — they can see customer-level only via direct booking access for triage, not aggregate exports)
- Never returns phone / email / address

### Response shape

```json
{
  "items": [
    {
      "customerId": "...",
      "customerName": "Boss-visible name",
      "totalBookings": 12,
      "totalConfirmed": 9,
      "totalCancelled": 2,
      "totalConverted": 7,
      "totalOrderedQuantity": 14,
      "totalGross": "240.00",
      "firstSeenSaleDate": "2026-05-17",
      "lastSeenSaleDate": "2026-05-23"
    }
  ]
}
```

### Hard rules

- `customerName` is the *current* name from `Customer.name` (no history)
- No phone / email / address ever
- Cross-shop isolation strict (Customer is shop-scoped)
- Rate-limited to prevent enumeration

---

## 6. PR 3.9-G8 — per-admin attribution

### Endpoint

`GET /api/sale/summary/by-admin?from=...&to=...`

### Source

- `Booking.createdById` (existing column)
- `Order.customerId` doesn't reveal admin; instead join via the converting booking's `createdById`

### Response shape

```json
{
  "items": [
    {
      "userId": "...",
      "userName": "Admin A",
      "manualBookingsCreated": 32,
      "bookingsConfirmed": 28,
      "bookingsCancelled": 4,
      "ordersConverted": 22
    }
  ]
}
```

### Auth

- OWNER / MANAGER only (admin attribution = managerial)
- CHAT_SUPPORT denied
- WAREHOUSE denied

### Future

- Average response time per admin (Tier 5+, needs inbox message read time)
- Conversion rate (booking → order) per admin

---

## 7. PR 3.9-G9 — CSV export

### Endpoint

`GET /api/sale/summary/export.csv?from=...&to=...&shape=daily|by-code|by-customer`

### Constraints

- Same auth as the underlying read endpoint
- `Content-Type: text/csv; charset=utf-8`
- BOM-prefixed for Excel
- Streamed for ranges > 1 day
- No PII fields in `daily` / `by-code` shapes
- `by-customer` shape requires OWNER / MANAGER (CHAT_SUPPORT denied)

### Rate limit

- 5 exports per IP per 5 minutes (existing rate-limit middleware)
- Logged via `activity.service` for audit

---

## 8. PR 5.x-A — channel-level analytics rollup

Depends on Tier 4.x landing the per-channel ingestion adapters
(`ChannelAdapter` per the Oho doc PR #65).

Adds `?channels=facebook,telegram,whatsapp` filter to the range
endpoint. Per channel:

- Inbound message count
- Conversion rate (message → booking → order)
- Avg time-to-confirm
- Per-channel revenue split

Defer until at least Tier 4.1 (FB receive-only) has shipped + a few
weeks of data exist.

---

## 9. Relationship to the Oho inbox

PR #65 designed the Oho-style inbox at `/inbox`. That module owns
conversation-level analytics (open / pending / resolved counters,
admin owner workload). This summary module owns sale-level analytics
(bookings, orders, RM).

Both modules read from the same store; they expose different lenses:

| Lens | Owns |
|---|---|
| `/sale` summary | per-saleDate, per-BP, per-customer, per-admin sale metrics |
| `/inbox` analytics | per-conversation, per-channel, response-time, owner workload |

Where they overlap:

- Per-channel revenue (PR 5.x-A above) reads channel from
  `ChannelIdentity.platform` + joins to `Booking.channelIdentityId`
- Per-admin attribution (G8) is sale-side; inbox-side per-admin
  workload (Tier 5+) reads `Conversation.assignedUserId`

Both modules avoid duplicate aggregation surfaces.

---

## 10. Hard no-go

- ❌ No production mutation
- ❌ No customer PII beyond name (and only for OWNER/MANAGER)
- ❌ No cross-shop data
- ❌ No schema change in G5 / G6 / G7
- ❌ G8 may need `Booking.createdById` index check; verify before implementation
- ❌ No real-time / streaming aggregation in this design (separate Tier 5+ effort)
- ❌ No outbound messaging
- ❌ No Facebook runtime
- ❌ pak-ta-kra untouched

---

## 11. Open questions for Boss + ChatGPT

1. Range cap: 31 days reasonable, or shorter (e.g. 7) for v1?
2. `by-customer` shape: should `customerName` be redacted for CHAT_SUPPORT or just denied entirely?
3. CSV export: include or exclude `customerName` in `by-customer` shape's CSV when caller is OWNER/MANAGER?
4. Per-admin attribution: count `manualBookingsCreated` only on `source = MANUAL`, or all bookings with `createdById`?
5. Channel rollup (PR 5.x-A): wait for Tier 4.4 (WhatsApp) before shipping, or ship after Tier 4.1 (FB-only) for early signal?

---

## 12. Cross-references

- PR #70 — single-date `GET /api/sale/summary` implementation
- PR #61 — Sale Operations Summary design (parent)
- PR #65 — Oho unified inbox architecture
- PR #56 — route security audit (RBAC baseline)
- `prisma/schema.prisma` — `Booking.createdById`, `Customer.name`, `ChannelIdentity.platform`

---

## 13. Decision

This doc lands as `docs(sale): summary date-range + analytics plan`.
Zero runtime. Boss + ChatGPT verdict on §2 PR sequence + §11 open
questions unlocks PR 3.9-G5.
