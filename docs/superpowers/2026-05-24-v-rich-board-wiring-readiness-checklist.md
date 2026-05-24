# V Rich Board — Wiring Readiness Checklist

**Filed:** 2026-05-24 (autonomous docs block Track 4)
**Author:** Claude Sonnet 4.6
**Status:** Pre-flight checklist. NO production UI wiring. NO drag/drop. NO outbound. NO new component code.

This checklist is the **gate-by-gate** companion to the existing
readiness doc (`2026-05-24-v-rich-board-readiness.md`). The existing
doc tells *what is shipped* and *what remains*. This doc tells Boss
*what must be ticked off* before the first wiring PR opens, in
strict order, with who approves what.

V Rich board components ship + tests ship. **NOTHING is rendered on
production `/sale` page.** Hard-held per Boss Decision + global no-go
list.

---

## 0. What "wired" means

| State | Boss `/sale` page behavior |
|---|---|
| Unwired (CURRENT) | V Rich board components are on disk but `/sale` does not render `<SaleBoardReadOnly />` anywhere. Boss sees the existing Product Codes panel + Booking panel + Summary panel (unchanged). |
| Read-only wired (TARGET STAGE 1) | `/sale` page conditionally renders `<SaleBoardReadOnly />` behind feature flag default OFF. When flag ON, board renders LIVE booking + stock state from existing GET endpoints. NO mutations from board. Existing panels unchanged. |
| Manual fill wired (TARGET STAGE 2) | Empty slot click opens existing Manual Create dialog with BP pre-filled. No new mutation surface added. |
| Drag/drop (HELD) | Hard-held. Out of scope for any wiring PR. |
| Outbound (HELD) | Hard-held per global no-go. |

This checklist gates only the path from CURRENT → TARGET STAGE 1 (read-only wired).

---

## 1. Skeleton inventory verified on master

Confirmed on master HEAD `987e1f0` via `git ls-tree` + `wc -l`:

| File | Lines | Purpose | On master? |
|---|---|---|---|
| `src/components/sale/board/ProductCodePill.tsx` | 89 | Single pill rendering | ✅ |
| `src/components/sale/board/ProductCodePillList.tsx` | 72 | List wrapper | ✅ |
| `src/components/sale/board/SlotRow.tsx` | 103 | Single row layout | ✅ |
| `src/components/sale/board/SaleBoardReadOnly.tsx` | 156 | Top-level read-only board | ✅ |
| `src/lib/sale/board-helpers.ts` | 199 | Pure helpers (sort/color/build) | ✅ |
| `src/lib/sale/board-display.ts` | 181 | Display calculations (width/badge) | ✅ |
| `tests/unit/lib/sale/board-helpers.test.ts` | (30 tests) | Helper tests | ✅ |
| `tests/unit/lib/sale/board-display.test.ts` | (37 tests) | Display tests | ✅ |
| `tests/unit/lib/sale/board-natural-sort.test.ts` | (25 tests) | Natural-sort edge cases | ✅ |

Total board surface: 800 LOC components + helpers; 92 pure helper tests.

**No data mapper. No /sale page integration. No feature flag scaffold.**

---

## 2. Gate-by-gate checklist (must tick in order)

### Gate 1 — Boss explicit decision (BEFORE any wiring PR opens)

Boss must explicit-tick each item below. Without all ticks, Claude does NOT open any wiring PR.

- [ ] **Gate 1.1** — Boss reads `2026-05-24-v-rich-board-readiness.md` §2.3 (slot behavior decisions) + this doc §3 (slot policy table) and verdicts each open question
- [ ] **Gate 1.2** — Boss reads `2026-05-24-v-rich-board-readiness.md` §2.4 (interaction surface decisions) + this doc §4 (interaction policy table) and verdicts each open question
- [ ] **Gate 1.3** — Boss authorizes `NEXT_PUBLIC_V_RICH_BOARD_ENABLED` env var creation in Vercel (default OFF) — R1 env change requires Boss explicit verdict
- [ ] **Gate 1.4** — Boss authorizes feature flag scaffold PR (`3.10-B-WIRE-1`) — even with flag default OFF, the route change to read flag + conditionally render is R1
- [ ] **Gate 1.5** — Boss UI smoke workbook v5 Sections A-L complete (so Boss has visibility into current state before adding board overlay)

### Gate 2 — Pre-wiring code + tests (Claude does, R2 docs, no flag yet)

