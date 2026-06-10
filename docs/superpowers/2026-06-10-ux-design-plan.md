# UX/UI Design Plan — App-wide Standards + Per-Surface Specs

**Filed:** 2026-06-10 · **Status:** DESIGN ONLY — canonical UX reference for all ROADMAP phases
**Owns:** global UX standards · per-surface design specs · page-route disposition · per-phase UX checklists
**Grounded in:** actual code audit 2026-06-10 (Sidebar nav, page sizes, placeholder scan) + `2026-05-25-goal-deep-audit-handoff.md` §4 UX findings

---

## §1 Design principles (ทุก feature ต้องผ่าน 6 ข้อนี้)

| # | หลักการ | ความหมายปฏิบัติ |
|---|---|---|
| P1 | **Thai-first** | label หลัก = ไทยสั้นๆ, English รอง, จีนเฉพาะ product display (Malaysia) |
| P2 | **Mobile-first admin** | แม่ค้าตอบแชท/เช็คยอดบนมือถือ — ทุกหน้าใหม่ design มือถือก่อน desktop |
| P3 | **During-live = one-hand, zero-think** | ระหว่างไลฟ์ admin มีเวลา <5 วิ/action — ปุ่มใหญ่, แถวเดียว, ไม่มี nested menu |
| P4 | **Repeated action ≤2 clicks** | งานซ้ำบ่อย (เปิดบิล, ยืนยันจอง, ตามโอน) ห้ามเกิน 2 คลิกจากจุดที่เห็นข้อมูล |
| P5 | **Status = สี + คำ เสมอ** | ห้ามใช้สีเดี่ยวสื่อสถานะ (color-blind) — chip มีทั้งสีและตัวหนังสือ |
| P6 | **Reversible > confirm dialog** | action ที่ undo ได้ → ทำเลย + toast พร้อมปุ่ม "เลิกทำ" (5 วิ); action ถาวร → confirm dialog เท่านั้น |

---

## §2 Global standards (ใช้ทุกหน้า — pin เป็น checklist ต่อ PR)

### 2.1 Status color tokens (semantic, ใช้ที่เดียวกันทั้งแอป)

| Token | ใช้กับ | สี (Tailwind) |
|---|---|---|
| `status-pending` | booking pending, รอจ่าย, แชทรอตอบ | amber-500 bg-amber-50 |
| `status-active` | confirmed, โอนแล้ว, กำลังไลฟ์ | green-600 bg-green-50 |
| `status-waiting` | รอโอน WAITING_PAYMENT, รอส่ง | blue-600 bg-blue-50 |
| `status-danger` | over-alloc, ค้างนาน, RISKY/BLOCKED | red-600 bg-red-50 |
| `status-muted` | cancelled, closed, history | gray-500 bg-gray-100 |
| `status-vip` | ลูกค้า VIP | purple-600 bg-purple-50 |

Rule: introduce as shared `StatusChip` component variants — single owner, no ad-hoc colors per page. (Existing 4 payment badges fold into this when touched.)

### 2.2 The loading / empty / error triple (ทุก data view ต้องมีครบ 3)

| State | Standard |
|---|---|
| Loading | **Skeleton** ของ layout จริง (ไม่ใช่ spinner กลางจอ) สำหรับ list/board; spinner เฉพาะ inline action |
| Empty | Icon + 1 ประโยคไทยบอกว่าทำไมว่าง + **ปุ่ม action ถัดไป** (เช่น "ยังไม่มีรหัสสินค้าของวันนี้ → [+ สร้างรหัส]") — empty state ที่ไม่มีปุ่ม = ทางตัน ห้าม |
| Error | ข้อความไทยอ่านรู้เรื่อง + ปุ่ม "ลองใหม่" + รายละเอียด technical พับเก็บ (ErrorBoundary ห่อทุก panel — pattern มีแล้วใน `/sale` ✅ ขยายให้ครบทุกหน้า) |

### 2.3 Feedback standards

- **Toast:** success/error ทุก mutation; ตำแหน่งเดียวทั้งแอป (bottom บนมือถือ, bottom-right desktop); success toast พร้อมปุ่ม undo เมื่อ reversible (P6)
- **Confirm dialog:** เฉพาะ irreversible (ยกเลิก booking ที่คืน stock, ลบ, ส่งข้อความออก) — บอกผลที่จะเกิดเป็นไทยชัดๆ ("ยกเลิกแล้ว stock จะคืน 2 ชิ้น")
- **Inline validation:** form validate ตอน blur + ตอน submit; error ใต้ field เป็นไทย; ห้าม alert()
- **Optimistic UI:** ใช้เฉพาะ action ที่ rollback ง่าย (tag, status chip); ห้ามใช้กับเงิน/stock — พวกนั้นรอ server confirm + แสดง pending spinner ที่ปุ่ม

