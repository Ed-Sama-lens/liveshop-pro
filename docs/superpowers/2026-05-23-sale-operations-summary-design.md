# Sale Operations Summary — Design

**Filed:** 2026-05-23 (overnight Tier 3.9-D follow-on)
**Author:** Claude Sonnet 4.6 (autonomous overnight block)
**Master baseline:** `a1aef83` (post PR #59 merge)
**Scope:** read-only daily / range summary for the `/sale` admin

This doc is **design only**. No code is opened in this PR. A follow-up
read-only PR (3.9-E / 3.10-?) implements the route + repo method after
Boss + ChatGPT verdict.

---

## 1. Problem

Boss must currently count bookings / orders by product code manually
across `/sale` panels. There is no single screen that answers, for a
given `saleDate`:

- How many bookings were placed against `CM1`?
- How many of those were confirmed vs cancelled vs converted to order?
- How many units were actually ordered (after conversion)?
- What is the remaining `availableQty` per code?
- What is the gross RM total per code so far?

Per-code counters live in three places (BroadcastProduct +
StockReservation + Booking + Order), and the admin must mentally join
them. This design unifies the read into one route.

---

## 2. Scope of this PR (3.9-E proposal)

- **In scope**: Single-date summary `GET /api/sale/summary?saleDate=YYYY-MM-DD`
  returning one row per BroadcastProduct active on that saleDate (or with
  bookings/orders against it on that saleDate).
- **Out of scope** (later):
  - Date range summary (`?from=...&to=...`)
  - UI panel in `/sale` (compact "สรุปวันนี้" card)
  - CSV export
  - Customer-level breakdown
  - Per-channel breakdown (manual vs live vs storefront)

---

## 3. Response shape

```json
{
  "success": true,
  "data": {
    "saleDate": "2026-05-23",
    "shopId": "...",
    "currency": "MYR",
    "items": [
      {
        "broadcastProductId": "...",
        "displayCode": "CM1",
        "productId": "...",
        "productName": "...",
        "stockCode": "...",
        "saleCode": "CM1",
        "variantId": "...",
        "sku": "...",
        "unitPrice": "12.50",
        "stock": {
          "totalQuantity": 50,
          "reservedQty": 12,
          "availableQty": 38,
          "lowStockAt": 5,
          "isLowStock": false,
          "isOutOfStock": false
        },
        "bookings": {
          "pendingReview": 2,
          "confirmed": 4,
          "cancelled": 1,
          "expired": 0,
          "convertedToOrder": 3,
          "total": 10
        },
        "orders": {
          "orderCount": 2,
          "orderedQuantity": 5,
          "grossTotal": "62.50"
        }
      }
    ],
    "totals": {
      "broadcastProductCount": 12,
      "totalBookings": 47,
      "totalOrders": 18,
      "totalOrderedQuantity": 53,
      "totalGross": "1240.00"
    }
  }
}
```

### Field rules

| Field | Source | Notes |
|---|---|---|
| `displayCode` / `productName` / `stockCode` / `saleCode` / `sku` / `unitPrice` | BroadcastProduct + Variant + Product | identical to `GET /api/sale/broadcast-products` shape |
| `stock.totalQuantity` | Variant.quantity | as-of-now (live read) |
| `stock.reservedQty` | sum of `StockReservation.qty WHERE releasedAt IS NULL` | reuses ORDER-RESERVATION-CLEANUP semantics |
| `stock.availableQty` | `totalQuantity - reservedQty` | |
| `bookings.*` | Booking grouped by `status` filtered by `broadcastProductId` AND `broadcastProduct.saleDate = saleDate` | reuses Tier 3.9-B saleDate index |
| `orders.orderCount` | distinct Order count via OrderItem → variant → BroadcastProduct match | de-duplicated per Order |
| `orders.orderedQuantity` | sum OrderItem.quantity for matching BP | |
| `orders.grossTotal` | sum OrderItem.totalPrice for matching BP | decimal string, MYR |

### What this summary does NOT include

- Customer identity / PII (only counts)
- Per-customer breakdown
- Payment status / shipment status
- Cross-shop data (`shopId` strictly equals authenticated user's `shopId`)

---

## 4. Query strategy

Single repo method `broadcastProductRepository.summarizeByDate({ shopId, saleDate })`.

**One Prisma transaction**, four queries:

1. `prisma.broadcastProduct.findMany` where `shopId AND saleDate = parsed` →
   includes `variant.product`, `variant`, raw fields. Gives the row skeleton.
2. `prisma.booking.groupBy` by `broadcastProductId, status` where
   `broadcastProduct.shopId = shopId AND broadcastProduct.saleDate = parsed`.
3. `prisma.stockReservation.groupBy` by `variantId` where
   `releasedAt IS NULL AND variant.product.shopId = shopId`. (Reservation
   is "as-of-now" — not saleDate-bound. Reflects live state.)
4. `prisma.orderItem` aggregate by `variantId` joined to bookings whose
   BP matches our saleDate set — implemented as a `findMany` on
   `orderItem` with `where: { variantId: { in: variantIds }, order: {
   bookings: { some: { broadcastProductId: { in: bpIds } } } } }`,
   reduced in JS for `orderCount` + `orderedQuantity` + `grossTotal`.

Reduce in JS. Output array length = matched BP count. `totals` block
folded over items.

Indexes already exist:
- `(shopId, saleDate, displayCode)` partial unique on BroadcastProduct (Tier 3.9-B)
- `(broadcastProductId)` FK index on Booking
- `(variantId)` FK index on StockReservation, OrderItem

Performance budget: 1 shop × 100 BP × 100 bookings × 50 orders =
~5k row scan max. Acceptable for admin-only route. No streaming yet.

---

## 5. Authorization

- `requireAuth()` (mirrors existing `/api/sale/*` routes)
- All three roles read-allowed: `OWNER`, `MANAGER`, `CHAT_SUPPORT`
  (CHAT_SUPPORT needs to see counts for inbox triage in Tier 4.x)
- Hard `shopId` predicate — no cross-shop leak
- Rate limit: reuse existing sale middleware (`withRateLimit`)
- No `customerId` or `customerName` returned

---

## 6. Schema additions

`src/lib/validation/sale.schemas.ts`:

```ts
export const saleSummaryQuerySchema = z.object({
  saleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD'),
});

export type SaleSummaryQuery = z.infer<typeof saleSummaryQuerySchema>;
```

Range form (deferred):

```ts
export const saleSummaryRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).superRefine((data, ctx) => {
  if (data.to < data.from) {
    ctx.addIssue({ code: 'custom', message: 'to must be >= from', path: ['to'] });
  }
});
```

---

## 7. Test plan

### Unit (pure helpers)

- `foldBookingsByStatus(rows: BookingGroupRow[]): BookingsBlock`
- `foldOrderItemsByBp(rows: OrderItemRow[], bpToVariantMap): OrdersBlock`
- `aggregateTotals(items: SummaryItem[]): TotalsBlock`
- Decimal-safe sum (no float drift on RM strings)

### Route (vitest)

- Returns 401 when unauthenticated
- Returns 403 when missing `shopId`
- Returns 400 when `saleDate` missing or wrong format
- Returns 200 with empty `items` when no BP on saleDate
- Returns correct counts for canned BP + Booking + Order fixtures
- Does NOT include cross-shop BPs (shop isolation)
- Does NOT leak customer PII
- All three roles (OWNER / MANAGER / CHAT_SUPPORT) authorized

### Smoke (prod unauth)

- Add to `tests/e2e/prod-unauth-smoke.spec.ts`:
  `GET /api/sale/summary` unauth → expect 401

No production POST.

---

## 8. UI follow-up (separate PR)

Two options after route lands:

**Option A** — compact panel in `/sale` workspace:
- Renders below Booking queue
- 5-column compact table: `code / unitPrice / available/total / bookings / orders`
- Click-through: clicking a row filters Booking queue to that code

**Option B** — dedicated `/sale/summary` route:
- Larger table with all 14 columns
- Date range picker (after range API lands)
- CSV export button (later)

Recommend **Option A** first — keeps Boss in single-screen flow.

---

## 9. Hard no-go

- ❌ No production mutation
- ❌ No payment / shipping touch
- ❌ No auto-confirm / auto-order
- ❌ No outbound
- ❌ No customer PII in response
- ❌ No cross-shop data
- ❌ No new schema column / migration
- ❌ No facebook runtime
- ❌ pak-ta-kra untouched

---

## 10. Open questions for Boss + ChatGPT

1. Should CHAT_SUPPORT see the summary, or restrict to OWNER + MANAGER?
2. Reservation block: as-of-now (live) or as-of-saleDate (historical snapshot)?
3. "ordered quantity" definition — current proposal counts OrderItem
   joined via booking → BP saleDate. Alternative: count by Order created
   on saleDate (different semantics).
4. Should `grossTotal` reflect only confirmed orders or also pending
   (RESERVED status) orders?
5. Should pre-existing storefront orders (non-sale-workflow) be excluded
   or included if they happen to share variants with sale BPs?

These are not blockers — defaults proposed in §3-§4 are safe. Verdict
sharpens semantics before implementation PR.

---

## 11. Implementation sequence (proposed)

| Step | PR | Risk |
|---|---|---|
| 1 | `feat(sale): summary repo + GET /api/sale/summary single-date` | R1 |
| 2 | `test(sale): summary route + repo coverage` | R2 |
| 3 | `feat(sale): "สรุปวันนี้" compact panel in /sale` | R1 |
| 4 | `feat(sale): summary range query support (from/to)` | R1 |
| 5 | `feat(sale): summary CSV export` | R1 |

Each step keeps the route additive — no breaking changes to existing
`/api/sale/*` contracts.

---

## 12. Cross-references

- `src/server/repositories/broadcast-product.repository.ts` — existing aggregate patterns
- `src/app/api/sale/bookings/route.ts` — existing saleDate filter on bookings list
- `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` — saleDate as primary context
- `docs/superpowers/2026-05-22-sale-route-security-permissions-audit.md` — RBAC + rate-limit baseline (PR #56)

---

## 13. Decision

This doc lands as `docs(sale): design sale operations summary dashboard`.
No runtime code. Boss + ChatGPT verdict gates the follow-up implementation
PR.