- [ ] **Gate 2.1** — Data mapper helper added: `src/lib/sale/build-slot-input.ts` exports `buildSlotInputFromState(bookings, broadcastProducts, reservations) → SlotInput[]` pure fn — R2 (no UI render path)
- [ ] **Gate 2.2** — Mapper unit tests added: minimum 12 cases covering empty state / single BP / multi BP / cancelled bookings filtered / over-allocated state / multiple bookings same customer
- [ ] **Gate 2.3** — Tests pass: `npx tsc --noEmit` + targeted vitest pass
- [ ] **Gate 2.4** — No `/sale` page change in this PR (mapper exists only as pure helper)

### Gate 3 — Feature flag scaffold (Claude does after Gate 1.3 + 1.4, R1)

- [ ] **Gate 3.1** — `NEXT_PUBLIC_V_RICH_BOARD_ENABLED` Vercel env var set to `false` (Boss does this, NOT Claude)
- [ ] **Gate 3.2** — Boss confirms env var via Vercel dashboard screenshot to Claude
- [ ] **Gate 3.3** — Claude opens `feat(sale): wire V Rich board behind feature flag default OFF` PR with DISSENT 4-bullet (R1)
- [ ] **Gate 3.4** — PR adds conditional render at `/sale` page: when flag === 'true', renders `<SaleBoardReadOnly />` ALONGSIDE (not replacing) existing Product Codes panel
- [ ] **Gate 3.5** — PR includes Playwright e2e: flag OFF → board absent from DOM; flag ON → board present
- [ ] **Gate 3.6** — Production smoke 17/17 still PASS post-merge
- [ ] **Gate 3.7** — Boss verifies on Vercel preview branch that flag OFF → no visible change; flag ON via local override → board renders

### Gate 4 — Read-only LIVE wiring (Claude does after Gate 3 stable, R1)

- [ ] **Gate 4.1** — Claude opens `feat(sale): map booking + stock to slot input` PR with DISSENT 4-bullet (R1 — semantic data flow)
- [ ] **Gate 4.2** — PR wires existing `/api/sale/broadcast-products` + `/api/sale/bookings` GET data into mapper from Gate 2 → board renders LIVE
- [ ] **Gate 4.3** — Hooks into existing `SaleWorkspaceShell` `refetchToken` so board refetches on mutation
- [ ] **Gate 4.4** — Pill click = NO-OP (read-only, per current skeleton default)
- [ ] **Gate 4.5** — Empty slot click = NO-OP (until Stage 2 manual fill wired)
- [ ] **Gate 4.6** — Boss visually approves rendering on Vercel preview with realistic data
- [ ] **Gate 4.7** — Production smoke 17/17 still PASS post-merge
- [ ] **Gate 4.8** — Flag flip to default ON only AFTER ≥1 week of board-OFF-stable + Boss explicit verdict

### Gate 5 — Manual fill (Stage 2, BLOCKED until Gate 4 stable + Boss verdict)

- [ ] **Gate 5.1** — Empty slot click opens existing Manual Create dialog with BP pre-filled
- [ ] **Gate 5.2** — NO new mutation route — reuses existing POST `/api/sale/bookings`
- [ ] **Gate 5.3** — PR adds zero new server code (UI wiring only)
- [ ] **Gate 5.4** — Boss verdict explicit before this PR opens

### Gate 6 — Drag/drop (HELD INDEFINITELY)

Not in scope for any wiring PR. Requires:
- Phase 1.5-D multi-code runtime stable
- Boss new explicit verdict
- Separate design audit (drag mechanics + race-safety)

Listed here only to make it explicit: **drag/drop is NOT in any wiring sequence**.

### Gate 7 — Outbound (HARD-HELD, global no-go)

Not in scope. Never opens from board. Outbound runtime requires Tier 4.5 + Boss verdict + global no-go lift.

---

## 3. Slot policy verdict table (Boss fills)

| Question | Current skeleton default | Boss verdict |
|---|---|---|
| CONFIRMED booking cancelled → slot stays empty in original position OR pull-left to compact? | stays empty (no pull-left) | ___ |
| Admin adds 5 more stock units mid-live → new slots append OR reorder by displayCode? | append at end | ___ |
| Stock count decreases (admin edit) → over-allocated slots show `integrity_warn`? | YES (matches MULTIPLE reservation) | ___ |
| Multiple bookings same customer same BP → single slot or one slot per quantity unit? | one slot per unit (multi-slot if qty > 1) | ___ |
| Terminal pill (cancelled/converted) → show in history disclosure only OR also greyed in active board? | history only (hidden from active) | ___ |

Defaults match `src/lib/sale/board-helpers.ts` current behavior + `isTerminalBookingStatus` filter.

---

## 4. Interaction policy verdict table (Boss fills)

