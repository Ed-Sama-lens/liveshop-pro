# Unified Inbox — Feature Spec + AI-Assist Design (Phase 10 detail)

**Filed:** 2026-06-10 · **Status:** DESIGN ONLY — no runtime, no schema migration in this doc
**Owns:** ROADMAP.md Phase 10 detail (sub-phases 10A–10F) + AI/Claude integration design
**Research base:** Oho Chat, Page365, Zwiz, CommentSold, SleekFlow, Respond.io, Chatwoot Captain + 2026 human-in-the-loop patterns (sources §8)

---

## §1 Research summary — what the market has (verified 2026-06-10)

| Platform | Standout features relevant to us |
|---|---|
| **Oho Chat** (TH) | Auto-assign "จราจร" — routes chats by **status + team** automatically; team split with manager oversight + measurable per-admin performance; customer case statuses; CRM customer DB; personalized broadcast omnichannel |
| **Page365** (TH) | CF detection from live comments → auto-invoice; order statuses (รอจ่าย/โอนแล้ว/รอส่ง); **slip auto-verification**; FB+LINE+IG chat merge |
| **CommentSold** (US) | Comment "sold" → cart hold; real-time inventory overlay on live; waitlist when sold out; automated invoicing; push notifications |
| **SleekFlow / Respond.io** | Assignment from first message; collaborators + handover notes + @mention; **lifecycle stages** on customer; AI agents that route, update lifecycle, summarize; SLA metrics |
| **Chatwoot Captain** (OSS) | Agent copilot: draft/improve/translate reply in editor; **conversation summarization**; label (tag) suggestions; "Memories" — retained customer context; FAQ suggestions from resolved conversations |
| **HITL patterns 2026** | Draft-first for ALL outbound until correction rate low; **batch approval** for low-risk actions (10–50 queued with rationales); **one-by-one approval** for money/commitments/public comms; confidence-based escalation; rejections feed back as learning |

**Gap none of them fill for us:** none are saleDate-first, none integrate booking→order→stock as the primary pipeline. That stays our differentiator — inbox features must serve the sale pipeline, not replace it.

---

## §2 Feature shortlist for liveshop-pro (prioritized)

### Tier 1 — core organization (sub-phase 10B)

| # | Feature | Why | Risk |
|---|---|---|---|
| F1 | **Conversation status pipeline** — `NEW / WAITING_REPLY / WAITING_PAYMENT / FOLLOW_UP / CLOSED` (shop-configurable later) | ทุกแพลตฟอร์มมี; ตรงกับ flow แม่ค้า: ทัก→จอง→รอโอน→ตาม→จบ | R2 model + UI |
| F2 | **Assignment** — assign conversation to admin; unassigned pool; reassign with handover note | Oho/SleekFlow core; multi-admin teams need it | R2 |
| F3 | **Tags** — free-form + suggested; per conversation AND per customer | universal | R2 |
| F4 | **Internal notes** — admin-only notes on conversation + on customer | SleekFlow handover pattern | R2 |
| F5 | **Unread / priority flags** — manual pin + auto "needs reply" indicator | basic hygiene | R2 |
| F6 | **Quick replies** — saved templates w/ variables (ชื่อลูกค้า, ยอด, เลขบัญชี, saleDate), Thai-first | every platform; แม่ค้าพิมพ์ซ้ำเยอะสุด | R2 (drafts), outbound = Boss gate |

### Tier 2 — customer 360 (sub-phase 10C)

| # | Feature | Why | Risk |
|---|---|---|---|
| F7 | **Customer panel in chat context** — booking history, order history, total spend (MYR), last saleDate, outstanding payment | Page365/CommentSold pattern; admin ไม่ต้องสลับหน้าจอ | R2 (read-only joins) |
| F8 | **Customer lifecycle stage** — `NEW / REPEAT / VIP / RISKY / BLOCKED` (manual first, rule-assist later) | Respond.io lifecycle; feeds Phase 8 auto-confirm trust decisions | R2 model; rules = R1 |
| F9 | **Customer merge across channels** — same person on FB + TG + WA → one profile | Phase 11 prerequisite; identity model already planned 10A | R1 (merge semantics) |
| F10 | **Follow-up reminders** — per customer/conversation: due date + reason; "ตามโอนพรุ่งนี้" one click from chat | Oho ไม่พลาดดีล; แม่ค้าลืมตามลูกค้า = ยอดหาย | R2 |

