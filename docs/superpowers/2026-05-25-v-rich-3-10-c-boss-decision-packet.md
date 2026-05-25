# V Rich Stage 3.10-C — Boss Decision Packet

**Filed:** 2026-05-25 (post #150 audit merge)
**For:** Boss
**Goal:** answer 17 questions + 1 env decision in <15 min → unlocks 5 wire PRs

Companion to (skim only):
- `docs/superpowers/2026-05-25-v-rich-stage-3-10-c-readiness-audit.md` (full audit, 346 lines — Boss does NOT need to read)
- `docs/superpowers/2026-05-24-v-rich-board-wiring-readiness-checklist.md` (gate checklist)

This packet is the **fast-decide** version. Boss reads + answers, Claude proceeds.

---

## How to use this packet

1. Read §A (10 UX questions) — pick one option per row, or accept default
2. Read §B (7 format questions) — pick or accept default
3. Read §C (env decision) — YES / NO / DEFER
4. Skim §D (wire sequence) — confirm scope is right
5. Pick §E (recommendation) — Option A / B / C / D

After Boss verdicts → Claude opens `3.10-C-WIRE-1` flag scaffold PR (only if §C = YES).

---

## §A. UX questions (10 items) — slot policy + interaction

### Q3.1 — Cancelled booking, what happens to its slot?

| Field | Detail |
|---|---|
| Question | Customer cancels CONFIRMED booking. Slot becomes empty. Does empty slot **stay in its original position** OR **pull-left so remaining filled slots shift together**? |
| Why matters | Boss visually scans board. Pull-left = compact view, slot indices change over time. Stay = stable indices, easier to point at "slot 3" verbally. |
| Recommended default | **stays empty** (no pull-left) — stable indices, matches existing skeleton |
| Risk if wrong | Pull-left = confusing if Boss says "ส่งให้คนที่ slot 3" + slot 3 changes meaning when slot 1 cancels |
| Blocks WIRE-1? | NO — defer (mapper supports either; UI decides on render) |

### Q3.2 — Admin adds more stock mid-live, where do new slots appear?

| Field | Detail |
|---|---|
| Question | BP has 5 stock. Admin edits → 8 stock. 3 new slots created. Do they **append at end** OR **reorder by displayCode**? |
| Why matters | Append = predictable; reorder = always sorted but new slots can appear in middle, confusing live admin. |
| Recommended default | **append at end** |
| Risk if wrong | Reorder = admin loses track of "the new ones" during live |
| Blocks WIRE-1? | NO — defer |

### Q3.3 — Over-allocation warning visible?

| Field | Detail |
|---|---|
| Question | Bookings > stock (legitimate when admin lowers stock mid-live). Show **integrity_warn badge** YES/NO? |
| Why matters | Without badge, Boss can't see when reality doesn't match stock count. With badge, Boss sees + fixes. |
| Recommended default | **YES** show warning badge |
| Risk if wrong | NO = silent data integrity loss; admin doesn't realize over-allocated |
| Blocks WIRE-1? | NO — defer to WIRE-3 (board renders badge) |

### Q3.4 — Multi-quantity booking: one slot or N slots?

| Field | Detail |
|---|---|
| Question | Customer books quantity 3. Show **1 slot labeled "Alice x3"** OR **3 slots all labeled "Alice"**? |
| Why matters | Per-unit = pack 1 box = move 1 slot at a time (matches physical workflow). Per-booking = compact but loses pack-count visibility. |
| Recommended default | **per-unit (3 slots)** |
| Risk if wrong | Per-booking + qty=10 = admin loses count of how many actual items packed |
| Blocks WIRE-1? | NO — defer (mapper supports either; UI/mapper-config decides) |

### Q3.5 — Terminal pill (cancelled / expired / converted) visible on active board?

| Field | Detail |
|---|---|
| Question | Booking already cancelled/expired/converted. Show as **history-only (hidden from active board)** OR **greyed pill in active board**? |
| Why matters | History-only = clean active view. Greyed = admin sees full timeline at a glance. |
| Recommended default | **history-only** (matches current `buildSlots` behavior + skeleton) |
| Risk if wrong | Greyed = clutters live workflow; admin can't tell at-a-glance what is active |
| Blocks WIRE-1? | NO — defer (mapper already filters; UI decides) |

### Q4.1 — Pill click does what?

| Field | Detail |
|---|---|
| Question | Admin clicks pill. **No-op (just visual feedback)** OR **opens drawer below with slot list** OR **opens booking detail dialog**? |
| Why matters | Open drawer = V Rich reference behavior. No-op = safer placeholder. Detail dialog = jumps user out of board flow. |
| Recommended default | **open drawer** (existing skeleton default) |
| Risk if wrong | Detail dialog = breaks flow when Boss wants quick scan of multiple BPs |
| Blocks WIRE-1? | **YES** — gates `SaleBoardReadOnly` render contract |

### Q4.2 — Drag/drop in Stage 3.10-C scope?

| Field | Detail |
|---|---|
| Question | Drag slots between BPs to re-assign bookings. YES include in 3.10-C OR NO defer? |
| Why matters | Drag-drop = needs race-safety + concurrency review + UX design. Big scope. |
| Recommended default | **NO** (HELD — separate design audit required) |
| Risk if wrong | YES = blows 3.10-C scope from 4 PRs to 8+ PRs |
| Blocks WIRE-1? | NO — but locking NO means 3.10-C ships smaller |

### Q4.3 — Keyboard nav across pills?

| Field | Detail |
|---|---|
| Question | Arrow keys move focus across pills/slots? YES / NO? |
| Why matters | Accessibility win. Optional for live workflow. |
| Recommended default | **NO** for 3.10-C (defer to accessibility pass later) |
| Risk if wrong | NO = inaccessible to keyboard-only users; not a regression vs today |
| Blocks WIRE-1? | NO — defer |

### Q4.4 — Empty slot click does what?

| Field | Detail |
|---|---|
| Question | Admin clicks empty slot. **No-op** OR **opens Manual Create dialog pre-filled with BP**? |
| Why matters | Pre-fill = fast manual booking creation = Stage 3.10-D scope. No-op = read-only safer for 3.10-C. |
| Recommended default | **no-op for 3.10-C** (Manual Create → 3.10-D after 3.10-C stable) |
| Risk if wrong | Pre-fill in 3.10-C = blurs read-only contract; admin may accidentally book |
| Blocks WIRE-1? | NO — defer (3.10-D blocked anyway) |

### Q4.5 — Terminal pill clickable for history detail?

| Field | Detail |
|---|---|
| Question | Cancelled / expired / converted booking — clickable to see history detail? YES / NO? |
| Why matters | History view = Boss can audit "why cancelled". No = clean board, audit lives in /orders. |
| Recommended default | **NO** for 3.10-C (terminal hidden per Q3.5 default) |
| Risk if wrong | NO = no inline audit; Boss jumps to /orders for context |
| Blocks WIRE-1? | NO — defer (conditional on Q3.5) |

---

## §B. Format questions (7 items) — UX shape

### QF.1 — Pill density: row layout?

| Field | Detail |
|---|---|
| Question | Pills: **1 row max, scroll horizontally if overflow** OR **wrap to multiple rows unlimited**? |
| Recommended default | **wrap unlimited** (existing skeleton flex-wrap behavior) |
| Changeable later without data risk? | **YES** — pure CSS |

### QF.2 — Slot label inside pill: compact or fraction?

| Field | Detail |
|---|---|
| Question | Pill badge: **(5)** compact (just available) OR **(5/13)** fraction (available + total)? |
| Recommended default | **(5/13) fraction** (matches mapper `headerLabel` + mapper output `stockBadge`) |
| Changeable later without data risk? | **YES** — pure render choice |

### QF.3 — Empty-state + warning text language?

| Field | Detail |
|---|---|
| Question | Display language: **Thai only** / **Thai + English** / **Boss preference**? |
| Recommended default | **Thai primary** (matches existing `/sale` workspace; English fallback only when no Thai gloss exists) |
| Changeable later without data risk? | **YES** — text strings |

### QF.4 — Board layout vs legacy Product Codes panel?

| Field | Detail |
|---|---|
| Question | **ALONGSIDE** legacy panel (both visible behind flag) OR **REPLACE** legacy panel? |
| Recommended default | **ALONGSIDE for 3.10-C** (let Boss validate before replacing); replace later as separate PR |
| Changeable later without data risk? | **YES** — conditional render |

### QF.5 — Mobile breakpoint behavior?

| Field | Detail |
|---|---|
| Question | Mobile screen: **collapse to vertical pill list** OR **hide board entirely**? |
| Recommended default | **collapse to vertical** (existing flex-wrap already mobile-friendly) |
| Changeable later without data risk? | **YES** — pure CSS |

### QF.6 — Long product names (Chinese/Malay/Thai) in pill?

| Field | Detail |
|---|---|
| Question | Long product name: **truncate at 20 chars with tooltip** OR **allow wrap (taller pill)** OR **hide name (code-only pill)**? |
| Recommended default | **truncate at 20 chars with tooltip** |
| Changeable later without data risk? | **YES** — pure render |

### QF.7 — Drawer position when pill expanded?

| Field | Detail |
|---|---|
| Question | Slot drawer: **inline below pill row** OR **side panel** OR **modal overlay**? |
| Recommended default | **inline below pill row** (existing skeleton default; least visual jump) |
| Changeable later without data risk? | **YES** — pure layout |

---

## §C. Env decision — `NEXT_PUBLIC_SALE_LAYOUT_V2`

### Plain language

| Item | Detail |
|---|---|
| What it controls | When `'true'`, `/sale` workspace renders the new V Rich board ALONGSIDE the existing Product Codes panel. When `'false'` or unset, nothing changes — admin sees exactly the current UI. |
| Why needed | Lets us ship board code to production with **zero visual change** until Boss flips flag. Boss can flip in dev → screenshot → review → decide → flip in prod. |
| Safe default value | **`'false'`** (or unset — both behave the same) |
| Environments later | Production + Preview (same value). Boss flips both at once. |
| Local dev only enough for initial dev? | **YES** — Claude uses `.env.local` (Boss-owned, never committed) to test locally. NO Vercel change needed until Boss wants Vercel preview to show board. |
| Boss-owned Vercel steps (only if/when approved) | See §F below |
| Will Claude set env? | **NO** — Claude will not touch Vercel env. Boss does this manually. |

### Verdict needed

| Option | Effect |
|---|---|
| **YES — authorize env var creation later** | Claude proceeds to WIRE-1 PR. WIRE-1 code reads `process.env.NEXT_PUBLIC_SALE_LAYOUT_V2`. Default branch behavior = flag unset = no UI change. Boss adds to Vercel later when ready to preview. |
| **DEFER — postpone env decision** | Claude does NOT open WIRE-1. Continue docs/tests/other safe work. |
| **NO — env var name not approved** | Claude proposes alternate name OR scraps wire plan. |

---

## §D. Wire sequence (5 PRs, R1 each unless noted)

### `3.10-C-WIRE-1` — flag scaffold + util

| Field | Detail |
|---|---|
| Purpose | Add `isSaleLayoutV2Enabled()` helper reading `process.env.NEXT_PUBLIC_SALE_LAYOUT_V2 === 'true'`. NO `/sale` render change yet. |
| Files likely touched | `src/lib/sale/feature-flags.ts` (extend, ~10 lines) + `tests/unit/lib/sale/feature-flags.test.ts` (~6 cases) |
| Risk | **R2** (pure helper + tests, no UI render) |
| Production behavior change? | **NO** — helper exists but no one calls it yet |
| Boss UI review? | NO |
| Stop conditions | If env var name needs change, stop + ask Boss |

### `3.10-C-WIRE-2` — `SaleBoardReadOnly` mapper consumption

| Field | Detail |
|---|---|
| Purpose | Refactor `SaleBoardReadOnly` to accept `BoardViewModel` instead of raw `SaleBoardProduct[]`. Skeleton internals use mapper output. |
| Files likely touched | `src/components/sale/board/SaleBoardReadOnly.tsx` (~+20/-15 lines) + `tests/unit/components/sale/board/SaleBoardReadOnly.test.tsx` (~10 cases) |
| Risk | **R1** (component contract change; existing prop type swap) |
| Production behavior change? | **NO** — component still not rendered anywhere in `/sale` |
| Boss UI review? | NO (no render yet) |
| Stop conditions | If component refactor needs >50 LOC change, split into smaller PRs |

### `3.10-C-WIRE-3` — `SaleWorkspaceShell` flag-gated render

| Field | Detail |
|---|---|
| Purpose | When flag is `'true'`, shell renders `<SaleBoardReadOnly />` ALONGSIDE existing Product Codes panel. When flag is `'false'` or unset, no change. |
| Files likely touched | `src/components/sale/SaleWorkspaceShell.tsx` (~+30 lines: import, memoized mapper call, conditional render) |
| Risk | **R1** + DISSENT 4-bullet (production page render change behind flag) |
| Production behavior change? | **NO when flag unset/false** (default); YES when flag true. Vercel env still unset → no production change. |
| Boss UI review? | **YES** — Boss must screenshot dev with flag=true before merge |
| Stop conditions | If shell refactor exceeds 50 LOC OR breaks legacy panel tests, split |

### `3.10-C-WIRE-4` — integration + Playwright tests

| Field | Detail |
|---|---|
| Purpose | Lock board behavior with flag ON in test env. Pin no-render with flag OFF. |
| Files likely touched | `tests/unit/components/sale/SaleWorkspaceShell-flag-gating.test.tsx` (~8 cases) + `tests/e2e/sale-board-v2.spec.ts` (~3 snapshots) |
| Risk | **R2** (tests only, no runtime) |
| Production behavior change? | **NO** |
| Boss UI review? | Optional — Boss inspects Playwright snapshots |
| Stop conditions | If Playwright needs new fixtures that hit production DB, stop + ask Boss |

### `3.10-C-WIRE-5` — flag-on-by-default decision (FUTURE, conditional)

| Field | Detail |
|---|---|
| Purpose | After Boss validates board in production via Vercel flag-on for ≥1 week, Boss decides if flag becomes default ON OR legacy panel removed. Separate PR. |
| Files likely touched | TBD per Boss verdict (env default change OR legacy removal) |
| Risk | **R1** (env or component removal) |
| Production behavior change? | **YES** |
| Boss UI review? | **YES** |
| Stop conditions | Do not open until Boss explicit `MAKE V_RICH DEFAULT` verdict + ≥1 week prod stability |

---

## §E. Current recommendation

| Option | Description | Recommended? |
|---|---|---|
| **A** | Boss answers UX/env now → Claude opens WIRE-1 immediately | **Recommended** — packet keeps it <15 min for Boss; mapper already shipped + tested |
| B | More planning/decision doc first (e.g. UX mock screenshots Boss reviews) | If Boss wants visual preview before committing to Q4.1/QF.4 |
| C | Pause V Rich entirely + Boss does UI smoke workbook v5 first | Higher priority if Boss has 1-hour smoke block ready |
| D | Stay on safe tests/docs/inventory/summary work (skip V Rich entirely this block) | If Boss has zero V Rich bandwidth |

**Claude's recommendation: Option A.** Reasons:
1. Boss can answer all 17 questions in <15 min using packet defaults
2. WIRE-1 is R2 helper-only — zero production change
3. Boss can defer Vercel env until ready to preview (local `.env.local` works for dev)
4. Mapper already shipped + 1951/1951 vitest green — no upstream risk

If Boss has zero V Rich bandwidth → Option D is safe fallback. Other allowed safe work in last handoff §11.

---

## §F. Boss-only action guide — Vercel env (only if/when approved)

**ONLY DO THIS WHEN BOSS DECIDES TO PREVIEW BOARD IN VERCEL.** WIRE-1/2/3 do NOT require env var yet — code defaults to `false` when env unset.

### Steps Boss does in browser

1. Open https://vercel.com/dashboard
2. Click `liveshop-pro` project
3. Click **Settings** tab
4. Click **Environment Variables** in left sidebar
5. Click **Add New**
6. Fill in:
   - **Key:** `NEXT_PUBLIC_SALE_LAYOUT_V2`
   - **Value:** `false` (initially — flip to `true` later when ready to preview)
   - **Environments:** check both **Production** + **Preview** (uncheck Development if you prefer to drive dev via `.env.local`)
7. Click **Save**
8. Trigger redeploy: go to **Deployments** → click latest → **Redeploy** (so env propagates)
9. Wait for deploy **Ready** state
10. To preview board: edit env value → `true` → redeploy. To hide: flip back to `false`.

### Hard rules (Boss)

- **NEVER paste the value into chat / email / commit** (it's a public env var so leak isn't catastrophic, but maintain hygiene habit)
- **NEVER set value to anything except `true` or `false`** (any other string = treated as false; safe)
- **NEVER add the variable to Development env unless you want dev server to also show board** (Claude uses local `.env.local`)

### Verify after deploy

```
# Hit production, screenshot to verify (Boss-side action)
curl -I https://nazhahatyai.com/sale
# Look for Vercel deploy ID changing after env flip
```

If board doesn't appear:
- Confirm env value is exactly `true` (lowercase, no quotes)
- Confirm redeploy completed (Deployments tab → green check)
- Confirm browser cache cleared / hard reload

### Hard no-go (Boss + Claude)

- Claude will NOT set this env var
- Claude will NOT ask Boss for the value
- Claude will NOT verify the deploy state via authenticated production POST
- Production unauth smoke (`npm run smoke:prod:unauth`) is the only allowed post-deploy verification

---

## §G. Verdict template (paste back to Claude)

```
V Rich 3.10-C verdict — 2026-05-25

§A UX questions:
  Q3.1 Cancelled slot:                 [stay / pull-left] = ___
  Q3.2 New stock mid-live:             [append / reorder] = ___
  Q3.3 Over-alloc badge:               [YES / NO] = ___
  Q3.4 Multi-qty slots:                [per-unit / per-booking] = ___
  Q3.5 Terminal pill visibility:       [history only / greyed] = ___
  Q4.1 Pill click:                     [no-op / open drawer / open detail] = ___
  Q4.2 Drag/drop in 3.10-C:            [NO / yes] = ___
  Q4.3 Keyboard nav:                   [NO / yes] = ___
  Q4.4 Empty slot click:               [no-op / Manual Create pre-fill] = ___
  Q4.5 Terminal pill clickable:        [NO / yes] = ___

§B format questions:
  QF.1 Pill density:                   [wrap / 1 row scroll] = ___
  QF.2 Slot label:                     [(5/13) fraction / (5) compact] = ___
  QF.3 Language:                       [Thai primary / Thai+English / other] = ___
  QF.4 Layout:                         [alongside / replace] = ___
  QF.5 Mobile:                         [vertical / hide] = ___
  QF.6 Long product name:              [truncate 20 / wrap / hide] = ___
  QF.7 Drawer position:                [inline / side / modal] = ___

§C env decision:
  Authorize NEXT_PUBLIC_SALE_LAYOUT_V2 later: [YES / DEFER / NO] = ___

§E recommendation:
  Pick path:                           [A / B / C / D] = ___

Open WIRE-1 PR now?                    [YES / NO] = ___
```

---

## §H. Status

| Item | Status |
|---|---|
| #149 mapper merged | ✅ (e092e0b) |
| #150 audit merged | ✅ (8815c63) |
| This packet (#151 future) | this PR |
| Stage 3.10-C WIRE-1 | ⏸ blocked — Boss verdict on §A.Q4.1 + §C |
| Stage 3.10-D Manual Create | ❌ HELD — depends on 3.10-C stable + Q4.4 verdict |
| Drag/drop | ❌ HARD-HELD (Q4.2 default = NO) |
| Outbound from board | ❌ HARD-HELD (global no-go) |
| UI smoke workbook v5 | ❌ Boss-owned, still owed |
| pak-ta-kra | ✅ untouched |
| Hard no-go violations | **0** |

R2 — docs only. pak-ta-kra untouched. No production change. No env mutation. No code touched.