| Question | Current skeleton default | Boss verdict |
|---|---|---|
| Pill click → open booking detail / expand slot row / no-op? | no-op (read-only) | ___ |
| Pill drag-drop → in scope? | NO (hard-held) | ___ (recommend keep NO) |
| Slot keyboard nav (arrow keys move focus across pills)? | no | ___ |
| Empty slot click → open Manual Create with BP pre-filled? | no-op (until Stage 2) | ___ |
| Terminal pill → clickable for history detail? | no | ___ |

If Boss verdicts pill-click = open booking detail → Stage 4.4 NO-OP becomes Stage 4 PR scope. Otherwise keep no-op for Stage 1.

---

## 5. Production safety on wiring day (every wire PR must hold these true)

| Item | Status that MUST hold |
|---|---|
| Direct DB mutation from board components | ❌ NEVER |
| Authenticated production POST from board | ❌ NEVER (Stage 1 + 2) |
| Outbound messaging from board | ❌ NEVER (held globally) |
| Facebook runtime from board | ❌ NEVER (held globally) |
| Phase 1.5 auto-confirm runtime from board | ❌ NEVER (held globally) |
| Render read-only state from existing GET endpoints | ✅ MAY (Stage 1+) |
| Emit `onAction` callback to parent for existing mutation paths | ✅ MAY (Stage 2 — Manual Create) |
| Refetch on mutation via existing `refetchToken` | ✅ MAY (Stage 1+) |
| New server route added for board | ❌ NEVER (reuse only) |
| New env var beyond `NEXT_PUBLIC_V_RICH_BOARD_ENABLED` | ❌ NEVER (Stage 1+) |
| New DB column for board state | ❌ NEVER (Stage 1+) |

---

## 6. Boss authorization checklist (paste to verdict reply)

```
V Rich Board Wiring Authorization — 2026-05-24

Slot policy verdicts (§3):
  Q3.1 Cancelled slot behavior:      [stay / pull-left]   = ___
  Q3.2 New stock mid-live:           [append / reorder]   = ___
  Q3.3 Over-allocated → warn:        [YES / NO]           = ___
  Q3.4 Per-unit slot:                [one per unit / one per booking] = ___
  Q3.5 Terminal pill visibility:     [history only / greyed in board] = ___

Interaction policy verdicts (§4):
  Q4.1 Pill click:                   [no-op / open detail / expand]   = ___
  Q4.2 Drag-drop:                    [NO / yes (req new design audit)] = ___
  Q4.3 Keyboard nav:                 [no / yes]           = ___
  Q4.4 Empty slot click:             [no-op / Manual Create pre-fill] = ___
  Q4.5 Terminal pill clickable:      [no / yes]           = ___

Authorization gates:
  Authorize env var creation:        [YES / NO]           = ___
  Authorize WIRE-1 feature flag PR:  [YES / NO]           = ___
  UI smoke v5 A-L complete:          [YES / NO]           = ___
  Begin Gate 2 mapper helper PR:     [YES / NO]           = ___
  Stage 2 Manual Create wiring:      [defer / authorize after Stage 1 stable] = ___
  Drag/drop scope:                   [INDEFINITELY HELD]  = ___ (must = HELD)
  Outbound from board:               [INDEFINITELY HELD]  = ___ (must = HELD)
```

---

## 7. Cross-references

- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (companion: what shipped + what remains)
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` (Tier 3.10-A parent audit)
- `docs/superpowers/2026-05-24-sale-workspace-state-map.md` (state map for refetch wiring point)
- `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` Section N (V Rich smoke reserved)
- PR #88 — V Rich board skeleton (components shipped, not wired)
- PR #63 — Tier 3.10-A board audit (parent design)
- `src/components/sale/board/` (4 components, 420 LOC)
- `src/lib/sale/board-helpers.ts` (199 LOC)
- `src/lib/sale/board-display.ts` (181 LOC)
- `tests/unit/lib/sale/board-*.test.ts` (92 tests)

---

## 8. Status

| Item | Status |
|---|---|
| Helpers + components on master | ✅ verified |
| 92 pure helper tests | ✅ green |
| Boss layout approval | ⏸ pending UI smoke v5 |
| Slot behavior verdicts (§3) | ⏸ pending |
| Interaction surface verdicts (§4) | ⏸ pending |
| Env var Vercel | ❌ not created |
| Feature flag scaffold (3.10-B-WIRE-1) | ❌ not started |
| Data mapper (3.10-B-WIRE-2) | ❌ not started |
| Refetch token integration (3.10-B-WIRE-3) | ❌ not started |
| Stage 2 Manual Create wiring | ❌ blocked until Stage 1 stable |
| Drag/drop | ❌ HARD-HELD |
| Outbound from board | ❌ HARD-HELD |

No production UI wiring. No drag/drop. No outbound. No new component code. R2 — docs only. pak-ta-kra untouched.
