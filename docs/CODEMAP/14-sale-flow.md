# 14 — Sale Flow (saleDate / Product Code / Booking / Order)

**Last refresh:** 2026-05-24 (autonomous docs block Track 5 — post Tier 3.9-D2 + state machine invariants + PR queue cleanup)
**Master baseline:** `987e1f0`

Maps the date-anchored sale workflow shipped through Tier 3.8 / 3.9 /
3.9-G / 3.9-D2. Read this BEFORE answering "how does X relate to Y"
for any booking / order / product code / summary / inventory-bulk
question.

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
| `quickProductCodesRepository` (sale) | `createBulk` (Product+Variant+BP atomic) — delegates to shared `product-bulk-core` | `src/server/repositories/quick-product-codes.repository.ts` |
| `inventoryBulkRepository` (NEW Tier 3.9-D2-A, #104) | `createBulk` (Product+Variant atomic, NO BroadcastProduct) — delegates to shared `product-bulk-core`, classifies P2002 | `src/server/repositories/inventory-bulk.repository.ts` |
| `product-bulk-core` (NEW Tier 3.9-D2-R, #101) | `buildCodePairs` / `resolveName` / `assertDisplayCodeShape` / `assertCategoryBelongsToShop` (pre-tx) / `createOrReuseProductVariantPairs` (tx) — pure + transactional shared core | `src/server/repositories/product-bulk-core.ts` |
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
| `/api/inventory/quick-product-bulk` (NEW Tier 3.9-D2-A, #104) | POST | bulk Product+Variant create, NO BroadcastProduct, all-or-nothing, cap 100 | OWNER/MANAGER (CHAT_SUPPORT/WAREHOUSE → 403) |

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

### Inventory side (NEW Tier 3.9-D + D2-B)

| Component | Role | Wired? |
|---|---|---|
| `QuickInventoryProductDialog` (PR #60 + #105) | quick-create dialog with bulk-range toggle (default OFF) | wired |
| `QuickProductFormFields` (shared) | shared form fields used by sale + inventory quick dialogs | wired |
| `ProductForm` (Advanced) | multi-variant + image upload, fallback on `/inventory/new` | wired (untouched by D2) |
| `BulkEditBar` / `ProductFilters` / `ProductTable` / `Pagination` / `LowStockAlert` / `StockBadge` / `VariantForm` / `VariantAttributeTag` | inventory list/edit UI | wired |

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
| `state-machine-invariants.test.ts` (NEW PR #103) | locks PENDING/CONFIRMED/CONVERTED/V Rich filter partition invariants — 53 tests | (test file, not runtime helper) |

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

**Detailed refetch model:** see `docs/superpowers/2026-05-24-sale-workspace-state-map.md` (state owners table + refetch graph + mutation→refetch matrix + 8 stale-state risks + anti-patterns).

**EditProductCode refresh path (F4 audit closed as not-a-bug):**

```
EditProductCodeDialog.handleSave → onUpdated callback
  ↓
SaleProductGridPlaceholder.onProductCreated prop (misleading name — fires on create + AddFromStock + edit + delete)
  ↓
SaleWorkspaceShell.setRefetchToken(n+1)
  ↓
BP list + bookings + summary all refetch
```

Optional R2 future rename: `onProductCreated` → `onProductsChanged` (audit at `2026-05-24-edit-product-code-refresh-audit.md`).

---

## 9. Cross-references

- Tier 3.9-A audit (PR #45): `2026-05-21-tier-3-9-phase-0-audit.md`
- Tier 3.9-B saleDate migration: `2026-05-21-tier-3-9-b-migration-safety-audit.md`
- Tier 3.9-G summary design: `2026-05-23-sale-operations-summary-design.md`
- Tier 3.9-G5 range design: `2026-05-23-sale-summary-date-range-plan.md`
- Tier 3.10-A V Rich audit: `2026-05-23-tier-3-10-a-vrich-board-design-audit.md`
- Summary+board integration: `2026-05-23-sale-summary-board-integration-plan.md`
- Phase 1.5 design: `2026-05-22-sale-auto-confirm-auto-order-design.md` (PR #54) + refinement (PR #81) + matrix (PR #90)
- Tier 3.9-D2 inventory bulk (PR #99 plan + #101 D2-R refactor + #104 D2-A endpoint + #105 D2-B UI + #106 D2-C verifier+workbook): `2026-05-23-inventory-bulk-d2-final-handoff.md` + `2026-05-23-inventory-bulk-technical-plan.md` + `2026-05-23-inventory-api-reference.md`
- State machine lock (PR #103): `2026-05-23-stock-booking-state-machine-matrix.md` + `tests/unit/lib/sale/state-machine-invariants.test.ts`
- Sale workspace state map: `2026-05-24-sale-workspace-state-map.md`
- Sale data-fetch audit: `2026-05-24-sale-data-fetch-audit.md`
- EditProductCode refresh audit (F4 closed): `2026-05-24-edit-product-code-refresh-audit.md`
- Phase 1.5 verdict packet + implementation checklist + decision summary: `2026-05-23-phase-1-5-verdict-packet.md` + `2026-05-24-phase-1-5-implementation-checklist.md` + `2026-05-24-phase-1-5-decision-summary.md`
- V Rich board readiness + wiring checklist: `2026-05-24-v-rich-board-readiness.md` + `2026-05-24-v-rich-board-wiring-readiness-checklist.md`
- Inventory bulk UX audit: `2026-05-24-inventory-bulk-ux-audit-after-d2.md`
- Non-prod verifier suite plan: `2026-05-24-non-prod-verifier-suite-plan.md` + `2026-05-24-sale-core-verifier-plan.md` + `2026-05-24-inventory-verifier-troubleshooting.md`
- Smoke workbook v5 (canonical, supersedes v1-v4): `2026-05-24-admin-smoke-workbook-v5.md`

---

## 10. Cross-cutting hard rules

- ❌ Never auto-create BroadcastProduct rows from inventory bulk (verified by D2-A unit tests + verifier Cases A+B)
- ❌ Never set `saleDate` on inventory Product/Variant create (inventory is not date-bound; Zod strips `saleDate` from `inventoryBulkBodySchema`)
- ❌ Never expose customer phone/email/address in `/api/sale/*` responses
- ❌ Never cross-shop leak (every route + repo carries `shopId`; cross-shop category injection blocked pre-`$transaction` in `assertCategoryBelongsToShop`)
- ❌ Never mutate `Order` rows outside `bookingRepository.convertToOrder` path (Phase 1.5 adds `upsertFromBooking` once Q4 verdicted)
- ❌ Never write to `StockReservation.releasedAt` outside booking cancel + order convert flows
- ❌ Never break atomicity: bulk Product+Variant create + reuse-or-create + Boss-required quantity=0 / price=0 valid (PR #101 + #104 enforced via `$transaction`)
- ❌ Never break PENDING / CONFIRMED / CONVERTED / V Rich filter partition (locked by 53 invariants in `state-machine-invariants.test.ts`, PR #103)

---

## 11. Tier 3.9 / D2 / state-machine summary (post-refresh)

| Sub-tier | Status | Source |
|---|---|---|
| 3.9-A baseline (saleDate context) | ✅ shipped | Block 1-2 |
| 3.9-B saleDate migration safety + Fix-1 reuse | ✅ shipped | Block 2 |
| 3.9-C compact summary panel | ✅ shipped (PR #85) | Block 2 |
| 3.9-D quick inventory create default | ✅ shipped (PR #60) | earlier |
| 3.9-D2-R shared core refactor | ✅ shipped (PR #101) `759a48b` | Block 7 |
| 3.9-D2-A inventory bulk endpoint | ✅ shipped (PR #104) `55b24a8` | Block 7 |
| 3.9-D2-B inventory bulk UI toggle | ✅ shipped (PR #105) `94876be` | Block 7 |
| 3.9-D2-C verifier + workbook v4 + API ref | ✅ shipped (PR #106) `e6b41b1` | Block 7 |
| State machine invariants locked | ✅ shipped (PR #103) `8222a2f` — 53 tests | Block 7 |
| Smoke workbook v5 canonical | ✅ shipped (PR #122) `30cae36` — supersedes v1-v4 | Block 8 |
| Sale workspace state map | ✅ shipped (PR #121) `3afd0c4` | Block 8 |
| EditProductCode F4 audit (not-a-bug) | ✅ shipped (PR #120) `0a3a892` | Block 8 |
| 3.9-G7-A `/sale/summary` route | held — Boss verdict pending on PR #86 §10 | — |
| 3.9-G7-B+ range UI | held | — |
| Phase 1.5-B auto-confirm runtime | HARD GATE — held per Decision 2 | — |
| Phase 1.5-C auto-order-append runtime | HARD GATE — held per Decision 2 | — |
| Phase 1.5-D multi-code runtime | HARD GATE — held per Decision 2 | — |
| V Rich board wiring | HARD GATE — components shipped (PR #88), wiring held per Boss | — |
