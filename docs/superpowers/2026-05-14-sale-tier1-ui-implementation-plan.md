# Tier 1 — `/sale` UI / IA consolidation plan

**Filed:** 2026-05-14
**Status:** Planning only. Do NOT implement in same PR as PR2 schema work.
**Branch model:** new feature branch `feat/sale-tier1-ui-omnichannel` from current master.

---

## 1. Problem statement

The `/sale` admin workspace was built when "booking" implied "live commerce comment booking" only. Schema migration PR 2 (`20260514000000_sale_omnichannel_booking`) removed that constraint at the data layer: bookings can now have `liveSessionId IS NULL` and originate from MANUAL / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT sources.

The UI does not yet reflect this. Current `/sale` workspace:

- `SaleWorkspaceShell` auto-selects ONE live session and hides everything else.
- `SaleProductGridPlaceholder` only renders BroadcastProducts for the selected session.
- `SaleBookingQueuePlaceholder` only renders bookings for the selected session.
- `ManualCreateBookingDialog` only accepts products from the selected session.
- "No live session selected" state is a dead-end placeholder.

Omnichannel bookings therefore have no admin surface. Tier 1 fixes the IA so non-live bookings have a place to live.

## 2. Scope (Tier 1 only)

In scope:

- New tab/chip layout that surfaces all booking sources, not just live-bound.
- Source chips on booking rows.
- Manual Create entry point that is always reachable, not gated by live session selection.
- Removal of "no live session → empty workspace" dead state.
- Thai admin labels (Boss approved D-1..D-10 in earlier session).
- Compatibility with feature flags: source chips render even when `ALLOW_NON_LIVE_BOOKING=false` (defensive — non-live bookings created via inbound runtimes future-PR will already appear).

Out of scope:

- Add from Stock (Tier 3 — separate plan).
- Evergreen BroadcastProduct create UI (Tier 3).
- `/live-selling` 308 redirect (deferred per Boss).
- Customer-facing messages (Boss explicit no-go).
- Messenger / WhatsApp / Telegram inbound runtime (Tier 4).
- Parser / comment-to-booking (Tier 5).
- pak-ta-kra.

## 3. UX direction

### 3.1 Source chips on booking rows

Each row in `SaleBookingQueuePlaceholder` gets a small chip indicating origin:

| `Booking.source` | Thai label | Color hint |
|---|---|---|
| `MANUAL` | สร้างเอง | gray |
| `LIVE_COMMENT` | คอมเมนต์ไลฟ์ | red |
| `PAGE_INBOX` | กล่องข้อความเพจ | blue |
| `POST_COMMENT` | คอมเมนต์โพสต์ | indigo |
| `WHATSAPP_CHAT` | WhatsApp | green |
| `TELEGRAM_CHAT` | Telegram | sky |
| `IMPORT` | นำเข้า | amber |
| `SYSTEM` | ระบบ | slate |

Chip text + tooltip on hover. No translation table — pure string map in component-local constant.

### 3.2 Top-level tab layout

Replace current "session-locked workspace" with two top tabs:

- **คิวการจอง** (Booking Queue) — full shop-wide booking list with source chips. Filterable by source + status + live session. Default filter = no filter (show all sources).
- **ตามไลฟ์** (Per-Session View) — current behavior preserved for live-commerce admins. Session picker → product grid + booking queue scoped to that session.

This preserves the existing flow for live commerce while exposing omnichannel.

### 3.3 Manual Create entry point

Currently buried inside `SaleBookingQueuePlaceholder` empty state. Move to top-level:

- Top-right header button: "+ สร้างการจองด้วยตนเอง" (Manual Create).
- Always visible regardless of selected session.
- Dialog adapts to flag state:
  - `ALLOW_NON_LIVE_BOOKING=false` → dialog requires live session selection at step 1 (legacy behavior).
  - `ALLOW_NON_LIVE_BOOKING=true` → dialog offers "Live session" radio (current) + "Stock product (no session)" radio. Latter requires `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` to enable.
- Out of scope for Tier 1: the "Stock product" picker UI itself (Tier 3 Add from Stock).
  - Tier 1 renders the radio but disables "Stock product" with helper text "ต้องเปิดใช้งานคลังสินค้าออนไลน์ก่อน" if evergreen flag is off.

### 3.4 No-session dead state removed

Replace the current "no live session selected → empty workspace" state with the booking queue tab as default landing. Live session picker becomes the secondary tab. Admin lands on a useful surface every time.

## 4. Route + data changes

### 4.1 `GET /api/sale/bookings` — relax `liveSessionId` requirement

Current behavior: `liveSessionId` REQUIRED in query (`saleBookingsQuerySchema` at `src/lib/validation/sale.schemas.ts:91-103`).

