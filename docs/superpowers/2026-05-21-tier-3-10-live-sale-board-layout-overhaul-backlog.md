# Tier 3.10 — Live Sale Board Layout Overhaul Backlog

**Filed:** 2026-05-21
**Priority:** P0 — current `/sale` layout cannot run real live-selling ops
**Source:** Boss feedback comparing current `/sale` (image 1) vs V Rich App reference (images 2, 3, video at `sale tab example/V Rich App - Sale - Google Chrome 2569-05-21 01-26-18.mp4`)
**Status:** Backlog. Do NOT implement until Codex + ChatGPT review.

---

## 1. Boss feedback (verbatim intent preserved)

> 1. Product Code tile (current) ใหญ่ + รก + กินพื้นที่เกิน ให้ย่อเป็น compact pill เหมือน V Rich App `BD3 BD4 BD5...` (ภาพ 2)
> 2. เมื่อกด pill → expand ตารางใต้ pill row พร้อมช่องว่างตามจำนวน stock (ภาพ 3) เช่น `BD4 大蜡烛 108 (13)` = displayCode + ชื่อ + ราคา + (stock qty)
> 3. ช่องว่างในตารางใช้สำหรับ pull ชื่อลูกค้าจาก live comment / inbox / Telegram / WhatsApp / Future chat aggregator → ลากหรือ auto-pull
> 4. เมื่อลูกค้าถูกเพิ่มในช่อง → ระบบบันทึก booking + ส่งรหัสยืนยันกลับแชทลูกค้าทันที (outbound message)
> 5. กด X → cancel order ลูกค้าคนนั้นทันที (release reservation)
> 6. stock count `(13)` ต้องอัพเดต real-time เมื่อมี customer คนใหม่ claim slot
> 7. ระบบต้องรองรับ:
>    - Facebook Live comment (Tier 4.2)
>    - Facebook Messenger inbox (Tier 4.1)
>    - WhatsApp (Tier 4.4)
>    - Telegram (Tier 4.3)
>    - Future custom chat aggregator (Tier 5+)

---

## 2. Reference comparison

### Current `/sale` Product Codes panel (image 1, Tier 3.6)
- Tile size: ~120px wide × ~80px tall per BP
- 2 cols on mobile / 3 cols on sm+
- Each tile shows: displayCode, productName, sku, RM price, qty
- Click → opens Edit Product Code dialog (Tier 3.6)
- No expand-to-slot-list inline
- 5 BPs already feels crowded; 50+ BPs would be unusable

### V Rich App reference (image 2 + 3)
- Pill row: `BD3 BD4 BD5 BD6 ... BD96 FS2 TZ1 +` — ~30-40 codes fit on one row
- Pill = colored badge (green = active, dark = sold-out, future colors for other states)
- Click pill → expand drawer/section BELOW pill row
- Drawer shows: `displayCode productName price (stockQty)` header + numbered slot list
- Each slot row = empty by default; populated when customer claims
- Slot has icons: list-view / chat-bubble / pencil-edit / person-add
- Bottom of drawer has "1" badge = page indicator (for paginated codes)
- `Add from Stock` + `New Broadcast Experience` buttons above pills
- `Date` + `Search` filters above buttons
- Live Video / Inbox / Post / Post (Auto) tabs on the right (chat source switcher)

### Key UX shift
- **Compact-by-default**: pills first, drawer-on-demand
- **In-place slot management**: customer goes IN the drawer, not in a separate Booking Queue panel
- **Real-time stock binding**: `(13)` shrinks as slots fill
- **Channel-agnostic slot fill**: slot doesn't care if customer came from FB comment / FB inbox / Telegram / WhatsApp — it accepts any source

---

## 3. Required improvements (full Tier 3.10 scope)

### 3.1 Pill-style Product Code chips
- Replace current 120×80 tiles with rounded-pill badges, ~30-60px wide × ~24px tall
- Show only displayCode (no SKU, no name on pill itself)
- Color states:
  - Active (in-stock): brand color (e.g. green/blue)
  - Sold-out (qty 0): muted/red
  - Reserved (qty < threshold): amber
  - Selected/expanded: highlight ring
