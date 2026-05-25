# V Rich Stage 3.10-C — Readiness Audit & Implementation Plan

**Filed:** 2026-05-25 (post Stage 3.10-B mapper #149 merge)
**Author:** Claude Sonnet 4.6
**Master baseline:** `e092e0b`
**Status:** Audit + plan only. NO production UI wiring. NO new component code in this PR.

Companion to:
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` (parent design audit)
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (what shipped + remains)
- `docs/superpowers/2026-05-24-v-rich-board-wiring-readiness-checklist.md` (gate checklist)
- `docs/superpowers/2026-05-24-v-rich-read-only-implementation-plan.md` (Stage 3.10-B/C/D PR sequence)
- `docs/superpowers/2026-05-23-sale-summary-board-integration-plan.md` (summary panel adjacency)

This doc closes Stage 3.10-B (mapper merged via PR #149) and audits what is needed before Stage 3.10-C (read-only slot board) implementation can safely start.

---

## 0. Cwd-hygiene note (added per Boss directive)

**ALWAYS** `cd liveshop-pro/` before running Node/test/lint/vitest/build commands. Running from parent `COWORK/code/` causes vitest to discover both `liveshop-pro/` AND `pak-ta-kra/` test files (different stack — Drizzle vs Prisma — Prisma tests fail in Drizzle context). Symptom: 388/597 test files fail with import errors despite tests being valid in their own project.

Reproduced 2026-05-25 during Stage 3.10-B verification. Workaround = strict `cd` before every command.

Future docs PR may codify into a small `docs/dev-loop.md` or similar (not in this PR scope).

---

## 1. Stage 3.10-B closeout — what shipped

PR #149 (merged `e092e0b`):

| Item | Detail |
|---|---|
| File | `src/lib/sale/build-board-view-model.ts` (327 LOC) |
| Tests | `tests/unit/lib/sale/build-board-view-model.test.ts` (441 LOC, 34 tests) |
| Behavior change | NONE — pure additive helper |
| Composes existing helpers | `sortDisplayCodes` / `pillColorState` / `slotsRemaining` / `buildSlots` / `formatBoardHeader` / `formatPillLabel` / `formatStockBadge` / `formatCurrency` |
| Output | `BoardViewModel` = `pills` + `drawers` (Record) + `orphanBookings` + `selectedBroadcastProductId` |
| Production UI consumption | NONE — mapper exists in isolation |

Mapper is **complete + sufficient** for Stage 3.10-C consumption. No re-derivation needed in UI.

---

## 2. Skeleton + helpers + docs inventory

### Skeleton components (`src/components/sale/board/`)

| File | LOC | Status |
|---|---|---|
| `ProductCodePill.tsx` | 89 | shipped, NOT wired to /sale |
| `ProductCodePillList.tsx` | 72 | shipped, NOT wired to /sale; props = `items[] + selectedDisplayCode + onSelect + stockBadgeMode` |
| `SlotRow.tsx` | 103 | shipped, NOT wired to /sale |
| `SaleBoardReadOnly.tsx` | 156 | top-level skeleton; props = `products[] + defaultSelected + onSlotCancel`; renders ProductCodePillList + BoardDrawer behind `selectedProduct` state |

### Pure helpers (`src/lib/sale/`)

| File | LOC | Purpose |
|---|---|---|
| `board-helpers.ts` | 199 | `pillColorState` / `compareDisplayCode` / `sortDisplayCodes` / `formatBoardHeader` / `buildSlots` / `slotsRemaining` / types |
| `board-display.ts` | 181 | `pillWidthChars` / `pillRowMaxWidthChars` / `slotProgressPercent` / `countFilledSlots` / `slotRowDisplayState` / color tokens / `formatPillLabel` / `formatStockBadge` |
| `build-board-view-model.ts` | 327 | new Stage 3.10-B mapper (#149) |

### Existing docs

| Doc | Purpose |
|---|---|
| `2026-05-13-vrich-reference-gap-analysis.md` | original V Rich UX reference gap |
| `2026-05-21-tier-3-10-live-sale-board-layout-overhaul-backlog.md` | layout backlog |
| `2026-05-23-tier-3-10-a-vrich-board-design-audit.md` | parent design (3.10-A) |
| `2026-05-23-sale-summary-board-integration-plan.md` | summary panel integration |
| `2026-05-24-v-rich-board-readiness.md` | what shipped + remaining |
| `2026-05-24-v-rich-board-wiring-readiness-checklist.md` | gate checklist |
| `2026-05-24-v-rich-read-only-implementation-plan.md` | Stage 3.10-B/C/D PR sequence |

**No gap in docs surface.** Implementation plan exists from 2026-05-24; this doc refines it for Stage 3.10-C specifically.

---

## 3. Mapper output sufficiency check

Does current `BoardViewModel` cover Stage 3.10-C UI needs?

| 3.10-C UI need | Mapper field(s) | Sufficient? |
|---|---|---|
| Compact product-code pill display | `pills[].displayCode` + `pills[].pillLabel` + `pills[].pillColor` + `pills[].stockBadge` | ✅ |
| Active / empty slot display | `drawers[bpId].slots[]` (Slot union with `kind: 'empty' \| 'filled'`) | ✅ |
| Stock / count display | `pills[].slotsRemaining` + `pills[].totalSlots` + `pills[].availableSlots` + `pills[].headerLabel` | ✅ |
| Cancelled / history excluded from active board | `buildSlots` already filters terminal statuses (CANCELLED/EXPIRED/CONVERTED_TO_ORDER) | ✅ |
| Over-allocation flag | `drawers[bpId].hasOverflow` + `overflow[]` array | ✅ |
| Selected pill highlighting | `pillColor === 'selected'` driven by `selectedBroadcastProductId` input | ✅ |
| Empty-saleDate / no product-codes | mapper returns `pills: []` when no BPs → UI shows existing `ProductCodePillList` empty state | ✅ |
| Future manual fill (Stage 3.10-D) | mapper supports — UI hands `onSlotClick` to empty slot index; no mapper change | ✅ for read-only |
| Future drag/drop (HELD) | mapper NOT designed for this; would need new ordering field. Out of scope. | N/A |
| Customer name + booking id per slot | `Slot.filled.customerName + customerId + bookingId + status + quantity + createdAt` | ✅ |
| Live session badge (off-live vs live-bound) | `pills[].liveSessionId` (null = evergreen) | ✅ |
| Sale-date tag | `pills[].saleDate` | ✅ |

**Verdict:** Mapper output is **complete** for Stage 3.10-C. No mapper change needed.

---

## 4. Data contract (top to bottom)

```
[Source]                [Mapper input]              [Mapper output]            [UI consumer]
───────────────         ──────────────              ──────────────             ────────────
GET /api/sale/          BoardBroadcastProductInput  BoardPillViewModel         ProductCodePillList
broadcast-products      (mirrors SaleBroadcast      (pills[] sorted V Rich)    (ProductCodePill × N)
?saleDate=YYYY-MM-DD    ProductRow)                 BoardSlotDrawerViewModel
                                                    (drawers[bpId] keyed)      SaleBoardReadOnly
GET /api/sale/          BoardBookingInput                                      (drawer behind selection)
bookings?liveSession    (mirrors SaleBookingRow                                BoardDrawer (internal)
Id=X (or future          subset)                                               SlotRow × N
date-aware variant)
                        + selectedBroadcastProductId (optional)
                        + currency (default 'MYR')
```

Contract is **pull-based**: existing `SaleWorkspaceShell` already calls both endpoints + maintains `refetchToken`. Stage 3.10-C wiring PR will:

1. Call `buildBoardViewModel(input)` inside `SaleWorkspaceShell` (memoized on `[bps, bookings, selectedDisplayCode]`)
2. Pass `pills + drawers + selection` to the new component
3. Bridge component's `onSelect(displayCode)` callback to `setSelected(displayCode)` state local to shell

**No new endpoint needed.** Existing `/api/sale/broadcast-products?saleDate=` + `/api/sale/bookings` cover Stage 3.10-C. Future date-aware bookings endpoint may collapse the two (separate concern, Tier 4.x).

---

## 5. Future UI consumer needs (data fetching)

| State | Source | Notes |
|---|---|---|
| Loading | `SaleWorkspaceShell.productState.kind === 'loading'` or `bookingState.kind === 'loading'` | already present |
| Empty saleDate (no BPs, no day picked) | `productState.kind === 'no-session'` | already present |
| No product codes (saleDate set but 0 BPs) | `pills.length === 0` after mapper | mapper returns empty; ProductCodePillList shows empty state ("ยังไม่มีรหัสสินค้าในวันที่ขายนี้") |
| Product with zero available slots | `pills[].pillColor === 'out-of-stock'` + `availableSlots === 0` | mapper provides; UI styles via color token |
| Product with active bookings | `drawers[bpId].slots.some(s => s.kind === 'filled')` | mapper provides |
| Cancelled / history excluded | `buildSlots` filters terminal | already handled |
| Stock unavailable / unknown | mapper falls back to `0` (defensive parse) — same as today | UI shows `RM0.00` + `(0/0)` |
| Over-allocation | `drawers[bpId].hasOverflow === true` | mapper provides; UI badge optional |

All states covered by existing mapper + workspace shell state machine. No new fetch logic needed.

---

## 6. Stage 3.10-C implementation PR sequence

Per `2026-05-24-v-rich-read-only-implementation-plan.md` adjusted post-mapper:

| PR | Title | Risk | Scope |
|---|---|---|---|
| 3.10-C-WIRE-1 | `feat(sale): add NEXT_PUBLIC_SALE_LAYOUT_V2 feature flag scaffold` | R1 + DISSENT | env flag default OFF; `SaleWorkspaceShell` conditionally renders `<SaleBoardReadOnly />` ALONGSIDE existing Product Codes panel. Boss creates env var in Vercel BEFORE merge. |
| 3.10-C-WIRE-2 | `feat(sale): wire BoardViewModel into SaleBoardReadOnly` | R1 | replace placeholder `BoardDrawer` internal with mapper-driven `drawers[bpId]`. Component reads from mapper output instead of re-deriving from raw `SaleBookingRow[]`. |
| 3.10-C-WIRE-3 | `feat(sale): SaleWorkspaceShell flag-gated render of SaleBoardReadOnly` | R1 | when `process.env.NEXT_PUBLIC_SALE_LAYOUT_V2 === 'true'`, render board ALONGSIDE existing grid. Flag OFF = no change. |
| 3.10-C-WIRE-4 | `test(sale): SaleWorkspaceShell flag gating + visual smoke` | R2 | unit test for shell flag gating + Playwright snapshot of board behind flag ON |
| 3.10-D-MANUAL-1 | (BLOCKED) `feat(sale): empty slot click opens Manual Create dialog` | R1 | requires Stage 3.10-C stable + Boss verdict on interaction policy Q4.4 |

**Critical sequencing:** WIRE-1 (flag) → WIRE-2 (mapper consumption) → WIRE-3 (shell gating) → WIRE-4 (tests). Each Boss-verified before next opens.

---

## 7. Stock / count ambiguities (DO NOT change semantics — flag only)

Items flagged for awareness; **mapper does not resolve any of these — preserves current behavior**:

| Ambiguity | Current behavior | Risk if changed |
|---|---|---|
| `availableQty` vs `stockQuantity - reservedQty` consistency | mapper uses `availableQty` from API for `pillColor` but `stockQuantity` for slot count via `buildSlots(_, stockQuantity)`. API SHOULD ensure these align. | If API returns inconsistent values, slot drawer shows N slots but `pillColor='out-of-stock'`. Mapper does not reconcile (would be semantic change). |
| Terminal status filter | `buildSlots` filters `CANCELLED / EXPIRED / CONVERTED_TO_ORDER`. Bookings with these statuses are silently dropped from slot list. | If admin wants to see history inline (V Rich reference does show greyed terminal pills), need separate filter mode. NOT in 3.10-C scope. |
| Over-allocation handling | active bookings > stock → overflow array surfaces it. UI may show warning badge. | If UI ignores overflow, admin loses visibility into integrity issue. Stage 3.10-C UI MUST surface `hasOverflow`. |
| Multiple bookings same customer same BP | mapper treats each booking as separate slot. V Rich reference appears to do same. | If Boss prefers "group by customer", new mapper variant needed. Out of scope. |
| Stock quantity = 0 (out-of-stock BP listed on saleDate) | mapper renders empty drawer (0 slots). Active bookings → overflow. | Acceptable. UI shows `(0/0)` badge. |
| `lowStockAt = null` (no threshold configured) | `pillColorState` skips low-stock check → `in-stock` if availableQty > 0. | Acceptable. Boss may want default threshold (e.g. 20% of stock). NOT in scope. |

**None of these require semantic change in Stage 3.10-C.** Mapper preserves existing API contract verbatim.

---

## 8. UI states checklist (for future 3.10-C wire PR)

Stage 3.10-C wire PR MUST handle each:

- [ ] Loading: shell `productState.kind === 'loading'` → board hidden OR skeleton
- [ ] Empty saleDate: shell `productState.kind === 'no-session'` → board shows existing placeholder
- [ ] No product codes: mapper returns `pills.length === 0` → ProductCodePillList empty state
- [ ] BP loaded, no bookings: drawers all-empty when expanded
- [ ] BP loaded, active bookings: drawer renders filled + empty slots
- [ ] BP loaded, over-allocated: `hasOverflow` badge surfaces
- [ ] BP loaded, out-of-stock: pill renders `out-of-stock` color + `(0/N)` badge
- [ ] Cancelled bookings: excluded from slots (existing `buildSlots` behavior)
- [ ] Selected pill: `pillColor='selected'`, drawer expanded
- [ ] Click expanded pill again: drawer collapses (existing skeleton behavior)
- [ ] Feature flag OFF: board not rendered, only legacy Product Codes panel
- [ ] Feature flag ON in dev: board renders ALONGSIDE legacy panel (NOT replacing it)
- [ ] Refetch on mutation: mapper re-runs when `refetchToken` bumps (existing pattern)
- [ ] Loading orphan-bookings: surface as warning row (or silent — Boss UX decision)
- [ ] Error state: shell `productState.kind === 'error'` → board hidden

---

## 9. Boss UX review points (gate before WIRE-1 opens)

Per `2026-05-24-v-rich-board-wiring-readiness-checklist.md` §3 + §4, Boss must verdict BEFORE Stage 3.10-C-WIRE-1 PR opens:

| # | Question | Default if Boss silent |
|---|---|---|
| Q3.1 | Cancelled slot stays empty OR pulls left? | stays empty (current skeleton default) |
| Q3.2 | New stock mid-live appends OR reorders? | appends at end |
| Q3.3 | Over-allocated → `integrity_warn` badge YES? | YES |
| Q3.4 | Per-unit slot OR per-booking slot when qty > 1? | per-unit (multiple slots per booking) |
| Q3.5 | Terminal pill visibility: history only OR greyed in board? | history only (excluded from active board) |
| Q4.1 | Pill click: no-op OR open drawer OR open booking detail? | open drawer (existing skeleton) |
| Q4.2 | Drag/drop in Stage 3.10-C scope? | NO (HELD per design) |
| Q4.3 | Keyboard nav across pills? | no (deferred) |
| Q4.4 | Empty slot click: no-op OR Manual Create pre-fill? | no-op for 3.10-C; 3.10-D for Manual Create |
| Q4.5 | Terminal pill clickable for history detail? | no (deferred) |

Plus UX format questions Boss should verdict:

| # | Question | Recommended default |
|---|---|---|
| QF.1 | Pill density: 1 row max OR wrap unlimited? | wrap unlimited (current skeleton) |
| QF.2 | Slot label format inside pill: `(5)` compact OR `(5/13)` fraction? | `(5/13)` fraction (matches mapper headerLabel) |
| QF.3 | Display language for empty-state text + warnings: Thai only / Thai+English / Boss preference? | Thai primary (matches existing `/sale` workspace) |
| QF.4 | Layout: pills above existing Product Codes panel OR replacing it? | ALONGSIDE for 3.10-C (replace later after Boss validates) |
| QF.5 | Mobile breakpoint: collapse to vertical pill list OR hide board entirely? | collapse to vertical (existing flex-wrap already mobile-friendly) |
| QF.6 | Chinese/Malay/Thai product names in pill: truncate at N chars OR allow wrap? | truncate at 20 chars with tooltip |
| QF.7 | Drawer position: inline below pill row OR side panel? | inline below pill row (existing skeleton) |

---

## 10. Test plan for Stage 3.10-C wire PRs

Required NEW tests before any 3.10-C-WIRE-3 PR merges:

### Unit
- [ ] `tests/unit/components/sale/SaleWorkspaceShell-flag-gating.test.tsx` (~8 cases): flag OFF → board absent, flag ON → board present alongside legacy, no double render
- [ ] `tests/unit/components/sale/board/SaleBoardReadOnly-wired.test.tsx` (~10 cases): consumes mapper output correctly, drawer expand/collapse, click toggles
- [ ] `tests/unit/lib/sale/feature-flags.test.ts` (~4 cases): `isSaleLayoutV2Enabled()` reads env, defaults false

### Integration
- [ ] Existing `SaleWorkspaceShell` tests still PASS with flag OFF (regression guard)

### Visual (Playwright, behind flag ON in test env)
- [ ] snapshot board renders with realistic fixture
- [ ] snapshot board with overflow badge
- [ ] snapshot board with empty saleDate

Out-of-scope for 3.10-C tests:
- Stage 3.10-D Manual Create wiring
- Drag/drop
- Outbound triggers

---

## 11. Dangerous areas to avoid in Stage 3.10-C

These are NOT in scope; flag here so future implementer does not accidentally cross:

| Area | Why dangerous | Mitigation |
|---|---|---|
| Booking status transitions | `buildSlots` filters terminal — DON'T change filter mid-render | If Boss wants history view, separate feature flag + separate mapper variant |
| Stock reservation math | mapper uses `availableQty` from API — DON'T recompute client-side | If API value drifts, fix at API not in mapper |
| Cross-shop access | mapper accepts any input — relies on API for shop scoping | Already enforced at `/api/sale/*` route layer |
| New mutation route | NO new POST/PATCH/DELETE in Stage 3.10-C | Stage 3.10-D reuses existing `POST /api/sale/bookings` |
| Currency change | mapper defaults to `'MYR'` — DON'T accept Boss-toggled currency | Currency lives in shop settings; if shop adds non-MYR, separate work |
| Booking ID injection (XSS) | `customerName` rendered in slot — React escapes by default | Don't use `dangerouslySetInnerHTML` |
| Refetch loop | mapper is pure — DON'T memoize without proper deps | Use `useMemo(() => buildBoardViewModel(input), [bps, bookings, selected])` |

---

## 12. Recommendation

**PROCEED with docs/tests only for now.** Specifically:

1. **This audit doc** (current PR — R2 docs only)
2. **No component skeleton changes** until Boss verdicts Q3.1-5 + Q4.1-5 + QF.1-7 (see §9)
3. **No flag scaffold PR** until Boss authorizes `NEXT_PUBLIC_SALE_LAYOUT_V2` env var creation in Vercel
4. **Test plan documented but tests NOT added** until WIRE-1 PR opens (tests target shell flag gating which doesn't exist yet)

If Boss verdicts §9 questions + authorizes env var → next safe block opens `3.10-C-WIRE-1` flag scaffold PR.

**Do NOT propose component skeleton change in this PR.** Skeleton is already correct shape for mapper consumption; modification would require Boss UX verdict first.

---

## 13. Tiny pure-helper test gaps in mapper (#149) — none identified

Reviewed `build-board-view-model.ts` post-merge. 34 tests cover:

- empty / single / multi BP
- natural sort
- terminal filter (3 statuses)
- over-allocation
- orphan bookings
- selection
- MYR formatting + priceOverride + invalid parse + currency override
- evergreen vs live-bound
- saleDate carry-through + absent normalization
- lowStockAt low/in/out
- empty stock
- frozen output
- display formatting
- createdAt parsing for slot ordering

**No follow-up test-only PR needed.** Coverage is complete for the mapper's public surface.

---

## 14. Cross-references

- PR #88 — V Rich skeleton (4 components shipped, not wired)
- PR #149 — Stage 3.10-B mapper (merged `e092e0b`)
- `src/components/sale/board/` (4 components, 420 LOC, all skeleton)
- `src/lib/sale/board-helpers.ts` (199 LOC pure helpers)
- `src/lib/sale/board-display.ts` (181 LOC display helpers)
- `src/lib/sale/build-board-view-model.ts` (327 LOC mapper, #149)
- `tests/unit/lib/sale/board-*.test.ts` (existing pure helper tests)
- `tests/unit/lib/sale/build-board-view-model.test.ts` (34 mapper tests, #149)
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md`
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md`
- `docs/superpowers/2026-05-24-v-rich-board-wiring-readiness-checklist.md`
- `docs/superpowers/2026-05-24-v-rich-read-only-implementation-plan.md`
- `docs/superpowers/2026-05-23-sale-summary-board-integration-plan.md`

---

## 15. Status

| Item | Status |
|---|---|
| Stage 3.10-B mapper | ✅ shipped (#149) |
| Stage 3.10-B closeout | ✅ this doc |
| Stage 3.10-C wire PRs | ⏸ blocked — Boss verdict on §9 + env var |
| Stage 3.10-C test plan | ✅ documented |
| Stage 3.10-D Manual Create | ❌ HELD until 3.10-C stable + Q4.4 verdict |
| Drag/drop | ❌ HARD-HELD |
| Outbound from board | ❌ HARD-HELD |
| Cwd-hygiene note | ✅ §0 |
| Mapper purity (post-merge) | ✅ no semantic impact |
| R2 / security status | ✅ unchanged from prior block |
| pak-ta-kra | ✅ untouched |

R2 — docs only. No production code touched in this PR. pak-ta-kra untouched. No env / schema / mutation.
