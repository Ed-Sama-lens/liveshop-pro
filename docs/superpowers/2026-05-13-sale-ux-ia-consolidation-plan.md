# Sale UX / IA consolidation — planning doc (Tier 1)

**Status:** PLANNING ONLY. No code in this commit. Implementation gated on Boss + ChatGPT approval of this doc.
**Date:** 2026-05-13
**Author:** Claude Opus 4.7
**Predecessors:**
- `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md` (V Rich research + omnichannel framing)
- `docs/superpowers/2026-05-13-phase-a-closeout.md` (Phase A partial-accept status)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (Phase O-1..O-8 inbound roadmap)

---

## 1. Executive summary

### Current issue

- `/sale` workspace still feels like a developer/admin dashboard:
  - 6 panels in a static grid, several still placeholder
  - Demo content on `Create Order` panel (mock A002/B002/C001 rows) — confusing for operators
  - Manual Create modal is the primary mutation surface despite Boss spec: "Manual Create = fallback"
- Sidebar splits sales between two entries:
  - `ไลฟ์สด` → `/live-selling` (legacy session CRUD)
  - `ขายผ่านไลฟ์` → `/sale` (V Rich-style MVP workspace)
- V Rich-style target = **one unified sales operator workspace** with one sidebar entry, dense product grid, sticky comment stream, source/context filters

### Boss 2026-05-13 clarification

- Booking is **omnichannel**, not live-only
- Product code + booking workflow must work **anytime**:
  - during livestreams
  - outside livestreams
  - from Messenger inbox
  - from Facebook Page post comments
  - from manual admin entry
  - from future Telegram / WhatsApp
- `LiveSession` is **one optional source/context**, not the universal root of every booking

### Goal of Tier 1

Make `/sale` feel like an operator console + clarify the omnichannel booking model **without changing backend behavior**. No schema, no new APIs unless absolutely necessary, no mutation surface change, no runtime Messenger/WhatsApp/Telegram/parser, no payment/shipping/checkout change.

---

## 2. Current route and navigation inventory

### Sidebar nav config

Source of truth: [src/components/shared/SidebarNav.tsx](../../src/components/shared/SidebarNav.tsx). NAV_GROUPS exports 4 groups (`overview` / `sales` / `management` / `system`).

Current Sales group contains 4 entries (relevant ones bolded):

| labelKey | href | roles | Current state | Recommended future |
|---|---|---|---|---|
| `orders` | `/orders` | OWNER/MANAGER/WAREHOUSE/CHAT_SUPPORT | production-active | keep |
| `orderByProduct` | `/orders/search-by-product` | OWNER/MANAGER/WAREHOUSE | production-active | keep |
| **`liveSelling`** | **`/live-selling`** | **OWNER/MANAGER** | **legacy (LiveSession CRUD)** | **merge into `/sale` OR redirect — Tier 1 plan** |
| **`liveSale`** | **`/sale`** | **OWNER/MANAGER/CHAT_SUPPORT** | **MVP (consolidating workspace)** | **rename + become unified sales workspace** |
| `chat` | `/chat` | OWNER/MANAGER/CHAT_SUPPORT | production-active | keep |

### Route inventory — `/live-selling`

Files: `src/app/(app)/live-selling/{page.tsx, [id]/page.tsx, new/page.tsx}`

| Path | Purpose | Component | Auth | Status |
|---|---|---|---|---|
| `/live-selling` | LiveSession list + status filter + pagination | `LiveSellingPage` (client component, calls GET `/api/live?page=&limit=&status=`) | OWNER/MANAGER | production-active |
| `/live-selling/[id]` | Single LiveSession detail (BroadcastProducts + edit) | depends — see file | OWNER/MANAGER | production-active |
| `/live-selling/new` | Create new LiveSession form | `LiveSessionForm` flow ends at `router.push('/live-selling')` | OWNER/MANAGER | production-active |