- Pill row wraps to multiple rows when >N pills
- "+ ปุ่ม" pill at end for quick-create entry
- Page badge `[1]` for large catalogs (>~50 codes)

### 3.2 Expand-on-click slot drawer
- Click pill → smooth expand below pill row (accordion or fixed slot)
- Drawer header: `{displayCode} {productName} {price} ({stockQty})`
- Header icons (right side):
  - List view (all slots compact)
  - Chat bubble (show messages for this code)
  - Pencil (edit BroadcastProduct — reuse Tier 3.6 dialog)
  - Person-add (add customer manually)
- Slot list: numbered 1..N where N = stockQty
- Each slot row:
  - Empty: dotted-line placeholder, drop target
  - Filled: customer name + channel icon + status badge + X button

### 3.3 Real-time stock counter
- `(stockQty)` in header updates via SSE / polling when:
  - new slot filled → qty decrement
  - X cancel → qty increment
  - stock adjusted in /inventory (cross-tab sync)
- Existing `useNotificationStream` hook may have pattern to reuse

### 3.4 Channel-agnostic slot fill
Slot population sources (multi-channel union):
1. **Manual entry** — admin types customer name (current Manual Create flow)
2. **Live comment auto-pull** — Facebook Live Comments (Tier 4.2 receive-only)
3. **Messenger inbox pull** — drag from Inbox panel (Tier 4.1)
4. **Post comment pull** — drag from Post tab (Tier 4.2)
5. **Telegram pull** — drag from Telegram tab (Tier 4.3)
6. **WhatsApp pull** — drag from WhatsApp tab (Tier 4.4)
7. **Future custom chat aggregator** — Tier 5+ unified inbox

Drag-and-drop interaction:
- Source side: comment/message row has drag handle
- Drop target: slot row in expanded drawer
- On drop:
  - Create `Booking` row (source = MANUAL / LIVE_COMMENT / PAGE_INBOX / etc per drop origin)
  - Reserve stock
  - Send outbound confirmation to customer's channel (mandate from § 1.4)
  - Real-time stock counter updates

### 3.5 Cancel slot (X button)
- Click X → confirmation prompt
- On confirm:
  - `bookingRepository.cancel()` (existing) with reason `Admin cancelled in /sale`
  - Release stock reservation
  - Counter +1
  - (Optional) Send cancellation message to customer

### 3.6 Outbound message gate (CRITICAL)
- This is the FIRST feature in liveshop-pro that sends outbound customer messages
- Boss's earlier mandate: "Do not send outbound customer messages" → MUST be re-evaluated for Tier 3.10
- Per-channel implementation:
  - Facebook Page Messenger send API
  - Telegram Bot send API
  - WhatsApp Business send API (template messages — Meta gating)
- Feature flag REQUIRED: `ALLOW_OUTBOUND_CUSTOMER_MESSAGES` default false
- Per-channel feature flag also (e.g. `ALLOW_OUTBOUND_MESSENGER`, `ALLOW_OUTBOUND_TELEGRAM`)
- Idempotency: dedupe by `(bookingId, channel, type)` to avoid spam on retry

### 3.7 Multi-channel unified design (forward-compat)
- Slot.source field tracks origin channel
- Booking.source enum already has MANUAL / LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / IMPORT / SYSTEM (verified in schema)
- New union endpoint: `GET /api/sale/inbox?channels=fb_comment,messenger,telegram,whatsapp&liveSessionId=X` returns merged inbox stream
- Drag source is channel-tagged; drop creates Booking with correct source

### 3.8 Layout refactor
- Replace current Product Codes panel grid with pill row + expand-drawer
- Booking Queue panel may merge into the drawer (slot rows ARE the booking queue)
- Customer Panel can move to right sidebar (channel switcher area)
- Filter chips (ALL / ไลฟ์สด / Inbox / Post Comment / Manual / Telegram / WhatsApp) become channel source filters for drawer-fill

