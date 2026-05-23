# 14 — Sale Flow (saleDate / Product Code / Booking / Order)

**Last refresh:** 2026-05-23 (Block 3 Track A)
**Master baseline:** `0c7b6e0`

Maps the date-anchored sale workflow shipped through Tier 3.8 / 3.9 /
3.9-G. Read this BEFORE answering "how does X relate to Y" for any
booking / order / product code / summary question.

---

## 1. The big picture

`saleDate` (YYYY-MM-DD, shop timezone) is the **primary grouping
context** for product codes. Pre-3.9 the system used LiveSession as
parent; from Tier 3.9 onward LiveSession is optional event context.

```
Shop (timezone)
  ↓
BroadcastProduct (BP) — saleDate-anchored, OPTIONAL liveSessionId
  ↓
Booking (per-customer reservation against a BP)
  ↓
Order (one or more bookings converted)
  ↓
OrderItem (one row per BP+variant; quantity summed)
```

---

## 2. Key models (`prisma/schema.prisma`)

| Model | Owns | saleDate involvement |
|---|---|---|
| `Shop` | timezone | source of truth for "today" in `todaySaleDate(tz)` |
| `BroadcastProduct` | displayCode + variant + saleDate | partial unique `(shopId, saleDate, displayCode) WHERE saleDate IS NOT NULL` |
| `ProductVariant` | sku + quantity + price + lowStockAt | source of stock count |
| `Booking` | customerId + broadcastProductId + status | join via BP.saleDate for date filter |
| `StockReservation` | bookingId + variantId + quantity + releasedAt | active when `releasedAt IS NULL` |
| `Order` + `OrderItem` | aggregated bookings | currently no `saleDate` column; Phase 1.5 adds one |

---

## 3. Booking lifecycle

```
PENDING_REVIEW ─── confirm ───▶ CONFIRMED ─── cancel ──▶ CANCELLED
       │                            │
       │                            └── convertToOrder ──▶ CONVERTED_TO_ORDER
       │
       └─── cancel ──▶ CANCELLED
       └─── expire ──▶ EXPIRED
```

Terminal statuses (`CANCELLED / EXPIRED / CONVERTED_TO_ORDER`) hidden
from active list per PR #52 `isTerminalBookingStatus` helper. History
disclosure surfaces them on demand.

---

## 4. Repository entry points

