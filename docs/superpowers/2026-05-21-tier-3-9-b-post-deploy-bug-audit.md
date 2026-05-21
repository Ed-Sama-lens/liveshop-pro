# Tier 3.9-B Post-Deploy Bug Audit + Revised Roadmap

**Filed:** 2026-05-21
**Status:** Audit-only — no code changes
**Master HEAD:** `ce28c75` (PR #47 merged + migration applied)
**Production:** https://nazhahatyai.com — date-first product code grouping live
**Source:** Boss UI smoke 2026-05-21

PR #47 deployed schema + date picker successfully. Boss UI smoke uncovered **10 bugs** spanning quick-create, AddFromStock, booking, order conversion, and panel filtering. Plus 8 backlog items previously deferred.

This doc audits root causes + revises PR plan for Tier 3.9-C through Tier 3.10.

---

## 1. Bug catalog from Boss UI smoke

### 1.1 B1 — CRITICAL — Same code different saleDate still conflicts

**Symptom:**
```
Duplicate code: unknown. Transaction rolled back; no products created.
```
Repro: create `SMK-TODAY` on 2026-05-21 → success. Switch date to 2026-05-22 → create `SMK-TODAY` → fail.

**Root cause:** Tier 3.9-B added saleDate uniqueness ONLY to `BroadcastProduct`. `Product` table still has shop-global `@@unique([shopId, stockCode])`. Quick-create transaction:

```
1. Product.create({stockCode: 'SMK-TODAY'})    ← FAILS HERE (collide with existing)
2. ProductVariant.create({sku: 'SMK-TODAY'})
3. BroadcastProduct.create({saleDate: 2026-05-22})
```

Step 1 throws P2002. Repository P2002 handler at `quick-product-codes.repository.ts:280-285` reports `target=unknown` because raw-SQL partial unique indexes don't surface `meta.target` reliably.

**Semantic question:** Should "create same stockCode on different sale dates" mean:
- **α** Reuse existing Product + Variant; only create new BroadcastProduct on the new date. ← **RECOMMENDED**
- β Append date suffix to stockCode (e.g. `SMK-TODAY-20260522`). Auto-disambiguate. UX confusing.
- γ Migrate `Product` to include saleDate in unique. Breaks catalog semantics (stockCode is supposed to be stable catalog ID).

Option **α** aligns with Boss's mental model: stockCode = physical inventory ID (catalog), displayCode = sale-day pointer. Reusable across dates without duplication.

### 1.2 B2 — CRITICAL — Booking quick-created product fails with "BroadcastProduct does not belong to the requested live session"

**Symptom:** Boss tried Manual Booking on a quick-created code → error toast. Same for codes created via legacy `/inventory/new` ProductForm IF those BPs are evergreen.

**Root cause:** `bookingRepository.createManual` at `booking.repository.ts:1551`:

```ts
if (bp.liveSessionId !== liveSessionId) {
  throw new ConflictError('BroadcastProduct does not belong to the requested live session');
}
```

`ManualCreateBookingDialog` ALWAYS passes `liveSessionId` from the selected session. Quick-create BPs have `liveSessionId=null`. → mismatch.

**Fix path:** Dialog must detect BP.liveSessionId and:
- If BP is live-bound → pass `liveSessionId`
- If BP is evergreen → pass `liveSessionId=null` AND pass `saleDate` for booking date context

Repo `createManual` already has evergreen-path branch (line 1543) — requires `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`. **Need verify flag value in Vercel prod env.**

### 1.3 B3 — HIGH — Bookings panel doesn't filter by saleDate

**Symptom:** Date picker switches Product Codes correctly, but Bookings panel shows all bookings regardless of selected date.

**Root cause:** PR #47 only switched Product Codes fetch to date-aware. Booking fetch at `SaleWorkspaceShell` still keys on `liveSessionId` (commented "deferred to Tier 4 parser runtime"). Boss confirmed this gap is unacceptable.

**Fix path:**
- Add `saleDate` filter to `GET /api/sale/bookings` route
- Booking can be filtered by:
  - BP.saleDate (if BP joined)
  - or new `Booking.saleDate` denormalized column (schema change)
- Recommend: route joins BP and filters BP.saleDate (no schema change required for this PR)

### 1.4 B4 — HIGH — Booking allows out-of-stock items

**Symptom:** Boss selected product with `availableQty=0` ("หมด" badge) → booking succeeded.

**Root cause:** No pre-booking stock check. Reservation happens at confirm-time only. Variant `availableQty = quantity - reservedQty` should gate booking create.

**Fix path:**
- `bookingRepository.createManual` add check: `if (variant.quantity - variant.reservedQty < bookingQty) throw OutOfStockError`
- UI Manual Booking dialog disable submit when `availableQty < requested`
- Decrement `reservedQty` on PENDING_REVIEW booking create (not just confirm) — current behavior reserves on CONFIRMED. This is the "Stock decrement decision X/Y/Z" Boss had as pending decision.

**Cross-link:** Pending Boss decision T5 (Stock decrement model). Now blocking PR.

### 1.5 B5 — MEDIUM — No Cancel button on PENDING booking

**Symptom:** PENDING bookings only show "Confirm" button. No X / Cancel action.

**Root cause:** `SaleBookingQueuePlaceholder` UI only renders Confirm on PENDING. No cancel path until status changes.

**Fix path:** Add `<button onClick={cancel}>X</button>` on PENDING row. POST `/api/sale/bookings/[id]/cancel` (route exists).

### 1.6 B6 — MEDIUM — Manual booking = 1 code per booking only

**Symptom:** Dialog allows 1 BP at a time. Boss wants multi-line cart (multiple codes in one booking session).

**Root cause:** Schema = `Booking → BroadcastProduct` 1:1. Each booking row = single BP. UI can offer "create N bookings in one transaction" but each remains 1:1.

**Fix path:**
- Schema-preserving solution: UI accepts list of `{BP, qty}` → backend creates N bookings in `$transaction`
- Group bookings by `customer + createdAt` for UI display ("Order draft")
- Future Order.create takes N bookings → 1 Order with N OrderItems (current model)

### 1.7 B7 — HIGH — Create Order incomplete

**Symptom:** Boss reported Create Order button doesn't work for full smoke.

**Root cause:** ✅ Already documented in MEMORY.md as in-flight. Bookings → Order conversion route exists (`/api/sale/orders/from-bookings`) but UI may be missing finalize path.

**Fix path:** Audit + complete `CreateOrderDialog` integration.

### 1.8 B8 — MEDIUM — AddFromStock shows codes already in panel

**Symptom:** Search results include products that already have a BroadcastProduct on current saleDate. Confusing.

**Root cause:** `/api/products?search=` returns all products. AddFromStock doesn't filter by "already-broadcasted for this date".

**Fix path:**
- Add `excludeWithBpForDate` query param to product search
- Repo: LEFT JOIN BroadcastProduct on `(shopId, productId, saleDate)`, exclude rows where BP exists
- UI: hide already-added rows

### 1.9 B9 — LOW — Date format `MM/DD/YYYY` (Boss prefers `DD/MM/YYYY`)

**Symptom:** Picker shows `05/21/2026`. Boss expects `21/05/2026`.

**Root cause:** Native `<input type="date">` uses **browser locale**, not app locale. Browser stuck on en-US.

**Fix path:**
- Native `<input type="date">` always shows YYYY-MM-DD as VALUE but displays in browser locale format
- For Thai users wanting DD/MM/YYYY:
  - **Option a:** Replace native input with custom date picker (shadcn Calendar + popover)
  - **Option b:** Set `lang="th-TH"` on HTML root or input — browser MAY render localized
  - **Option c:** Accept native picker; Boss adjusts browser language → low priority

Recommend Option **a** for Tier 3.10 polish (deferred). Keep Option **c** behavior for PR 3.9-B-2.

### 1.10 B10 — TRACKED — Product Codes card too large (V Rich pill layout)

**Status:** Already in Tier 3.10 backlog. Defer.

---

## 2. Backlog items Boss reiterated

| Item | PR | Status |
|---|---|---|
| AddFromStock multi-select / select-all | 3.9-C | open |
| AddFromStock default displayCode + price from saleCode/SKU | 3.9-C | open |
| `/inventory/new` quick-create pattern | 3.9-D | open |
| Pattern unification all create/edit surfaces | 3.9-D + 3.9-E | open |
| Product Codes pill layout (V Rich) | 3.10-A/B | held on 3.9 stable |
| Click pill → board/table slots | 3.10-C+ | held |
| Drag-drop customer from Live/Inbox/FB Post | 3.10-Drag (revised scope) | held on Tier 4 receive-only |
| Drag-drop Telegram/WhatsApp | 3.10-Drag-2 | further deferred |
| Outbound message confirmation | 3.10-Outbound | feature-gated, Boss approval required |

---

## 3. Revised PR sequence

Old plan: 3.9-A → 3.9-B (✅ merged) → 3.9-C → 3.9-D → 3.9-E → 3.10-A.

**Revised plan (10 PRs minimum):**

| PR | Title | Scope | Risk | Blocker on |
|---|---|---|---|---|
| **3.9-B2** | docs(sale): post-deploy bug audit | This doc | R2 | — |
| **3.9-B-Fix-1** | fix(sale): quick-create reuses existing Product on stockCode match | Bug B1 | R1 (repo change) | docs |
| **3.9-B-Fix-2** | fix(sale): evergreen booking path + saleDate context | Bug B2 + B3 | R1 (route + UI) | Fix-1 |
| **3.9-B-Fix-3** | fix(sale): booking out-of-stock guard + reservedQty timing | Bug B4 | R1 (stock semantics) | Fix-2; needs Boss decision on T5 |
| **3.9-B-Fix-4** | fix(sale): PENDING booking cancel button | Bug B5 | R2 | independent |
| **3.9-B-Fix-5** | feat(sale): multi-code Manual Booking (cart) | Bug B6 | R1 (route) | Fix-3 |
| **3.9-B-Fix-6** | fix(sale): Create Order finalize | Bug B7 | R1 | Fix-5 |
| **3.9-C** | feat(sale): AddFromStock multi-select + defaults + hide-existing | Bugs B8 + backlog | R1 | Fix-2 |
| **3.9-D** | feat(inventory): /inventory/new shared quick-create pattern | backlog | R1 | 3.9-C |
| **3.9-E** | docs + verifier + handoff | wrap-up | R2 | 3.9-D |
| **3.10-A** | docs(sale): V Rich pill+board design audit | next-tier audit | R2 | 3.9-E |

**Critical path:** Fix-1 → Fix-2 → Fix-3 → Fix-5 → Fix-6 unblock Boss's daily booking workflow. Fix-4 + 3.9-C can run parallel.

---

## 4. Root-cause deep dive per bug

### 4.1 B1 root cause — Product table not date-aware

**Schema constraint:**
```prisma
model Product {
  @@unique([shopId, stockCode])    // ← shop-global
}
```

**Boss's mental model vs reality:**

| Concept | Boss thinks | System actually |
|---|---|---|
| `stockCode` | label for one PHYSICAL inventory line | unique catalog ID per shop forever |
| `saleCode` / `displayCode` | label customer types in live chat | unique per (shop, saleDate) |
| Same stockCode reused across days | OK — same physical product | ❌ blocked by Product unique |

**Fix design:**

```
quickProductCodesRepository.createBulk → logic per (stockCode, saleCode) pair:
  existing = await tx.product.findUnique({ where: { shopId_stockCode: { shopId, stockCode } } })
  if (existing) {
    // Find or create matching variant
    variant = existing.variants[0] ?? await tx.productVariant.create({...})
  } else {
    product = await tx.product.create({...})
    variant = await tx.productVariant.create({...})
  }
  // Always create new BroadcastProduct on saleDate
  bp = await tx.broadcastProduct.create({...saleDate})
```

**Edge cases:**
- What if existing Product has different `name`/`price`/`category`? → Keep existing values. Don't overwrite (Product is catalog).
- What if Boss wants to recreate Product with new metadata for new sale day? → Boss must edit Product separately first. Or use different stockCode.
- What if variant doesn't exist (Product exists but no variants)? → Auto-create variant matching new sku.

### 4.2 B2 root cause — Booking validation rejects evergreen BP

**Constraint:** `bookingRepository.createManual` line 1551:
```ts
if (bp.liveSessionId !== liveSessionId) {
  throw new ConflictError('BroadcastProduct does not belong to the requested live session');
}
```

**Issue:** When `bp.liveSessionId=null` (evergreen) and dialog sends current session ID → mismatch.

**Fix design:**

`ManualCreateBookingDialog` must:
1. Read selected BP's `liveSessionId` from grid state
2. If BP evergreen → POST without `liveSessionId` OR with explicit `null`
3. Always include `saleDate` for date-context

`createManual` repo:
- Path A (live-bound BP): existing check still applies
- Path B (evergreen BP): skip session match check; require `saleDate` matches BP.saleDate
- Already has evergreen branch at line 1542-1548 (flag-gated)

**Verify Vercel env `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true`** before deploying fix.

### 4.3 B3 root cause — Booking fetch ignores saleDate

**Current:** `/api/sale/bookings?liveSessionId=...&limit=100`

**Need:** `/api/sale/bookings?saleDate=YYYY-MM-DD&limit=...`

**Fix design:**

```ts
// Route validation: accept liveSessionId OR saleDate (or both)
const querySchema = z.object({
  liveSessionId: z.string().optional(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine(d => d.liveSessionId || d.saleDate, {
  message: 'Provide liveSessionId or saleDate',
});

// Repo: join BP to filter by saleDate
where: {
  shopId,
  ...(saleDate ? { broadcastProduct: { saleDate: parseSaleDate(saleDate) } } : {}),
  ...(liveSessionId ? { liveSessionId } : {}),
}
```

UI `SaleWorkspaceShell` booking effect: switch dependency from `selectedId` to `selectedSaleDate`.

### 4.4 B4 root cause — No pre-booking stock guard

**Current model:**
- `ProductVariant.quantity` = total stock
- `ProductVariant.reservedQty` = reserved by CONFIRMED bookings + active StockReservation rows
- `availableQty = quantity - reservedQty`
- PENDING_REVIEW bookings do NOT reserve

**Boss's expectation:**
- PENDING_REVIEW booking should reserve immediately (else 10 customers can all "PENDING" the same last unit)
- Display "หมด" should block adding new bookings

**Fix design — two-phase:**

**Phase A (this PR):**
- Add `availableQty` check in `bookingRepository.createManual` (and parser when wired)
- Throw `OutOfStockError` if `availableQty < bookingQty`

**Phase B (Boss decision T5 dependency — Stock decrement X/Y/Z):**
- Decision matrix pending. Options:
  - **X:** Reserve on PENDING (fast-fail risk if customer abandons)
  - **Y:** Reserve only on CONFIRMED (current; race condition with multiple PENDING)
  - **Z:** Hybrid — soft-reserve on PENDING with short TTL, hard-reserve on CONFIRMED

Boss confirmed in smoke: Option **X** preferred ("update จำนวนสินค้าใน stock ทันทีเมื่อมีการเพิ่มสินค้าเข้า booking แม้ว่าจะยังไม่ confirm order").

→ Phase B = decrement reservedQty on PENDING create. Add to PR 3.9-B-Fix-3.

### 4.5 B5 — straightforward UI fix

Add cancel button on PENDING state. Existing `POST /api/sale/bookings/[id]/cancel` route ready.

### 4.6 B6 — schema-preserving multi-code

Dialog accepts array. Backend `$transaction` creates N bookings + N reservations. Each booking remains 1:1 with BP. Group by `(customer, createdAt floor to minute)` for UI display.

### 4.7 B7 — Create Order audit

Already wired backend (`POST /api/sale/orders/from-bookings`). UI may need:
- Multi-select bookings (already exists per smoke screenshot — checkbox + "Create Order (N)" button)
- Finalize button enabled when ≥1 booking selected
- Boss confirmed unfinished; need component audit

### 4.8 B8 — AddFromStock filter

```ts
// GET /api/products?search=...&excludeBpForSaleDate=2026-05-21
// Repo: LEFT JOIN BP on (productId, saleDate); exclude rows where BP.id IS NOT NULL
```

UI: hide rows with `alreadyAdded=true` flag.

### 4.9 B9 — locale-aware date picker

Defer to Tier 3.10 polish OR Tier 3.9-D shared form work.

### 4.10 B10 — V Rich pill layout

Tier 3.10 backlog. Held.

---

## 5. Schema impact summary

| Bug | Schema change needed? |
|---|---|
| B1 | No (logic change in repo) |
| B2 | No (route + UI dispatch logic) |
| B3 | No (route accepts saleDate; repo joins BP) |
| B4 | No (logic + reservation timing) |
| B5 | No (UI only) |
| B6 | No (transaction wrapper) |
| B7 | No (UI completion) |
| B8 | No (route param + repo join) |
| B9 | No (UI library) |
| B10 | No (UI layout) |

**Zero schema migrations needed** for Tier 3.9 fixes. All bugs are repo / route / UI logic.

---

## 6. Production stability risk

| Concern | Status |
|---|---|
| Existing CM1-CM10 codes (created pre-3.9-B with Quick Create) | Backfilled to created day. Still functional. |
| Boss test code `SMK-TODAY` today | Created, visible on 05/21. Safe to keep or delete. |
| Production smoke unauth | 16/16 pass post-merge ✅ |
| Booking flow broken for quick-created codes | YES — B2. Boss workaround: use `/inventory/new` legacy form codes |
| Order conversion | Partial. B7 follow-up needed |

**Recommendation:** Boss continues live selling using `/inventory/new`-created products until Fix-1 + Fix-2 ship. Quick-create works for catalog creation but bookings against quick-created codes fail.

---

## 7. Boss + ChatGPT decisions needed before implementation

| ID | Question | Recommendation |
|---|---|---|
| D-Fix-1 | Quick-create reuse Product (α) vs append date suffix (β) vs migrate (γ) | **α reuse** |
| D-Fix-2 | If existing Product has different name/category/price, use stored or overwrite? | **stored** (catalog stable) |
| D-Fix-3 | Booking out-of-stock guard — pre-PENDING or pre-CONFIRMED? | **pre-PENDING (Option X)** per Boss |
| D-Fix-4 | Reservation timing — PENDING (X) / CONFIRMED (Y) / hybrid (Z) | **X** per Boss |
| D-Fix-5 | Multi-code booking — backend $transaction or sequence calls? | **$transaction** (atomic) |
| D-Fix-6 | `ALLOW_EVERGREEN_BROADCAST_PRODUCT` env flag in production | Must verify; default likely `true` |
| D-Fix-7 | AddFromStock filter scope — current saleDate only or all dates? | **current saleDate only** |
| D-Fix-8 | Date picker library — shadcn Calendar or native `<input>` | **native for now**, shadcn in Tier 3.10 polish |
| D-Fix-9 | Booking date filter — by BP.saleDate join or new Booking.saleDate column | **BP.saleDate join** (no schema) |

---

## 8. Test coverage gaps to add

After fix-PRs:
- Quick-create reuse-Product unit test
- Booking evergreen-path repo test (different from live-bound)
- Booking out-of-stock guard test
- Multi-code transaction rollback test
- Bookings panel saleDate filter component test
- AddFromStock filter route test
- Cancel button on PENDING UI test

Add to existing `tests/unit/app/api/sale/` + `tests/unit/components/sale/`.

---

## 9. Production safety honored

- ✅ No production data mutation by this audit
- ✅ Pak-ta-kra untouched
- ✅ No secrets exposed
- ✅ No env / flag flip
- ✅ Snapshot from PR #47 still valid backup
- ✅ Boss-owned `test note/` + `sale tab example/` untracked

---

## 10. Cross-references

- `docs/superpowers/2026-05-21-tier-3-9-phase-0-audit.md` — initial 5-issue catalog
- `docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md` — date-first model
- `docs/superpowers/2026-05-21-tier-3-9-b-migration-safety-audit.md` — deploy procedure (B1 sequence)
- `docs/superpowers/2026-05-21-tier-3-9-product-create-pattern-unification-backlog.md` — original 5 backlog issues
- `docs/superpowers/2026-05-21-tier-3-10-live-sale-board-layout-overhaul-backlog.md` — V Rich pill design

---

## 11. Awaiting Boss + ChatGPT verdict

- D-Fix-1 through D-Fix-9 above
- Confirm PR sequence (10 PRs proposed)
- Confirm production stability acceptable while fixes land (Boss can use legacy form)
- Approve PR 3.9-B-Fix-1 implementation start after verdict