### 2.4 Layout + responsive

- Table → **card list บนมือถือ** (ทุกตาราง: orders, payments, inventory) — ห้าม horizontal scroll ตาราง
- Tap target ≥ 44×44px; font มือถือ ≥ 14px; ระยะห่างปุ่ม destructive จากปุ่มปกติ ≥ 8px
- Sticky: action bar ของ bulk operations + ปุ่ม primary ของ form ยาว → ติดล่างจอมือถือ
- Sidebar (desktop) ✅ มีแล้ว; MobileNav ✅ มีแล้ว — เพิ่ม **badge ตัวเลข** (แชทค้างตอบ, จองรอยืนยัน) ที่ nav item เมื่อ Phase 10B ถึง

### 2.5 Form standards

- Single-column เสมอ; autofocus field แรก; Enter = submit; ปุ่ม primary ขวา/ล่างเดียว
- Quick-create pattern (จาก `/sale` ✅): field น้อยสุดที่เปิดงานได้ + "แก้รายละเอียดทีหลังได้" — ห้าม form ยาวบังคับกรอกครบ
- ตัวเลขเงิน: input `inputmode="decimal"`, แสดงผล `RM 1,234.50` consistent ทุกที่ (มี currency module codemap 08 ✅)

### 2.6 Performance UX

- List > 50 รายการ → pagination หรือ virtualization (board 100 pills = ต้อง virtualize/collapse — Phase 3)
- Debounced search 300ms (pattern มีแล้วใน /orders /inventory ✅ — ใช้ทุก search ใหม่)
- `next/image` สำหรับรูปทุกจุดใหม่; migrate 8 จุด `<img>` เดิม (audit M1) + เปิด G11 remotePatterns เมื่อแตะ

---

## §3 Page-route disposition (พบจาก code audit — roadmap เดิมไม่ได้ map)

| Route | สภาพจริง (2026-06-10) | Disposition |
|---|---|---|
| `/dashboard` | 373L ใช้งานได้ (stats + recent activity) | **ยกเป็น "หน้าเริ่มวัน"** — Phase 7+ เพิ่ม: การ์ด saleDate วันนี้ (ยอดจอง/ค้างโอน/stock ใกล้หมด) + shortcut 4 ปุ่มงานบ่อย + (Phase 10D) AI digest ฝังบนสุด; แตกไฟล์ (LOW audit) ตอนแตะ |
| `/sale` | ✅ ดี (3-row + ErrorBoundary + date-first) | ตาม Phase 1–5; เพิ่ม board UX ตาม §4.1 |
| `/chat` | 272L **มี placeholder** | = **บ้านของ Phase 10** — rebuild เป็น unified inbox ตาม §4.2; ห้ามทำ feature ใหม่ใส่ของเก่าก่อน 10A |
| `/customers` | 123L บาง (list พื้นฐาน) | = **บ้านของ Phase 10C customer 360** — ขยายเป็น profile + lifecycle + follow-up hub |
| `/live-selling` | 88L placeholder | **รอ Phase 9** (live comments receive) — ใส่ banner "เชื่อม Facebook ก่อน" ชี้ไป settings; ห้าม dead-end เปล่า |
| `/analytics` | 279L มีของ | ตรวจทับซ้อนกับ Phase 7 summary — Phase 7 ตัดสิน: ยุบรวมหรือแบ่งหน้าที่ (summary=ต่อ saleDate, analytics=ภาพรวมยาว) |
| `/reports` | 283L **มี placeholder** | Phase 7 ตัดสิน disposition พร้อม analytics — candidate: export center (CSV plan §7 spec) |
| `/orders`, `/payments`, `/inventory`, `/shipping` | ✅ ใช้งานจริง (filters/pagination/toasts ครบ) | คง pattern; migrate ตาราง→card มือถือตอนแตะ (Phase 14) |
| `/notifications` | 237L มีหน้า | Phase 10B **ต่อ event จริงเข้า**: booking ใหม่, สลิปเข้า, แชทค้าง >X ชม. + badge ที่ nav |
| `/activity` | 264L มีของ | คงไว้ — audit log; Phase 10D เพิ่ม AI action log view ที่นี่ |
| `/bulk` | 337L ใช้งานได้ | คงไว้; ผูก checklist §2 ตอนแตะ |
| `/settings` | 456L (มี dead `setTeamMembers` — audit M4) | Phase 10B **ทำ team management จริง** (จำเป็นสำหรับ assignment F2) — ปิด M4 พร้อมกัน |
| `/exchange-rates` | มีหน้า (L9 stub const) | คงไว้ MYR-first; ลบ dead const ตอนแตะ |
| `/orders/search-by-product` | ✅ มี | คงไว้ — เข้าได้จาก nav แล้ว |