Internal redirects from `LiveSessionForm.tsx:51` + `LiveSessionTable.tsx:82` → `/live-selling/...`. **Three internal link sites would break on `/live-selling` removal.**

### Route inventory — `/sale`

File: `src/app/(app)/sale/page.tsx` → mounts `SaleWorkspaceShell.tsx`. Single page, no sub-routes. Auto-selects LIVE → SCHEDULED → first session.

Calls:
- `GET /api/sale/live-sessions` (auto-mounted on shell mount)
- `GET /api/sale/live-sessions/[id]/broadcast-products` (per selected session)
- `GET /api/sale/bookings?liveSessionId=&limit=100` (per selected session)
- `GET /api/customers/[id]` (per booking row click)
- `GET /api/sale/customers/search?q=&limit=20` (Manual Create modal)
- 4 POST surfaces (Confirm/Cancel/CreateOrder/ManualCreate)

### Route inventory — `/live` API

Server-side `/api/live` powers `/live-selling`. **Not the same as `/api/sale/live-sessions`** (two parallel routes). `/api/sale/live-sessions` is a sale-namespaced read endpoint per `docs/sale-api-map.md`.

| API | Used by | Mutation? |
|---|---|---|
| `GET /api/live` | `/live-selling` page | no |
| `POST /api/live` | LiveSessionForm | yes (creates LiveSession) |
| `GET /api/live/[id]` | `/live-selling/[id]` | no |
| `PATCH /api/live/[id]` | LiveSessionForm edit | yes |
| `GET /api/live/[id]/status` | likely status updates | depends |
| `POST /api/live/[id]/status` | LiveSessionForm | yes |
| `GET /api/live/[id]/comments` | LiveSession detail | no |
| `GET /api/sale/live-sessions` | `/sale` workspace shell | no |
| `GET /api/sale/live-sessions/[id]/broadcast-products` | `/sale` Product Codes panel | no |

The two API namespaces serve different consumers but model the same data. Future consolidation could collapse to one, but **out of Tier 1 scope** — Tier 1 = UI/IA only.

### Permissions

Source of truth: [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts) lines 16-23:

```ts
{ prefix: '/live-selling', roles: ['OWNER', 'MANAGER'] as UserRole[] },
{ prefix: '/sale', roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'] as UserRole[] },
```

**Permission mismatch**: `/sale` allows CHAT_SUPPORT, `/live-selling` does not. Merge or redirect must preserve `/sale` more-permissive ACL — CHAT_SUPPORT must keep read access during live (per RBAC §9 in Boss 2026-04-06 dissent).

### Middleware

`src/proxy.ts` runs `intlMiddleware` + auth check. No route-specific logic for `/live-selling` vs `/sale` beyond `canAccess()` from permissions. Adding a redirect for `/live-selling` → `/sale` is safe at proxy layer.

### Tests referencing these routes/labels

| Test | Reference |
|---|---|
| `tests/integration/auth/middleware.test.ts` | `/live-selling` in 3 blockedPaths arrays + `/sale` in 1 |
| `tests/unit/lib/auth/permissions.test.ts` | 4 cases asserting OWNER/MANAGER allow + WAREHOUSE/CHAT_SUPPORT deny on `/live-selling` |
| `tests/e2e/manual-create-phase-a.prod-smoke.spec.ts` | heading regex `/Live Sale/i` on `/sale` |

**Impact of any rename/removal:**
- Rename `liveSale` label → break `Live Sale` heading regex (Phase A spec) — easy fix
- Remove `/live-selling` route or change ACL → break 4 permissions tests + 3 middleware test entries
- Add redirect `/live-selling` → `/sale` → keep permission tests intact (path still resolves to 307 redirect, not 403)

### i18n keys

`messages/{en,th,zh}.json` lines 10-11:

| Key | en | th | zh |
|---|---|---|---|
| `liveSelling` | Live Selling | ไลฟ์สด | 直播销售 |
| `liveSale` | Live Sale | ขายผ่านไลฟ์ | 直播下单 |