### Tier 3 — AI assist layer (sub-phase 10D — the Claude layer, see §3)

| # | Feature | HITL mode |
|---|---|---|
| F11 | Conversation summarization (Thai) — on demand + on assignment handover | read-only output |
| F12 | Reply drafts — AI drafts, admin edits/approves, NEVER auto-send | one-by-one approval |
| F13 | Auto-tag + status suggestions | batch approval |
| F14 | Booking suggestion from message (extends existing parser plan) — "ลูกค้าขอ CM12 x2" → prefilled booking card | one-by-one (creates booking = money-adjacent) |
| F15 | Follow-up draft generation — unpaid booking → payment reminder draft queue | batch draft, one-by-one send |
| F16 | **Daily digest** — สรุปเช้า: แชทค้างตอบ, booking ค้างโอน per saleDate, ลูกค้าควรตาม, anomaly (over-alloc, stock ติดลบ) | read-only report |

### Tier 4 — scale features (sub-phase 10E/10F)

| # | Feature | Risk |
|---|---|---|
| F17 | Auto-assign rules (Oho "จราจร") — route by status/channel/keyword to team queue | R1 (after manual assignment proven) |
| F18 | Broadcast / personalized blast | R1 + outbound Boss gate — LAST |
| F19 | SLA + admin performance metrics — first-response time, resolved count, per-admin load | R2 (read-only analytics) |
| F20 | Slip auto-read assist (AI reads slip image → amount/date/bank suggestion vs expected) | R1, candidate only — Page365 parity, defer until Phase 12 hardening done |

**Rejected for now:** customer-facing chatbot auto-reply (outbound risk, Thai nuance), built-in live video (FB native is fine), translation helper (defer until non-Thai customer volume real).

---

## §3 AI/Claude integration design (the part that makes Claude able to help manage)

### Design principle

Claude is an **admin copilot, not an autonomous actor**. Every AI output lands in a reviewable queue. No AI writes to booking/order/stock/outbound directly. This matches 2026 HITL best practice (draft-first until correction rate is "boringly low") and our hard no-go list.

### 3.1 The `AiSuggestion` queue (core mechanism)

One table drives all AI assist features (F11–F16). Design sketch (NOT a migration — Phase 10D PR will carry the real one + dissent):

```prisma
model AiSuggestion {
  id             String   @id @default(cuid())
  shopId         String   // shop boundary — always scoped
  type           AiSuggestionType // REPLY_DRAFT | TAG | STATUS | BOOKING | FOLLOW_UP | SUMMARY | DIGEST
  conversationId String?  // nullable: digest is shop-level
  customerId     String?
  payload        Json     // type-specific: draft text / tag list / booking fields
  rationale      String   // WHY the AI suggests this — shown to admin (HITL requirement)
  confidence     Float?   // 0-1; UI sorts low-confidence to manual review
  status         AiSuggestionStatus // PENDING | APPROVED | EDITED | REJECTED | EXPIRED
  reviewedById   String?  // admin who acted
  reviewedAt     DateTime?
  editedPayload  Json?    // what admin actually used (feedback signal)
  source         String   // "claude-code" | "api" | model id — audit trail
  createdAt      DateTime @default(now())
}
```

Invariants (test-pinned when built):
- Suggestion approval **creates a draft action**, never an outbound send (send stays manual per hard no-go).
- BOOKING-type approval opens the prefilled booking form — admin still clicks save (one-by-one).
- TAG/STATUS approvals can be batch (low-risk, reversible).
- All rows shop-scoped; cross-shop read = denied at service layer.
- REJECTED rows kept (not deleted) — they are the feedback corpus.

### 3.2 How Claude connects — 3 stages, increasing integration