**กฎ:** ห้ามมี route ที่เป็น dead-end placeholder ตอน Phase 14 จบ — ทุก stub ต้องถูก build, ยุบ, หรือซ่อนจาก nav

---

## §4 Per-surface design specs

### 4.1 `/sale` + V Rich board (Phase 3/5)

**ปัญหา UX ที่ต้องแก้ใน Phase 3:**
1. **100 pills (CM1–CM100) ล้นจอ** → board ต้องมี: ช่องค้นหา/filter รหัส (debounced) + จัดกลุ่ม collapse ได้ + virtualize เมื่อ >50
2. **Slot สถานะอ่านยาก** → ใช้ StatusChip tokens §2.1: ว่าง=เทาขอบประ, จองแล้ว=amber+ชื่อลูกค้า, ยืนยัน=เขียว, over-alloc=แดง+badge "เกิน X"
3. **Legend** — แถบอธิบายสีเล็กๆ บนหัว board (ครั้งแรกเปิด expand, จำ collapse state)
4. **Board วาง BETWEEN primary/secondary rows (จาก audit ⚠️)** — Boss smoke Phase 1 ตัดสิน; ถ้า scroll ยาวไป → ตัวเลือก: tab สลับ legacy/board แทน stack
5. Skeleton ของ board ตอนโหลด (ไม่ใช่ spinner)

**Phase 5 fill/cancel flow (ออกแบบล่วงหน้า — ผูกกับ spec Q1–Q10):**
```
คลิก slot ว่าง → popover (ไม่ใช่ dialog เต็มจอ):
  [ค้นหาลูกค้า_______]  ← autofocus, แสดง "ลูกค้าล่าสุดของ saleDate นี้" 5 คนก่อนพิมพ์
  จำนวน [1] [+][-]
  [จองเลย]             ← 1 ปุ่ม, Enter ก็ได้
→ toast "จอง CM12 ให้ คุณA แล้ว [เลิกทำ]" (undo 5 วิ ก่อน commit จริง — ตาม Q-spec)
คลิก slot มีคน → popover: ชื่อ+สถานะ+[ยืนยัน][ยกเลิก][ดูแชท]
  ยกเลิก = confirm dialog (บอก stock คืนเท่าไหร่) — ไม่ undo เพราะแตะ stock
```
มือถือ: popover → bottom sheet เต็มกว้าง

### 4.2 `/chat` unified inbox (Phase 10 — ผูกกับ inbox spec §5)

**Desktop ≥1024px — 3 panes:**
```
| รายการแชท 320px      | บทสนทนา flex          | ลูกค้า 360 300px (พับได้) |
| [ค้นหา] [filter:สถานะ]| header: ชื่อ+ช่องทาง+   | ชื่อ+lifecycle chip        |
| ● customerA  รอโอน   |   status chip+assignee | ยอดค้างโอน RM XX [เตือนตาม]|
|   ตัวอย่างข้อความ 1บรรทัด| messages…             | การจองวันนี้ (saleDate)    |
| ○ customerB  ใหม่    | [AI: สรุป][AI: ร่างตอบ] | ออเดอร์ล่าสุด 3 รายการ      |
|   …                  | composer + quick replies| แท็ก / โน้ต                |
```
**Mobile — 1 pane ต่อชั้น:** list → tap → thread (header แตะ = เปิด customer sheet) → back ชัดเจน. ตอบแชทได้จบใน thread เดียว: ปุ่มลัด [จองให้] [ขอสลิป] [เปิดบิล] ใน composer toolbar

**AI elements (10D):** ปุ่ม AI = เสนอ draft ใน composer (แก้ได้ก่อนส่ง — ส่งเองเสมอ); suggestion queue = หน้า review แยก + badge; ทุก AI draft มี label "ร่างโดย AI" จนกด ส่ง

### 4.3 `/customers` customer 360 (Phase 10C)

- List: ค้นหา + filter lifecycle + sort ยอดซื้อ/ล่าสุด; row = ชื่อ, ช่องทาง icons, lifecycle chip, ยอดสะสม, ค้างโอน
- Profile: header (ชื่อ+lifecycle+แท็ก) · tab จอง/ออเดอร์/แชท/โน้ต · ปุ่ม [เตือนตาม] [เปิดแชท] [จองให้]
- **Follow-up hub:** view "ต้องตามวันนี้" — list ลูกค้า due + เหตุผล + ปุ่มลัดไปแชท → นี่คือหน้า admin เปิดทุกเช้า คู่ dashboard