Plus `'live'` translation namespace used by `LiveSellingPage`.

In-page subtitle text on `SaleWorkspaceShell.tsx:233`: `<h1>Live Sale / ขายผ่านไลฟ์</h1>` (hard-coded — not yet using `messages/*` keys for the page heading).

---

## 3. i18n / label plan

### Current

| Surface | Current label | Note |
|---|---|---|
| Sidebar (Sales group, 1st live entry) | `ไลฟ์สด` / `Live Selling` / `直播销售` | legacy session CRUD |
| Sidebar (Sales group, 2nd live entry) | `ขายผ่านไลฟ์` / `Live Sale` / `直播下单` | MVP unified workspace |
| `/sale` page heading | `Live Sale / ขายผ่านไลฟ์` (hard-coded) | bilingual in code |
| `/sale` page subtitle | `จัดการสินค้า จองสินค้า และสร้างออเดอร์จากไลฟ์` (hard-coded) | live-centric framing |

### Proposed (post-Tier-1)

**Sidebar consolidation** (single entry, removes `liveSelling`):

| key | en | th | zh |
|---|---|---|---|
| `liveSale` (rename) | **Live Commerce** OR **Sales Workspace** | **ขายของไลฟ์สด** | **直播销售工作台** OR **销售工作台** |

**Page heading + subtitle** (replace hard-coded with i18n keys):

| key | en | th | zh |
|---|---|---|---|
| `sale.heading` | Live Commerce | ขายของไลฟ์สด | 直播销售工作台 |
| `sale.subtitle` | Manage bookings, comments, chats, and orders from every sales channel | จัดการจองสินค้า คอมเมนต์ แชท และออเดอร์จากทุกช่องทาง | 管理来自所有销售渠道的预订、评论、聊天和订单 |

### Naming risk

| Risk | Mitigation |
|---|---|
| `ขายของไลฟ์สด` may imply live-only to first-time merchants | Subtitle explicitly says "ทุกช่องทาง". Source filter chips in toolbar (ทั้งหมด / ไลฟ์สด / Inbox / Post / Manual / TG / WA) reinforce the omnichannel scope. Empty-state copy on `/sale` says "เริ่มจาก inbox/comment หรือสร้างเอง" not "เลือกรอบไลฟ์ก่อน". |
| `Live Commerce` English label may sound like a marketing term | Acceptable — merchant-facing; matches V Rich `Sale` operator mental model |
| `Sales Workspace` is generic but accurate | Backup option if Boss prefers neutral English |
| `直播销售工作台` long but accurate | Chinese-speaking merchants in test market — acceptable |

**Boss decision needed:** final English label — `Live Commerce` (preferred) / `Sales Workspace` / other?

---

## 4. Target IA for unified workspace

### Top toolbar

Sticky at top of `/sale`. Two filter groups + quick actions:

**Source filter (chip group):**
- `ทั้งหมด` (default, no source filter applied)
- `ไลฟ์สด`
- `Inbox / Messenger`
- `Post Comment`
- `Manual`
- `Telegram` (badge `เร็วๆ นี้`)
- `WhatsApp` (badge `เร็วๆ นี้`)

When source = `ไลฟ์สด`, expose a secondary LiveSession picker (current Live Sessions panel content becomes inline picker).
When source = `Inbox / Messenger` / `Post Comment`, expose a thread/channel picker (future, gated on Phase O-1+).

**Context filter (single dropdown):**
- LiveSession picker (when source = ไลฟ์สด)
- Page/Post id picker (when source = Post Comment, future)
- Thread id picker (when source = Inbox, future)
- "No context required" (when source = Manual or ทั้งหมด)

**Quick actions:**
- `+ สร้าง booking เอง` (Manual Create — visible always; fallback mode)
- `+ Add Product Code` (Add from Stock — Tier 3 feature, placeholder button now)
- `+ New Live Session` (mounted in `รอบไลฟ์` sub-tab, not in main toolbar)

