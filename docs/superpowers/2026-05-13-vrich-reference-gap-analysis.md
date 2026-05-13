# V Rich `/sale` reference + omnichannel booking gap analysis

**Status:** RESEARCH + UX/IA ROADMAP. No code in this doc.
**Date:** 2026-05-13 (rev 2 — added Boss omnichannel clarification + corrected live-centric framing)
**Author:** Claude Opus 4.7
**Source:** Boss-provided 3:25 video of `https://masternivest.vrich619.com/sale` (V Rich App v.3.11.2). 41 frames extracted at 1 frame / 5 seconds via ffmpeg.
**Related docs:**
- `docs/superpowers/2026-05-13-phase-a-closeout.md` (Phase A status)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (8-tier inbound roadmap)
- `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md` (fixed bug)

---

## Why this matters (rev 2)

Boss flagged that current `liveshop-pro/sale` UX is split into 2 conceptual tabs ("ไลฟ์สด" + "ขายผ่านไลฟ์") which is harder to use than the V Rich reference.

But **the goal is broader than copying V Rich**. Boss's 2026-05-13 clarification:

> Booking is **NOT live-only**. Product codes and bookings must be creatable at any time:
> - during live sessions
> - outside live sessions
> - from inbox/Messenger chats
> - from Facebook Page post comments
> - from manual admin entry
> - from future Telegram
> - from future WhatsApp
>
> Therefore `LiveSession` is an optional context/source for booking workflows, **not the only root**.

V Rich's `/sale` is **one example** of a unified workspace, but its mental model is still "live-centric" (it pushes the comment stream from live as the main interaction). LiveShop Pro must go further: live is **one source among many**.

Reference target = pattern benchmark, not visual copy target.

---