### 4.4 `/dashboard` หน้าเริ่มวัน (Phase 7 แตะ, Phase 10D เสริม)

ลำดับบน→ล่าง: (1) การ์ด saleDate วันนี้: ยอดจอง/ยืนยันแล้ว/ค้างโอน RM/stock ใกล้หมด — แตะแล้วไป `/sale` (2) AI digest (10D) (3) งานค้าง: แชทรอตอบ N, สลิปรอตรวจ N, follow-up due N — แตะไปหน้านั้นๆ (4) stats เดิม

---

## §5 Per-phase UX checklist (ROADMAP อ้างตารางนี้)

| Phase | UX checklist เพิ่มเติม (นอกเหนือ checklist §2 ที่ใช้ทุก PR) |
|---|---|
| 3 | §4.1 ข้อ 1–5: search/filter pills · slot StatusChip · legend · placement verdict · skeleton |
| 5 | §4.1 fill flow: popover/bottom-sheet · recent customers · undo-before-commit (ตาม Q-spec) · cancel confirm บอก stock คืน |
| 6 | quick-create parity ทุกจุด · sticky bulk action bar · duplicate error ไทย inline (ไม่ใช่ toast อย่างเดียว) |
| 7 | dashboard การ์ดวันนี้ (§4.4) · analytics/reports disposition (§3) · เลขเงิน RM format เดียว |
| 9 | `/live-selling` banner เชื่อม FB (§3) · settings หน้า FB connect ชัดเจน ไม่โชว์ secret |
| 10A–B | §4.2 layout · nav badge · notifications wiring · settings team mgmt (ปิด M4) |
| 10C | §4.3 ทั้งหมด · follow-up hub |
| 10D | AI label ทุก draft · suggestion review queue UI · AI log ใน /activity |
| 12 | ไม่มี UI ใหม่ — แต่ error message ทุก dangerous transition ต้องเป็นไทยอ่านรู้เรื่อง |
| 14 | กวาด §2 ครบทุกหน้าเก่า · table→card มือถือ · `<img>`→`next/image` 8 จุด (M1) + G11 · stub-page rule (§3) · onboarding guide · global search (candidate F-new) · keyboard shortcuts (candidate) |

---

## §6 New feature candidates พบจาก re-audit (ยังไม่ commit — Boss เลือกตอนถึง phase)

| # | Candidate | Phase ที่เหมาะ | เหตุผล |
|---|---|---|---|
| C1 | Global search (ลูกค้า/ออเดอร์/รหัสสินค้า จาก header ทุกหน้า) | 14 | admin หาของเร็วขึ้นมาก; โครง API search มีบางส่วนแล้ว |
| C2 | Keyboard shortcuts (j/k เลื่อนแชท, r ตอบ, b จองให้) | 14 | power admin เร็วขึ้น; ทำหลัง flow นิ่ง |
| C3 | ~~PWA installable + push~~ → **GRADUATED เป็น ROADMAP Phase 16** (2026-06-10) | 16 | ดู `2026-06-10-mobile-app-plan.md` — committed plan แล้ว ไม่ใช่ candidate |
| C4 | Slip auto-read AI (spec F20) | หลัง 12 | Page365 parity; ต้องการ payment hardening ก่อน |
| C5 | Stock ใกล้หมดแจ้งใน live (board badge "เหลือ 2") | 3 | กัน oversell ระหว่างไลฟ์ — เสนอใส่ Phase 3 เลยถ้า data พร้อม |

---

## §7 Engineering debt ที่ผูกเข้า phases แล้ว (จาก audit M/L/G)

| Debt | ผูกเข้า |
|---|---|
| M1 `<img>` 8 จุด + G11 remotePatterns | Phase 14 |
| M2 exhaustive-deps 3 จุด (เสี่ยง refetch loop) | Phase 12 hygiene — แก้ทีละจุด + test |
| M4 settings dead team state | Phase 10B team mgmt |
| L6–L11 unused imports/consts | autonomous lane — กวาดตอนแตะไฟล์นั้น |
| G2 R2 lifecycle policy (Cloudflare dashboard) | Boss action queue — เพิ่มใน ROADMAP §7 |
| G9 UploadAudit table (R1 schema) | Phase 12 หรือ 13 — ตัดสินตอน audit |

---

*Canonical UX reference. ROADMAP §5 phases + inbox spec ชี้มาที่นี่. Update เมื่อ Boss verdict เปลี่ยน design.*