---

## 4. Files to investigate (audit before design)

```bash
# Current /sale panel structure
src/app/(app)/sale/page.tsx
src/components/sale/SaleWorkspaceShell.tsx           # orchestrator
src/components/sale/SaleProductGridPlaceholder.tsx   # current grid — REPLACE
src/components/sale/SaleBookingQueuePlaceholder.tsx  # current booking — MERGE into drawer
src/components/sale/SaleCustomerPanelPlaceholder.tsx # right side
src/components/sale/SaleSourceFilterChips.tsx        # repurpose for channel filter
src/components/sale/AddFromStockDialog.tsx           # Tier 3.6 - integrate or replace
src/components/sale/EditProductCodeDialog.tsx        # reuse for pill pencil icon
src/components/sale/CreateQuickProductCodeDialog.tsx # reuse for "+" pill
src/components/sale/ManualCreateBookingDialog.tsx    # reuse for person-add
src/components/sale/SaleInboxPlaceholder.tsx         # current Inbox placeholder
src/components/sale/SaleSessionPickerPlaceholder.tsx # session picker

# Real-time
src/hooks/useNotificationStream.ts                   # pattern to reuse
src/server/socket/index.ts                           # socket.io for cross-tab sync

# Channel sources (none integrated yet)
src/lib/facebook/live-comments.ts                    # FB Live Comments helper (Tier 4.2 prep)
src/server/services/webhook.service.ts               # outbound webhook
src/app/api/webhooks/                                # inbound webhook endpoints
```

---

## 5. Design questions for Codex + ChatGPT consult

Before any code:

1. **Pill row pagination** — flat list with wrap vs paginated `[1] [2] [3]` vs virtual scroll?
2. **Expand UX** — accordion (one at a time) vs multi-expand vs modal drawer?
3. **Slot rows = Booking rows** — should slot be a UI projection of Booking table OR a separate "slot reservation" concept?
4. **Drag-and-drop library** — `@dnd-kit` (modern + accessible) vs `react-beautiful-dnd` (legacy) vs HTML5 native?
5. **Real-time strategy** — existing socket.io + new event types vs SSE vs polling?
6. **Outbound message policy** — feature-flagged per-channel as in § 3.6? OR pure inbound-only Tier 3.10, outbound deferred?
7. **Channel union endpoint shape** — single `GET /api/sale/inbox` with channel filter OR per-channel endpoints with client merge?
8. **Future chat aggregator** — what's the abstraction layer to make this plug-in-able?
9. **Mobile layout** — pill row + drawer on small screen?
10. **Old `/sale` deprecation** — feature flag `ALLOW_TIER_3_10_LAYOUT=true` for staged migration?
11. **Multi-variant products** — current Tier 3.8 supports 1 variant per product. Pill = 1 BroadcastProduct = 1 Product = 1 Variant. Multi-variant case?
12. **Performance at scale** — 100 pills + 100 expand drawers + N slots each + N channels streaming live → render budget?

---

## 6. PR sequence (high-level estimate)

| PR | Scope | LOC est | Risk |
|---|---|---|---|
| PR-1 | Audit + design doc + Codex/ChatGPT review | 0 (docs) | R0 |
| PR-2 | Pill-style chip component + replace grid | 400 | R1 |
| PR-3 | Expand-on-click drawer + slot list (empty) | 600 | R1 |
| PR-4 | Manual slot fill (reuse Manual Create) + cancel X | 400 | R1 |
| PR-5 | Real-time counter via socket.io | 400 | R1 |
| PR-6 | Channel union inbox endpoint + UI tabs | 800 | R1 |
| PR-7 | Drag-and-drop from inbox to slot | 600 | R1 |
| PR-8 | Outbound message gate (per-channel, flag-gated) | 1000 | R1+ |
| PR-9 | Telegram channel adapter | 500 | R1 |
| PR-10 | WhatsApp channel adapter | 500 | R1 |
| PR-11 | Future chat aggregator abstraction | 400 | R2 |

