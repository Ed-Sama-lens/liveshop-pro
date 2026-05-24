# V Rich Board — Read-Only Implementation Plan

**Filed:** 2026-05-24 (autonomous Phase 4)
**Author:** Claude Sonnet 4.6
**Status:** Implementation plan only. NO production UI wiring. NO drag/drop. NO outbound. NO new component code (skeleton already on master, this doc plans the wiring sequence).

Companion to:
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (what shipped + what remains)
- `docs/superpowers/2026-05-24-v-rich-board-wiring-readiness-checklist.md` (gate-by-gate checklist)
- `docs/superpowers/2026-05-24-sale-workspace-state-map.md` (state owners + refetch graph)
- `docs/CODEMAP/14-sale-flow.md` (sale flow map)

This doc adds: explicit per-PR contract / data shape / props / feature-flag mechanics / Boss decisions still needed.

---

## 0. Stage definitions

| Stage | Code | What | Risk |
|---|---|---|---|
| 3.10-B | read-only compact pill list (per BroadcastProduct row in current Product Codes panel) | wire `ProductCodePillList` skeleton into `/sale` LIVE | R1 |
| 3.10-C | read-only slot board (per-BP drawer expansion using `SaleBoardReadOnly`) | wire below-fold accordion under each pill row | R1 |
| 3.10-D | manual slot fill (empty slot click → Manual Create dialog pre-filled with BP) | reuse existing POST `/api/sale/bookings` — no new mutation route | R1 |
| HELD | drag/drop | out of scope | — |
| HELD | outbound from board | global hard-no-go | — |

This doc plans Stages 3.10-B and 3.10-C. Stage 3.10-D requires Boss verdict on interaction policy before scoping. Stages HELD remain held.

---

## 1. Required data contract

### 1.1 `SlotInput` shape (pure helper input)

```typescript
interface SlotInput {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly stockQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  readonly bookings: readonly SlotBookingRef[];
}

interface SlotBookingRef {
  readonly bookingId: string;
  readonly customerId: string;
  readonly customerNameHint: string; // PII-safe — name only, no phone/email
  readonly status: BookingStatus; // PENDING_REVIEW | CONFIRMED | CANCELLED | EXPIRED | CONVERTED_TO_ORDER
  readonly quantity: number;
}
```

Mapper `buildSlotInputFromState(broadcastProducts, bookings, reservations) → SlotInput[]` is a pure fn. Lives at `src/lib/sale/build-slot-input.ts` (new). Per existing helpers convention: no React, no fetch, no Prisma.

### 1.2 Source GET endpoints (already wired in workspace)

- `GET /api/sale/broadcast-products?saleDate=YYYY-MM-DD` → `SaleBroadcastProductRow[]`
- `GET /api/sale/bookings?liveSessionId=X` → `SaleBookingRow[]`
- No new endpoint. No mutation surface from board.

### 1.3 Stock reservation join

Reservations are joined server-side via the existing booking response. Board renders `reservedQty` + `availableQty` already computed by the API. No new join logic in board code.

---

## 2. Stage 3.10-B — Pill list wiring

### 2.1 PR `3.10-B-WIRE-1` — feature flag scaffold (R1)

**Goal:** add `NEXT_PUBLIC_V_RICH_BOARD_ENABLED` env flag. When ON, render `<ProductCodePillList />` ALONGSIDE existing Product Codes panel. When OFF (default), no change.