| Stage | Mechanism | What Claude can do | Gate |
|---|---|---|---|
| **C1 — scripts (build with 10B)** | Non-prod verifier-style scripts (`scripts/ai/*.ts`) run by Claude Code locally against dev DB; output = markdown report / seed AiSuggestion rows in dev | Daily digest in dev, summarize test conversations, validate the suggestion pipeline end-to-end before any prod exposure | R2 — dev only |
| **C2 — internal API (with 10D)** | `/api/ai/*` routes: `GET /api/ai/context/conversation/:id` (redacted context pack), `POST /api/ai/suggestions` (write suggestion only), `GET /api/ai/digest/:saleDate`. Auth = dedicated service token (Vercel env, Boss-set), rate-limited, audit-logged | Claude (any runner: Claude Code session, scheduled job) reads conversation context + posts suggestions into the queue | R1 — token is Boss-owned; routes ship with shop-scope + no-PII-beyond-need tests |
| **C3 — MCP server (post-launch, optional)** | Thin MCP server wrapping C2 endpoints as tools: `get_conversation_summary`, `list_pending_followups`, `draft_reply`, `suggest_booking` | Boss chats with Claude naturally ("สรุปแชทวันนี้", "ใครยังไม่โอนบ้าง") and Claude uses tools live | R1 — read tools + suggestion-write only; no send tool EVER in v1 |

### 3.3 Context pack (what AI sees — privacy by design)

`GET /api/ai/context/conversation/:id` returns ONLY:
- last N messages (text, direction, timestamp — no raw attachment URLs)
- customer: display name, lifecycle stage, tags, booking/order summary counts + amounts (MYR), outstanding payment flag
- saleDate context: product codes referenced, stock state
- NEVER: phone, address, slip images, payment details, other customers' data

Pin test: context pack serializer has an explicit allowlist; new fields require test update (prevents accidental PII widening).

### 3.4 Feedback loop

Weekly script aggregates: approval rate, edit distance on EDITED, rejection reasons → markdown report → tune prompts/rules. (No model training; prompt+rule tuning only.)

---

## §4 Schema additions overview (design-level, all Phase-10 PRs carry real migrations + dissent)

| Model | New/Extend | Sub-phase |
|---|---|---|
| `Conversation` | new — channel, externalId, shopId, customerId?, status, assigneeId?, priority, lastMessageAt | 10A (already in roadmap) |
| `Message` | new — conversationId, direction, text, raw payload ref, externalTs | 10A |
| `ChannelIdentity` | new — customerId?, channel, externalUserId, displayName | 10A |
| `ConversationNote` / `CustomerNote` | new | 10B |
| `Tag` + join tables | new | 10B |
| `FollowUp` | new — customerId, conversationId?, dueAt, reason, status, createdById | 10C |
| `Customer` | extend — lifecycleStage enum | 10C |
| `QuickReply` | new — shopId, title, body (variables) | 10B |
| `AiSuggestion` | new — §3.1 | 10D |

Rule: **one migration per PR**, dissent-4-bullet each, no destructive change, all backward-compatible adds.

---

## §5 Sub-phase plan (replaces flat Phase 10 order in ROADMAP)

### 10A — Foundation (unchanged from roadmap)
Read-only conversation list · identity model · message storage. **Precondition:** Phase 9 receive-only working.

### 10B — Organization (Tier 1: F1–F6)
1. [Claude] Schema PR: Conversation.status/assignee/priority + Tag + Notes + QuickReply (R1, dissent, one migration)
2. [Claude] Status pipeline UI (kanban-ish filter tabs on conversation list) + tests
3. [Claude] Assignment UI: assign/unassign/reassign + handover note + unassigned pool view
4. [Claude] Tags + notes UI · quick replies CRUD (insert into composer as draft — send button stays behind outbound gate)
5. [Boss] smoke: assign flow + status flow บน dev (Claude สอนไทยตอนถึง)
**DoD:** admin จัดระเบียบแชทได้: สถานะ, มอบหมาย, แท็ก, โน้ต, เทมเพลตตอบ

### 10C — Customer 360 (Tier 2: F7–F10)
1. [Claude] Customer panel in chat: bookings/orders/spend/outstanding (read-only joins, no schema)
2. [Claude] Schema PR: lifecycleStage + FollowUp (R1, dissent)
3. [Claude] Follow-up UI: create from chat 1 click · due list view · overdue indicator
4. [Claude] Lifecycle stage manual set + filter; rule-assist deferred to Phase 8 alignment
5. [Boss] smoke + decide merge semantics F9 (cross-channel merge = R1 question, Claude จะส่งตาราง Q ให้ตอบ)
**DoD:** เห็นลูกค้าครบในแชทเดียว · ไม่ลืมตามลูกค้า · แบ่งกลุ่มลูกค้าได้

