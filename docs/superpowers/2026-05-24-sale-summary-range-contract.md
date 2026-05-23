# Sale Summary Range API Contract

**Filed:** 2026-05-24 (autonomous Track 4)
**Author:** Claude Sonnet 4.6
**Master baseline:** `b0774a5` (post #107 handoff merge)
**Status:** Contract reference. No runtime change.

One-page reference for `GET /api/sale/summary` covering both
single-day and range modes. Use during UI development + smoke
testing. Companion to existing single-day API ref in
`docs/superpowers/2026-05-23-sale-api-reference.md`.

NO secrets. NO PII. Placeholder values only.

---

## 1. Endpoint

### `GET /api/sale/summary`

Three mutually-exclusive query modes:

| Mode | Query | Repository |
|---|---|---|
| Single day (default) | `?saleDate=YYYY-MM-DD` | `saleSummaryRepository.summarizeByDate` |
| Range | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `saleSummaryRepository.summarizeByDateRange` |
| Today | (no params) | single-day with today resolved in shop timezone |

**Auth:** `requireAuth()` + valid `user.shopId`. OWNER + MANAGER + CHAT_SUPPORT all read-permitted. Other roles 403.

**Rate limit:** shared `withRateLimit` bucket (20 req / 15 min / IP).

---

## 2. Mode dispatch rules (locked)

The route MUST enforce mutual exclusion. Ambiguous requests are 400:

| Query | Result |
|---|---|
| `?saleDate=2026-05-24` only | 200 single-day |
| `?from=2026-05-17&to=2026-05-23` only | 200 range |
| (no params) | 200 single-day, today resolved in shop timezone |
| `?saleDate=...&from=...&to=...` | **400 ambiguous** (server rejects, not silently picks) |
| `?from=...` without `to=` | 400 incomplete range |
| `?to=...` without `from=` | 400 incomplete range |
| `?saleDate=garbage` | 400 invalid date format |
| `?from=2026-05-23&to=2026-05-17` | 400 to < from |
| `?from=2026-01-01&to=2027-01-01` | 400 range too large (server-capped) |

Server may impose a max range (currently inferred from existing tests; document the exact cap when surfaced).

---

## 3. Single-day response shape (`?saleDate=...`)

```jsonc
{
  "success": true,
  "data": {
    "saleDate": "2026-05-24",
    "shopId": "shop_...",
    "currency": "MYR",
    "items": [
      {
        "broadcastProductId": "bp_...",
        "displayCode": "CM1",
        "stock": {
          "totalQuantity": 10,
          "reservedQty": 3,
          "availableQty": 7,
          "lowStockAt": 5,
          "isLowStock": false,
          "isOutOfStock": false
        },
        "bookings": {
          "pendingReview": 1,
          "confirmed": 2,
          "cancelled": 0,
          "expired": 0,
          "convertedToOrder": 0,
          "total": 3
        }
      }
    ],
    "totals": {
      "broadcastProductCount": 1,
      "totalBookings": 3,
      "totalOrders": 1,
      "totalOrderTouches": 1,
      "totalOrderedQuantity": 5,
      "totalGross": "59.50"
    }
  }
}
```

### Single-day shape invariants

- `currency` always `"MYR"` for liveshop-pro
- `items[]` may be empty (no BPs for this saleDate yet)
- `stock` block reflects **current** state, NOT historical at saleDate
- `bookings` block is per-BP aggregation across status enum
- `totals.totalGross` is a **decimal string** (e.g. `"59.50"`), not a number
- `totals.totalOrderTouches` may differ from `totals.totalOrders` when one Order covers multiple BPs (UI shows touches as secondary chip only when delta exists)
- **NO PII** (no customer name / phone / email / address fields anywhere)

---

## 4. Range response shape (`?from=...&to=...`)

```jsonc
{
  "success": true,
  "data": {
    "from": "2026-05-17",
    "to": "2026-05-23",
    "shopId": "shop_...",
    "currency": "MYR",
    "days": [
      { "saleDate": "2026-05-17", "items": [...], "totals": {...} },
      { "saleDate": "2026-05-18", "items": [...], "totals": {...} },
      // ... one entry per day in range, INCLUSIVE
      { "saleDate": "2026-05-23", "items": [...], "totals": {...} }
    ],
    "totals": {
      "broadcastProductCount": 12,
      "totalBookings": 47,
      "totalOrders": 18,
      "totalOrderTouches": 22,
      "totalOrderedQuantity": 64,
      "totalGross": "1240.50"
    },
    "stockSnapshotNote": "Stock values reflect CURRENT snapshot, not historical state at each date in the range."
  }
}
```

### Range shape invariants

- `from` ≤ `to` strictly enforced
- `days[]` ordered chronologically ascending
- `days[].items[].stock` is **current snapshot**, NOT historical — explicitly documented via `stockSnapshotNote`
- `totals` at top level is sum of all days
- Range mode does NOT include `saleDate` at top level (use `from`+`to`)
- **NO PII**
- Empty range (no bookings in window) → `days[]` may still contain entries with zero totals OR be empty (depends on repository semantics — verify when implemented)

---

## 5. Error responses

| Status | Cause | Body |
|---|---|---|
| 400 | Ambiguous `?saleDate=...&from=...&to=...` | `{ success: false, error: "Provide either saleDate or from+to, not both" }` |
| 400 | Incomplete range (only `from` or only `to`) | `{ success: false, error: "from and to must be provided together" }` |
| 400 | Invalid YYYY-MM-DD | `{ success: false, error: "Invalid date format" }` |
| 400 | `to < from` | `{ success: false, error: "to must be >= from" }` |
| 400 | Range too large | `{ success: false, error: "Range exceeds maximum" }` |
| 401 | Unauthenticated | `{ success: false, error: "You must be signed in to access this resource" }` |
| 403 | No `shopId` | `{ success: false, error: "No shop associated with your account" }` |
| 403 | Wrong role | `{ success: false, error: "Insufficient permissions" }` |
| 429 | Rate-limited | `{ success: false, error: "Too many requests" }` |
| 500 | Unexpected | `{ success: false, error: "..." }` |

---

## 6. Cross-shop isolation

The route **MUST** resolve `shopId` from session (`user.shopId`), NEVER from query/body. Existing tests assert:

- `saleSummaryRepository.summarizeByDate(shopId, date)` called with session shopId
- `saleSummaryRepository.summarizeByDateRange(shopId, from, to)` same
- Two shops querying same saleDate see disjoint `items[]`
- Customer cannot inject `?shopId=...` to read another shop's data

---

## 7. Future enhancements (held)

| Feature | Status | Held for |
|---|---|---|
| CSV export | not started | PR #86 §10 verdict on range UI scope |
| `/sale/summary` dedicated route page | not started | PR #86 §10 verdict |
| Historical stock at each date in range | not started | Schema change required (track ProductVariant snapshots) |
| Per-day drill-down link from range | not started | UI design needed |
| Custom date presets (last 7 / 30 / quarter) | not started | UI design needed |

---

## 8. Stock snapshot semantics (clarification)

The `days[].items[].stock` block in range mode returns the **CURRENT** ProductVariant state at query time, NOT the historical state at each `saleDate` in the range.

**Why:** liveshop-pro does not currently maintain a per-day stock snapshot table. Historical stock would require either:
1. Schema migration adding `ProductVariantSnapshot` rows keyed by date
2. Reconstructing from `OrderItem` + `StockReservation` audit logs

Both are out of scope for the current iteration. The `stockSnapshotNote` field on the range response makes this explicit so UI does not mislead admins.

For **booking counts** in range mode, those ARE historical — derived from `Booking.createdAt` + saleDate associations.

For **order counts + revenue** in range mode, those ARE historical — derived from `Order.createdAt` + saleDate (when Order.saleDate landed in Phase 1.5; for now derived via Booking → Order conversion timestamps).

---

## 9. Cross-references

- `src/app/api/sale/summary/route.ts` — route handler
- `src/server/repositories/sale-summary.repository.ts` — repository (single + range)
- `src/components/sale/SaleSummaryPanel.tsx` — UI consumer (single only)
- `src/components/sale/sale-summary-panel.helpers.ts` — pure helpers
- `tests/unit/app/api/sale/summary.route.test.ts` — single-mode route tests
- `tests/unit/app/api/sale/summary-range.route.test.ts` — range-mode route tests
- `tests/unit/lib/sale/summary-helpers.test.ts` — single helpers
- `tests/unit/lib/sale/summary-range-helpers.test.ts` — range helpers
- PR #86 — range UI plan (open questions §10)
- PR #77 — range mode runtime PR
- PR #70 — single-day runtime PR
- PR #85 — compact panel PR

---

## 10. Hard rules (never violate)

- ❌ NEVER accept `shopId` from client (query/body/header) — always session
- ❌ NEVER expose customer PII in any summary response
- ❌ NEVER silently pick when `saleDate` + `from`/`to` both provided — return 400
- ❌ NEVER skip the range cap check
- ❌ NEVER return historical stock when actually current snapshot (use `stockSnapshotNote`)
- ✅ MAY add new total fields (additive) without breaking compatibility
- ✅ MAY add new per-item booking status counts (additive)
