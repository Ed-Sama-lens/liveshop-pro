# Tier 1 UI/IA handoff — `/sale` omnichannel consolidation

**Filed:** 2026-05-14
**Branch:** `feat/sale-tier1-ui-omnichannel`
**Head SHA:** `5980061`
**PR:** https://github.com/Ed-Sama-lens/liveshop-pro/pull/3

---

## 1. Branch + commit

| Item | Value |
|---|---|
| Branch | `feat/sale-tier1-ui-omnichannel` |
| Base | `master` (HEAD `4f91bcb` at branch-creation time) |
| Head SHA | `5980061` |
| Commit count | 1 |
| Commit message | `feat(sale): tier1 ui omnichannel consolidation` |

## 2. Files changed

| File | Status | Lines |
|---|---|---|
| `src/components/sale/BookingSourceChip.tsx` | NEW | +126 |
| `src/components/sale/SaleSourceFilterChips.tsx` | NEW | +106 |
| `src/components/sale/SaleWorkspaceShell.tsx` | MOD | +44 / -26 |
| `src/components/sale/SaleOrderConversionPlaceholder.tsx` | MOD | +21 / -66 |
| `src/components/sale/SaleProductGridPlaceholder.tsx` | MOD | +6 / -14 |
| `src/components/sale/SaleBookingQueuePlaceholder.tsx` | MOD | +16 / -6 |
| `tests/unit/components/sale/BookingSourceChip.test.ts` | NEW | +61 |

**Total:** 7 files, +390 / -102.

## 3. UI / IA behavior changes

### 3.1 Header

| | Before | After |
|---|---|---|
| Title | `Live Sale / ขายผ่านไลฟ์` | `ขายของไลฟ์สด` |
| Subtitle | `จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์` | `จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง` |
| Live-only mental model | implied by title and subtitle | removed |

### 3.2 Test-banner removed

Prior amber Construction banner ("ระยะทดสอบ: 4 mutations พร้อมใช้...") removed. Replaced by source filter card (always visible, useful).

### 3.3 Source filter card (new)

Renders below header. Contains:
- Label `ตัวกรองตามแหล่งที่มา` + hint `ช่องทางที่ขีดทับ = เร็ว ๆ นี้ (รอ inbound runtime)`
- 7 chips: `ทั้งหมด` (default) / `ไลฟ์สด` / `Inbox` / `Post Comment` / `Manual` / `Telegram` / `WhatsApp`
- Active chips: `ทั้งหมด`, `ไลฟ์สด`, `Manual`
- Disabled chips: `Inbox`, `Post Comment`, `Telegram`, `WhatsApp` (Tier 4 dependency, line-through styling, tooltip explains)

### 3.4 Booking row source chip

Each booking row in `SaleBookingQueuePlaceholder` now renders a `BookingSourceChip` between displayCode and customerName. 8 source labels supported + fallback for unknown. Color hints per Tier 1 plan § 3.1.

### 3.5 Order Conversion panel cleanup

Demo rows removed:
- `A002 Chili Crab Sauce ×1 RM18.50 total RM18.50`
- `B002 Coconut Jelly ×3 RM8.00 total RM24.00`
- `C001 Curry Puff ×5 RM6.00 total RM30.00`
- Subtotal / Shipping / Total demo numbers

Replaced with explicit info hint card directing admins to per-row Create Order action.

### 3.6 Empty state copy

Product grid + booking queue + order conversion empty states rewritten to:
- Drop "Live Selling" coupling
- Mention multi-channel future sources
- Reference upcoming Add from Stock for non-live product creation
- Avoid implying inbound runtime exists today

## 4. What remains placeholder

| Item | State | Reason |
|---|---|---|
| Inbox panel | Coming-soon labeled (unchanged from prior) | Tier 4 inbound runtime not started |
| Order Conversion batch convert | Disabled placeholder | Per-row Create Order is the supported path |
| Source filter for `Inbox` / `Post Comment` / `Telegram` / `WhatsApp` | Disabled chips | Tier 4 inbound runtime not started — chips exist as visual signal of upcoming work |
| Manual Create button location | Still inside booking queue panel (unchanged from prior) | Moving to header is a larger restructure; Tier 1 kept this stable to limit blast radius |
| Cross-session booking queue | Client-side filter only | GET `/api/sale/bookings` still requires `liveSessionId` query param; relaxing this is a deferred follow-up (PR 2 documented intent) |