### In-page sub-tab strip

9 sub-tabs inside one `/sale` workspace. Operator stays on one route + URL; sub-tab state lives in URL search param `?tab=overview` for shareable links.

| Sub-tab | Thai | Purpose | Tier |
|---|---|---|---|
| overview | ภาพรวมขาย | today's bookings/orders by source + active context badges + quick filters | 1 |
| live-sessions | รอบไลฟ์ | create/manage LiveSession; one section, NOT parent requirement for sales | 1 |
| products | สินค้า / รหัส CF | Add from Stock + product code grid; supports live + non-live contexts (Tier 3) | 1 layout + 3 features |
| comments | คอมเมนต์ / แชท | future unified inbound stream (receive-only Phase O-1+) | 1 placeholder + 4 wiring |
| bookings | รายการจอง | bookings by source/context + Confirm/Cancel + integrity badge | 1 |
| customer | ลูกค้า | selected customer summary + PII whitelist + ChannelIdentity list | 1 |
| orders | ออเดอร์ | create order from confirmed bookings + handoff to `/orders` | 1 |
| payment | ชำระเงิน / สลิป | future slip verification — NOT scope until Boss GO | future |
| shipping | จัดส่ง | future fulfillment / pickup handoff — out of `/sale` scope | future |

### Mental model contract (must hold)

1. `รอบไลฟ์` (live sessions) is **one tab**, not the parent. Operator can work in `bookings` / `customer` / `orders` without ever opening `รอบไลฟ์`.
2. `สินค้า / รหัส CF` must support **non-live contexts** when Tier 3 lands. Live-only is the current data-model constraint (AR-1) — Tier 1 plans around it but doesn't fix it.
3. Manual Create is the fallback override; comment-to-booking is the future main flow.
4. Comment / inbox stream is the future core operator surface (Tier 4 unlocks it).

---

## 5. Data-model and backend assumptions audit

Examined files: `prisma/schema.prisma`, `src/server/repositories/booking.repository.ts`, `src/app/api/sale/*`, `src/components/sale/*`.

### Per-table audit

| Field | Type | Current state | Tier 1 impact | Future risk |
|---|---|---|---|---|
| `Conversation.liveSessionId` | `String?` (nullable) | already supports non-live conversations | none | low |
| `Message.liveSessionId` | `String?` (nullable) | already supports messages outside live | none | low |
| `BroadcastProduct.liveSessionId` | **`String` (REQUIRED)** + Cascade delete + `@@unique([liveSessionId, displayCode])` | **all product codes live-bound** | UI must hide non-live product workflow OR use "evergreen" session | **AR-1: blocks Tier 3 unless schema changes OR evergreen-session pattern adopted** |
| `Booking.liveSessionId` | **`String` (REQUIRED)** | **all bookings live-bound** | UI must keep showing live picker for Manual Create OR provide evergreen | **AR-2: blocks non-live booking creation; affects all 4 mutation routes** |
| `BookingHistory` / `StockReservation` / `OrderItem` / etc | dependent on Booking.liveSessionId | follow Booking | — | downstream effect of AR-2 |

### Per-API audit

| Route | liveSessionId requirement | Tier 1 impact |
|---|---|---|
| `GET /api/sale/live-sessions` | none (lists sessions) | unchanged |
| `GET /api/sale/live-sessions/[id]/broadcast-products` | path param required | unchanged; only valid in live context |
| `GET /api/sale/bookings?liveSessionId=` | **REQUIRED query param** | future "all sources" view needs new route OR session-optional accept |
| `POST /api/sale/bookings` | required in body (`liveSessionId`) | Manual Create UI must still pass it — Tier 1 keeps current shape |
| `POST /api/sale/bookings/[id]/confirm` | implicit (booking has FK) | unchanged |
| `POST /api/sale/bookings/[id]/cancel` | implicit | unchanged |
| `POST /api/sale/orders/from-bookings` | **REQUIRED in body** | unchanged |
| `GET /api/sale/customers/search?q=` | no liveSessionId | already shop-scoped; supports non-live UI ✅ |
| `GET /api/customers/[id]` | no liveSessionId | already neutral ✅ |