**Files touched:**
- `src/components/sale/SaleWorkspaceShell.tsx` (+~10 lines): conditional render based on `process.env.NEXT_PUBLIC_V_RICH_BOARD_ENABLED === 'true'`
- `src/components/sale/SaleProductGridPlaceholder.tsx` (UNTOUCHED — existing panel keeps rendering)
- No new component file (skeleton already on master from PR #88)

**DISSENT 4-bullet required.** Boss must create env var in Vercel before merge.

**Boss explicit `IMPLEMENT 3.10-B-WIRE-1 NOW` required.**

### 2.2 PR `3.10-B-WIRE-2` — data mapper helper (R2)

**Goal:** add `src/lib/sale/build-slot-input.ts` pure fn + unit tests. Does NOT wire into UI yet.

**Files touched:**
- `src/lib/sale/build-slot-input.ts` (new, ~80 LOC pure fn)
- `tests/unit/lib/sale/build-slot-input.test.ts` (new, ~12 cases)

**Risk R2.** No `/sale` page change. No UI render. Helper exists only.

Tests cover:
- Empty state
- Single BP single booking
- Multi BP
- Cancelled bookings filtered (terminal status)
- Over-allocated → `integrity_warn`
- Multi-booking same customer same BP

### 2.3 PR `3.10-B-WIRE-3` — pill list LIVE wiring (R1)

**Goal:** wire mapper + existing `<ProductCodePillList />` into the flag-gated branch from WIRE-1. When flag ON, board renders LIVE booking + stock state from existing GET endpoints.

**Files touched:**
- `src/components/sale/SaleWorkspaceShell.tsx` (~+30 lines): pass mapper output to `<ProductCodePillList products={slotInputs} />`
- `src/components/sale/board/ProductCodePillList.tsx` (UNTOUCHED — skeleton component contract already defined)

**Pill click:** NO-OP (read-only Stage 3.10-B). Boss may verdict Stage 3.10-D Manual Create fill later.

**Refetch:** hooks into existing `SaleWorkspaceShell.refetchToken`. Board re-renders on mutation (Confirm/Cancel/Convert from existing dialogs).

**Boss explicit `IMPLEMENT 3.10-B-WIRE-3 NOW` required.**

---

## 3. Stage 3.10-C — Slot board (drawer) wiring

### 3.1 PR `3.10-C-WIRE-1` — `<SaleBoardReadOnly />` per-pill drawer (R1)

**Goal:** click pill → expand drawer below using existing `<SaleBoardReadOnly />` skeleton. Drawer shows per-slot booking allocation grid.

**Files touched:**
- `src/components/sale/SaleWorkspaceShell.tsx` (~+50 lines): drawer state + onPillClick handler
- `src/components/sale/board/SaleBoardReadOnly.tsx` (UNTOUCHED — skeleton handles render)

**Pill click NOW expands drawer.** This is a change from Stage 3.10-B no-op behavior — requires Boss interaction-policy verdict per V Rich wiring checklist §4.

**Boss explicit `IMPLEMENT 3.10-C-WIRE-1 NOW` required.**

### 3.2 PR `3.10-C-WIRE-2` — slot click NO-OP placeholder (R2)

**Goal:** define empty-slot click handler as NO-OP for now. Reserved for Stage 3.10-D Manual Create fill.

Allows the click target to exist without behavior, so users testing the board don't see broken empty slots.

---

## 4. Stage 3.10-D — Manual slot fill (BLOCKED — needs Boss verdict)

When Stage 3.10-C is production-stable ≥1 week + Boss verdicts the empty-slot click policy:

### 4.1 PR `3.10-D-MANUAL-1` (R1)

**Goal:** empty slot click → open existing `ManualCreateBookingDialog` with BP pre-filled.

**Files touched:**
- `src/components/sale/board/SaleBoardReadOnly.tsx` (~+20 lines): onSlotClick callback
- `src/components/sale/SaleWorkspaceShell.tsx` (~+10 lines): handler bridge

**No new server route.** Reuses existing `POST /api/sale/bookings` manual create path. Dialog component unchanged.

---

## 5. HELD permanently (in this plan)

| Item | Why held |
|---|---|
| Drag/drop | Requires separate design audit + race-safety review + Phase 1.5-D multi-code stable first |
| Outbound from board | Global hard-no-go (Tier 4.5+ requires separate gate) |
| Phase 1.5 auto-confirm wired from board | Auto-confirm is Q1+Q2 territory, not board |
| New mutation route | Reuse existing POST endpoints only |
| New DB column | No board-specific DB column |
| Schema migration | None for V Rich wiring |

---

## 6. Boss decisions still needed (verdict templates)

### 6.1 Slot policy verdicts (from V Rich readiness checklist §3)

```
Slot policy verdicts — 2026-05-24

Q3.1 Cancelled slot behavior:      [stay empty / pull-left compact] = ___
Q3.2 New stock mid-live:           [append at end / reorder by displayCode] = ___
Q3.3 Over-allocated → warn:        [YES integrity_warn / NO] = ___
Q3.4 Per-unit slot:                [one per unit / one per booking] = ___
Q3.5 Terminal pill visibility:     [history only / greyed in board] = ___
```

### 6.2 Interaction policy verdicts

```
Interaction policy verdicts — 2026-05-24

Q4.1 Pill click (Stage 3.10-C):    [no-op / open drawer / open booking detail] = ___
Q4.2 Drag-drop:                    [NO held] = ___ (must = NO)
Q4.3 Keyboard nav:                 [no / arrow keys focus] = ___
Q4.4 Empty slot click (Stage 3.10-D): [no-op / Manual Create pre-fill] = ___
Q4.5 Terminal pill clickable:      [no / yes for history] = ___
```

### 6.3 Environment gate

```
Authorize NEXT_PUBLIC_V_RICH_BOARD_ENABLED in Vercel: [YES / NO] = ___
Default value (production):                            [false / true] = ___ (recommended: false)
First WIRE-1 PR authorization:                         [IMPLEMENT NOW / hold] = ___
```

---

## 7. Relationship to existing surfaces

### 7.1 Summary panel

`<SaleSummaryPanel />` is unaffected by board wiring. Both consume same `selectedSaleDate` from `SaleWorkspaceShell`. Both refetch on same `refetchToken`.

### 7.2 Booking state machine

Board RENDERS the state machine; it does NOT mutate it. Existing Confirm / Cancel / Convert dialogs remain the only mutation paths. Board reflects post-mutation state via refetch.

### 7.3 Phase 1.5 interaction

If Phase 1.5-B auto-confirm ships before Stage 3.10-B: board renders auto-confirmed bookings as CONFIRMED pills (no special handling needed).

If Phase 1.5-C auto-order append ships before Stage 3.10-B: board renders CONVERTED_TO_ORDER bookings as terminal (filtered from active list per existing `isTerminalBookingStatus`).

Multi-code Manual Create (Phase 1.5-D) is independent.

---

## 8. Test surface needed before any wire PR opens

Already on master (skeleton + helpers):

- 92 pure helper tests (board-helpers + board-display + natural-sort)
- 53 state-machine invariants (PR #103)
- All Tier 3.9 D2 tests

Required NEW before Stage 3.10-B WIRE-3:

- `tests/unit/lib/sale/build-slot-input.test.ts` (~12 cases) — Stage 3.10-B WIRE-2
- `tests/unit/components/sale/SaleWorkspaceShell-flag-gating.test.ts` (~6 cases) — flag OFF renders existing UI; flag ON renders board

Required NEW before Stage 3.10-C WIRE-1:

- Integration test or Playwright e2e for pill-click drawer expansion

---

## 9. Production safety on wiring day (every wire PR must hold)

- ❌ NO direct DB mutation from board
- ❌ NO authenticated production POST from board
- ❌ NO outbound from board
- ❌ NO Facebook from board
- ❌ NO Phase 1.5 auto-confirm runtime from board
- ❌ NO new mutation route added for board
- ❌ NO new env var beyond `NEXT_PUBLIC_V_RICH_BOARD_ENABLED`
- ❌ NO new DB column for board state
- ✅ MAY render read-only state from existing GET endpoints
- ✅ MAY emit onAction callback to parent for existing mutation paths
- ✅ MAY refetch on mutation via existing `refetchToken`

---

## 10. Boss-must-approve-first checklist

Before Stage 3.10-B WIRE-1 PR opens:

- [ ] Boss verdicts slot policy Q3.1–Q3.5 (§6.1)
- [ ] Boss verdicts interaction policy Q4.1–Q4.5 (§6.2)
- [ ] Boss authorizes `NEXT_PUBLIC_V_RICH_BOARD_ENABLED` env var creation (§6.3)
- [ ] Boss confirms default value `false` in Vercel
- [ ] Boss UI smoke workbook v5 Sections A–L all PASS (so board overlay doesn't compound smoke debt)
- [ ] Boss explicit `IMPLEMENT 3.10-B-WIRE-1 NOW`

If any item unchecked → Claude does NOT open the wiring PR.

---

## 11. Cross-references

- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (what shipped + remains)
- `docs/superpowers/2026-05-24-v-rich-board-wiring-readiness-checklist.md` (gate-by-gate)
- `docs/superpowers/2026-05-24-sale-workspace-state-map.md` (refetch graph)
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` (parent audit)
- `docs/CODEMAP/14-sale-flow.md` (sale flow map)
- `src/components/sale/board/` (4 components, 420 LOC, all skeleton — no wiring)
- `src/lib/sale/board-helpers.ts` (199 LOC pure helpers)
- `src/lib/sale/board-display.ts` (181 LOC pure helpers)
- `tests/unit/lib/sale/board-*.test.ts` (92 pure helper tests)
- PR #88 — V Rich board skeleton (components shipped, not wired)
- PR #63 — Tier 3.10-A board audit (parent design)

---

## 12. Status

| Item | Status |
|---|---|
| Skeleton + helpers on master | ✅ verified |
| 92 pure helper tests | ✅ green |
| Stage 3.10-B WIRE-1 (flag scaffold) | ⏸ blocked — Boss verdict on §6.3 + UI smoke |
| Stage 3.10-B WIRE-2 (mapper helper) | ⏸ blocked — can ship as R2 standalone if Boss authorizes |
| Stage 3.10-B WIRE-3 (LIVE wiring) | ⏸ blocked — depends on WIRE-1 + WIRE-2 |
| Stage 3.10-C (drawer) | ⏸ blocked — depends on WIRE-3 stable + Q4.1 verdict |
| Stage 3.10-D (manual fill) | ⏸ blocked — Stage 3.10-C stable + Q4.4 verdict |
| Drag/drop | ❌ HARD-HELD |
| Outbound from board | ❌ HARD-HELD |

No production UI wiring. No new component code in this PR. R2 — docs only. pak-ta-kra untouched.