| Repository | Key methods | Source file |
|---|---|---|
| `broadcastProductRepository` | `list` (filterable by saleDate) / `create` / `createMany` (batch route #53) / `update` / `delete` | `src/server/repositories/broadcast-product.repository.ts` |
| `bookingRepository` | `createManual` / `confirm` / `cancel` / `convertToOrder` | `src/server/repositories/booking.repository.ts` |
| `orderRepository` | (creation via `convertToOrder` in booking repo) | `src/server/repositories/order.repository.ts` |
| `quickProductCodesRepository` | `createBulk` (Product+Variant+BP atomic) | `src/server/repositories/quick-product-codes.repository.ts` |
| `saleSummaryRepository` | `summarizeByDate` / `summarizeByRange` | `src/server/repositories/sale-summary.repository.ts` |
| `stockReservationRepository` | reservation lifecycle | `src/server/repositories/stock.repository.ts` |

---

## 5. API routes (admin-side `/api/sale/*`)

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/sale/live-sessions` | GET | list sessions | OWNER/MANAGER/CHAT_SUPPORT |
| `/api/sale/live-sessions/[id]/broadcast-products` | GET | list BPs for session (legacy live-bound) | same |
| `/api/sale/broadcast-products` | GET | list BPs by `scope` + `saleDate` + `q` | same |
| `/api/sale/broadcast-products` | POST | create BP (OWNER/MANAGER) | write |
| `/api/sale/broadcast-products/[id]` | PATCH | update BP | write |
| `/api/sale/broadcast-products/[id]` | DELETE | delete BP (OWNER only) | write |
| `/api/sale/broadcast-products/batch` | POST | batch create (Tier 3.9-C) | write |
| `/api/sale/quick-product-codes` | POST | Product + Variant + BP atomic create | write |
| `/api/sale/bookings` | GET | list bookings by saleDate / liveSessionId / status | read |
| `/api/sale/bookings` | POST | manual create | write |
| `/api/sale/bookings/[id]/confirm` | POST | confirm + reserve stock | write |
| `/api/sale/bookings/[id]/cancel` | POST | cancel + release stock | write |
| `/api/sale/orders/from-bookings` | POST | convert bookings → Order | write |
| `/api/sale/customers/search` | GET | PII-safe customer typeahead | read |
| `/api/sale/summary` | GET | single-day OR range summary aggregate | read |

Cross-shop isolation: every route sources `shopId` from session, never
from client.

---

## 6. UI surfaces (`src/components/sale/`)

| Component | Role | Wired? |
|---|---|---|
| `SaleWorkspaceShell` | orchestrator; owns selectedSaleDate + refetchToken | wired |
| `SaleSummaryPanel` (NEW PR #85) | compact "สรุปวันนี้" panel | wired |
| `SaleSessionPickerPlaceholder` | live session picker | wired |
| `SaleProductGridPlaceholder` | Product Codes grid (current production) | wired |
| `SaleBookingQueuePlaceholder` | bookings panel + history disclosure | wired |
| `SaleCustomerPanelPlaceholder` | selected customer detail | wired |
| `SaleOrderConversionPlaceholder` | order conversion UI | wired |
| `SaleInboxPlaceholder` | inbox stub (Tier 4.1 will wire) | placeholder |
| `SaleSourceFilterChips` | source filter (Tier 1) | wired |
| `AddFromStockDialog` | multi-select stock add (PR #53) | wired |
| `CreateQuickProductCodeDialog` | sale quick-create | wired |
| `EditProductCodeDialog` | per-BP edit | wired |
| `ManualCreateBookingDialog` | manual booking | wired |
| `ConfirmBookingDialog` / `CancelBookingDialog` / `CreateOrderDialog` | mutations | wired |
| `board/ProductCodePill` (NEW PR #88) | V Rich pill | **NOT wired** — feature flag future |
| `board/ProductCodePillList` (NEW PR #88) | pill row | **NOT wired** |
| `board/SlotRow` (NEW PR #88) | drawer slot row | **NOT wired** |
| `board/SaleBoardReadOnly` (NEW PR #88) | accordion drawer skeleton | **NOT wired** |
| `SalePanelCard` | shared panel chrome | used everywhere |

---

## 7. Pure helpers (`src/lib/sale/`)

| File | Purpose |
|---|---|
| `sale-date.ts` | `todaySaleDate(tz)` / `parseSaleDate(iso)` / `formatSaleDate(date)` |
| `booking-rules.ts` | `groupBookingsForOrderItems` |
| `feature-flags.ts` | runtime flag accessors |
| `summary.helpers.ts` | `foldBookingsByStatus` / `foldReservedQty` / `foldOrdersByBp` / `sumMoney2` / `aggregateTotals` / `enumerateDateRange` / `foldByCodeAcrossDays` / `aggregateRangeTotals` / `deriveStockFlags` |
| `board-helpers.ts` | `pillColorState` / `compareDisplayCode` / `sortDisplayCodes` / `formatBoardHeader` / `buildSlots` / `slotsRemaining` |
| `board-display.ts` | `pillWidthChars` / `slotProgressPercent` / `slotRowDisplayState` / `formatPillLabel` / `formatStockBadge` / color tokens |

UI components consume helpers via type-safe imports. Helpers never
touch React, fetch, or Prisma.

---

## 8. Selected saleDate flow

```
SaleWorkspaceShell holds: selectedSaleDate, refetchToken
  ↓
prop drilling to all panels
  ↓
each panel useEffect refetches on saleDate / refetchToken change
  ↓
mutation success → onMutationSuccess → setRefetchToken(n+1)
  ↓
all panels refetch in parallel
```

5 surfaces refetch in parallel: summary / product grid / booking
queue / customer panel / inbox.

---

## 9. Cross-references

- Tier 3.9-A audit (PR #45): `2026-05-21-tier-3-9-phase-0-audit.md`
- Tier 3.9-B saleDate migration: `2026-05-21-tier-3-9-b-migration-safety-audit.md`
- Tier 3.9-G summary design: `2026-05-23-sale-operations-summary-design.md`
- Tier 3.9-G5 range design: `2026-05-23-sale-summary-date-range-plan.md`
- Tier 3.10-A V Rich audit: `2026-05-23-tier-3-10-a-vrich-board-design-audit.md`
- Summary+board integration: `2026-05-23-sale-summary-board-integration-plan.md`
- Phase 1.5 design: `2026-05-22-sale-auto-confirm-auto-order-design.md` (PR #54) + refinement (PR #81) + matrix (PR #90)

---

## 10. Cross-cutting hard rules

- ❌ Never auto-create BroadcastProduct rows from inventory bulk
- ❌ Never set `saleDate` on inventory Product/Variant create (inventory is not date-bound)
- ❌ Never expose customer phone/email/address in `/api/sale/*` responses
- ❌ Never cross-shop leak (every route + repo carries `shopId`)
- ❌ Never mutate `Order` rows outside `bookingRepository.convertToOrder` path (Phase 1.5 adds `upsertFromBooking`)
- ❌ Never write to `StockReservation.releasedAt` outside booking cancel + order convert flows