### Repository audit

[src/server/repositories/booking.repository.ts](../../src/server/repositories/booking.repository.ts):

- `confirm(bookingId, shopId, changedById)` → reads booking row (which has FK to liveSession). No external param.
- `cancel(...)` → same pattern.
- `convertToOrder({shopId, liveSessionId, customerId, changedById, bookingIds?})` → **explicit liveSessionId required**. Order conversion is scoped to "all of these CONFIRMED bookings in this live session for this customer".
- `createManual({shopId, liveSessionId, customerId, broadcastProductId, quantity, status, idempotencyKey?, changedById})` → **explicit liveSessionId required**.

### Classification per Boss spec format

| Component | currently live-session-bound | can support non-live with current model | needs future schema/design |
|---|---|---|---|
| `Conversation` | optionally | yes | no |
| `Message` | optionally | yes | no |
| **`BroadcastProduct`** | **yes** | **no (FK required)** | **yes — AR-1** |
| **`Booking`** | **yes** | **no (FK required)** | **yes — AR-2** |
| `bookingRepository.confirm/cancel` | implicitly (via FK) | no | follow AR-2 |
| `bookingRepository.convertToOrder` | explicitly | no | **AR-3** |
| `bookingRepository.createManual` | explicitly | no | follow AR-2 |
| `/api/sale/bookings` GET/POST | yes (route contract) | no | follow AR-2 |
| `/api/sale/customers/search` | no | yes | none |
| `/api/customers/[id]` | no | yes | none |
| `/sale` `SaleWorkspaceShell` auto-select | yes (auto-picks LIVE) | partial — empty-state Manual Create works after `2f52e01` | **AR-4: when no LiveSession exists, all panels dead-end** |
| `/live-selling` route | yes by definition | no — entire surface is session CRUD | **AR-5: needs Tier 1 decision on fate** |

**No schema/contract change in Tier 1.** All AR-* items remain flag-and-defer. Tier 2 = schema design audit (still docs-only, no migration).

---

## 6. Tier 1 implementation proposal — UI/IA only

Boss spec proposed 6 slices A-F. Concrete proposals below. **No code in this commit** — Tier 1 implementation is a separate future PR.

### Slice A — Sidebar nav label consolidation

**Constraint:** must not break permissions tests + middleware tests.

**Two-step recommendation:**

1. **A.1** — Rename `liveSale` i18n key values (sidebar label) but keep route `/sale` + permission untouched.
   - `messages/{en,th,zh}.json` line 11: `liveSale` value
     - en: `Live Sale` → `Live Commerce`
     - th: `ขายผ่านไลฟ์` → `ขายของไลฟ์สด`
     - zh: `直播下单` → `直播销售工作台`
   - No route change. No permission change. No test change required.
2. **A.2** — Add `/live-selling` → `/sale` redirect in `src/proxy.ts`.
   - 308 permanent redirect (operator should not bookmark old URL).
   - Drop `liveSelling` from `NAV_GROUPS` sales group.
   - Drop `/live-selling` from `tests/unit/lib/auth/permissions.test.ts` (4 cases).
   - Drop `/live-selling` from `tests/integration/auth/middleware.test.ts` (3 entries).
   - **Risk:** breaks the 3 internal `router.push('/live-selling')` redirects in `LiveSessionForm.tsx` + `LiveSessionTable.tsx`. Must update to `/sale?tab=live-sessions` or similar.
   - **Stop condition:** if any internal link to `/live-selling/[id]` cannot be mapped to a `/sale` sub-tab + state, hold A.2 and decide.

### Slice B — `/sale` page header + subtitle + source filter chip UI copy