Tier 1 change: make `liveSessionId` optional. When absent, return shop-wide bookings ordered by createdAt DESC + paginated. When present, behavior unchanged.

This is the GET cross-source filter relaxation deferred from PR 2.

Defensive: cap default limit at 50 (already in schema). Add explicit max page or cursor if shop accumulates large booking volume in future.

### 4.2 No new POST routes

Tier 1 is read-only IA + display. No new mutation routes. POST `/api/sale/bookings` already supports the omnichannel shape per PR 2.

### 4.3 No schema change

PR 2 migration already added `@@index([shopId, source, status])` for the relaxed GET filter. Tier 1 uses that index.

## 5. Component changes

| Component | Change |
|---|---|
| `SaleWorkspaceShell` | Refactor to render `<BookingQueueTab>` + `<PerSessionTab>`. Move session fetch logic out of the shell. |
| `SaleBookingQueuePlaceholder` | Add `source` field rendering with chip. Strip "no session" empty state. |
| `SaleProductGridPlaceholder` | Untouched in Tier 1 (lives inside Per-Session tab). |
| `ManualCreateBookingDialog` | Add "Live session vs. Stock product" radio. Disable "Stock product" branch when `ALLOW_EVERGREEN_BROADCAST_PRODUCT=false`. Branch UI shells out to Tier 3 picker (placeholder for now). |
| `SaleSessionPickerPlaceholder` | Move into Per-Session tab; remove auto-select-on-mount side effect from shell. |
| New: `BookingQueueTab.tsx` | Top-level tab. Fetches `GET /api/sale/bookings` without `liveSessionId`. Renders unified queue with source chips. |
| New: `PerSessionTab.tsx` | Wraps existing session picker + product grid + booking queue. Preserves legacy behavior. |
| New: `BookingSourceChip.tsx` | Small chip component with source-color map + Thai label map. |

## 6. Feature flag visibility

Tier 1 does NOT flip any flag. It renders UI that respects the current flag state:

- `ALLOW_NON_LIVE_BOOKING=false` → BookingQueueTab still works (read-only show-all); Manual Create dialog has "Stock product" radio disabled.
- `ALLOW_NON_LIVE_BOOKING=true` (current D4 state) → same as above (because evergreen flag still off).
- `ALLOW_EVERGREEN_BROADCAST_PRODUCT=true` (future D6) → Manual Create "Stock product" radio enabled, picker rendered from Tier 3 plan.

Tier 1 must ship BEFORE Tier 3 (Add from Stock) so the IA is in place when evergreen BPs become creatable.

## 7. Test plan

| Layer | Test |
|---|---|
| Unit | `BookingSourceChip` renders all 8 source labels correctly |
| Unit | `BookingQueueTab` handles loading / error / empty / populated states |
| Unit | `PerSessionTab` preserves legacy session-locked flow |
| Unit | `ManualCreateBookingDialog` radio enables/disables based on flag prop |
| Integration | `GET /api/sale/bookings` without `liveSessionId` returns shop-scoped list |
| Integration | `GET /api/sale/bookings` with `liveSessionId` still filters (legacy callers) |
| Integration | Cross-shop attempt returns empty list, not 500 |
| E2E (Playwright) | Admin lands on `/sale` → BookingQueueTab shown by default → can switch to PerSessionTab → can click Manual Create from header |

Min vitest target: still 821+ pass + new tests (~+30 net).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Existing live commerce flow regressed | PerSessionTab preserves it verbatim; smoke covers both tabs |
| GET shop-wide returns too many rows | Default limit 50 + future pagination |
| Source chips leak internal taxonomy to non-admin | UI is auth-gated to OWNER/MANAGER/CHAT_SUPPORT (matches current /sale rule) |
| Manual Create "Stock product" radio confuses admin when disabled | Helper text + tooltip explains "available after Add from Stock ships" |
| Translation strings drift | Single component-local map; no i18n provider needed for Tier 1 |

## 9. Branching

- Branch: `feat/sale-tier1-ui-omnichannel` from `origin/master`.
- Single PR.
- No schema change.
- No flag flip.
- Boss + ChatGPT review per Boss-style PR template.
- Ship after PR 2 + before Tier 3.

## 10. Cross-references

- PR 2 handoff: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md`
- D6 plan: `docs/superpowers/2026-05-14-sale-evergreen-product-code-d6-plan.md`
- Add from Stock plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- Existing routes: `src/app/api/sale/bookings/route.ts`, `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts`
- Existing UI: `src/components/sale/SaleWorkspaceShell.tsx`, `ManualCreateBookingDialog.tsx`, `SaleBookingQueuePlaceholder.tsx`
