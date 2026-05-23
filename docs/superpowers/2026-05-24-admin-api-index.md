# Admin API Index — Sale + Inventory

**Filed:** 2026-05-24 (autonomous Track 9)
**Author:** Claude Sonnet 4.6
**Master baseline:** `b0774a5`
**Status:** Index reference. No runtime change.

Single index of all `/api/sale/*` and `/api/inventory/*` admin routes.
Cross-links the deeper docs already on master so future Claude/Boss
sessions find them fast. NO secrets, NO PII, placeholder values only.

---

## 1. Auth model (all routes)

| Role | Sale read | Sale mutate | Inventory mutate | Hard delete |
|---|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ | ❌ BP DELETE only |
| CHAT_SUPPORT | ✅ | ❌ | ❌ | ❌ |
| WAREHOUSE | ❌ | ❌ | ❌ | ❌ |
| CUSTOMER | ❌ | ❌ | ❌ | ❌ |

Every admin route requires `requireAuth()` + valid `user.shopId` (from session, NEVER from query/body).

Rate-limit: shared `withRateLimit` bucket (20 req / 15 min / IP).

---

## 2. Sale endpoints

### 2.1 Live Sessions

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/live-sessions` | GET | OWNER+MANAGER+CHAT_SUPPORT | paginated, filterable by status |
| `/api/sale/live-sessions/[id]/broadcast-products` | GET | OWNER+MANAGER+CHAT_SUPPORT | session-scoped |

### 2.2 Broadcast Products

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/broadcast-products` | GET | read all | `?scope=all&saleDate=YYYY-MM-DD&limit=200` |
| `/api/sale/broadcast-products` | POST | OWNER+MANAGER | create single BP for live session |
| `/api/sale/broadcast-products/[id]` | PATCH | OWNER+MANAGER | edit display fields |
| `/api/sale/broadcast-products/[id]` | DELETE | OWNER+MANAGER | hard delete (BP only) |
| `/api/sale/broadcast-products/batch` | POST | OWNER+MANAGER | AddFromStock multi-attach |

### 2.3 Bookings

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/bookings` | GET | read | `?saleDate=...&limit=100` |
| `/api/sale/bookings` | POST | OWNER+MANAGER | dispatch on body: `action: 'manual-create' \| 'confirm' \| 'cancel'` |
| `/api/sale/orders/from-bookings` | POST | OWNER+MANAGER | convert N confirmed bookings → Order |

### 2.4 Customers (read-only from /sale)

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/customers/search` | GET | OWNER+MANAGER+CHAT_SUPPORT | typeahead by name/phone |
| `/api/customers/[id]` | GET | OWNER+MANAGER+CHAT_SUPPORT | customer detail panel |

### 2.5 Quick product code (Tier 3.8)

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/quick-product-codes` | POST | OWNER+MANAGER | composite Product + Variant + BP create, single or bulk |

### 2.6 Summary (Tier 3.9-G)

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/sale/summary?saleDate=YYYY-MM-DD` | GET | read | single-day totals + per-BP stock/bookings |
| `/api/sale/summary?from=...&to=...` | GET | read | range mode — days[] + top-level totals |
| (no params) | GET | read | dispatches to single-day with today resolved in shop timezone |

Mutual exclusion enforced server-side. Mixing `saleDate` + `from`/`to` → 400.

### 2.7 Categories

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/categories` | GET | read | shop categories for dropdowns |

---

## 3. Inventory endpoints

### 3.1 Product (legacy single create)

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/products` | POST | OWNER+MANAGER | create Product + N Variants (advanced form supports multi-variant) |
| `/api/products/[id]` | GET / PATCH / DELETE | role-gated | catalog admin |
| `/api/products/[id]/images` | POST | OWNER+MANAGER | R2 image upload (used AFTER product create) |

