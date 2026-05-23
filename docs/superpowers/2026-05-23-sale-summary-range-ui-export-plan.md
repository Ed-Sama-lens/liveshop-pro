# Sale Summary Range UI + Export — Plan

**Filed:** 2026-05-23 (Block 2 Track T3)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `d870931` (post #84 merged)
**Status:** Plan only. No runtime in this PR.

This doc sequences the UI consumers + export shapes on top of:
- PR #70 — `GET /api/sale/summary?saleDate=` (single-day)
- PR #77 — `GET /api/sale/summary?from=&to=` (range)
- PR #85 — Compact "สรุปวันนี้" panel (single-day UI consumer)

PR #71 already sequenced the API extensions. This doc focuses on the
UI + export surface; deliberately stops at "plan only" because each
UI piece is its own R1 PR.

---

## 1. Surface options

| Option | Where | Pros | Cons |
|---|---|---|---|
| **A — Range mode toggle in compact panel** | `/sale` workspace | Single screen for admin; familiar | Limited space; range output is many rows |
| B — Dedicated `/sale/summary` route | Sidebar entry | Room for full table + filters | Extra navigation; route discoverability |
| C — Modal expanded from compact panel | `/sale` workspace | Discoverable; lazy-rendered | Modal-in-workspace UX adds friction |

### Claude recommendation: **B (dedicated route)** for range, keep A (compact panel) for single-day glance

Rationale:
- Range output = N days × M codes + range totals + per-code rollup. Too much for the compact strip.
- Boss workflow: glance at today (panel) → drill into range (dedicated screen). Two distinct intents.
- Sidebar already has "Live Selling" entry; adding "สรุปการขาย / Sale Summary" mirrors that.

---

## 2. Compact panel scope (PR #85 merged) — unchanged

Single-day mode only. No range toggle in compact strip. Boss clicks
"ดูช่วงเวลา" link → navigates to `/sale/summary?from=&to=`.

---

## 3. Dedicated `/sale/summary` route — PR sequence

| PR | Title | Risk |
|---|---|---|
| 3.9-G7-A | `feat(sale): /sale/summary route skeleton + date-range picker` | R1 |
| 3.9-G7-B | `feat(sale): /sale/summary daily totals table` | R1 |
| 3.9-G7-C | `feat(sale): /sale/summary per-code rollup table` | R1 |
| 3.9-G7-D | `feat(sale): /sale/summary range header + filters` | R1 |
| 3.9-G8-A | `feat(sale): /sale/summary CSV export (daily shape)` | R1 |
| 3.9-G8-B | `feat(sale): /sale/summary CSV export (per-code shape)` | R1 |
| 3.9-G8-C | `feat(sale): /sale/summary CSV export (per-customer shape, PII-gated)` | R1 |

Each PR independently reviewable. Each ≤300 LOC.

---

## 4. UI layout (`/sale/summary`)

```
┌─────────────────────────────────────────────────────────────┐
│  สรุปการขาย / Sale Summary                  [กลับสู่ /sale]  │
├─────────────────────────────────────────────────────────────┤
│  Range: [from picker] → [to picker]  [วันนี้] [7 วัน] [30 วัน]│
│  Max 31 days enforced client + server                       │
├─────────────────────────────────────────────────────────────┤
│  Range header strip                                         │
│  • dayCount  • broadcastProductCount  • totalOrders         │
│  • totalOrderTouches  • totalOrderedQuantity  • totalGross  │
├─────────────────────────────────────────────────────────────┤
│  ▼ Daily totals (collapsible)                               │
│    Day | BP | Bookings | Orders | Qty | Gross               │
│    2026-05-17 | 12 | 47 | 18 | 53 | RM1,240.00              │
│    2026-05-18 | ...                                         │
├─────────────────────────────────────────────────────────────┤
│  ▼ Per-product-code (collapsible, default expanded)         │
│    Code | Name | Bookings | Orders | Qty | Gross | Days     │
│    CM1  | ...  | 24       | 8      | 12  | RM150 | 3        │
│    ...                                                      │
├─────────────────────────────────────────────────────────────┤
│  ▶ CSV export (OWNER/MANAGER only)                          │
│    [daily] [per-code] [per-customer]                        │
├─────────────────────────────────────────────────────────────┤
│  Stock snapshot note (footer):                              │
│  Stock fields reflect current state, not historical.        │
└─────────────────────────────────────────────────────────────┘
```

### Mobile layout

- Range picker stacks above totals
- Tables become horizontal-scroll cards on `sm:` and below
- Default-collapsed daily table on `sm:` to save real estate

---

## 5. Component breakdown

| Component | Purpose | Risk |
|---|---|---|
| `<SaleSummaryRangeShell>` | route shell, manages range state + fetch | R1 |
| `<SaleSummaryRangePicker>` | from/to + preset buttons (7d/30d) | R1 |
| `<SaleSummaryRangeHeader>` | range totals strip | R1 |
| `<SaleSummaryDailyTable>` | per-day rows; collapsible | R1 |
| `<SaleSummaryByCodeTable>` | per-displayCode rollup; sortable | R1 |
| `<SaleSummaryCsvExport>` | 3-button export with shape selector | R1 |

Each component own helper file for pure logic (mirrors PR #85 pattern).

---

## 6. Data flow

```
Range picker state (from, to)
  ↓
useFetch /api/sale/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  ↓
SaleSummaryRangeResult
  ├─ days[]      → SaleSummaryDailyTable
  ├─ byCode[]    → SaleSummaryByCodeTable
  ├─ totals      → SaleSummaryRangeHeader
  └─ stockSnapshotNote → footer
```

No mutation. No PII. shopId scoped server-side.

---

## 7. CSV export shapes

### 7.1 Daily shape

Columns:
```
saleDate, broadcastProductCount, totalBookings, totalOrders,
totalOrderTouches, totalOrderedQuantity, totalGross
```

No PII. Available to OWNER / MANAGER / CHAT_SUPPORT.

### 7.2 Per-code shape

Columns:
```
displayCode, productName, stockCode, saleCode,
totalBookings, totalConfirmed, totalCancelled, totalConverted,
totalOrderCount, totalOrderedQuantity, totalGross,
appearedOn (semicolon-separated YYYY-MM-DD list)
```

No PII. Available to all three roles.

### 7.3 Per-customer shape (PII-gated)

Columns:
```
customerId, customerName (OWNER/MANAGER only; "***" for CHAT_SUPPORT),
totalBookings, totalConfirmed, totalCancelled, totalConverted,
totalOrderedQuantity, totalGross,
firstSeenSaleDate, lastSeenSaleDate
```

NEVER include: phone, email, address.

Access: OWNER / MANAGER only. CHAT_SUPPORT denied 403 on this shape.

---

## 8. CSV implementation notes

- Stream via `Response` body for large ranges
- BOM-prefixed (`﻿`) for Excel compatibility
- Rate limit: 5 exports per IP per 5 minutes (existing `withRateLimit`)
- Logged via `activity.service` per export
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="sale-summary-<shape>-<from>-<to>.csv"`

---

## 9. Hard no-go

All G7 / G8 PRs:

- ❌ No mutation
- ❌ No customer phone / email / address ever
- ❌ No cross-shop data
- ❌ No env / flag change
- ❌ No schema migration
- ❌ No outbound / Facebook / payment touch
- ❌ pak-ta-kra untouched

---

## 10. Open questions for Boss + ChatGPT

1. Sidebar entry: "สรุปการขาย" under Live Selling? Or new top-level item?
2. Default range on first visit: today / last 7 days / current month?
3. Per-customer CSV: include name for MANAGER or restrict to OWNER only?
4. Range presets: 7d / 30d / custom only — or include "this week" / "this month"?
5. Daily table default state: collapsed (recommended for ranges >7 days) or expanded?
6. CSV file size cap: hard at 31-day max range, or stream truncate at 10MB?

Defaults proposed throughout are conservative + reversible.

---

## 11. Implementation order

1. **3.9-G7-A** (route shell + picker) — lands first; unblocks B/C
2. **3.9-G7-D** (range header) — small; quick win
3. **3.9-G7-C** (per-code table) — Boss's primary use case per UI smoke
4. **3.9-G7-B** (daily totals table) — supplements per-code
5. **3.9-G8-A** + **3.9-G8-B** (daily + per-code CSV)
6. **3.9-G8-C** (per-customer CSV) — last; PII-gate review

---

## 12. Cross-references

- PR #70 — single-day endpoint
- PR #71 — date-range design + sequence
- PR #77 — range query API
- PR #85 — compact panel (single-day UI)
- `src/server/repositories/sale-summary.repository.ts`
- `docs/superpowers/2026-05-23-sale-operations-summary-design.md`
- `docs/superpowers/2026-05-23-sale-summary-date-range-plan.md`

---

## 13. Decision

This doc lands as `docs(sale): summary range UI + export plan`. Zero
runtime. Boss + ChatGPT verdict on §10 unlocks PR 3.9-G7-A.