**Cumulative: ~5,600 LOC, 11 PRs.** Multiple Boss approval gates required.

---

## 7. Coordination with existing Tier backlogs

| Tier | Status | Relation |
|---|---|---|
| Tier 3.7 | superseded by Tier 3.8 | — |
| Tier 3.8 | shipped (PR #42-#44) | quick-create feeds Tier 3.10 pills |
| Tier 3.9 | backlog (5 issues, P0) | **resolve Tier 3.9 issues FIRST** before Tier 3.10 rewrite; otherwise rewrite inherits broken refresh + multi-select + redundant displayCode |
| Tier 4.1 | backlog (Messenger receive-only) | feeds Inbox channel → Tier 3.10 drawer |
| Tier 4.2 | not started | FB Live Comments receive |
| Tier 4.3 | not started | Telegram receive + outbound |
| Tier 4.4 | not started | WhatsApp receive + outbound |
| Tier 5 | not started | Comment parser → auto-fill slot |
| Future | not started | Custom chat aggregator + unified inbox |

**Dependency chain:**
```
Tier 3.9 (pattern unification) — must finish first
  ↓
Tier 3.10 PR-2..PR-5 (compact UI + drawer + manual fill + real-time)
  ↓
Tier 4.1 (Messenger receive) → feeds drawer source
  ↓
Tier 3.10 PR-6..PR-8 (channel union + drag + outbound gate)
  ↓
Tier 3.10 PR-9..PR-10 (Telegram + WhatsApp adapters)
  ↓
Tier 3.10 PR-11 (future aggregator abstraction)
```

---

## 8. Risks summary

| Risk | Severity | Notes |
|---|---|---|
| Large refactor; many files touched | HIGH | 11 PRs, ~5600 LOC, multiple Boss approvals |
| Outbound message permission/policy | HIGH | First outbound feature; legal + Meta App Review implications |
| Real-time sync correctness | HIGH | stock race conditions; socket.io scaling |
| Drag-and-drop accessibility | MEDIUM | dnd-kit handles keyboard alt; document for admin training |
| Channel adapter complexity | HIGH | each platform has different message format, auth, rate limit |
| Mobile UX | MEDIUM | live ops often run on phone/tablet; pill row + drawer fit small screens? |
| Storefront/checkout coupling | MEDIUM | reservation system shared; can't break public flow |

---

## 9. What this docs does NOT do

- Does NOT implement any of the 11 PRs
- Does NOT modify schema (Booking.source enum already supports all channels)
- Does NOT change runtime
- Does NOT block Boss from continuing Tier 3.9 work
- Does NOT pre-empt Codex / ChatGPT review on the design questions § 5

---

## 10. Cross-references

- Tier 3.8 backlog: `docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md`
- Tier 3.8 handoff: `docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-implementation-handoff.md`
- Tier 3.9 backlog: `docs/superpowers/2026-05-21-tier-3-9-product-create-pattern-unification-backlog.md`
- Tier 4.1 implementation checklist: `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md`
- Tier 4 fixtures: `tests/fixtures/messenger/`
- Sale UI polish backlog: `docs/superpowers/2026-05-15-sale-ui-qa-polish-backlog.md`
- Reference UI: V Rich App video at `sale tab example/V Rich App - Sale - Google Chrome 2569-05-21 01-26-18.mp4` (Boss-only, gitignored)

---

End of backlog. Boss instruction: "deep research dig deep ให้ละเอียด สรุปสิ่งที่ต้องทำแล้วไปปรึกษา codex กับ chatgpt ก่อนนะ อย่าพึ่งลงมือทำ"

Do NOT implement until Boss + Codex + ChatGPT explicit approval. Multiple gates required (per § 6 + § 7 + § 8).
