# Tier 3.9 — Phase 0 Deep Audit (Product Create/Edit Pattern Unification)

**Filed:** 2026-05-21
**Author:** Claude (Sonnet) under Boss + ChatGPT supervision
**Status:** Audit only — no runtime changes
**Master HEAD at audit time:** `0124caf`
**Baseline:** `npx tsc --noEmit` EXIT=0, `npm run lint` 0 errors / 58 warnings (pre-existing)

This document is the deliverable for **Phase 0** of the Tier 3.9 work order. It maps every product / variant / sale-code surface, identifies the mismatches Boss reported during Tier 3.8 production smoke, and proposes a canonical pattern + PR split.

It must be Boss + ChatGPT reviewed BEFORE any implementation PR opens.

---

## 1. Schema audit (Prisma 7 / Postgres)

### 1.1 Product / ProductVariant / BroadcastProduct

| Model | Key fields | Unique constraints | Notes |
|---|---|---|---|
| `Product` | `stockCode` (required), `saleCode` (nullable), `name`, `categoryId?`, `images[]`, `isActive` | `@@unique([shopId, stockCode])` | name required (line 157). Indexes on `stockCode`, `saleCode`. |
| `ProductVariant` | `sku`, `price` (Decimal 12,2 required), `costPrice?`, `quantity` (default 0), `reservedQty`, `lowStockAt?`, `attributes` JSON | `@@unique([productId, sku])` | One product → many variants. Stock lives on variant, not product. |
| `BroadcastProduct` | `liveSessionId?`, `productId`, `variantId?`, `displayCode`, `displayOrder`, `priceOverride?`, `isPinned` | `@@unique([liveSessionId, displayCode])` + partial SQL `@@unique([shopId, displayCode]) WHERE liveSessionId IS NULL` | Supports BOTH evergreen (null liveSessionId) and live-bound. Migration `20260514000000_sale_omnichannel_booking` adds the partial index via raw SQL (Prisma doesn't generate WHERE clauses). |
| `StockReservation` | `variantId`, `bookingId?`, `orderId?`, `quantity`, `expiresAt`, `releasedAt?` | None (indexed by variantId / bookingId / expiresAt) | Atomic stock reservation. Released via `releasedAt`. |
| `Booking` | `liveSessionId?`, `broadcastProductId`, `customerId`, `quantity`, `unitPrice`, `status`, `source`, `idempotencyKey?` | `@@unique([shopId, idempotencyKey])` | Source enum: MANUAL / LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / IMPORT / SYSTEM. **Forward-compat ✅** — Tier 3.10 multi-channel doesn't need new enum values. |

### 1.2 Channel / source enum readiness

`BookingSource` enum already covers all Boss-mentioned future channels:

```
MANUAL          ✅ available now
LIVE_COMMENT    ✅ schema ready (parser not built)
PAGE_INBOX      ✅ schema ready (Messenger runtime not built)
POST_COMMENT    ✅ schema ready (parser not built)
WHATSAPP_CHAT   ✅ schema ready (runtime not built)
TELEGRAM_CHAT   ✅ schema ready (runtime not built)
IMPORT          ✅ available for bulk loaders
SYSTEM          ✅ available for cron/automation
```

No migration needed for Tier 3.10 channel readiness at the schema layer. UI + repo layers may still need filter additions.

### 1.3 Migrations on master

```
20260403074809_init
20260508171617_add_unified_inbox_and_sale_mvp
20260514000000_sale_omnichannel_booking
```

No pending or untracked migrations as of `0124caf`. Tier 3.8 was schema-no-op (Zod relaxation + new route + new component only).

---

## 2. Product creation surfaces (every way to create Product / Variant / BroadcastProduct)

### 2.1 `/inventory/new` — `src/app/(app)/inventory/new/page.tsx` + `src/components/inventory/ProductForm.tsx` (355 lines)

| Property | Value |
|---|---|
| Pattern | Old structured form: Product header + nested VariantForm[] |
| Required fields | `name` (line 225 `required`), `stockCode` (line 234 `required`), per-variant `sku` + `price` |
| Optional fields | `saleCode`, `description`, `categoryId`, `images` (edit-mode only), `costPrice`, `lowStockAt` |
| Bulk creation | ❌ no Start/End No. concept |
| Default for blank price | none — relies on Zod `.transform()` (PR-A relaxation) |
| Default for blank name | none — `required` HTML attribute blocks submit |
| API endpoint | `POST /api/products` |
| Validation schema | `createProductSchema` in `src/lib/validation/product.schemas.ts` (PR-A relaxed to accept `price >= 0` + empty string transforms) |
| Tier 3.8 update | Schema layer ONLY. UI was NOT rewritten. |
| Boss verdict | **Issue 3.9.4 — too complicated, still uses old default form.** |

### 2.2 `/sale` quick-create dialog — `src/components/sale/CreateQuickProductCodeDialog.tsx`

| Property | Value |
|---|---|
| Pattern | Flat 11-field dialog (no nested Variant section) |
| Required fields | `stockCodeBase` + `saleCodeBase` only |
| Optional fields | `categoryId`, `productName`, `productDetails`, `imageUrl`, `startNo`, `endNo`, `quantity` (defaults 1), `lowStockAt`, `price` (defaults 0), `cost` |
| Bulk creation | ✅ Start/End No. produces `endNo - startNo + 1` trios (Product + Variant + BroadcastProduct), max 100 per request (`QUICK_BULK_MAX_RANGE = 100`) |
| Default for blank price | `'0'` (Zod `.transform()` in `quickBulkProductCodesBodySchema`) |
| Default for blank name | repo fills placeholder from `saleCode` → `stockCode` (line 199-206 of product.repository.ts pattern) |
| API endpoint | `POST /api/sale/quick-product-codes` |
| Validation schema | `quickBulkProductCodesBodySchema` in `src/lib/validation/sale.schemas.ts` |
| Evergreen flag check | ❌ route does NOT check `ALLOW_EVERGREEN_BROADCAST_PRODUCT`. Always creates evergreen (`liveSessionId: null` line 219 of repo). Intentional per Boss workflow. |
| Boss verdict | ✅ matches workflow. **Keep as canonical pattern.** |

### 2.3 Add from Stock dialog — `src/components/sale/AddFromStockDialog.tsx`

| Property | Value |
|---|---|
| Purpose | Pick existing ProductVariant from inventory + assign displayCode for sale board |
| Search endpoint | `GET /api/products?search=&limit=20` |
| Selection | **Single-select only** (`selectedVariant: ProductSearchVariantRow \| null`, line 83) |
| Required to submit | `displayCode` non-empty (line 172) AND `selectedVariant !== null` |
| displayCode default | ❌ blank — Boss must type even if stock has saleCode |
| priceOverride default | ❌ blank — Boss must type even though variant has price |
| API endpoint | `POST /api/sale/broadcast-products` |
| Evergreen flag check | ✅ route enforces `ALLOW_EVERGREEN_BROADCAST_PRODUCT` (defense-in-depth at repo) |
| Search row shape | `{ variantId, productId, productName, sku, attributes, price, quantity, reservedQty }` — **no saleCode field surfaced** |
| Boss verdict | **Issue 3.9.2 + 3.9.3 — single-select forces 10× clicks for CM1-CM10; redundant displayCode + special price typing.** |

### 2.4 `POST /api/products` — legacy product create

| Property | Value |
|---|---|
| Caller | ProductForm only |
| Auth | OWNER / MANAGER |
| Validation | `createProductSchema` (Tier 3.8 PR-A relaxed) |
| Repository | `productRepository.create` (line 199-206 already has placeholder-name fallback) |
| Notes | Repository already supports name fallback; ProductForm UI doesn't expose it (still HTML `required`). |

### 2.5 `POST /api/sale/broadcast-products` — broadcast product create

| Property | Value |
|---|---|
| Caller | AddFromStockDialog |
| Auth | OWNER / MANAGER (CHAT_SUPPORT cannot create) |
| Body shape | `{ variantId, displayCode, liveSessionId?, priceOverride? }` |
| Validation | `createBroadcastProductBodySchema` |
| Repository | `broadcastProductRepository.create` — enforces evergreen flag |
| Multi-create | ❌ single-row only |

### 2.6 `POST /api/sale/quick-product-codes` — Tier 3.8 composite create

| Property | Value |
|---|---|
| Caller | CreateQuickProductCodeDialog only |
| Auth | OWNER / MANAGER |
| Multi-create | ✅ range bulk (start/end), single Prisma transaction |
| Output | array of `{ productId, variantId, broadcastProductId, stockCode, saleCode, displayCode }` |

### 2.7 Other surfaces (none for plain product create)

Checked and **NOT product create paths**:
- `POST /api/products/[id]/variants` — adds variant to existing product (not full create)
- `POST /api/products/import` — bulk CSV import (Tier 5+ feature, not in Boss workflow)
- `POST /api/storefront/admin/products` — storefront publish (creates StorefrontProduct join row, not Product)
- `POST /api/sale/bookings` — Booking create (not Product)
- Verifier / seed scripts — internal only, not user-facing

---

## 3. Product edit surfaces

### 3.1 `/inventory/[id]` — `src/app/(app)/inventory/[id]/page.tsx` + ProductForm edit mode

- Same `ProductForm` component as create, with `mode="edit"`.
- PATCH `/api/products/[id]` — name / stockCode / saleCode / description / categoryId only.
- Variants edited separately via VariantForm (lives inside ProductForm in edit mode).
- Images upload + delete via `/api/products/[id]/images` and `/api/products/[id]/images/[filename]`.

### 3.2 Sale-side product code edit — `src/components/sale/EditProductCodeDialog.tsx`

- Tier 3.6 dialog. Edits BroadcastProduct fields: `displayCode`, `displayOrder`, `priceOverride`, `isPinned`.
- PATCH `/api/sale/broadcast-products/[id]`.
- DOES NOT edit underlying Product / Variant. Stock quantity / price are edited at variant level (separate flow).

### 3.3 Stock quantity adjust — `POST /api/stock/adjust`

- Variant-level quantity delta (positive or negative). Audit logged.
- Used by inventory page row actions.

### 3.4 Price edit

- Variant price → only via `ProductForm` edit mode (PATCH /api/products/[id]/variants/[variantId]).
- BroadcastProduct priceOverride → EditProductCodeDialog.

### 3.5 Image edit / upload

- Edit-mode only in ProductForm.
- No image upload at create time.
- No image edit from `/sale` quick-create dialog.
- imageUrl field in `quickBulkProductCodesBodySchema` accepts URL string but doesn't upload — Boss has to paste R2 URL manually.

### 3.6 Missing edit surfaces

- ❌ No way to edit product image from `/sale` after quick-create (must navigate to `/inventory/[id]`).
- ❌ No way to bulk-edit prices.
- ❌ No way to bulk-toggle isActive.
- ❌ No way to attach image at quick-create time (URL paste only — no upload widget).

These gaps are Tier 3.9 scope-adjacent but NOT in Boss's reported 5 issues. Defer.

---

## 4. Product code fetch / display surfaces

### 4.1 Product Codes panel (`SaleProductGridPlaceholder` inside `SaleWorkspaceShell`)

**Smoking gun for Issue 3.9.1:**

`SaleWorkspaceShell.tsx` line 182:
```ts
const res = await fetch(
  `/api/sale/live-sessions/${encodeURIComponent(selectedId)}/broadcast-products`,
  { method: 'GET', credentials: 'same-origin' }
);
```

→ Fetches **live-scoped only**. Quick-create writes `liveSessionId: null`. **Mismatch verified.**

After quick-create POST returns success, `SaleProductGridPlaceholder` receives `onProductCreated()` callback → SaleWorkspaceShell refetches the live-scoped endpoint → evergreen rows are filtered out → panel appears unchanged.

Boss's workaround: click "Add from Stock" → search returns the newly-created variants → re-add as live-bound → now visible. (Inefficient, leads to Issue 3.9.2/3.9.3 redundant typing.)

### 4.2 Available endpoints

| Endpoint | Scope filter | What it returns |
|---|---|---|
| `GET /api/sale/live-sessions/[id]/broadcast-products` | Live-bound to specific session | Only `liveSessionId = [id]` rows |
| `GET /api/sale/broadcast-products?scope=all` | All shop-scoped | Evergreen + live-bound merged |
| `GET /api/sale/broadcast-products?scope=evergreen` | Evergreen only | `liveSessionId IS NULL` |
| `GET /api/sale/broadcast-products?scope=live` | Live-only (any session) | `liveSessionId IS NOT NULL` |

`broadcastProductRepository.list` (the `scope=all` path) ALREADY supports unified evergreen + live-bound listing. **The endpoint exists; the UI just isn't using it.** This is a UI-only fix.

### 4.3 Add from Stock search endpoint

`GET /api/products?search=&limit=20` — admin product search. Returns products with nested variants. **DOES expose `saleCode` field** (repo line 102). AddFromStock row shape currently discards it. Trivial fix.

---

## 5. Current sale board layout (Tier 3.10 audit input)

### 5.1 Current Product Codes panel

- 2-3 column grid of cards (`grid-cols-2 sm:grid-cols-3` line 189)
- Cap at 12 rows displayed (line 190 `slice(0, 12)`)
- Each card: displayCode + productName + sku + price + qty
- Out-of-stock + low-stock visual states (lines 191-206)
- Click → opens EditProductCodeDialog (line 197)
- 12+ rows truncated with "view all in next phase" message (line 254)

### 5.2 What V Rich App shows (per Boss reference video)

- Compact pill row at top: BD3 / BD4 / BD5 / CM1 / CM2 ...
- Click pill → opens expanded board BELOW the pill row
- Expanded board header: `BD4 大蜡烛 108 (13)` (code / name / price / available qty)
- Numbered slot rows (1. / 2. / 3. ...) totaling N = available qty
- Slots filled by dragging customer chip from inbox / live comments
- Cancel X per slot releases the booking
- Outbound confirmation sent on slot fill (NOT in Tier 3.10 scope per Boss)

### 5.3 Distance between current and V Rich

| Aspect | Current | V Rich | Gap |
|---|---|---|---|
| Card size | Large (text + qty + price block) | Pill (just code + dot/count) | UI: replace grid with pill row |
| Click behavior | Edit dialog popup | Expand board in-place | UI: add inline expansion state |
| Slot view | None | Numbered rows = stock qty | New component |
| Customer fill | None (Manual Create dialog is separate) | Drag/drop from channel | New component, Tier 4 dep |
| Multi-channel source | None visible in board | Inbox + comments + telegram + WA | Tier 4 dep |

**Tier 3.10 is doable IN STEPS** without breaking Tier 3.9. PRs 3.10-B (pills) + 3.10-C (read-only board) + 3.10-D (manual fill) + 3.10-E (cancel) are sequenced safely.

---

## 6. Future-channel compatibility audit

### 6.1 Schema layer

- ✅ `BookingSource` enum covers MANUAL / LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / IMPORT / SYSTEM
- ✅ `Booking.channelIdentityId?` and `Booking.conversationId?` and `Booking.sourceMessageId?` nullable FKs ready
- ✅ `ChannelIdentity`, `Conversation`, `Message` models exist (Tier 4 phase 1)
- ✅ `SaleChannel` enum on Customer covers FACEBOOK / INSTAGRAM / LINE / TIKTOK / MANUAL / STOREFRONT

### 6.2 Repository / route layer

- `bookingRepository.createManual` accepts source = MANUAL only currently. Other sources rejected at repo guard.
- `POST /api/sale/bookings` route validates source via Zod enum.
- No runtime parser exists for any non-MANUAL source.

### 6.3 UI layer

- `ManualCreateBookingDialog` exists for MANUAL source.
- No source-filter UI in any sale board panel.
- No drag-drop infrastructure.
- No inbox panel showing comments / messages.

### 6.4 Verdict

**Schema is forward-compat for Tier 3.10 board UI work.** Runtime support for non-MANUAL sources is Tier 4 scope (Messenger / Telegram / WhatsApp parsers). Tier 3.10 PRs A-E can proceed WITHOUT Tier 4 runtime, using MANUAL-only fill as the first feature path.

---

## 7. Mismatch risks identified

| Risk | Severity | Mitigation |
|---|---|---|
| Two product-create UIs diverge over time → user confusion | HIGH | PR 3.9-D unify `/inventory/new` to same flat pattern, OR document why two patterns exist |
| Quick-create succeeds + panel doesn't refresh → user re-creates duplicates | HIGH | PR 3.9-B fix unified fetch; today Boss got duplicate error from DB partial unique index, which is acceptable safety net but confusing UX |
| AddFromStock single-select forces 10× round-trips for CM1-CM10 | HIGH | PR 3.9-C multi-select |
| AddFromStock loses saleCode → forces re-typing → typo risk → wrong displayCode | MEDIUM | PR 3.9-C default displayCode from saleCode/SKU |
| Quick-create route bypasses evergreen flag, AddFromStock route enforces → inconsistent behavior | LOW | Document intent: quick-create is "Boss workflow" path, flag-bypass intentional. Keep but note in audit doc. Consider unifying in PR 3.9-E or defer. |
| Tier 3.10 pills + board if implemented before refresh fix → user can't see new codes appear | HIGH | PR 3.9-B is hard dependency for Tier 3.10 |
| `/inventory/new` rewrite risks breaking existing variant workflows | MEDIUM | PR 3.9-D keeps advanced section behind toggle; default to simple |
| Pattern unification might break tests | MEDIUM | Each PR runs targeted vitest before merge |

---

## 8. Canonical pattern (proposed)

### 8.1 Schema layer (no change)

- Product / ProductVariant / BroadcastProduct / Booking already structurally sound.
- Partial unique index already in place for evergreen.
- BookingSource enum already covers future channels.

### 8.2 Validation layer (consolidate)

- `createProductSchema` (Tier 3.8 PR-A) — accepts `price >= 0`, empty-string transforms, optional name. ✅ Already canonical.
- `quickBulkProductCodesBodySchema` (Tier 3.8 PR-B) — superset with bulk + composite fields. ✅ Already canonical.
- AddFromStock body schema (`createBroadcastProductBodySchema`) — needs **multi-row variant** (PR 3.9-C).

### 8.3 Repository layer

- `productRepository.create` — keep; already supports placeholder name fallback.
- `quickProductCodesRepository.createBulk` — keep; canonical composite create.
- `broadcastProductRepository.create` — extend to accept array (PR 3.9-C) for multi-add.

### 8.4 UI layer (shared component)

Build `ProductQuickCreateForm` shared component used by:
- `/sale` quick-create dialog (existing `CreateQuickProductCodeDialog` becomes thin wrapper)
- `/inventory/new` page (replaces old `ProductForm` as default; advanced behind toggle)

Shared props:
```ts
interface ProductQuickCreateFormProps {
  mode: 'sale-evergreen' | 'inventory-simple' | 'inventory-advanced';
  categories: readonly QuickProductCodeCategory[];
  onCreated: (result: CreatedRows) => void;
  showBulkRange?: boolean; // /sale = true, /inventory/new = optional
}
```

Shared fields:
- stockCodeBase (required)
- saleCodeBase (required, defaults to stockCodeBase if blank — per quick-create repo pattern)
- categoryId (optional)
- productName (optional, repo fills)
- productDetails (optional)
- imageUrl (optional)
- startNo / endNo (optional, paired, bulk mode)
- quantity (defaults 1)
- lowStockAt (optional)
- price (defaults 0)
- cost (optional)

Field shape and validation match `quickBulkProductCodesBodySchema` exactly.

Advanced section (toggle): variant attributes JSON, multiple variants per product, image upload. Defaults hidden.

### 8.5 Fetch layer (UI)

Product Codes panel uses:
```
GET /api/sale/broadcast-products?scope=all&liveSessionId=[id]
```

with `scope=all` returning union of evergreen + that session's live-bound rows. After quick-create POST success → `onProductCreated()` → refetch this single unified endpoint.

Same endpoint backs Tier 3.10 pill row.

### 8.6 Add from Stock dialog (multi)

- Result list checkbox per row + select-all visible toggle.
- Auto-default `displayCode` from `saleCode` || `sku` || product code.
- `priceOverride` optional, defaults blank (server interprets as use-variant-price).
- Submit POSTs to extended `/api/sale/broadcast-products` accepting `items: [{variantId, displayCode, priceOverride?}]` (transaction-safe).
- Already-existing-displayCode rows surfaced as conflict with row-level error.

---

## 9. Implementation PR split (Tier 3.9)

| PR | Scope | Files | LOC est | Risk | Schema migration |
|---|---|---|---|---|---|
| **3.9-A** | This audit doc | 1 (this doc) | ~700 | R2 | none |
| **3.9-B** | Product Codes panel → `GET /api/sale/broadcast-products?scope=all&liveSessionId=[id]` + refresh after quick-create | `SaleWorkspaceShell.tsx` + tests | ~120 | R2 | none (endpoint exists) |
| **3.9-C** | AddFromStock multi-select + defaults + batch POST | `AddFromStockDialog.tsx` + `broadcast-products` route + repo + schema + tests | ~400 | R1 | none |
| **3.9-D** | Shared `ProductQuickCreateForm` component; `/inventory/new` uses it (old form behind advanced toggle) | new component + `inventory/new/page.tsx` + `CreateQuickProductCodeDialog.tsx` refactor + tests | ~500 | R1 | none |
| **3.9-E** | Handoff doc + local verifier (D4/D6 still passes) + MEMORY.md update | new doc | ~200 | R2 | none |

**Stop conditions:**
- If PR 3.9-C requires schema migration for some reason → STOP + report
- If PR 3.9-D breaks existing inventory edit flow → ship simple-only and gate advanced behind feature flag
- If batch add cannot be transaction-safe → ship all-or-nothing first; partial-success later
- No outbound messaging in any 3.9 PR
- No Tier 3.10 work until 3.9 reviewed by Boss + ChatGPT

---

## 10. Questions requiring Boss / ChatGPT decision

1. **Q1 — Advanced toggle on /inventory/new:** Keep old `ProductForm` reachable via "Advanced" toggle, or remove entirely? Recommended: keep behind toggle for image-edit and multi-variant flows that quick-create doesn't cover yet.
2. **Q2 — `/inventory/new` bulk range:** Should `/inventory/new` also show Start/End No. like `/sale`, or only single-create? Recommended: hide bulk by default on `/inventory/new`; expose toggle to keep parity available.
3. **Q3 — Evergreen flag intent:** Quick-create route bypasses `ALLOW_EVERGREEN_BROADCAST_PRODUCT` flag while AddFromStock enforces it. Intentional split (Boss workflow path always works), or should AddFromStock also bypass? Recommended: keep split. Quick-create is Boss-driven; AddFromStock is more general and benefits from flag gating.
4. **Q4 — Batch displayCode collision:** When AddFromStock multi-add hits a duplicate displayCode partway through, return per-row results or fail all-or-nothing? Recommended: all-or-nothing in PR 3.9-C; per-row error reporting in PR 3.9-E if needed.
5. **Q5 — Live-bound vs evergreen for AddFromStock:** When session is selected, should multi-add create live-bound or evergreen rows? Recommended: live-bound (current behavior). Evergreen path remains in quick-create + flag-gated AddFromStock empty-session case.
6. **Q6 — Tier 3.10 dependency:** Tier 3.10 pills MUST consume the same unified endpoint from PR 3.9-B. Confirm Tier 3.10 cannot start until PR 3.9-B merges.
7. **Q7 — Image upload at quick-create:** Add image upload widget to CreateQuickProductCodeDialog (not just URL paste)? Recommended: defer to a later PR after Tier 3.10 design audit.
8. **Q8 — Pattern unification scope:** Should `ProductForm` be deleted after PR 3.9-D, or kept as advanced path forever? Recommended: keep advanced path indefinitely; track for future deprecation when Tier 5+ image upload + multi-variant land in quick-create form.

---

## 11. What this audit does NOT cover

- **Tier 3.10 design audit** (separate PR 3.10-A doc, after Tier 3.9 stable)
- **Tier 4 channel runtime** (Messenger / Telegram / WhatsApp parsers; out of scope)
- **Outbound customer messaging policy** (HARD NO until Boss + ChatGPT approves separately)
- **Stock decrement model X/Y/Z** (orthogonal pending decision)
- **Phase B execution** (not in scope, paused)
- **/inventory/[id] edit page rewrite** (advanced path; defer)
- **Image upload from /sale** (defer per Q7)

---

## 12. Verification baseline

```
$ npx tsc --noEmit
EXIT=0 (silent)

$ npm run lint
0 errors / 58 warnings (pre-existing, no regression)

$ git log --oneline -3
0124caf docs(sale): Tier 3.8 backlogs + implementation handoff (PR-D)
d4e9006 feat(sale): quick bulk product code creation (PR-B + verifier / Tier 3.8)
bb7a1f1 fix(sale): allow live-selling default values in product creation (PR-A / Tier 3.8)

$ git status --short
?? docs/superpowers/2026-05-21-tier-3-10-live-sale-board-layout-overhaul-backlog.md
?? docs/superpowers/2026-05-21-tier-3-9-product-create-pattern-unification-backlog.md
?? sale tab example/
?? test note/
```

No production mutations performed during audit. No env changes. No flag flips. Pak-ta-kra untouched.

---

## 13. Sign-off

Audit ready for Boss + ChatGPT review. Implementation cannot proceed without:
- Verdict on Q1-Q8 (or default-acceptance per audit recommendation)
- Confirmation of PR split (3.9-A through 3.9-E)
- Confirmation Tier 3.10 holds until 3.9 stable

When greenlit, execution starts at **PR 3.9-A docs/audit commit** (this doc + Tier 3.9 backlog + Tier 3.10 backlog into one docs-only PR), then PR 3.9-B refresh fix.