Replace hard-coded `<h1>Live Sale / ขายผ่านไลฟ์</h1>` + subtitle in `SaleWorkspaceShell.tsx` with i18n-keyed text:

```tsx
// proposed (NOT applied yet)
<h1>{t('sale.heading')}</h1>            // "ขายของไลฟ์สด"
<p>{t('sale.subtitle')}</p>             // "จัดการจองสินค้า คอมเมนต์ แชท..."
<SourceFilterChips />                   // ทั้งหมด / ไลฟ์สด / Inbox / Post / Manual
```

Source filter chip = visual + click handler updating URL search param `?source=`. Behavior in Tier 1 = filter local booking list display only. No new fetch. No API change. Telegram + WhatsApp chips render with `(เร็วๆ นี้)` badge + disabled state.

### Slice C — Layout restructure into operator workspace sections

Convert 6-panel grid into 9 sub-tab strip per IA proposal §4.

Approach options:

| Option | Pros | Cons |
|---|---|---|
| **C.1 In-page horizontal tabs** | Simplest; minimal route churn; URL state via `?tab=` | Sub-tabs can feel cramped on mobile |
| C.2 Left-rail secondary nav | More space per tab | Doubles up with sidebar; cognitive load |
| C.3 Accordion sections | All visible at once | Hard to scroll; loses density advantage |

**Recommend C.1.** Default tab on first load = `overview` (when omnichannel data exists) or `bookings` (current MVP behavior).

### Slice D — Remove or label demo/sample content

`Create Order` panel currently renders hard-coded A002/B002/C001/Subtotal RM72.50 rows for visual mock. Per Boss spec: confusing for operators.

Two options:

- **D.1** Remove demo content entirely. Panel shows real `Create Order` flow inline OR moves to the `orders` sub-tab.
- **D.2** Wrap demo content with explicit `DEMO ONLY` banner.

**Recommend D.1.** The demo predates Manual Create + Confirm/Cancel/CreateOrder dialogs and is no longer needed.

### Slice E — Operator-friendly empty states

Current empty states are dev-facing:
- `รอเลือกรอบไลฟ์` (Product Codes panel) — implies admin must select live first
- `เลือกรอบไลฟ์ก่อนเพื่อดูรายการจอง` (Booking Queue) — same

Per Boss clarification, copy must NOT force live as a prerequisite:

| Panel | Old copy | New copy (proposed) |
|---|---|---|
| Live Sessions | `ยังไม่มีไลฟ์สำหรับวันนี้ — ไปที่ Live Selling เพื่อเริ่มรอบใหม่` | `ยังไม่มีรอบไลฟ์ — สร้างรอบในแท็บ "รอบไลฟ์" หรือทำงานต่อจากแหล่งอื่นได้เลย` |
| Product Codes | `รอเลือกรอบไลฟ์` | `เลือกรอบไลฟ์เพื่อดูรหัสสินค้าของรอบนั้น (รหัสสินค้านอกรอบไลฟ์เปิดใช้เมื่อ Tier 3 ขึ้น)` |
| Customer Bookings | `เลือกรอบไลฟ์ก่อนเพื่อดูรายการจอง` | `เลือกรอบไลฟ์ หรือ filter ที่ source อื่น (Inbox / Post / Manual) เพื่อดูรายการจอง` |

### Slice F — Old routes stable or redirect only after route audit

- Keep `/live-selling` accessible until A.2 lands.
- When A.2 lands, add 308 redirect → `/sale`. Internal `router.push('/live-selling/...')` calls in `LiveSessionForm.tsx:51` + `LiveSessionTable.tsx:82` MUST be updated to point at `/sale?tab=live-sessions&liveSessionId=...` BEFORE A.2 ships.
- **Stop condition:** if `/live-selling/[id]` detail view content cannot be re-hosted inside `/sale?tab=live-sessions`, hold A.2 + reconsider.

### Tier 1 constraint matrix