## V Rich App `/sale` workspace anatomy

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top alert strip (carrier rate notice, Meta Catalog re-login, IG ad)  │
├──────────────────────────────────────────────────────────────────────┤
│ Logo │ V Rich App | Sale     │ Auto Inbox: No │ Waiting List: No │ … │
│ v3.x ├──────────────────────────┬───────────────────────────────────┤
│ Menu │ Date 14/02/2026  Search  │ Live Video │ Inbox │ Post │ P.Auto│
│ Home │ [+ Add from Stock] [+ New│                  Auto-button (🔁) │
│ ●Sale│       Broadcast Exp.]    │ 244...: 快来啦 我来了!              │
│ ...  │                          │ Liew Jun An 28                     │
│      │ ┌──── Product Code Grid│ Michael Ong Yew Cheong 28           │
│      │ T1 T2 T3 T4 ... T200 ⏶⏷│ Seng Soobeng 28                     │
│      │ T201-T300, T301-T400  │ Joy Lee 33                          │
│      │ etc — color-coded rows │ Alex Teo 33                         │
│      │                          │ Keong Ngiam 后面金色那尊是什么       │
│      │ ┌── Selected: T30 Lp Eim│ Yong Soon Lim 下午好                 │
│      │ │   32 (0)              │ Yong Soon Lim 比赛牌到了吗?           │
│      │ │ 1.✓ Alex Teo : 32     │ Yong Soon Lim Okok                  │
│      │ └────────────────────  │ (real-time comment stream scrolling)│
└──────┴──────────────────────────┴───────────────────────────────────┘
```

### Sidebar nav (Thai)

| Item | English equiv |
|---|---|
| Home | Dashboard |
| **Sale** | live sales workspace (always active here) |
| Search Order | order lookup |
| Order List | orders index |
| Confirm Transfer | confirm bank/payment transfer |
| Check out | checkout (admin-initiated) |
| Pickup | pickup management |
| Chat | direct chat |
| Chat Reply Template | canned responses |

### Center panel — Live Sale workspace

**Top toolbar:**
- Date picker (shows `14/02/2026`)
- Search input (filter products by code/keyword)
- **`+ Add from Stock`** — green button — opens Stock picker modal
- **`+ New Broadcast Experience`** — green button — creates new live session/broadcast entity

**Product Code Grid (defining feature):**
- Massive tab-style grid of product codes
- Each tile = `T<N>` (e.g. T1, T2, ..., T300)
- **Color-coded rows** = different product batches/categories:
  - Teal/cyan band: T1-T21
  - Green band: T22-T41
  - Purple band: T42-T58
  - Etc.
- Visible up to T200 in one screen, scrollable to T400+
- Up/down arrow buttons to scroll between batches
- "+" tile = add new code
- Numeric counter `(1)` = active count
- **Click a tile** → expands the row below with that code's bookings

**Selected code expanded row:**
- Format: `T30 Lp Eim 32 (0)`
  - `T30` = code
  - `Lp Eim` = product short label (likely abbrev of brand + model)
  - `32` = qty/price/identifier
  - `(0)` = active booking count or stock variant
- Right-side icons: ☰ (reorder) / 💬 (chat) / ✏️ (edit) / 🚚 (ship?)
- Body: numbered booking list
  - `1.✓ Alex Teo : 32` → ID# / checkmark / customer name / qty
  - `1. Michael Ong Yew Cheong : 45` (same format, no check yet)
  - `X` button to remove booking from this code

### Right panel — Live comment + inbox stream

**4 tabs:**
- **Live Video** — comments from Facebook live stream
- **Inbox** — Page Inbox DMs (Messenger)
- **Post** — comments on regular Facebook post
- **Post (Auto)** — auto-parsed comments

**Auto-mode toggle:**
- Green pill-style **`Auto`** button (with circular animated icon)
- When on → system auto-parses incoming comments → auto-creates booking if confident

**Comment feed format:**
- One row per comment
- `{customer name} {message}` — usually just the qty/code or natural text
- Mixed languages: Chinese (大陆/泰国/马来), Thai, English, emoji
- Customers seen in feed: `Alex Teo`, `Michael Ong Yew Cheong`, `Yong Soon Lim`, `Joy Lee`, `Keong Ngiam`, `Affleck Leow`, `Liew Jun An`, `Seng Soobeng`, `Frank Tan`, `Even Tan`, `Benny Ng`, `Sim Teng`, `Dee Kay`, `Kan`, `Kent Lim Kent`, `Lu Wei Ping`, `Luw Wei Ping Okka`, `Eddy` (admin)
- Special row: raw FB ID format `2446689545757837: 快来啦 我来了!` — when name unknown, shows FB user id

### Top context strip

| Field | Value seen |
|---|---|
| `Auto Inbox` | No |
| `(2nd flag, partial text)` | No |
| `Waiting List` | No |
| `ลูกค้ายกเลิกรายการ` | (when alert banner expanded) |
| Arrow buttons (← →) | navigate live sessions |
| Chat bubble icon | open chat overlay |

### Top alert strip (admin announcements)

- `แจ้งปรับค่าส่ง (ตามผู้ให้บริการ) เริ่ม 1 เมษายน 2569 ดูรายละเอียดเพิ่มเติม [KEX] [J&T]` — carrier rate change
- `ลูกค้าสามารถทำการ logout และ login ใหม่เพื่อทำให้แสดงพิกัด Meta Catalog ได้แล้วตอนนี้` — Meta Catalog re-login
- `Live IG + Boost live วันนี้ ฟรี Ads credit ข้าวจากทาง Meta...` — IG livestream ad credit promo
- These come from **SaaS provider (V Rich)**, NOT from admin's shop → platform-level announcements

### Top right (account meta)

- User name (`Eddy`)
- `Contract Expire: 17/06/2026 (49 Days)` — SaaS subscription expiry
- `Verify Slip Credit: 40000` — paid balance for slip verification feature
- Account avatar

### Stock modal — `+ Add from Stock`

Opens overlay table:

| Column | Notes |
|---|---|
| ☐ (checkbox) | per-row + master |
| `Product C` | Product Code (e.g. `000-11.9.2022` / `1-7-2024T...`) |
| `Sale Cod` | Sale code (e.g. `000` / `TN1`) |
| `Description` | text (`T-Shirt Yellow เหลือง S`, `000-ข้าวสารกระสอบใหญ่40กก.`) |
| `Quantity` | int (e.g. 41 / 20 / 19) |
| `Price` | decimal (e.g. 250 / 40 / 60) |
| `Cost` | decimal (e.g. 0.00) |
| `Addition` | adder field |
| `Remark` | free text |
| Per-column filter inputs (with `x` clear) | top of each column |

**Footer:** `Page 1 of 29 ◀▶  View 1 - 500 of 14,416`

**Scale signal:** **14,416 products** in one shop's catalog. Pagination 500/page. Filterable by every column. This is a **mass-product environment** (live-selling SaaS supports thousands of variants).

### Product detail modal (clicking a product tile)

Single-product editor:

| Field | Type | Example |
|---|---|---|
| Product Code | text | `000` |
| Product Stock Code | text | `000-11.9.2022` |
| Description | text | `000-ข้าวสารกระสอบใหญ่40กก.` |
| Quantity | int | 41 |
| Price | decimal | 250 |
| Normal Price | decimal | 0 |
| Cost | decimal | 0 |
| **Color** | tag picker | `ดำ / ส้ม / แดง / เหลือง / เขียว / ชมพู / ฟ้า / น้ำตาล / น้ำเงิน / เทา / ม่วง` + utility ` ✓ x ⚙ ` |
| **Size** | tag picker | `XS / S / M / L / XL / 2XL / 3XL / 4XL / 5XL / SS` + utility |
| Product Category | text | (blank in samples) |
| Weight (gram) | decimal | 0.00 |
| Addition Shipping | decimal | (blank) |
| Buy Limit | int | 0 (= no limit) |
| Show in Sale Link | bool | toggle |
| Live Special Price | decimal | (cut off) |
| Remark | text | (cut off) |
| **Image upload** | `Choose File` button + thumbnail | top-right of modal |

**Key insight:** color + size are **multi-select tags within one product row**. NOT one row per variant (vs liveshop-pro Prisma schema which uses `ProductVariant` with `attributes` Json — different model).

---

## liveshop-pro `/sale` workspace anatomy (current)

### Layout (Boss's screenshot)

```
┌─────────────────────────────────────────────────────────────────┐
│ Logo │ Live Sale / ขายผ่านไลฟ์                        │   user │
│      │ จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์                │        │
│ Side │ ╔═════ amber test-mode banner ═════════════════╗         │
│ Nav  │ ║ 4 mutations พร้อมใช้ — ...                    ║         │
│      │ ╚═══════════════════════════════════════════════╝         │
│      │ ┌──Live Sessions─┐ ┌──Product Codes─┐ ┌──Cust.Bookings─┐│
│      │ │ 2 รอบ — auto   │ │ ยังไม่มีสินค้า     │ │ ยังไม่มีจอง    ││
│      │ │ LIVE SCHEDULED │ │ ใน รอบนี้         │ │ [Create Order]││
│      │ │ Live (ENDED)   │ │                  │ │ [Bulk Confirm]││
│      │ │                │ │                  │ │ [+ Manual    ]││
│      │ └────────────────┘ └──────────────────┘ └────────────────┘│
│      │ ┌──Customer Panel─┐┌──Create Order───┐ ┌──Unified Inbox─┐│
│      │ │  placeholder    ││  DEMO ONLY      │ │  COMING SOON   ││
│      │ └─────────────────┘└──────────────────┘ └────────────────┘│
└──────┴────────────────────────────────────────────────────────────┘
```

### Sidebar (current Thai)

| Item | Status |
|---|---|
| Dashboard / แดชบอร์ด | live |
| Analytics / วิเคราะห์ | live |
| Reports / รายงาน | live |
| Orders / คำสั่งซื้อ | live |
| Order by Product / ค้นหาตามสินค้า | live |
| Live Selling / ไลฟ์สด | live (separate page) |
| **Live Sale / ขายผ่านไลฟ์** | live (current) |
| Chat / แชท | live |
| Inventory / คลังสินค้า | live |
| Customers / ลูกค้า | live |
| Shipping / จัดส่ง | live |
| Payments / การชำระเงิน | live |
| Storefront / หน้าร้าน | live |
| Exchange Rate / อัตราแลกเปลี่ยน | live |
| Notifications / การแจ้งเตือน | live |
| Activity Log / บันทึกกิจกรรม | live |
| Settings / ตั้งค่า | live |

Boss flag: **"Live Selling / ไลฟ์สด"** + **"Live Sale / ขายผ่านไลฟ์"** are 2 separate nav entries → confusion. V Rich has 1 entry (`Sale`). Recommend merge.

### 6 panels (current)

1. Live Sessions — session list + auto-select + LIVE badge
2. Product Codes — BroadcastProduct grid (sparse — single card per row)
3. Customer Bookings — booking queue + Confirm/Cancel/CreateOrder/ManualCreate
4. Customer Panel — selected customer summary (live data via `/api/customers/[id]`)
5. Create Order — DEMO ONLY (mock data — never wired)
6. Unified Inbox — COMING SOON (Messenger/WhatsApp/Telegram/Live comments — design only)

---

## Gap analysis — what V Rich has that we don't

### A. **One workspace, not two**

V Rich: `/sale` is THE live workspace. No separate "Live Selling" page.

liveshop-pro: split between `/live-selling` (legacy?) + `/sale` (Live Sale MVP). Boss wants merge.

**Action:** unify into single `/sale`. Demote `/live-selling` to internal route or absorb its features into `/sale` panels. Big UX win, no schema change.

### B. **Inline live comment stream** (BIGGEST gap)

V Rich: right-panel sticky **comment feed** scrolling in real-time. 4 tabs (Live Video / Inbox / Post / Post Auto). Customer comments arrive → admin sees → assigns to product code with click or auto-mode parses → booking row appears.

liveshop-pro: comment ingestion is **future Phase O-1 to O-6** per omnichannel discovery doc. Currently zero inbound webhook receivers. Customer comments NEVER appear in `/sale`. Without this, the workspace is 50% blind.

**Action:** Phase O-1 (Messenger receive-only) + Phase O-2 (Facebook Live comments) become the highest-value next steps. Without comments, the admin must Manual Create every booking — slow, error-prone.

### C. **Product code grid as primary UI**

V Rich: T1-T400+ grid is the **central interaction surface**. Admin clicks T30 → row expands → bookings appear. Each tile shows code only, no name/price clutter. Color-coding = batches.

liveshop-pro: Product Codes panel shows max 12 cards each with displayCode + name + variant + price + stock + "หมด" badge. Larger card → fewer codes per screen. Less density.

**Action:** redesign Product Codes panel to **compact tile grid** (code only, 6-8 tiles per row, ~80 tiles per screen). Click a tile → expand details. Save real estate.

### D. **Add from Stock workflow**

V Rich: `+ Add from Stock` opens 14,000-row paginated table. Admin checks 1-N products → those become BroadcastProduct rows for the current live session.

liveshop-pro: no Stock browser on `/sale`. BroadcastProduct must be created via separate "Live Selling" page (older Boss workflow). Admin context-switches.

**Action:** add `+ Add from Stock` modal inside `/sale` — reuse existing `/api/products` list endpoint + new `POST /api/sale/live-sessions/[id]/broadcast-products/bulk` (TBD).

### E. **New Broadcast Experience button**

V Rich: `+ New Broadcast Experience` likely creates a fresh "live session" entity. Admin presses → live session row gets created → grid resets to that session's products.

liveshop-pro: similar concept (`LiveSession` model exists) but creation UI lives in `/live-selling`. Need on-sale-page creator.

**Action:** add `+ New Live Session` button in `/sale` toolbar. Reuse existing `POST /api/live` route.

### F. **Multi-language comment normalization**

V Rich: comment feed mixes Chinese (Simplified, Traditional), Thai, English, emoji. Customer names from FB profile (raw name string).

liveshop-pro: schema supports it (`Customer.name` String, no locale constraint). Comment ingestion not built. **No action gap.**

### G. **Auto-parse mode toggle**

V Rich: `Auto` button green pill. When on → confident parses auto-create bookings without admin click. Admin reviews after.

liveshop-pro: omnichannel discovery doc Phase O-4 specifies parser POC. Auto-mode UI not designed yet.

**Action:** when Phase O-4 lands, add Auto toggle in right-panel.

### H. **Customer comment → booking — 1-click flow**

V Rich: admin sees customer comment with qty (e.g. `Michael Ong Yew Cheong 28`) → clicks the comment row OR auto-mode → booking row added under T28.

liveshop-pro: no such flow. Manual Create modal requires customer search + product search + qty input + submit. 5+ clicks. Admin can't keep up during fast live stream.

**Action:** when inbox lands, add "Convert to booking" inline button on each comment row → pre-fills Manual Create with parsed customer + code + qty → 1-click submit.

### I. **Booking row visual format**

V Rich: `1.✓ Alex Teo : 32` — concise, one line.
- Number index
- Confirm-check icon (✓ when confirmed)
- Customer name
- Qty / code

liveshop-pro: row has code chip + customer link + qty + RM unitPrice + status badge + integrity badge + Confirm + Cancel + checkbox. Information-dense — fine for analyst, slower for live operator.

**Action:** offer "compact mode" toggle. Default to dense, opt-in to V-Rich-style 1-line.

### J. **Product variant model**

V Rich: variants via **tag multi-select** in one product row (Color tags + Size tags).
liveshop-pro: variants via separate `ProductVariant` rows with `attributes: Json`.

These are different models. V Rich's looser model = faster product entry but harder stock accounting. Our model = strict, better for Prisma + accurate stock per SKU.

**No change recommended** — our model is correct for stock invariants. Just need fast bulk-variant create UI.

### K. **Stock count visibility**

V Rich: stock count shown per-row in Stock modal table (`Quantity` column). On main grid, just code — admin trusts memory or hovers.

liveshop-pro: each Product Code card shows `{availableQty} ชิ้น` + "หมด" badge — better stock visibility per tile. Keep.

### L. **Order count + cumulative metric**

V Rich: Customer Panel not visible in this video sample. Possibly hidden under chat overlay.

liveshop-pro: Customer Panel shows lifetime value + order count → strong context. Keep.

### M. **Slip Credit / Subscription state**

V Rich: top-right shows `Contract Expire: 17/06/2026 (49 Days)` + `Verify Slip Credit: 40000` — SaaS billing meta.

liveshop-pro: no SaaS subscription UI yet. We're the SaaS provider, not consumer. **No gap.**

### N. **Carrier rate alerts**

V Rich: red banner top of page — admin announcements about carrier rate changes / IG live promo / Meta Catalog issues.

liveshop-pro: amber test-mode banner exists. No platform-announcement channel.

**Action:** when SaaS multi-tenant scale (post-MVP), build admin announcement banner system.

### O. **Chat Reply Template**

V Rich: sidebar has `Chat Reply Template` — canned response library for admin during live.

liveshop-pro: no equivalent. Future Phase if Chat panel becomes interactive.

---

## Architectural decisions implied

### Reference confirms

1. ✅ Our `LiveSession` + `BroadcastProduct` + `Booking` + `Customer` + `ChannelIdentity` + `Message` schema is fundamentally correct.
2. ✅ Our 4-mutation Manual Create/Confirm/Cancel/CreateOrder is the right primitive set.
3. ✅ Single workspace + multi-panel layout = correct (we just split too many panels).

### Reference suggests we should add

1. **Unify nav:** merge "Live Selling" + "Live Sale" → one "Sale" entry
2. **Inline comment stream** (highest priority) — block on Phase O-1
3. **Dense product code grid** (R1 UI refactor)
4. **Add from Stock modal** (R1 — new bulk-create endpoint + UI)
5. **Auto-parse toggle** (block on Phase O-4)
6. **1-click comment-to-booking** (block on Phase O-1 + Manual Create stable)

### Reference suggests we should NOT copy

1. ❌ V Rich variant model (tag multi-select) — our `ProductVariant` is more rigorous
2. ❌ Raw FB user ID display `2446689545757837: 快来啦` — leaks platform identifier; we should resolve to `ChannelIdentity → Customer` first
3. ❌ Mass-table Stock modal showing 14,000 rows — only relevant when shop catalog scales

---

## Boss 2026-05-13 product clarification (NEW)

Captured for record. All future `/sale` design decisions must respect:

1. **Booking is omnichannel, not live-only.** Customers create bookings via:
   - Live stream comments
   - Messenger inbox DMs
   - Facebook Page post comments
   - Manual admin entry
   - Future Telegram messages
   - Future WhatsApp messages
2. **Product codes must be usable any time.** Admin creates / browses / manages product codes without requiring an active LiveSession.
3. **LiveSession = optional context / source**, not the universal root of all booking workflows.
4. **UI must NOT require an active live session for all booking creation.** Manual Create on a fresh empty session must work (fix `2f52e01` already restores this for the UI).
5. **Current schema risk to evaluate:** does `BroadcastProduct.liveSessionId` (required FK) force every product code to belong to a live session? If yes, a future neutral `SaleContext` or `SaleProduct` model may be needed. **No schema change yet** — flag as architectural risk, not as immediate work.
6. **Manual Create = fallback / manual override**, not the main high-speed flow. The main high-speed flow is **comment / inbox / post → resolve customer → 1-click create booking**.

### Architectural risks captured (do NOT fix in current scope)

| Risk | Where | Implication |
|---|---|---|
| **AR-1** `BroadcastProduct.liveSessionId` non-null FK | `prisma/schema.prisma` model `BroadcastProduct` | All product codes are scoped to a LiveSession today. Future "non-live booking" workflows (e.g. inbox order with code admin chose this morning) need either: a default "evergreen" LiveSession per shop, OR a new `SaleProduct`/`ProductCode` model that doesn't require live binding. Both options need dissent before code. |
| **AR-2** `Booking.liveSessionId` required | `prisma/schema.prisma` model `Booking` | Same shape as AR-1. Non-live bookings (chat / post / Telegram) would still need a session id. Default evergreen session is the cheapest path, but pollutes session list. |
| **AR-3** `convertToOrder` repo requires `liveSessionId` | `src/server/repositories/booking.repository.ts` `convertToOrder` | Order conversion accepts `(shopId, liveSessionId, customerId, bookingIds)`. Removing `liveSessionId` requirement = R1 contract change. Keep for now. |
| **AR-4** `/sale` UI auto-selects a LiveSession on mount | `src/components/sale/SaleWorkspaceShell.tsx` | If no LiveSession exists, current code shows empty Product Codes + Booking Queue + nothing actionable. Non-live workflows currently dead-end. |
| **AR-5** "Live Selling" route (`/live-selling`) duplicates session/product UI | likely older Boss workflow | Consolidate into `/sale` per Boss spec, but verify route + permissions + i18n + tests + middleware before deleting. |

These are **flag-and-defer** items. Do NOT implement schema/contract changes without explicit dissent-4-bullet + Boss approval.

---

## Target sidebar + Information Architecture (proposal — NOT to code yet)

### Sidebar consolidation

Current 2 entries → 1 entry. **Naming candidate evaluation:**

| Option | Label (Thai) | Pros | Risk |
|---|---|---|---|
| **A** (Boss preferred) | `ขายของไลฟ์สด` | familiar to merchants; matches V Rich operator mental model; current sidebar already has live items | may imply "live only" — wrong per omnichannel clarification |
| **B** | `ขายของ / Booking` | accurate for omnichannel (inbox/post/manual/Telegram/WhatsApp) | less aligned with V Rich mental model; admin needs translation |
| **C** | `ขายและจองสินค้า` | very accurate | longer label; less catchy |
| **Compromise** | `ขายของไลฟ์สด` label + broader subtitle "จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง" | keeps familiar mental model + clarifies scope inside the page | label is still slightly misleading on first read |

**Recommend Compromise** — Option A label + omnichannel subtitle inside the workspace. Document the wording trade-off in commit message when rename happens.

### Target `/sale` workspace IA (proposal)

Internal sub-tabs / sections. Not top-level sidebar entries — operator stays in one workspace.

```
┌─ /sale workspace (single sidebar entry: ขายของไลฟ์สด) ────────────────┐
│ Top toolbar:                                                         │
│   - Source filter:  [ทั้งหมด] [ไลฟ์สด] [Inbox] [Post] [Manual] [TG/WA]│
│   - Context filter: [LiveSession picker] [Channel/Thread] (when src) │
│   - Quick actions:  [+ Add Product Code] [+ Manual Booking]          │
│   - Date / Search                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ Sub-tab strip (in-page, sticky):                                     │
│ [ภาพรวมขาย] [รอบไลฟ์] [สินค้า/รหัส CF] [คอมเมนต์/แชท]                 │
│ [รายการจอง] [ลูกค้า] [ออเดอร์] [ชำระเงิน/สลิป] [จัดส่ง]               │
├──────────────────────────────────────────────────────────────────────┤
│ Active sub-tab content area                                          │
└──────────────────────────────────────────────────────────────────────┘
```

#### Sub-tab summaries

1. **ภาพรวมขาย (Overview)** — today's bookings/orders grouped by source. Active live/session/post/inbox context badges. Quick filter chips.
2. **รอบไลฟ์ (Live Sessions)** — create/manage LiveSession. Status badges. Live-specific product sets. **Must not block non-live booking work in other tabs.**
3. **สินค้า / รหัส CF (Products / Codes)** — Add from Stock. Product code grid. BroadcastProduct or sale-product management. Stock / price / special live price per row. **Codes usable outside live context too** (post-AR-1 resolution).
4. **คอมเมนต์ / แชท (Comments / Chat)** — future unified inbound stream. Sub-tabs inside: Live Video / Inbox / Post / Post Auto / Telegram / WhatsApp. Receive-only first (blocks on Phase O-1+).
5. **รายการจอง (Bookings)** — bookings by customer / product / source / context. Confirm / Cancel. Reservation integrity badge. **Source badge per row**: LIVE_COMMENT / PAGE_POST_COMMENT / MESSENGER_INBOX / MANUAL / TELEGRAM / WHATSAPP.
6. **ลูกค้า (Customer)** — selected customer summary (current Customer Panel). PII whitelist enforced. ChannelIdentity list resolved + masked. NO raw `platformUserId`.
7. **ออเดอร์ (Orders)** — create order from confirmed bookings. Search / Order List handoff.
8. **ชำระเงิน / สลิป (Payment / Slip)** — future slip verification. NOT in scope until Boss explicit GO.
9. **จัดส่ง (Shipping)** — future fulfillment / pickup / shipping handoff. Separate workspace later.

### Source/context filter mental model

Top toolbar exposes 2 filters:

| Filter | Options | Effect on workspace |
|---|---|---|
| **Source** | ทั้งหมด / ไลฟ์สด / Inbox / Post / Manual / Telegram (future) / WhatsApp (future) | Filters bookings, comments, customers, orders by origin |
| **Context** | session: any / specific LiveSession id<br/>channel: any / Page id / Thread id | Narrows to one live, one Facebook Page post thread, one Messenger thread, etc. |

Source = where the booking came from (booking-time origin tag).
Context = which thread/session it belongs to (still actionable).

Defaults: Source = ทั้งหมด, Context = no live (don't auto-select). Admin opts into "Live mode" by picking ไลฟ์สด + selecting an active LiveSession.

This decouples the operator workflow from "live must be selected to do anything".

---

## Recommended roadmap (revised tiers)

### Tier 0 — Closeout / harness / doc (THIS CHANGE)

Goal: accept patch, capture corrected Phase A status, preserve curated harness, document V Rich findings + omnichannel framing.

- T0.1 — Phase A closeout doc with `PHASE_A_PARTIAL_ACCEPTED` wording
- T0.2 — Harness cleanup (afterEach network log persistence + status guard)
- T0.3 — Curated commit (Option D — Playwright config + setup + spec + bug followup + this doc + closeout doc)
- T0.4 — Emergency credential / rotation scripts stay LOCAL until ops toolkit decision

No code change to runtime. No mutation surface change. R2 (docs + tests).

### Tier 1 — UI / IA consolidation only (NO new APIs)

Goal: make `/sale` feel like an operator console + clarify the omnichannel booking model without changing backend.

- T1.1 — Sidebar consolidation **planning doc** first (route + permissions + i18n + middleware + test risks)
- T1.2 — `/sale` layout refactor: sticky toolbar with Source + Context filters
- T1.3 — Sub-tab strip inside `/sale` (Overview / Live Sessions / Products / Comments / Bookings / Customer / Orders / Payment / Shipping)
- T1.4 — Source-aware copy: subtitle + empty-states reflect "booking from any source"
- T1.5 — Remove or clearly label demo / sample content (e.g. `Create Order` panel's hard-coded `A002 Chili / B002 Coconut / C001 Curry Puff` mock — confusing for operators)
- T1.6 — Mark Manual Create as fallback action (visual de-emphasis)
- T1.7 — Sidebar rename (label only) — only after T1.1 planning doc approved

**Constraints:**
- No backend mutation change
- No new APIs unless absolutely necessary
- No schema change
- No mutation grep delta (stays 4 POSTs)
- No `/live-selling` deletion until route audit complete

Risk: R1 (UI surface + sidebar nav). Mutation grep stays 4.

### Tier 2 — Product code / sale product model design (DOCS-ONLY)

Goal: analyze whether current `BroadcastProduct` is too live-session-bound for omnichannel reality.

- T2.1 — Audit current code: every `liveSessionId` usage in BroadcastProduct / Booking flows
- T2.2 — Compare designs:
  - **Design X**: keep current schema + use evergreen "default" LiveSession per shop for non-live work
  - **Design Y**: new `SaleProduct` / `ProductCode` model independent of LiveSession; `BroadcastProduct` becomes a join table when product is featured in live
  - **Design Z**: make `liveSessionId` nullable on BroadcastProduct + Booking
- T2.3 — Dissent doc with trade-offs (R0/R1/R2 per option)
- T2.4 — Boss + ChatGPT decide

**No code. No schema change.** Architectural design only.

### Tier 3 — Add from Stock / BroadcastProduct management (depends on T2 decision)

Goal: bulk add products to current session OR to non-session context.

- T3.1 — New route `POST /api/sale/live-sessions/[id]/broadcast-products/bulk` OR `POST /api/sale/products/bulk` (depending on T2 outcome)
- T3.2 — Reuse `productRepository.findMany` for picker
- T3.3 — Add Stock modal UI in `/sale` toolbar
- T3.4 — Tests + smoke

Mutation grep delta: 4 → 5 POSTs. R1.

### Tier 4 — Receive-only comments / inbox

See `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` Phase O-1 through O-2.

- Messenger receive-only (no reply, no parser)
- Facebook live comments receive-only
- Page post comments receive-only
- Telegram receive-only (later)
- WhatsApp receive-only (later)

**No outbound messages. No parser auto-booking.**

### Tier 5 — Parser + comment-to-booking UX

Goal: when a confident comment parse exists, surface a 1-click "Convert to booking" button in the right-side comment stream.

- T5.1 — Parser library (already documented in Phase O-4)
- T5.2 — Comment row UI with parse confidence + 1-click create
- T5.3 — Admin-confirmed first. No fully automatic booking until parser proven safe.

### Tier 6 — Payment / slip / fulfillment integration

Separate workspace. Out of `/sale` scope.

---

## Cross-references

- Video frames: `tests/e2e/screenshots/reference-analysis/frame_001.jpg` … `frame_041.jpg` (local, not committed)
- Phase A report: this same conversation
- Omnichannel discovery: `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md`
- Manual Create readiness audit: `docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md`
- Manual Create design: `docs/superpowers/2026-05-12-sale-manual-create-booking-design.md`
- Empty-queue UX bug followup (fixed in `2f52e01`): `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md`

---

## Boss/ChatGPT decision points (revised)

**CD-1** Sidebar consolidation strategy: **Compromise** option (Boss preferred `ขายของไลฟ์สด` label + omnichannel subtitle inside the page) or pure rename to Option B / C?
**CD-2** Tier 2 schema audit timing: do AR-1/AR-2/AR-3 design before Tier 1 UI, in parallel, or after?
**CD-3** Tier 1 sub-tab strip: in-page horizontal tabs (proposed) vs left-rail vertical secondary nav vs accordion sections?
**CD-4** Source filter granularity: 6 fixed sources (Live / Inbox / Post / Manual / Telegram / WhatsApp) vs dynamic from `BookingSource` enum values seen in DB?
**CD-5** Context filter UX: separate dropdown per context type vs unified "context" picker that adapts shape based on selected Source?
**CC-1** Product Codes panel UI: compact grid (V Rich style) vs current card format vs hybrid (compact default + expand on click)?
**CC-2** `/live-selling` route fate: redirect to `/sale` / hide from nav / 410 Gone / leave as-is for power users?
**CC-3** Demo / sample content on `Create Order` panel: remove entirely vs label as "DEMO ONLY" with banner vs replace with real session-aware preview?
**CN-1** Raw FB user ID exposure when comment arrives without resolved Customer: hide entirely vs partial mask (last 4 digits) vs internal-only field never rendered?
**CN-2** Carrier alert / platform announcement banner system — only at SaaS multi-tenant — defer entirely or design hook now?
**CN-3** Booking source badge color palette + labels — what's the canonical set across all surfaces (booking row, customer panel, order row, etc.)?

---

## What to adopt from V Rich

| Pattern | Why | Tier |
|---|---|---|
| One unified sales/booking workspace | Boss decision — operators stay in one screen | 1 |
| Dense product code grid (compact tiles) | High density = faster live operation | 1 + 3 |
| `+ Add from Stock` flow | Bulk product code seeding | 3 |
| Sticky comment/inbox panel (when runtime exists) | Core operator interaction surface | 4 |
| Comment-to-booking 1-click design | Main high-speed selling flow | 5 |
| Source badges on bookings/orders/customers | Operators see origin at a glance | 1 + 5 |
| Source / context filters in toolbar | Decouples workspace from live-only mode | 1 |
| Sub-tab IA inside one workspace | Reduces sidebar entries; richer per-task views | 1 |

## What NOT to copy from V Rich

| Anti-pattern | Why | Tier |
|---|---|---|
| Raw Facebook user IDs in UI (`2446689545757837: 快来啦`) | PII leak; we have `ChannelIdentity` for proper resolution | enforced from Tier 4 onward |
| 14,000-row stock modal as-is | Premature optimization for our scale; design later | T3 design only |
| Tag-multi-select variant model | Our `ProductVariant` row model is more correct for stock invariants | never |
| Auto customer-facing messages without policy | We have explicit "no customer-facing message" rule until Boss approves | never until policy |
| Live-only booking constraints | Boss clarification — booking is omnichannel | enforced |
| Carrier alert banner injected by SaaS provider | Single-tenant for now | defer |
| Provider subscription / slip-credit UI | We ARE the SaaS provider | N/A |

---

## TL;DR

V Rich App = the same workflow we're building, 5 years more mature — but **its mental model is still live-centric**. LiveShop Pro must go further: live is **one source**, inbox/post/manual/Telegram/WhatsApp are equal first-class sources.

They prove:

1. Sales workspace **must** include real-time inbound stream (comments + inbox) to be useful at speed.
2. Product code grid is the right primary UI — dense + clickable.
3. One workspace > multiple tabs.
4. Manual Create is a fallback, not the main flow.

Our path (revised):
- **Tier 0** (this change): close out Phase A, preserve harness, ship docs
- **Tier 1** (~1-2 weeks): UI/IA consolidation only — sidebar merge, sub-tab strip, source/context filters, source-aware copy
- **Tier 2** (docs only): schema audit — does BroadcastProduct/Booking need to support non-live? Decision before code
- **Tier 3** (~1 week): Add from Stock — depends on T2
- **Tier 4** (~2-3 weeks): receive-only inbound stream via Phase O-1 + O-2 + post-comment receiver
- **Tier 5**: parser + 1-click comment-to-booking
- **Tier 6**: payment / slip / fulfillment

Without Tier 4, `/sale` is a Manual Create harness — not yet an omnichannel sales tool.

**Critical: booking must NOT be designed as live-only.** Future routes that auto-require `liveSessionId` are AR-1/AR-2 violations and must be flagged in dissent.