### 10D — AI assist (Tier 3: F11–F16 + §3)
1. [Claude] Schema PR: AiSuggestion (R1, dissent)
2. [Claude] C1 scripts: digest + summarizer on dev data; validate queue end-to-end
3. [Claude] Suggestion review UI: pending queue, approve/edit/reject, batch ops for TAG/STATUS
4. [Claude] C2 API routes + service token design doc → [Boss] sets token in Vercel → enable
5. [Claude] Reply-draft + follow-up-draft generators (server-side, behind flag)
6. [Boss] smoke: review queue + approve flow
**DoD:** Claude สรุปแชท/ร่างตอบ/แนะนำแท็ก-booking ได้ โดยทุก action ผ่านมือ admin · audit ครบ

### 10E — Follow-through & outbound (Tier 4: F17–F18) — **Boss gate heavy**
Auto-assign rules → broadcast. Each = R1 + explicit Boss approve. Outbound send = separate hard gate per hard no-go list.

### 10F — Metrics (F19)
SLA/per-admin dashboards — read-only analytics, R2, anytime after 10B data exists.

---

## §6 Design checklist (apply to every 10x PR)

- [ ] Shop boundary enforced at service layer + test
- [ ] No PII in AI context beyond §3.3 allowlist + test
- [ ] All AI writes go through AiSuggestion — zero direct mutation paths + test
- [ ] Outbound send paths behind `INBOX_OUTBOUND_ENABLED` flag default false + test
- [ ] Thai-first labels, English fallback
- [ ] Mobile layout (admin ตอบแชทบนมือถือ)
- [ ] One migration per PR, dissent-4-bullet, backward-compatible
- [ ] scrutinize self-review before merge (operating contract §3 ROADMAP)

---

## §7 Open questions for Boss (ตอบตอนถึง 10B/10C/10D — ยังไม่ต้องตอบตอนนี้)

| Q | คำถาม | Default ถ้าไม่ตอบ |
|---|---|---|
| Q1 | สถานะแชทเริ่มต้น 5 ตัว (NEW/WAITING_REPLY/WAITING_PAYMENT/FOLLOW_UP/CLOSED) พอไหม หรืออยากเพิ่ม/เปลี่ยนชื่อไทย | ใช้ 5 ตัวนี้ |
| Q2 | ทีมแอดมินมีกี่คน มีการแบ่งทีม (เช่น ทีมขาย/ทีมแพ็ค) ไหม — กระทบ design assignment | single pool ไม่แบ่งทีม |
| Q3 | lifecycle stage: นิยาม VIP/RISKY ของ Boss คืออะไร (ยอดซื้อ? จำนวนครั้ง? เบี้ยว?) | manual set เท่านั้น |
| Q4 | Daily digest อยากได้ช่องทางไหน (หน้า dashboard / LINE ส่วนตัว / email) | dashboard ก่อน |
| Q5 | Slip auto-read (F20) สนใจไหม หรือตัดทิ้ง | candidate, ไม่ทำจนกว่าสั่ง |

---

## §8 Sources

1. [Oho Chat — what is Oho Chat](https://help.oho.chat/user-manual/what-is-oho-chat) + [Auto Assign blog](https://www.oho.chat/blog/auto-assign-hub-blog-chat-management) — auto-assign by status+team, team oversight
2. [Page365](https://www.page365.net/) — CF auto-invoice, order statuses, slip verification
3. [CommentSold live selling](https://try.commentsold.com/features/live-selling/) — comment→cart, waitlist, automated invoicing
4. [SleekFlow inbox](https://sleekflow.io/inbox) + [Respond.io comparison](https://respond.io/blog/sleekflow-vs-respondio) — assignment, collaborators, lifecycle stages, AI agents that route/summarize, SLA
5. [Chatwoot Captain](https://www.chatwoot.com/captain/) + [Captain docs](https://www.chatwoot.com/hc/user-guide/en/categories/captain) — copilot drafts, summarization, label suggestions, memories
6. [HITL AI agents 2026 (getclaw)](https://getclaw.sh/blog/human-in-the-loop-ai-agents-approvals-2026) + [Plivo HITL patterns](https://www.plivo.com/blog/human-in-the-loop-patterns-for-ai-customer-service-in-production/) — draft-first, batch vs one-by-one approval, confidence escalation

---

*Design only. Runtime PRs follow ROADMAP Phase 10 gates. This file = Phase 10 canonical detail.*
