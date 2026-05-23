# Tier 3.10-A — V Rich Board Design Audit

**Filed:** 2026-05-23 (overnight Track 5)
**Author:** Claude Sonnet 4.6 (autonomous overnight block)
**Master baseline:** `a1aef83` (post PR #59 merge)
**Status:** Design audit only. No runtime change. Boss + ChatGPT verdict
gates PR-1 (compact pills) and downstream steps.

This doc is the **focused audit + tight PR split** Boss asked for after
the broader Tier 3.10 backlog (`2026-05-21-tier-3-10-live-sale-board-layout-overhaul-backlog.md`).
That backlog enumerates the full vision and the 12 open design
questions; this audit picks defaults + locks the PR sequence.

---

## 1. What Tier 3.10-A produces

| Output | Status |
|---|---|
| Locked answers to the 12 open design questions in §5 of the May-21 backlog | this doc §3 |
| Tight PR split Boss requested (`3.10-B / -C / -D / -E`) | this doc §4 |
| Files-to-touch inventory per PR | this doc §5 |
| Hard no-go list per PR | this doc §6 |
| Test plan per PR | this doc §7 |
| Boss/ChatGPT verdict gates per PR | this doc §8 |

This doc does NOT:
- Implement pills or drawer
- Touch any runtime code
- Add socket events
- Touch outbound messaging
- Change schema

---

## 2. Recap — Boss's intent (paraphrased from backlog §1)

Replace the current 3-col Product Code tile grid with a V Rich-style
flow:

1. **Pills** row across the top — `BD3 BD4 BD5 … +` — compact, color-coded
2. **Expand drawer** below pills when a pill is clicked — shows
   `displayCode productName price (stockQty)` header + numbered slot
   list
3. **Slots fill from any channel** — manual entry today, Live comments
   + Inbox + Telegram + WhatsApp later (Tier 4.x)
4. **Real-time stock counter** — `(13)` shrinks as slots fill
5. **Outbound confirmation** on slot fill (deferred and feature-flagged)
6. **X cancel** on slot row

Selected Sale Date stays primary context (Tier 3.9 anchor); pills query
by `?saleDate=YYYY-MM-DD`.

---

## 3. Locked answers to the 12 design questions

| # | Question | Locked answer | Rationale |
|---|---|---|---|
| 1 | Pill row pagination | Flat wrap; CSS `flex-wrap` with `max-height` clamp + scroll | Boss demos show 30-40 pills/row. Pagination adds clicks. Virtual scroll deferred until >300 pills. |
| 2 | Expand UX | Accordion — one drawer at a time, smooth slide-down | Multi-expand fights small-screen usability. Modal hides pills. |
| 3 | Slot rows = Booking rows? | Slot = UI projection of `Booking` row (filtered by `(broadcastProductId, saleDate)`). New `Slot` table NOT added. | Avoids schema mutation. Reuses Tier 3.9 saleDate index. |
| 4 | Drag-and-drop library | `@dnd-kit/core` (modern, accessible, modular) — defer to PR 3.10-E | Most maintained. Existing project has no dnd dep yet — opt-in only when needed. |
| 5 | Real-time strategy | Existing `useNotificationStream` SSE first; socket.io for slot deltas later if needed | SSE simpler, no extra socket lane. Already used for notifications. |
| 6 | Outbound message policy | **Inbound + manual only Tier 3.10. Outbound deferred to Tier 4.5**, feature-flagged per channel | Boss's "no outbound" gate stays. Tier 3.10 is layout + manual slot fill + read-only multi-channel. |
| 7 | Channel union endpoint shape | Single `GET /api/sale/inbox?saleDate=...&channels=...` returning union; per-channel adapters under the hood | Single endpoint = single client query lane. Adapters keep each channel testable. |
| 8 | Future chat aggregator abstraction | `ChannelAdapter` interface: `listMessages(filter) → UnifiedMessage[]` + `sendMessage(...)` (Tier 4.5+) | Adapter per channel; UI never touches channel-specific shape. |
| 9 | Mobile layout | Pill row scrolls horizontally; drawer takes full width below | One-handed cashier flow. No vertical scroll-jacking inside drawer. |
| 10 | Old `/sale` deprecation | Feature flag `NEXT_PUBLIC_SALE_LAYOUT_V2=false` default; flip to `true` after Boss UI smoke; old layout removed after 1 stable week | Reversible R1. |
| 11 | Multi-variant products | Tier 3.10 covers 1-variant-per-product (current schema reality). Pill = `BroadcastProduct`. Multi-variant deferred. | Current Tier 3.8 quick-create + AddFromStock both bind 1 BP to 1 variant. |
| 12 | Performance at scale | Drawer renders ≤1 BP at a time (accordion). Pill row virtualized only if >300 pills. Slot list capped at displayed `stockQty` rows. | Real budget = 1 drawer × 50 slots = 50 DOM nodes max. |

---

## 4. PR split (Boss-requested format)

| PR | Scope | LOC est | Risk | Depends on |
|---|---|---|---|---|
| **3.10-A** (this) | Design audit + locked answers + PR split | 0 (docs) | R2 | — |
| **3.10-B** | Compact pill chip component + replace existing tile grid (read-only; click is no-op) | ~350 | R1 | Boss verdict on §3 |
| **3.10-C** | Read-only slot board: accordion drawer + numbered empty slots populated by existing Booking rows for `(saleDate, BP)` | ~500 | R1 | 3.10-B merged |
| **3.10-D** | Manual slot fill (reuse `ManualCreateBookingDialog`) + X cancel slot (reuse `bookingRepository.cancel`) | ~400 | R1 | 3.10-C merged |
| **3.10-E** | Drag/drop from receive-only inbox stream (Facebook Live comments + Page inbox); slot accepts `Booking.source` per drop origin | ~700 | R1 | 3.10-D merged AND Tier 4.1 receive-only landed AND `@dnd-kit/core` added |

### Why this split

- **3.10-B = visual only.** Replace `SaleProductGridPlaceholder` with `SaleProductPillRow`. No interaction yet. Boss can verify pills look right before any state plumbing.
- **3.10-C = layout only.** Accordion drawer renders the same `state.products[*]` data already returned by `GET /api/sale/broadcast-products`. Booking rows for `(saleDate, BP)` already returned by `GET /api/sale/bookings?saleDate=...`. No new API.
- **3.10-D = manual write paths only.** Both `bookingRepository.createManual` and `bookingRepository.cancel` already exist + tested. UI changes wire them differently; semantics unchanged.
- **3.10-E = real-time + multi-channel.** Largest PR. Gated behind Tier 4.1 webhook delivery; until then there is nothing to drag.

### What is intentionally NOT in 3.10-* scope

- ❌ Outbound messaging (Tier 4.5)
- ❌ Auto-confirm / auto-order (PR #54 design — separate verdict)
- ❌ Telegram / WhatsApp runtime (Tier 4.3 / 4.4)
- ❌ Schema changes
- ❌ New auth boundary
- ❌ Payment / shipping touch
- ❌ pak-ta-kra anything

---

## 5. Files-to-touch inventory

### 3.10-B (pill row)

| Path | Action |
|---|---|
| `src/components/sale/SaleProductPillRow.tsx` | NEW — pill row + color states |
| `src/components/sale/SaleProductGridPlaceholder.tsx` | MOD — render pill row when `NEXT_PUBLIC_SALE_LAYOUT_V2` truthy; keep grid for fallback |
| `src/components/sale/SaleWorkspaceShell.tsx` | MOD — branch on layout flag |
| `tests/unit/components/sale/SaleProductPillRow.helpers.test.ts` | NEW — pure pill state helpers (qty → color, sort order, page badge) |
| `src/lib/feature-flags.ts` | MOD — add `SALE_LAYOUT_V2` flag accessor |

### 3.10-C (slot drawer)

| Path | Action |
|---|---|
| `src/components/sale/SaleProductSlotDrawer.tsx` | NEW — accordion drawer + slot list |
| `src/components/sale/slot-drawer.helpers.ts` | NEW — pure `buildSlots(bp, bookings, stockQty)` helper |
| `tests/unit/components/sale/slot-drawer.helpers.test.ts` | NEW — slot fill rules |
| `src/components/sale/SaleProductPillRow.tsx` | MOD — click pill → open drawer (single-open accordion) |

### 3.10-D (manual fill + X cancel)

| Path | Action |
|---|---|
| `src/components/sale/SaleProductSlotDrawer.tsx` | MOD — slot row clickable when empty (opens Manual Create dialog) |
| `src/components/sale/SaleProductSlotRow.tsx` | NEW — single slot row component (X button, status badge) |
| `tests/unit/components/sale/slot-row.helpers.test.ts` | NEW — slot transition rules |

### 3.10-E (drag-drop + multi-channel)

| Path | Action |
|---|---|
| `src/components/sale/SaleInboxPanel.tsx` | MOD — drag handles per message |
| `src/components/sale/SaleProductSlotRow.tsx` | MOD — drop target |
| `src/server/channels/types.ts` | NEW — `ChannelAdapter` interface |
| `src/server/channels/facebook-live.adapter.ts` | NEW — Tier 4.2 read adapter |
| `src/server/channels/facebook-inbox.adapter.ts` | NEW — Tier 4.1 read adapter |
| `src/app/api/sale/inbox/route.ts` | NEW — union endpoint |
| `package.json` | MOD — add `@dnd-kit/core` |

---

## 6. Hard no-go per PR

All four PRs:

- ❌ No production mutation by Claude
- ❌ No env / flag change (Boss enables `SALE_LAYOUT_V2` after smoke)
- ❌ No outbound message implementation
- ❌ No payment / shipping touch
- ❌ No schema change / migration
- ❌ No Phase 1.5 runtime (`auto-confirm`, `auto-order-append`, `multi-code` — see PR #54 design)
- ❌ No Facebook runtime started in 3.10-B / -C / -D (only -E touches inbox routes, and stays read-only until Tier 4.5)
- ❌ pak-ta-kra untouched

---

## 7. Test plan per PR

### 3.10-B

- Unit: pill color state (in-stock / sold-out / low-stock / selected), sort order (numeric suffix natural-sort), page badge
- Visual: side-by-side screenshot (old grid vs new pill row) — manual
- Smoke unauth: 16/16 unchanged (no auth change)

### 3.10-C

- Unit: `buildSlots(bp, bookings, stockQty)` invariants:
  - returns array of length `stockQty`
  - empty slots are last
  - filled slots respect Booking creation order
  - `convertedToOrder` bookings excluded (handled in PR #52)
- Visual: drawer expand smooth; single-open accordion; no layout jank
- Smoke unauth: 16/16 unchanged

### 3.10-D

- Unit: slot row click → opens dialog with prefilled `broadcastProductId`
- Unit: X click → cancel call with reason
- Route reuse: `bookingRepository.cancel` already tested 30+ scenarios; no new route tests
- Visual: slot fills immediately on success; cancel removes row

### 3.10-E

- Unit: `ChannelAdapter` mock + adapter tests
- Route: `GET /api/sale/inbox?saleDate=...&channels=...` auth + RBAC + channel filter + dedup by platform message ID
- Component: drag-drop interaction with `@dnd-kit/core` test harness
- Smoke unauth: add `GET /api/sale/inbox` 401 unauth case

---

## 8. Verdict gates

| Gate | Required from Boss | Required from ChatGPT |
|---|---|---|
| Open PR 3.10-B | "Pills approved per §3-§4" | Independent review on §3 answers |
| Open PR 3.10-C | "Drawer accordion approved" | Independent review on `buildSlots` invariants |
| Open PR 3.10-D | "Manual slot fill approved" | Independent review on reuse vs new code |
| Open PR 3.10-E | "Tier 4.1 receive-only ready; outbound stays gated" | Independent review on `ChannelAdapter` boundary |
| Flip `SALE_LAYOUT_V2=true` on Vercel | Boss UI smoke after 3.10-D merged | — |
| Remove old grid code | 1 stable week + Boss explicit OK | — |

Each gate is an explicit Boss decision. Claude does NOT auto-open the next PR after the previous lands.

---

## 9. Cross-references

- `docs/superpowers/2026-05-21-tier-3-10-live-sale-board-layout-overhaul-backlog.md` — full vision + 12 open questions
- `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md` — V Rich UX comparison
- `docs/CODEMAP/13-unified-commerce-inbox.md` — multi-channel inbox model
- `docs/superpowers/2026-05-22-sale-auto-confirm-auto-order-design.md` (PR #54) — Phase 1.5 design; outbound stays gated
- `docs/superpowers/2026-05-22-facebook-receive-only-readiness-audit.md` (PR #57) — Tier 4.1 prep
- `docs/superpowers/2026-05-23-sale-operations-summary-design.md` (Track 3) — separate read-only summary

---

## 10. Open follow-ups (not blockers)

- A1 — Color tokens for pill states (designer call vs reuse Tailwind palette)
- A2 — Pill width metric: should `CM10` fit same width as `CM1`? Tabular-numeric font feature?
- A3 — Drawer animation library: native CSS transition vs Framer Motion?
- A4 — `useNotificationStream` reuse vs new dedicated `useSaleSlotStream` — measure first
- A5 — Storefront / non-sale orders inside slot view — out of scope or future expand?

These can land alongside 3.10-B without gating the PR.

---

## 11. Decision

This doc lands as `docs(sale): design V Rich-style sale board (Tier 3.10-A)`.
Zero runtime change. Boss + ChatGPT verdict on §3 unlocks PR 3.10-B.