| Constraint | Result |
|---|---|
| Schema change | NONE |
| API behavior change | NONE |
| Production DB mutation | NONE |
| Mutation grep delta | 4 POSTs unchanged |
| Webhook / parser / chat runtime | NONE |
| Payment / shipping / checkout | NONE |
| Phase B | not started |
| Live-only lock-in | explicitly NOT introduced |

---

## 7. Risk register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Route confusion: operators with `/live-selling` bookmark get 404 | high | Add 308 redirect before removing from nav |
| R-2 | i18n label ambiguity: `ขายของไลฟ์สด` may imply live-only | medium | Subtitle + source filter chips clarify scope; A/B test wording with merchants |
| R-3 | Role / permission regression: removing `/live-selling` ACL entry could elevate CHAT_SUPPORT to legacy session CRUD | medium | A.2 keeps `/live-selling` permission row + adds 308 redirect; do NOT remove ACL during Tier 1 |
| R-4 | Middleware / proxy regression: 308 vs 301 vs 302 vs 307 nuance with intl middleware | low | Use 308 (permanent + preserves method); test in dev first |
| R-5 | **AR-1 live-only data-model**: `BroadcastProduct.liveSessionId` required FK + `@@unique([liveSessionId, displayCode])` blocks non-live product codes | **high** | Tier 1 does NOT fix. Tier 2 audit proposes evergreen-session pattern OR schema change with dissent. Tier 3 cannot ship "Add from Stock for non-live" without resolving this. |
| R-6 | **AR-2 live-only Booking model**: `Booking.liveSessionId` required FK | **high** | Same as AR-1. All Manual Create flows still need a session id. Workaround: in Tier 1, Manual Create UI continues to require a session pick (existing behavior preserved). |
| R-7 | `/sale` dead-end risk when no BroadcastProduct exists in auto-selected session | medium | Already partially mitigated by `2f52e01` (Manual Create button shows even on empty queue). Still: product picker dead-ends — see Phase A closeout Step 7. Resolve via Tier 1 Slice E empty-state copy + Tier 3 Add from Stock. |
| R-8 | Non-live booking support gap: Boss spec says booking must work outside live, but data model requires `liveSessionId` | **high** | Resolve via Tier 2 (schema audit) OR introduce evergreen "default" LiveSession per shop (Tier 1 hack, Tier 2 cleanup) |
| R-9 | Future Telegram / WhatsApp abstraction: source filter chips include them as "เร็วๆ นี้" but no runtime exists | low | UI placeholder only in Tier 1; receive-only runtime is Tier 4 (Phase O-5/O-6) |
| R-10 | Customer PII risk in future comment/inbox displays: V Rich shows raw FB user IDs like `2446689545757837: 快来啦` | **high** | Tier 1 does not surface inbound stream. When Tier 4 wires it, ChannelIdentity → Customer resolution + masking must land FIRST. Documented in CN-1 (V Rich anti-pattern). |
| R-11 | Test impact: 4 permissions tests + 3 middleware test entries + 1 Phase A heading regex reference `/live-selling` or `/Live Sale` | low | Update tests in same PR as Slice A.2. Phase A spec heading regex needs `Live Commerce` after rename. |
| R-12 | Hard-coded heading in `SaleWorkspaceShell.tsx:233` not yet i18n-keyed | low | Slice B fixes this; not a regression risk if done together with label rename |
| R-13 | Internal redirects in `LiveSessionForm.tsx:51` + `LiveSessionTable.tsx:82` to `/live-selling/...` | medium | Must be updated to `/sale?tab=live-sessions...` BEFORE A.2 ships |
| R-14 | `/api/live` route still exists in parallel with `/api/sale/live-sessions` | low | Out of Tier 1 scope. API consolidation = separate task; backend duplication does not block UI consolidation. |

---

## 8. Open decisions for Boss / ChatGPT

