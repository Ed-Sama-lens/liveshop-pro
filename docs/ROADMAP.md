# LiveShop Pro — Master Roadmap to 100%

**Canonical roadmap. Single source of truth.**
**Created:** 2026-06-10 · **Baseline:** master `b3ceb56` · **Author:** Claude (per Boss directive + ChatGPT phase summary 2026-06-10)
**Supersedes:** scattered phase plans in `docs/superpowers/` handoffs (those remain as detail references, this file owns sequencing + status).

---

## §0 How to use this file (Opus 4.8 — read this first)

1. **Session boot:** read this file top-to-bottom once per session before any roadmap work. Then read `docs/superpowers/2026-05-25-goal-deep-audit-handoff.md` if you need finding-level detail.
2. **Find the active phase:** §4 Phase Index — first phase with status `▶ ACTIVE` or `READY`. Never skip a `BLOCKED-BOSS` gate.
3. **Work the phase:** follow its task list in §5. Tasks are ordered. Each task says WHO does it (`[Claude]` or `[Boss]`).
4. **Update this file** when a phase status changes (PR merged, Boss verdict received). Status edits to this file = docs-only, commit direct or via PR.
5. **Self-review rule (Boss directive 2026-06-10):** Codex/ChatGPT review is RETIRED (token exhausted). After every major deliverable, Claude MUST self-review using the `scrutinize` skill (outsider-perspective end-to-end review), fix findings, and only then merge. CI green + scrutinize pass = merge authority for in-scope PRs.
6. **Reporting language:** all reports/questions/teaching to Boss = ภาษาไทย เข้าใจง่าย. Code/commits/paths/errors stay English.
7. **When blocked on a `[Boss]` task:** produce a step-by-step Thai walkthrough (this file already contains them — point Boss at the right section, don't re-derive).

### Status legend

| Status | Meaning |
|---|---|
| ✅ DONE | Completed + verified, evidence recorded |
| ▶ ACTIVE | Currently being worked |
| READY | Preconditions met, can start immediately |
| BLOCKED-BOSS | Needs a Boss action/verdict before any work |
| BLOCKED-PHASE | Needs an earlier phase to finish first |
| HELD | Explicitly held until Boss says `IMPLEMENT NOW` |

### Risk legend (gates)

| Level | Meaning | Rule |
|---|---|---|
| R2 | Safe additive (docs/tests/helpers/flag-default-false) | Claude autonomous, merge on CI green + scrutinize |
| R1 | Production-visible behavior / schema / runtime wiring | Boss verdict required BEFORE merge |
| R0 | Irreversible (prod data mutation, mass delete, bucket policy, paid) | Boss explicit per-action token, 2-step confirm |

---

## §1 Verified current state (2026-06-10, evidence-backed)

### App identity

- **Product:** Live Commerce / Live Selling SaaS admin (`nazhahatyai.com`), Next.js 16 + TS 5 strict + Prisma 7 + PostgreSQL + next-intl + Tailwind/shadcn + Vitest + Playwright. Deploy = Vercel auto on master push. Storage = Cloudflare R2 (`images.nazhahatyai.com`).
- **Core principle:** `/sale` is a unified sales workspace keyed by **saleDate** (NOT live-session-bound). Supports pre-live, during-live, off-live selling.
- **End vision:** FB Page live selling + FB Inbox + post comments + manual sales + Telegram/WhatsApp later + Oho-style unified inbox + message → customer → booking → order.

### What is DONE and merged (master `b3ceb56`)

| Area | State | Evidence |
|---|---|---|
| Security: R2 slip signed URL (10-min expiry, clamped) | ✅ | `src/lib/upload/storage.ts` `getSignedReadUrl` |
| Security: upload path traversal guard | ✅ | `assertSafeKey` + tests |
| Security: magic-bytes mime sniff (R2 G6) | ✅ | `src/lib/upload/mime-sniff.ts` + 25 tests (PR #157) |
| Security: deleteFile non-404 error logging (R2 G5) | ✅ | PR #158 |
| V Rich 3.10-B mapper (`BoardViewModel`) | ✅ | PR #153 (WIRE-2) |
| V Rich WIRE-1 flag scaffold (`NEXT_PUBLIC_SALE_LAYOUT_V2`, default **false**) | ✅ | PR #152, `src/lib/sale/feature-flags.ts` |
| V Rich WIRE-2 `SaleBoardReadOnly` consumes `BoardViewModel` | ✅ | PR #153 |
| WIRE-4 Playwright scaffold (6 tests, triple-gated skip) | ✅ scaffold only | PR #160, `tests/e2e/v-rich-board-layout-v2.spec.ts` |
| saleDate grouping, AddFromStock, inventory quick-create, bulk Start/End | ✅ | Tier 3.x merged earlier |
| `/api/sale/summary` + range query + compact summary panel | ✅ | Tier 3.9 |
| Lint baseline | 0 errors / ~55 warnings | PR #155 |
| Full vitest | 1978/1978 PASS (91 files) | 2026-06-09 run |
| `npm run smoke:prod:unauth` | 17/17 PASS | 2026-06-09 run |
| Deep audit + 12 ranked recommendations | ✅ | `docs/superpowers/2026-05-25-goal-deep-audit-handoff.md` (PR #156) |
| R2 G8 prefix convergence plan (3 sub-phases) | ✅ plan only | `docs/superpowers/2026-05-25-r2-g8-prefix-convergence-plan.md` (PR #159) |

### What is OPEN / PENDING

| Item | State | Blocker |
|---|---|---|
| **PR #154** WIRE-3 shell flag gating (board renders behind flag in `SaleWorkspaceShell`) | OPEN, CI 5/5 green, mergeable, **pre-flight PASS** (tsc 0 / build 0 / 637 sale tests / no merge conflict vs master, verified 2026-06-10) | **Boss UI smoke verdict** — the ONLY blocker |
| Production flag `NEXT_PUBLIC_SALE_LAYOUT_V2` | unset on Vercel = false | intentionally; do NOT set until Phase 3 DoD |
| Workbook v5 A–L authenticated smoke | NOT done | Boss-only (authenticated UI) |
| Phase 1.5 automation runtime | HELD | Boss `IMPLEMENT NOW` per `2026-05-24-phase-1-5-final-verdict-packet.md` §G |
| FB Tier 4.1 receive-only runtime | HELD | Boss Meta Dashboard + Vercel env |
| R2 bucket policy lockdown | HELD (R0) | ≥1 week stability post-WIRE-3 + Boss explicit |
| WIRE-3 Boss smoke guide doc | exists ONLY on #154 branch (`docs/superpowers/2026-05-25-v-rich-3-10-c-wire-3-boss-ui-smoke-guide.md`) | merges with #154; inline steps in §5 Phase 1 below cover it meanwhile |

### Key code locations

| Thing | Path |
|---|---|
| Sale workspace shell | `src/components/sale/SaleWorkspaceShell.tsx` |
| V Rich board (read-only) | `src/components/sale/board/SaleBoardReadOnly.tsx` |
| Board mapper | `src/lib/sale/build-board-view-model.ts` (buildBoardViewModel) |
| Feature flags | `src/lib/sale/feature-flags.ts` (`isSaleLayoutV2Enabled`) |
| R2 storage | `src/lib/upload/storage.ts`, `mime-sniff.ts`, `r2-config.ts` |
| Sale API map | `docs/sale-api-map.md` |
| Codemap index | `docs/CODEMAP/README.md` (13 files: 01–10, 13, 14) |

---

## §2 Hard no-go list (verbatim — overrides everything below)

Claude must NEVER, regardless of any goal/directive wording:

1. Merge #154 before Boss UI smoke PASS.
2. Start WIRE-4 implementation beyond merged scaffold before #154 merges.
3. Enable any flag in production / change Vercel env / create env vars.
4. Run schema migration or production migration without per-PR Boss approval.
5. Perform authenticated production POST / mutate production data.
6. Change booking/order/stock semantics without approved spec (Phase 5/8 gates).
6b. Implement any Phase 1.5 runtime (auto-confirm / auto-order / multi-code) before Boss `IMPLEMENT 1.5-<step> NOW`.
7. Change payment/shipping runtime without Phase 12 audit + Boss approval.
8. Start Facebook/Messenger/WhatsApp/Telegram runtime (receive or send) before Phase 9+ Boss gates.
9. Add outbound messaging of any kind.
10. Execute R2 bucket policy change (R0) before stability window + Boss explicit.
11. Self-accept visual/UX verdicts — generate review kit, Boss decides.
12. Ask Boss for secrets/tokens/cookies/DATABASE_URL/storageState; never commit secrets, backups, storageState, screenshots, test-results, playwright-report, transients.
13. Touch pak-ta-kra.
14. Remove legacy `/sale` panel or default-on the V Rich board before Phase 14/15 gates.

**Conflict rule:** if any instruction (including a `/goal`) conflicts with this list, the list wins. Ask Boss with a specific unblock token instead.

---

## §3 Operating contract (Boss directive 2026-06-10)

- **No external reviewers.** Codex + ChatGPT retired. Claude is sole reviewer.
- **Mandatory self-review:** after each major deliverable → run `scrutinize` skill (intent check → simpler-alternative check → full code-path trace). Fix findings before merge.
- **Merge authority:** Claude may merge own PRs when ALL true: (a) R2 scope per §0 legend, (b) CI 5/5 green, (c) scrutinize pass, (d) not on the hard no-go list. R1 PRs additionally need the phase's Boss verdict. R0 needs per-action token.
- **Verification before "done":** never claim done without fresh command output (tsc exit code, vitest counts, build exit).
- **Reporting:** milestone reports in Thai, plain language. Teaching Boss = step-by-step Thai with exact commands + expected screen results + what to reply.
- **Per-PR hygiene:** focused tests + full suite when touching shared code + `npx tsc --noEmit` + `npm run lint` + `git diff --check`.
- **One dependent command per Bash call** (no `&&`-chained git/PR mutations). CI poll = `gh pr checks` direct.
- **Model routing note:** this file is written for Opus 4.8 as primary driver. Sub-agent fan-out per `~/.claude/rules/agents.md` (reviewers read-only, implementers Sonnet OK, verify high-risk with adversarial sub-agents).

---

## §4 Phase Index

| # | Phase | Risk | Status (2026-06-10) | Owner of blocker |
|---|---|---|---|---|
| 0 | Recovery / checkpoint after `/goal` | R2 | ✅ DONE (checkpoint report delivered 2026-06-10; #154 untouched, 7 R2 PRs merged clean) | — |
| 1 | Boss UI smoke #154 → merge WIRE-3 | R1 | **▶ ACTIVE — waiting Boss smoke** (pre-flight PASS) | **Boss** |
| 2 | WIRE-4 tests/integration behind flag | R2 | BLOCKED-PHASE (needs #154 merged) | — |
| 3 | V Rich read-only stabilization (preview) | R2+visual | BLOCKED-PHASE (needs Phase 2) | Boss for visual verdicts |
| 4 | Workbook v5 A–L Boss smoke | manual | READY any time (independent) | **Boss** |
| 5 | V Rich 3.10-D manual slot fill/cancel | R1 | BLOCKED-BOSS (spec approval first) | Boss |
| 6 | Product/Inventory completion polish | R2 | READY (parallel-safe with 1–4) | — |
| 7 | Sale summary / analytics hardening | R2 | READY (parallel-safe) | — |
| 8 | Phase 1.5 auto-confirm/auto-order/multi-code | R1 | HELD until Boss `IMPLEMENT 1.5-X-Y NOW` | Boss |
| 9 | FB Tier 4.1 receive-only foundation | R1 | BLOCKED-BOSS (Meta Dashboard + Vercel env) | Boss |
| 10 | Oho-style unified inbox | R1 | BLOCKED-PHASE (needs 9) | — |
| 11 | Telegram / WhatsApp expansion | R1 | BLOCKED-PHASE (needs 10) | — |
| 12 | Payment/shipping/order hardening | R2 audit → R1 fixes | READY (audit part parallel-safe) | — |
| 13 | Security / production readiness | R2 audit; bucket = R0 | partially READY (checklist); bucket HELD | Boss for R0 |
| 14 | Admin UX polish / launch prep | R2 + Boss walkthrough | BLOCKED-PHASE (needs 1–7, 12, 13) | Boss |
| 15 | Launch / controlled rollout | R0-adjacent | BLOCKED-PHASE (needs 14) | Boss |

**Recommended execution order:** 1 → 2 → (4 ‖ 6 ‖ 7 ‖ 12-audit in parallel) → 3 → 5 → 8 (when ordered) → 9 → 10 → 11 → 12-fixes → 13 → 14 → 15.

**Claude-autonomous lanes (work these whenever the active gate is waiting on Boss):** Phase 6, Phase 7, Phase 12 audit part, Phase 13 checklist part, plus docs/tests/fixtures/verifier/codemap anywhere.

---

## §5 Phase detail

---

### Phase 0 — Recovery / checkpoint ✅ DONE

Delivered 2026-06-10: branch=master `b3ceb56` clean; #154 open untouched; 7 R2 PRs (#155–#161) reviewed via deep review + merged; zero hard no-go violations; tests evidence vitest 1978/1978, smoke:prod:unauth 17/17. No further action.

---

### Phase 1 — Boss UI smoke #154 → merge WIRE-3 ▶ ACTIVE

**Goal:** verify flag-gated V Rich board renders correctly in local dev, then merge #154.
**Pre-flight (Claude, DONE 2026-06-10):** tsc EXIT=0 · lint 0 errors · `npm run build` EXIT=0 · sale tests 637/637 · dev server boots 855ms · `/sale` unauth → 307 sign-in (middleware correct) · merge dry-run vs master = no conflict.

#### [Boss] Task 1.1 — UI smoke (10–15 นาที) — สอนละเอียด

**เตรียม (ครั้งเดียว):**
```bash
cd /c/Users/Asus/COWORK/code/liveshop-pro
git fetch origin feat/v-rich-3-10-c-wire-3-shell-gating
git switch -c smoke/wire-3 origin/feat/v-rich-3-10-c-wire-3-shell-gating
npm install
```

**รอบ 1 — flag ปิด (default):**
```bash
npm run dev
```
- เปิด browser → `http://localhost:3000/sale` → login admin ตามปกติ
- ✅ ต้องเห็น panel "รหัสสินค้า" แบบเดิม (legacy)
- ✅ ต้อง **ไม่เห็น** "Sale Board (V Rich style) — preview"
- ✅ หน้าตาเหมือนเดิมทุกอย่าง
- เสร็จแล้วกด `Ctrl+C` ใน terminal

**รอบ 2 — flag เปิด:**
- Git Bash: `NEXT_PUBLIC_SALE_LAYOUT_V2=true npm run dev`
- PowerShell: `$env:NEXT_PUBLIC_SALE_LAYOUT_V2='true'; npm run dev`
- refresh `http://localhost:3000/sale` แล้วเช็ค 7 ข้อ:

| # | เช็ค | ต้องเห็น |
|---|---|---|
| 1 | legacy panel "รหัสสินค้า" | ยังอยู่ ไม่หาย |
| 2 | board ใหม่ "Sale Board (V Rich style) — preview" | โผล่เพิ่ม |
| 3 | คลิก pill (ชิปรหัสสินค้า) | drawer/รายละเอียดเปิด |
| 4 | ใน drawer | อ่านอย่างเดียว — **ไม่มี**ปุ่มบันทึก/ยกเลิก/ช่องกรอก |
| 5 | กด F12 → แท็บ Network → filter Fetch/XHR → คลิก pill หลายอัน | มีแต่ GET — **ห้ามมี** POST/PUT/PATCH/DELETE ไป `/api/` |
| 6 | กด F12 → Console | ไม่มี error สีแดง |
| 7 | กด Ctrl+Shift+M (มุมมองมือถือ) เลือก iPhone | board ไม่ล้นจอ อ่านได้ |

**รอบ 3 — ปิด flag ย้อนกลับ:** หยุด server, รัน `npm run dev` ธรรมดา, refresh → board หายไป เหลือ legacy เท่านั้น

**ตอบกลับ:**
- ผ่านทุกข้อ → พิมพ์บอก Claude: `WIRE-3 UI smoke PASS — merge approved`
- ไม่ผ่าน → บอก: ข้อไหน fail / เห็นอะไร / error ใน Console (copy มาวางได้เลย)

#### [Claude] Task 1.2 — after verdict

- PASS → merge #154 (squash, delete branch) → run full vitest on master → update §4 status → proceed Phase 2.
- FAIL → fix ONLY CSS/copy/layout/read-only gating on the branch (no new runtime), push, ask Boss re-smoke. Repeat.

**DoD:** Boss PASS · #154 merged · post-merge full vitest green · production unchanged (env still unset).

---

### Phase 2 — WIRE-4: tests/integration behind flag (R2)

**Preconditions:** #154 merged.
**Already merged:** Playwright scaffold (PR #160) — 6 e2e tests, triple-gated skip (`RUN_V_RICH_E2E=1` + flag + storageState file).

#### [Claude] Tasks

1. Component integration tests (Vitest + Testing Library, NOT Playwright — no auth needed):
   - flag false ⇒ shell renders legacy only (pin exact panel set)
   - flag true ⇒ board appears alongside legacy
   - read-only: board subtree contains zero `<input>/<textarea>/<select>` and zero mutation buttons
   - empty-slot click = no-op (no state change, no fetch)
   - mock fetch asserts zero POST/PUT/PATCH/DELETE from board interactions
   - booking/order/payment controls in legacy panels unchanged with flag on
2. Docs: `docs/superpowers/<date>-sale-layout-v2-flag-guide.md` — how to enable flag in local/dev/preview (NOT production), how to run the gated Playwright suite, troubleshooting.
3. Run scrutinize → merge when CI green.

**Forbidden:** production flag, Vercel env, legacy removal, default-on, fill/cancel, drag/drop, stock/order semantics.

**[Boss] optional:** run the gated Playwright suite once locally (Claude will provide exact Thai steps when scaffold becomes runnable — needs Boss one-time login to create `tests/e2e/.auth/boss-dev-storage-state.json`, never committed).

**DoD:** integration tests merged · flag-false regression locked by tests · flag-true behavior documented · zero production change.

---

### Phase 3 — V Rich read-only stabilization (R2 + Boss visual)

**Preconditions:** Phase 2 done.

#### [Claude] Tasks

1. Audit board data correctness against repository truth (unit-test each):
   - stock count = product truth
   - active bookings only (cancelled/history excluded from active slots)
   - over-allocation badge when bookings > stock
   - multi-qty booking renders per-unit slots
2. Empty/fallback states (component + test per state): no saleDate selected · no product codes · stock unknown · zero available · no active bookings · mapper error (ErrorBoundary already wraps — pin it).
3. UX copy pass (Thai primary) for board header/subtitle/drawer labels.
4. Responsive pass: assert layout classes for sm/md/lg breakpoints in tests where possible.
5. Scrutinize → PR → merge (R2: display-only changes).

#### [Boss] Task — visual review รอบสอง (~10 นาที)

Claude จะสร้าง review kit: รายการหน้าจอที่ต้องดู + จุดเช็ค (ภาษาไทย) หลัง task 1–4 เสร็จ. ขั้นตอนเหมือน Phase 1 รอบ 2 (เปิด flag local) แต่เน้นความถูกต้องของตัวเลข stock/booking กับความอ่านง่าย.

**DoD:** board readable · counts correct (test-pinned) · no mutation controls · flag-false untouched · Boss visual approve.

---

### Phase 4 — Workbook v5 A–L Boss smoke (manual, independent — can run ANY time)

**Reference:** `docs/superpowers/2026-05-24-admin-smoke-workbook-v5.md` (canonical steps live there).

**Sections:** A `/sale` date picker · B quick-create product codes · C AddFromStock (multi-select/defaults/hide-existing) · D bookings active/history · E cancel/confirm · F create order · G order detail · H compact summary panel · I `/inventory/new` quick-create · J inventory bulk Start/End · K known deferred features · L regression/cleanup notes.

#### [Boss] วิธีทำ (ทีละ section, พักได้)

- เริ่ม critical ก่อน: **B → E → F → I → K → L** (~20 นาที) ที่เหลือทำทีหลังได้
- เปิด workbook v5 ไฟล์ข้างบน → ทำตามทีละข้อ → จดผลเป็น `A-PASS`, `C-FAIL: <อะไร>` ฯลฯ
- ทำบน **local dev** (`npm run dev` + login) — ไม่ใช่ production
- ห้ามส่ง cookie/secret/storageState ให้ Claude — ส่งแค่ข้อความผล + screenshot

#### [Claude] After results

- Triage: R2 UI bugs → fix immediately (PR per fix, scrutinize, merge). Anything touching stock/order/payment behavior → STOP, write dissent-4-bullet, ask Boss.
- Update workbook with results + file follow-ups.

**DoD:** all sections PASS or triaged issue list · R2 fixes merged · risk items escalated not self-fixed.

---

### Phase 5 — V Rich 3.10-D manual slot fill/cancel (R1 — spec BEFORE code)

**Preconditions:** Phases 1–3 done. **BLOCKED-BOSS:** semantics approval.

#### [Claude] Task 5.1 — spec doc first (R2, can draft early)

`docs/superpowers/<date>-v-rich-3-10-d-fill-cancel-spec.md` answering ALL of:
slot→booking mapping · empty-slot click behavior · customer selection UX · quantity handling · stock reservation timing (reserve-on-fill vs on-confirm) · cancel = cancel booking vs release reservation · active/history view interaction · duplicate customer/code handling · over-alloc behavior · race/concurrency strategy (DB transaction + optimistic UI policy).
Each question: recommendation + alternatives + risk. End with verdict template for Boss (ตาราง Q1–Q10 ให้ Boss กา ✓ เป็นภาษาไทย).

#### [Boss] Task 5.2 — approve semantics (ตอบ Q1–Q10 ในไฟล์ spec)

#### [Claude] Tasks 5.3+ — strictly ordered after approval

repository/API audit → route design (api-and-interface-design) → non-prod tests FIRST (TDD) → UI skeleton behind flag → [Boss] manual smoke (Claude สอนไทยตอนถึง) → merge.

**Forbidden before approval:** any booking mutation, reservation behavior change, order creation change, production POST.

**DoD:** manual fill works · cancel releases correctly · stock consistent · race/duplicate/over-alloc tests pass · Boss smoke PASS.

---

### Phase 6 — Product/Inventory completion polish (R2 — autonomous lane)

**Preconditions:** none. Work whenever waiting on a Boss gate.

#### [Claude] Tasks

1. Terminology unification audit: product / variant / product code naming across UI + code + docs; fix drift (display-only).
2. Verify `/inventory/new` quick-create parity with `/sale` quick-create pattern; align UX if diverged (display-only).
3. Duplicate-code error copy: Thai primary + English + Chinese (Malaysia use) — extend existing P2002 translation pattern.
4. Verifier script for product-code flow (`scripts/` non-prod, pattern: existing verifier suite plan `2026-05-24-non-prod-verifier-suite-plan.md`).
5. Search/AddFromStock edge audit: paging, hide-existing correctness, duplicate suppression — tests.
6. Docs/codemap update for product creation model (`docs/CODEMAP/`).
7. Confirm product code usable for both live + off-live saleDates (tests at repository level).

**Forbidden:** new schema migration · new image upload scope · production mutation.

**DoD:** CM1–CM100 fast creation verified by tests · edit name/price/stock simple · AddFromStock no-dup · docs current.

---

### Phase 7 — Sale summary / analytics hardening (R2 — autonomous lane)

**Preconditions:** none.

#### [Claude] Tasks

1. Harden `/api/sale/summary`: edge-case tests — no bookings · all cancelled · pending vs confirmed mix · order created · paid/unpaid if modeled.
2. No-PII test: summary payload must never include customer name/phone/address — add pin test.
3. Money formatting: MYR/RM display correctness tests (existing i18n currency module, codemap 08).
4. Range UI plan doc (NOT build): how admin picks date ranges, what loads.
5. CSV/export plan doc (NOT runtime).
6. Thai/English admin labels audit on summary panel.

**Not yet:** big analytics dashboard · historical stock snapshots (schema not ready) · CSV runtime.

**DoD:** summary accurate per tests · range logic tested · zero PII in payloads (pinned) · labels clear.

---

### Phase 8 — Phase 1.5 automation (R1 — HELD)

**Trigger to start:** Boss message `IMPLEMENT 1.5-<step> NOW` per `docs/superpowers/2026-05-24-phase-1-5-final-verdict-packet.md` §G (Q1–Q8 verdict template).
**Scope when triggered:** trusted-customer auto-confirm · risky stays pending · auto-order append by shopId+customerId+saleDate · multi-code booking · outbound stays disabled.

**PR ladder (each = separate PR, Boss approves each runtime one):**
1. decision finalization doc → 2. schema migration (`Customer.autoConfirmEligible`, `Order.saleDate` if verdict requires — R1, dissent-4-bullet first) → 3. repository behavior + tests → 4. route tests → 5. UI controls behind flag → 6. non-prod verifier → 7. [Boss] smoke (Claude สอนไทย) → 8. production migration plan with snapshot/preflight (R0-adjacent — separate Boss token).

**Invariants (test-pinned before merge):** no append to PAID/CANCELLED orders · multi-code transactional · auto-confirm strictly opt-in per customer.

**DoD:** per verdict packet acceptance matrix + Boss approval each runtime PR.

---

### Phase 9 — Facebook Tier 4.1 receive-only foundation (R1)

**Reference:** `docs/superpowers/2026-05-24-meta-receive-only-runtime-readiness-refinement.md` + `2026-05-24-meta-webhook-signature-preflight-checklist.md`. Parser plan: `2026-05-14-comment-to-booking-parser-plan.md`.

#### [Boss] Task 9.1 — Meta + Vercel setup (Claude ห้ามแตะ secrets)

ทำตามไฟล์ refinement §1.1–§1.5:
1. Meta App Dashboard: สร้าง/ตั้งค่า app + webhook subscription (URL จะได้จาก Claude ตอน route พร้อม)
2. Vercel → Project → Settings → Environment Variables เพิ่มเอง:
   - `FACEBOOK_APP_SECRET` (จาก Meta dashboard)
   - `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (ตั้งค่า random ยาวๆ เอง เก็บไว้กรอก 2 ที่ให้ตรงกัน)
3. ตัดสินใจเรื่อง Page token storage (Claude จะเสนอ options เป็นไทยตอนถึง)
4. ตอบ Claude: `FB env set — AUTHORIZE Tier 4.1-A`

#### [Claude] Ladder (each step separate PR, receive-only, NO outbound ever in this phase)

1. env/schema/docs/tests only (schema = R1 dissent first) → 2. webhook GET verification route (challenge echo) → 3. POST signature validation + raw-body handling → 4. Page Inbox receive → storage → 5. post comments receive → 6. live comments receive/poll → 7. message → customer/conversation/message mapping (cross-shop safe) → 8. parser suggestion-only (no auto-confirm) → 9. one-click booking from suggestion (admin-initiated).

**Forbidden:** asking Boss to paste secrets in chat · setting env · enabling runtime before Boss authorize · outbound · auto-send.

**DoD:** webhook verified receive-only · messages stored + mapped safely · suggestions visible, never auto-acted.

---

### Phase 10 — Oho-style unified inbox (R1)

**Preconditions:** Phase 9 working. **Discovery doc exists:** `2026-05-13-omnichannel-live-commerce-inbox-discovery.md`, codemap 13.

**[Claude] order:** read-only conversation list → customer/channel identity model (schema = R1 gate) → message storage → notes/tags/status/assignment → message→booking link → one-click booking → quick replies draft-only → [Boss gate] outbound manual send → automation last.

**Boss approvals needed at:** every schema migration · channel runtime integration · outbound enable · production env · real-customer data handling decisions.

**DoD:** all channels in one list · conversation↔customer linked · booking from message works · outbound (if enabled) manual + approved only.

---

### Phase 11 — Telegram / WhatsApp expansion (R1)

**Preconditions:** Phase 10 foundation.
**[Claude] order:** provider abstraction (interface over FB implementation) → receive-only webhook per channel → channel identity mapping → message normalization → customer matching (safe merge rules) → booking suggestion → [Boss gate] manual outbound → automation last.
**Boss tasks:** Telegram Bot token / WhatsApp Business setup เอง (Claude สอนไทยตอนถึง — same secrets rule as Phase 9).
**DoD:** receive-only works both channels · appears in unified inbox · customer matching safe · booking manual first.

---

### Phase 12 — Payment / shipping / order hardening (audit=R2 now, fixes=R1)

**Preconditions for audit:** none — autonomous lane. **Reference:** `2026-05-15-order-payment-shipping-readiness-audit.md` (extend it).

#### [Claude] Audit + tests (R2)

Audit: order lifecycle · payment slip viewer post-signed-URL · shipping status transitions · create-order-from-booking · cancel/confirm booking · stock reservation/release.
Add dangerous-transition pin tests:
- paid order cannot be overwritten
- cancelled order cannot receive append
- payment-approved state immutable from sale flow
- slip access cross-shop denied (signed URL ownership check)
- order/customer shop boundary enforced

#### [Claude→Boss] Fixes

R2 fixes merge autonomously. Behavior-change fixes = R1 → dissent + Boss approve.

**DoD:** lifecycle stable · cross-shop safe · no raw slip URL anywhere · transition tests green.

---

### Phase 13 — Security / production readiness (checklist=R2, bucket=R0)

#### [Claude] Checklist sweep (R2, autonomous)

auth/RBAC · shop ownership on every route · cross-shop access tests · upload traversal (done — re-verify) · R2 signed URL (done — re-verify) · CSP/security headers (tests exist — extend) · rate limiting on mutation routes · error handling without leaks · logging without secrets · no-PII sweep · backup/snapshot plan doc · rollback plan doc · smoke scripts green.

#### [Boss] R0 bucket policy gate

เงื่อนไขก่อนทำ: WIRE-3 อยู่บน production อย่างน้อย 1 สัปดาห์แบบไม่มีปัญหา + Boss สั่ง explicit + ยืนยัน backup แล้ว. Claude จะเขียน plan + rollback ให้ก่อน, Boss กดยืนยัน 2 ขั้น.

**DoD:** checklist all pass · zero known high-severity · rollback documented · smoke suite stable.

---

### Phase 14 — Admin UX polish / launch prep

**Preconditions:** 1–7, 12, 13 done (8–11 optional for soft launch — decide with Boss).

**[Claude]:** label simplification (Thai primary, English secondary, Chinese product display for Malaysia) · loading/empty/error states sweep · mobile/tablet pass · onboarding guide · admin manual (Thai) · known-limitations page · backup/restore notes · support/debug checklist.

**[Boss]:** final UX walkthrough จริงทั้ง flow (Claude เตรียม script ไทยให้เดินตาม) · ซ้อมขายจริง 1 รอบบนข้อมูลทดสอบ · ตัดสินใจ launch readiness.

**DoD:** Boss ใช้ flow หลักได้ไม่งง · product code → booking → order ลื่น · ไม่มี critical UI confusion.

---

### Phase 15 — Launch / controlled rollout

**Order:** internal dry run → fake/test saleDate rehearsal → ONE small real sale session → monitor logs/errors → collect feedback → fix hot issues → expand.

**Forbidden early:** broad auto-confirm · outbound auto-send · multi-channel automation · removing legacy panel · default-on board without fallback.

**Rollback:** flag off (instant, env unset) · revert merge commit · Vercel instant rollback to previous deployment — document exact commands in Phase 13 rollback doc.

**DoD:** production stable through ≥1 real sale session · order/payment/stock zero critical issues · rollback path tested.

---

## §6 App-level Definition of Done (all must hold)

1. `/sale` = unified saleDate-first workspace ✅ (already true — keep invariant)
2. Product code creation fast (CM1–CM100) — Phase 6
3. AddFromStock / quick-create / bulk usable — Phase 6 + workbook PASS
4. V Rich board: pills · slots · read-only ✅→ manual fill/cancel (P5) → drag/drop (post-15 backlog)
5. booking → order flow stable — Phase 12 tests
6. stock reservation/release correct — Phase 12 tests
7. sale summary accurate — Phase 7
8. Phase 1.5 automation opt-in + safe — Phase 8 (when ordered)
9. FB receive-only live — Phase 9
10. unified inbox — Phase 10
11. Telegram/WhatsApp foundation — Phase 11
12. payment/shipping/order hardened — Phase 12
13. security readiness pass — Phase 13
14. workbook v5 pass — Phase 4
15. rollback/smoke/monitoring plan — Phase 13/15
16. controlled rollout executed — Phase 15

---

## §7 Boss action queue (สรุปสิ่งที่ Boss ต้องทำ เรียงตามลำดับ)

| ลำดับ | สิ่งที่ทำ | เวลา | ปลดล็อก | วิธี |
|---|---|---|---|---|
| 1 | UI smoke #154 | 10–15 นาที | Phase 1→2→3 ทั้งสาย V Rich | §5 Phase 1 Task 1.1 (ขั้นตอนไทยละเอียดอยู่ตรงนั้น) |
| 2 | Workbook v5 (critical B/E/F/I/K/L ก่อน) | 20–60 นาที | Phase 4 + ความมั่นใจ flow เดิม | เปิด `2026-05-24-admin-smoke-workbook-v5.md` ทำทีละข้อ |
| 3 | ตอบ spec Q1–Q10 fill/cancel | 15 นาที (หลัง Claude ส่ง spec) | Phase 5 | Claude จะส่งตารางให้กาเป็นไทย |
| 4 | Phase 1.5 verdict §G Q1–Q8 + `IMPLEMENT NOW` | 20 นาที | Phase 8 | `2026-05-24-phase-1-5-final-verdict-packet.md` |
| 5 | Meta Dashboard + Vercel env | 30–60 นาที | Phase 9–11 ทั้งสาย inbox | §5 Phase 9 Task 9.1 |
| 6 | R0 bucket policy confirm | 5 นาที (หลัง stability ≥1 สัปดาห์) | Phase 13 ปิดจบ | Claude เตรียม plan ให้กดยืนยัน |
| 7 | Final UX walkthrough + launch call | 1–2 ชม. | Phase 14–15 | Claude เตรียม script ไทย |

**กติกาตอบ:** ตอบสั้นๆ ได้เลย เช่น `WIRE-3 UI smoke PASS — merge approved` หรือ `B-PASS E-FAIL: กดยกเลิก booking แล้ว stock ไม่คืน`. Claude จัดการต่อเอง.

---

## §8 Verification command reference (Claude — run before every "done")

```bash
cd /c/Users/Asus/COWORK/code/liveshop-pro   # ALWAYS — never run vitest from parent dir (pak-ta-kra contamination)
npx tsc --noEmit                            # expect EXIT=0 (rm -rf .next first if stale generated types error)
npm run lint                                # expect 0 errors
npx vitest run <targeted-paths>             # focused first
npx vitest run                              # full suite when shared code touched — expect 1978+ pass, 0 fail
npm run build                               # expect EXIT=0
npm run smoke:prod:unauth                   # 17/17 — read-only prod checks only
git diff --check                            # no whitespace damage
gh pr checks <n>                            # CI poll direct (background notify unreliable)
```

---

## §9 Risk register / known issues

| Risk | Mitigation |
|---|---|
| Flag accidentally set in Vercel | Only Boss touches Vercel; flag readers test-pinned to default-false |
| Board shows wrong counts → admin mistrust | Phase 3 test-pins counts to repository truth before any default-on |
| Manual fill/cancel races (P5) | Spec-first; DB transactions; concurrency tests required pre-merge |
| FB webhook spoofing (P9) | Signature validation step 3 before any storage step |
| Cross-shop data leak in inbox (P10) | Shop boundary tests required at model step, before UI |
| Stale `.next` types break tsc | `rm -rf .next` then re-run (known Windows issue) |
| Vitest run from parent dir pollutes results | cwd-hygiene rule in §8 |
| WIRE-3 smoke guide only on #154 branch | Steps duplicated inline §5 Phase 1; merges with #154 |
| Reviewer-less workflow (Codex retired) | Mandatory scrutinize self-review + adversarial sub-agents on R1+ paths |

---

*End of roadmap. Update §4 statuses as phases complete. This file is the contract.*
