# V Rich Board — Wiring Readiness

**Filed:** 2026-05-24 (autonomous Track 5)
**Author:** Claude Sonnet 4.6
**Status:** Readiness doc. NO wiring this PR.

Tracks what the V Rich board (Tier 3.10-B/C skeleton) needs before
production wiring can land.

---

## 1. Shipped (PR #88)

Components on master under `src/components/sale/board/`:

| Component | File | Status |
|---|---|---|
| ProductCodePill | `ProductCodePill.tsx` | shipped, NOT wired |
| ProductCodePillList | `ProductCodePillList.tsx` | shipped, NOT wired |
| SlotRow | `SlotRow.tsx` | shipped, NOT wired |
| SaleBoardReadOnly | `SaleBoardReadOnly.tsx` | shipped, NOT wired |

Pure helpers on master under `src/lib/sale/`:

| Helper | File | Tests |
|---|---|---|
| `pillColorState` / `compareDisplayCode` / `sortDisplayCodes` / `formatBoardHeader` / `buildSlots` / `slotsRemaining` | `board-helpers.ts` | 30 |
| `pillWidthChars` / `pillRowMaxWidthChars` / `slotProgressPercent` / `countFilledSlots` / `slotRowDisplayState` / `formatPillLabel` / `formatStockBadge` | `board-display.ts` | 37 |
| Natural-sort edge cases (Tier 3.10 hardening) | `board-natural-sort.test.ts` | 25 (this PR) |

Net: 92 board-side tests covering pure helper layer. Components themselves are presentational over those helpers.

---

## 2. NOT shipped — what remains before wiring

### 2.1 Boss explicit approval gates

- [ ] Boss UI smoke workbook v3 Sections A-K complete
- [ ] Boss UI smoke workbook v4 Section L complete
- [ ] Boss visually approves V Rich skeleton layout in dev preview
- [ ] Boss decides slot behavior policy (per §2.4)

### 2.2 Data wiring (not implemented)

- [ ] Route from `/sale` workspace into `<SaleBoardReadOnly />`
- [ ] Map `Booking[]` + `BroadcastProduct[]` + `StockReservation[]` to `SlotInput[]`
- [ ] Hook into existing `SaleWorkspaceShell` refetch token on mutations
- [ ] Feature flag (recommended): `NEXT_PUBLIC_V_RICH_BOARD_ENABLED=false` default

### 2.3 Slot behavior decisions (Boss-owned)

V Rich shows slots fill left→right as bookings come in. Open questions:

- [ ] When a CONFIRMED booking is cancelled, does its slot stay empty in original position OR pull-left to compact?
- [ ] When admin adds 5 more stock units mid-live to a BP, do new slots append OR reorder by displayCode?
- [ ] When stock count decreases (admin edit), do over-allocated slots show as `integrity_warn`?
- [ ] Multiple bookings same customer same BP — single slot or one slot per quantity unit?

Defaults in current skeleton:
- left-to-right fill, no pull-left
- new stock appends at end
- over-allocated → integrity_warn (matches current `MULTIPLE` reservation state)
- one slot per unit, multiple slots if quantity > 1

### 2.4 Interaction surface decisions (Boss-owned)

- [ ] Pill click — open booking detail? expand slot row? no-op?
- [ ] Pill drag-drop — out of scope (NO DRAG-DROP)
- [ ] Slot keyboard nav — arrow keys move focus across pills?
- [ ] Empty slot click — open Manual Create with that BP pre-filled?
- [ ] Terminal pill (cancelled/converted) — show in history disclosure only OR also greyed in active board?

Defaults in current skeleton:
- pill click is no-op (read-only)
- no drag-drop
- no keyboard nav
- empty slot click is no-op
- terminal pills hidden from active board (matches `isTerminalBookingStatus`)

### 2.5 Outbound integration (held)

- [ ] Pill action → trigger Messenger / WhatsApp reply (Tier 4.5+)
- [ ] Live comment → auto-fill Manual Create from V Rich slot (Tier 4.7+)

Hard-held: no outbound runtime per global no-go.

---

## 3. Wiring PR sequence (when Boss approves)

| PR | Title | Risk | Scope |
|---|---|---|---|
| 3.10-B-WIRE-1 | feat(sale): wire V Rich board behind feature flag | R1 | env flag default OFF; `/sale` page conditionally renders board |
| 3.10-B-WIRE-2 | feat(sale): map booking + stock to slot input | R1 | pure mapper fn + tests + integration |
| 3.10-B-WIRE-3 | feat(sale): refetch token integration | R1 | hooks `SaleWorkspaceShell` mutation refetch |
| 3.10-C-INTERACT-1 | feat(sale): pill click opens booking detail | R1 | only if Boss decides interaction |

Each PR ≤ 300 LOC. DISSENT 4-bullet on each.

---

## 4. Test surface needed before wiring

Already in master (post this PR):

- 92 pure helper tests (board-helpers + board-display + natural-sort)
- 53 state-machine invariants tests (`PENDING` / `CONFIRMED` / `CONVERTED` / V Rich filter partition)
- 24 D2-B bulk payload tests
- 37 D2-A route tests
- 16 inventory schema tests

NOT in master, needed before wiring:

- [ ] mapper test: `Booking[] + BP[] + StockReservation[] → SlotInput[]`
- [ ] integration test: refetch token bumps after mutation → board re-renders
- [ ] integration test: feature-flag OFF means board does NOT render
- [ ] visual regression (Playwright screenshot) — optional, Boss decides

---

## 5. Production safety on wiring day

When the wire PR opens, these must remain true:

- ❌ NO direct DB mutation from board components
- ❌ NO authenticated production POST from board components
- ❌ NO outbound messaging from board components
- ❌ NO Facebook runtime from board components
- ❌ NO Phase 1.5 auto-confirm runtime from board components
- ✅ MAY render read-only state derived from existing GET endpoints
- ✅ MAY emit `onAction` callbacks to parent for existing mutation paths (confirm/cancel/convert)
- ✅ MAY refetch on mutation via existing `refetchToken` pattern

---

## 6. Cross-references

- PR #88 — V Rich board skeleton (components shipped, not wired)
- PR #63 — Tier 3.10-A board audit (parent design)
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` (parent audit)
- `src/components/sale/board/` (4 components)
- `src/lib/sale/board-helpers.ts` (pure helpers)
- `src/lib/sale/board-display.ts` (display helpers)
- `tests/unit/lib/sale/board-helpers.test.ts` (30 tests)
- `tests/unit/lib/sale/board-display.test.ts` (37 tests)
- `tests/unit/lib/sale/board-natural-sort.test.ts` (this PR, 25 tests)

---

## 7. Status

| Item | Status |
|---|---|
| Helpers + components on master | ✅ |
| Natural-sort edge cases locked | ✅ this PR |
| Boss layout approval | ⏸ pending UI smoke |
| Slot behavior decisions | ⏸ pending Boss |
| Interaction surface decisions | ⏸ pending Boss |
| Feature flag scaffold | ⏸ not started (3.10-B-WIRE-1) |
| Data mapper | ⏸ not started (3.10-B-WIRE-2) |
| Refetch token integration | ⏸ not started (3.10-B-WIRE-3) |
| Outbound integration | ❌ hard-held (Tier 4.5+) |