| ID | Decision | Options | Claude recommendation |
|---|---|---|---|
| D-1 | Final sidebar label (Thai) | (a) `ขายของไลฟ์สด` (Boss preferred) <br/> (b) `ขายและจองสินค้า` <br/> (c) `Sales` + Thai sub-label | **(a)** with subtitle clarifier |
| D-2 | Final sidebar label (English) | (a) `Live Commerce` <br/> (b) `Sales Workspace` <br/> (c) `Sales` <br/> (d) other | **(a) Live Commerce** |
| D-3 | `/live-selling` fate | (a) 308 redirect → `/sale` <br/> (b) Hide from nav, keep accessible by URL <br/> (c) 410 Gone <br/> (d) Leave as-is for power users | **(a) 308 redirect** after internal links updated |
| D-4 | Tier 1 (UI/IA) before Tier 2 (schema audit) — order? | (a) Tier 1 first, AR-1/AR-2 audit in parallel doc <br/> (b) Tier 2 schema audit first, then Tier 1 <br/> (c) Bundle Tier 1 + Tier 2 audit in one PR | **(a)** — Tier 1 is pure UI/IA and ships independently; AR-* audit is doc-only, can happen in parallel |
| D-5 | Non-live product code support — design before Add from Stock (Tier 3)? | (a) Yes, full schema audit (AR-1) before Tier 3 designs <br/> (b) No, Tier 3 can use evergreen "default" LiveSession workaround | **(a) Yes** — evergreen session pollutes session list + uniqueness constraint complicates code reuse |
| D-6 | Phase B blocked until after Tier 1 planning? | (a) Yes, hold Phase B <br/> (b) No, Phase B can proceed in parallel | **(a) Yes** — Tier 1 doesn't change mutation surface but a Phase B run while UX consolidation is in flux risks confusing test data |
| D-7 | Sub-tab strip option | (a) In-page horizontal tabs (C.1) <br/> (b) Left-rail secondary nav (C.2) <br/> (c) Accordion (C.3) | **(a) C.1** |
| D-8 | Demo content on Create Order panel | (a) Remove (D.1) <br/> (b) `DEMO ONLY` banner (D.2) <br/> (c) Replace with real preview | **(a) Remove** |
| D-9 | When to update Phase A spec heading regex to match new label | (a) Same PR as Slice A.1 <br/> (b) Follow-up commit | **(a) Same PR** |
| D-10 | URL sub-tab state convention | (a) `?tab=overview` <br/> (b) `/sale/overview` (sub-route) <br/> (c) localStorage only | **(a) `?tab=`** — shareable, no new route files needed |

---

## 9. Recommended next action after this doc

**Hold for Boss + ChatGPT decisions D-1 through D-10.** No Tier 1 code until decisions land.

After decisions:

1. **Tier 1 implementation PR** — single PR per IA proposal §4, slices A-F per §6. Constraints:
   - No schema change
   - No API behavior change
   - No mutation surface change
   - Tests updated in same PR
   - Internal redirects updated in same PR
2. **Tier 2 schema audit doc** — parallel docs-only effort if D-4 = option (a). Covers AR-1 / AR-2 / AR-3 with dissent-4-bullet for each schema-change candidate.
3. **Phase B** stays blocked until Tier 1 lands + safe test data enumerated.

---

## 10. Cross-references

- Phase A closeout: `docs/superpowers/2026-05-13-phase-a-closeout.md`
- V Rich gap analysis + omnichannel framing: `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`
- Omnichannel inbound roadmap: `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md`
- Empty-queue bug followup (fixed in `2f52e01`): `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md`
- Sidebar config: `src/components/shared/SidebarNav.tsx`
- Permissions: `src/lib/auth/permissions.ts`
- i18n: `messages/{en,th,zh}.json`
- `/sale` shell: `src/components/sale/SaleWorkspaceShell.tsx`
- `/live-selling` page: `src/app/(app)/live-selling/page.tsx`
- Sale API map: `docs/sale-api-map.md`