### 3.2 Inventory bulk (Tier 3.9-D2)

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/inventory/quick-product-bulk` | POST | OWNER+MANAGER | bulk Product + Variant only — NO BroadcastProduct, NO saleDate, NO imageUrl. All-or-nothing. Cap 100. |

Schema: `inventoryBulkBodySchema` in `src/lib/validation/inventory.schemas.ts`.
Repository: `inventoryBulkRepository.createBulk` in `src/server/repositories/inventory-bulk.repository.ts`.
Shared core: `createOrReuseProductVariantPairs` in `src/server/repositories/product-bulk-core.ts` (also used by sale-side `/api/sale/quick-product-codes`).

---

## 4. Tier 3.9 + 3.10 status quick view

| Sub-tier | Route(s) | Status |
|---|---|---|
| 3.8 quick bulk | `/api/sale/quick-product-codes` | LIVE |
| 3.9-B saleDate context | sale routes accept `?saleDate=` | LIVE |
| 3.9-D quick inventory default | `/inventory/new` Quick form | LIVE |
| 3.9-D2-A inventory bulk | `/api/inventory/quick-product-bulk` | **LIVE (#104 post-merge)** |
| 3.9-D2-B inventory bulk UI | `/inventory/new` toggle | **LIVE (#105 post-merge)** |
| 3.9-G3 summary single-day | `/api/sale/summary?saleDate=` | LIVE |
| 3.9-G5 summary range | `/api/sale/summary?from=&to=` | LIVE |
| 3.9-G6 compact panel | `SaleSummaryPanel` | LIVE |
| 3.9-G7 dedicated `/sale/summary` route | not started | held — PR #86 §10 |
| 3.10-B/C V Rich board | skeleton shipped, NOT wired | held |
| Phase 1.5 auto-confirm | not started | held |

---

## 5. Hard rules (apply to ALL admin routes)

- ❌ NEVER read `shopId` from query/body — always `user.shopId` from session
- ❌ NEVER skip `requireAuth()` middleware
- ❌ NEVER expose customer PII (phone/email/address) outside the explicit customer detail endpoint
- ❌ NEVER soften rate-limit
- ❌ NEVER skip Zod body validation on POST/PATCH routes
- ❌ NEVER bypass `$transaction` for multi-row mutations
- ✅ ALWAYS return `{ success, data?, error?, fields? }` envelope shape
- ✅ ALWAYS use `ok(...)` / `error(...)` helpers from `src/lib/api/response.ts`
- ✅ ALWAYS log via `logActivity` for state-changing mutations (non-blocking)

---

## 6. Documentation cross-references

| Topic | Deeper doc |
|---|---|
| Sale single-day + per-route detail | `docs/superpowers/2026-05-23-sale-api-reference.md` (Block 3 PR #96) |
| Inventory bulk endpoint detail | `docs/superpowers/2026-05-23-inventory-api-reference.md` (Block 6 PR #106) |
| Summary contract (single + range) | `docs/superpowers/2026-05-24-sale-summary-range-contract.md` (Track 4) |
| Sale data-fetch + perf | `docs/superpowers/2026-05-24-sale-data-fetch-audit.md` (Track 6) |
| Stock + booking state machine | `docs/superpowers/2026-05-23-stock-booking-state-machine-matrix.md` (Block 5) |
| Phase 1.5 verdict packet | `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` |
| Inventory bulk tech plan (architecture) | `docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md` |
| Inventory verifier troubleshooting | `docs/superpowers/2026-05-24-inventory-verifier-troubleshooting.md` (Track 2) |
| V Rich board readiness | `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (Track 5) |
| Admin workflow polish | `docs/superpowers/2026-05-24-admin-workflow-polish-audit.md` (Track 8) |
| Sale core verifier plan | `docs/superpowers/2026-05-24-sale-core-verifier-plan.md` (Track 7) |
| Codemap entry for sale flow | `docs/CODEMAP/14-sale-flow.md` (Block 3 PR #94) |
| Smoke workbook v3 | `docs/superpowers/2026-05-23-admin-smoke-workbook-v3.md` |
| Smoke workbook v4 (Section L) | `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` |

---

## 7. Future routes (planned, not built)

| Route | Tier | Held for |
|---|---|---|
| `/api/sale/orders/[id]/append-from-bookings` | 1.5-C | Boss Phase 1.5 verdict |
| `/api/customers/[id]/risk-flag` | 1.5-B | Boss Phase 1.5 verdict |
| `/api/sale/summary.csv` | 3.9-G8 | Boss range UI verdict (PR #86 §10) |
| `/api/meta/webhook` | 4.1 | Boss Meta App Dashboard setup |
| `/api/meta/messages` | 4.5+ | Boss outbound authorization |

All held by hard no-go gates.

---

## 8. Status

- Index doc reflects state as of master `b0774a5`
- All listed routes are LIVE except Section 7 (future)
- No discrepancy detected between code + docs at audit time
- R2 docs-only PR