## 5. Why D4 / D6 still blocked

| Flag | State | Why still off |
|---|---|---|
| `ALLOW_BOOKINGIDS_ONLY_CONVERSION` | ON (D3) | already enabled; no change |
| `ALLOW_NON_LIVE_BOOKING` | OFF | even if ON, Manual Create dialog cannot pick an evergreen BroadcastProduct because Tier 3 Add from Stock has not landed |
| `ALLOW_EVERGREEN_BROADCAST_PRODUCT` | OFF | no route exists to create evergreen BPs; flag is dead config until Tier 3 |

Tier 1 deliberately does not flip flags. The chips render gracefully under all flag combinations: visible-but-non-functional disabled chips signal future capability without implying it exists.

## 6. Tests

| Suite | Before | After |
|---|---|---|
| `tests/unit/components/sale` | 112 / 2 files | **124 / 3 files PASS** |
| Full vitest | 821 / 41 files | **833 / 42 files PASS** |
| Targeted sale (`tests/unit/lib/sale tests/unit/app/api/sale`) | 189 / 7 | **189 / 7 PASS** (unchanged) |
| `npx tsc --noEmit` | 2 known socket errors | **tsc result unchanged; only the 2 known pre-existing socket test errors remain** |

New file: `tests/unit/components/sale/BookingSourceChip.test.ts` — 12 cases covering all 8 enum values + fallback for unknown + empty string + purity + schema-enum-sync guard.

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Header copy change breaks Playwright selector | LOW | no E2E spec currently asserts header text |
| Source filter hides bookings unexpectedly | LOW | default `ALL` preserves prior view; filter applies in memory only |
| Disabled chips create false expectation | LOW | explicit tooltip "เร็ว ๆ นี้ (รอ Tier 4 inbound runtime)" |
| Removed demo rows confuse admins | LOW | replaced with explicit info hint; placeholder more honest |
| Manual Create still buried | MEDIUM | accepted — moving to header is Tier 1.5 scope, kept this PR small |

## 8. Vercel preview

| | Value |
|---|---|
| Preview build status | SUCCESS |
| Preview URL | https://vercel.com/edsamalunarkingdomguild-2630s-projects/liveshop-pro/EXj2mghWqqAeFG5VVy17D7N2XCMk |
| Production deploy | NOT triggered (branch not merged) |

## 9. Next steps

| # | Action | Owner |
|---|---|---|
| 1 | Boss + ChatGPT review PR #3 | Boss |
| 2 | Merge PR #3 after review | Boss decision |
| 3 | Verify production smoke after deploy (9-probe) | Claude on next /goal |
| 4 | Open Tier 3 Add from Stock PR (`feat/sale-add-from-stock`) | Claude next session |
| 5 | After Tier 3 lands + Boss verdict: flip D4 + D6 flags together + functional smoke | Coordinated |
| 6 | Future Tier 1.5: relax GET `/api/sale/bookings` `liveSessionId` requirement + lift Manual Create button to workspace header | Separate small PR |

## 10. No production change confirmation

- No production DB mutation
- No Vercel env change
- No new feature flag
- No D4 / D6 enablement
- No checkout / payment / shipping change
- No `/robots.txt` fix
- No `/live-selling` redirect
- No Add from Stock runtime
- No Messenger / WhatsApp / Telegram / parser runtime
- No backup dump committed
- No emergency scripts committed
- No pak-ta-kra touch

## 11. Cross-references

- Tier 1 plan: `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md`
- Tier 3 plan: `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- D6 plan: `docs/superpowers/2026-05-14-sale-evergreen-product-code-d6-plan.md`
- Hygiene disposition: `docs/superpowers/2026-05-14-hygiene-followups-disposition.md`
- PR 2 handoff: `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md`
