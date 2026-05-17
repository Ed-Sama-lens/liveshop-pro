# Session handoff for next Claude — liveshop-pro

**Filed:** 2026-05-17
**Master HEAD at filing:** `5a4b6f2cb27c0fbddbb7e6c548ef619e9ac68b46`
**Purpose:** Self-contained handoff for a fresh Claude session. Next Claude should be able to continue without reading old chat history.

---

## 1. Executive summary

| Field | Value |
|---|---|
| Project | **liveshop-pro** (NOT pak-ta-kra) |
| Repo | `github.com/Ed-Sama-lens/liveshop-pro` |
| Local path | `C:\Users\Asus\COWORK\code\liveshop-pro` |
| Domain | `nazhahatyai.com` |
| Stack | Next.js 16 + TypeScript 5 strict + Prisma 7 + PostgreSQL on Railway + Vercel + Cloudflare R2 + Tailwind + shadcn/ui + Vitest + Playwright |
| Currency | MYR (RM) — NOT THB |
| Branch model | single `master` ; feat/* per task ; PR-first ; rebase merge convention |

### Current goal

Complete the Live Commerce / omnichannel booking system before onboarding real admins or customers. App is **not yet in real use**. Boss is intentionally completing the system end-to-end before opening to real ops.

### Current production HEAD

`5a4b6f2cb27c0fbddbb7e6c548ef619e9ac68b46`

### Current production flag state

| Flag | Value |
|---|---|
| `ALLOW_BOOKINGIDS_ONLY_CONVERSION` | **true** (D3) |
| `ALLOW_NON_LIVE_BOOKING` | **true** (D4) |
| `ALLOW_EVERGREEN_BROADCAST_PRODUCT` | **true** (D6) |

All three flags ON in Vercel Production. Set by Boss in prior sessions.

### Current production health

- 15/15 unauth smoke probes PASS at master `5a4b6f2` (most recent).
- `/robots.txt` 200 with `User-Agent: * Disallow: /` body.
- `/sitemap.xml` 404 (no metadata route yet; policy deferred per Boss = Option A).
- All `/api/sale/*` auth-gated correctly.
- All security headers present (CSP / HSTS / Permissions-Policy / Referrer-Policy).

### Current blockers

1. **PR #14 review + merge** — Boss + ChatGPT.
2. **D4/D6 functional smoke** — Boss-side admin UI only. Claude cannot use admin credentials.
3. **Stock decrement decision X/Y/Z** — Boss verdict. Current recommendation: Y (decrement on CONFIRMED).
4. **Tier 4.1 Messenger receive-only PR** — needs Boss approval + Meta App Secret/Page Access Token freshness check.
5. **Phase B unblock** — BLOCKED until functional smoke + observation passes.
6. **Sitemap policy** — Boss verdict. Default = Option A (defer / no sitemap).
7. **Functional smoke** — blocked by auth (hard no-go on Claude requesting admin creds).

---

## 2. What has landed

### Schema + backend

| PR / commit | Title | Master SHA |
|---|---|---|
| **PR #1** | `feat(sale)` PR2 omnichannel booking schema/backend migration | merged earlier (`a5d13e8` plan + later commits) |
| **D1 migration** | Production Prisma migration `20260514000000_sale_omnichannel_booking` applied via Railway direct connection. Pre-migration snapshot taken via `pg_dump` (local backups/ gitignored). Verified schema state. | applied 2026-05-14 |
| **D3 flag flip** | `ALLOW_BOOKINGIDS_ONLY_CONVERSION=true` enabled in Vercel Production by Boss. | env-only |

### UI / Routes

| PR | Title | Master SHA | Status |
|---|---|---|---|
| **PR #3** | `feat(sale): tier1 ui omnichannel consolidation` | `d0df01c` | MERGED |
| **PR #4** | `feat(sale): add product code management from stock` (Tier 3) | `1720b1d` | MERGED |
| **PR #5** | `docs(sale): plan tier3.5 bp update/delete + tier4 inbound receive` | merged in `16ad655` | MERGED |
| **PR #6** | `feat(sale): tier3.5 broadcast product update + delete` (backend) | `071ea00` | MERGED |
| **PR #7** | `test(e2e): add production unauth smoke harness` | `c13c9eb` + `ff7e6dd` (rebase tail) | MERGED |
| **PR #8** | `fix(seo): public robots.txt and sitemap.xml middleware bypass` | `3d59b87` | MERGED |
| **PR #9** | `chore(ops): gitignore local-only emergency scripts` | `636d1d4` | MERGED |
| **PR #10** | `docs(sale): tier5 parser plan + 2026-05-15 overnight handoff` | `54cdb9c` | MERGED |
| **PR #11** | `feat(sale): unify live sales workspace` (Tier 1.5 sidebar + layout) | `eba64cf` | MERGED |
| **PR #12** | `feat(sale): add product code edit + delete UI` (Tier 3.6) | `6a035e5` | MERGED |
| **PR #13** | `docs(sale): readiness audit + tier4 plan + sitemap + observability + handoff` | `5a4b6f2` | MERGED |
| **PR #14** | `docs(sale): boss smoke checklist + stock decision + tier4.1 plan + handoff` | `c1ccce0` (branch) | **OPEN** |

### Key milestones

- Omnichannel schema migration applied to production (Q-1..Q-20 + M-1 decisions cleared).
- Booking source enum: MANUAL / LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT / IMPORT / SYSTEM.
- `BroadcastProduct.shopId` NOT NULL, `BroadcastProduct.liveSessionId` nullable, partial unique index for evergreen `(shopId, displayCode) WHERE liveSessionId IS NULL`.
- `Booking.liveSessionId` nullable; FK `ON DELETE SET NULL`.
- V2 bookingIds-only conversion path with idempotency key v2 namespace `sale-conv:v2:{shopId}:{customerId}:{sha256-16}`.
- Tier 3 + Tier 3.5 + Tier 3.6 unlock full BroadcastProduct CRUD via API + admin UI.
- Tier 1.5 unified workspace: single sidebar entry `ขายของไลฟ์สด` → `/sale`; `/live-selling` hidden from sidebar but reachable for LiveSession CRUD.

---

## 3. Current production state

| Item | Value |
|---|---|
| Master HEAD | `5a4b6f2` |
| Vercel last deploy | SUCCESS for master `5a4b6f2` |
| Production smoke | 15/15 PASS (latest) |
| `/robots.txt` | 200 + correct body (Tier-1.5 PR #8 fixed) |
| `/sitemap.xml` | 404 (no metadata route; policy deferred Option A) |
| `/sale` unauth | 307 → sign-in |
| `/api/sale/broadcast-products` GET/POST/PATCH/DELETE | all auth-gated (401 unauth) |
| Production data | Boss-only test records: 1 Shop, 1 User (OWNER), 1 Customer (Boss self), 2 LiveSession, 2 ProductVariant, 0 BroadcastProduct, 0 Booking, 0 Order |
| Real customer data | NONE in production |
| Test data created by Claude | NONE |

### Backup snapshot

Local file: `backups/backup-pr2-d1-20260514-132409.dump` (117KB, gitignored). Taken pre-D1 migration via `pg_dump -Fc` through Docker `postgres:18-alpine` connected via `DATABASE_PUBLIC_URL` from Railway. SHA-256: `151f5cb6b24063516e7f1e7050bed64fcaa1b585735e99dd8c5947b7a4df5cae`.

---

## 4. Open PR

### PR #14

| Field | Value |
|---|---|
| URL | https://github.com/Ed-Sama-lens/liveshop-pro/pull/14 |
| Title | `docs(sale): boss smoke checklist + stock decision + tier4.1 plan + handoff` |
| Branch | `docs/post-pr12-pr13-handoff` |
| Head commit | `c1ccce0` |
| Risk | R2 (docs-only) |
| Files | 4 new docs, 881 lines |

Contains:

1. `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
2. `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
3. `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
4. `docs/superpowers/2026-05-15-post-pr12-pr13-handoff.md`

**Recommended action:** verify docs-only before merge (no src/, no schema, no env). If clean → merge via rebase. No production deploy effect.

---

## 5. Functional smoke status

❌ **D4/D6 functional smoke is NOT done.**

Reason: blocked by admin auth. Claude must NOT request or use admin credentials, cookies, session, or storageState. Hard no-go.

### Boss action required

Boss runs the smoke through admin UI per:

`docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`

Step-by-step:

- **Step A** — Create test BroadcastProduct via Add from Stock dialog (displayCode `TEST-D6-001`).
- **Step B** — Edit dialog smoke (Tier 3.6 PR #12 — priceOverride + isPinned).
- **Step C** — Create non-live MANUAL booking against TEST-D6-001 for Boss customer.
- **Step D** — Confirm booking. Verify reservedQty +1.
- **Step E** — Optional cancel test with a second booking.
- **Step F** — Convert via V2 `POST /api/sale/orders/from-bookings` with `bookingIds[]` only. Replay for idempotency.
- **Step G** — Verify all rows + state.

Boss reports back:
- BroadcastProduct displayCode + ID
- Booking ID(s)
- Order ID + Order Number
- Replay idempotent yes/no
- reservedQty observed
- Screenshots / errors if any step failed

If smoke FAIL → Claude opens hotfix branch.
If smoke PASS → record IDs + proceed to stock decision + Phase B discussion.

---

## 6. Stock decrement decision

**File:** `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`

### Three options

| Option | Trigger | Pros | Cons |
|---|---|---|---|
| **X** — Decrement on DELIVERED | Order status → DELIVERED | Matches admin mental model; reservedQty stays accurate | Depends on admin marking DELIVERED; tracking integration absent |
| **Y** — Decrement on CONFIRMED (recommended) | Order status → CONFIRMED (payment verified) | Reliable admin touchpoint; simpler audit; no tracking dependency | Physical-vs-digital window during PROCESSING/SHIPPED |
| **Z** — Manual via `/inventory` | Admin adjusts after each shipment | Zero code change; maximum flexibility | Doesn't scale; admin forgetfulness causes drift |

### Current recommendation

**Option Y.** Implementation phases Y.0-Y.7 detailed in memo. Critical for real admin onboarding at moderate volume.

### Boss decision pending

No code change until Boss picks X/Y/Z. Stock decrement is currently NOT wired — `ProductVariant.quantity` never drops on DELIVERED. Acceptable today because production has zero real orders.

---

## 7. Tier 4.1 Messenger receive-only plan

**File:** `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`

### Scope

Receive-only Messenger webhook. Persist `Conversation` / `ChannelIdentity` / `Message` rows from FB Page inbox + post comments. NO outbound. NO parser auto-booking (that's Tier 5).

### Key design

- New route `GET/POST /api/webhooks/messenger`
- HMAC SHA-256 verification of body with `FACEBOOK_APP_SECRET` (timing-safe compare)
- Idempotency via `Message.externalMessageId` unique constraint (P2002 catch on retry)
- Replay protection: reject events > 7 days old or > 1 hour future
- New flag `ALLOW_MESSENGER_WEBHOOK_RECEIVE` default false (ships behind flag; Boss flips after Page subscription tested)
- Estimated ~1500 lines new code (route + repo + helpers + tests + verifier + handoff)

### Required env (all already in `src/lib/env.ts`)

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET` (HIGH sensitivity — used for HMAC)
- `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (challenge handshake)
- `FACEBOOK_PAGE_ACCESS_TOKEN` (rotates ~60 days per project memory)
- NEW: `ALLOW_MESSENGER_WEBHOOK_RECEIVE` default false

### Boss approval gates (must clear before PR opens — § 16 of plan)

- [ ] `FACEBOOK_APP_SECRET` current in Vercel Production
- [ ] `FACEBOOK_PAGE_ACCESS_TOKEN` not expired
- [ ] `Shop.facebookPageId` filled for `nazha-hatyai`
- [ ] Meta App "Live" mode OR Boss test Page added as App Tester
- [ ] Approve flag name + PII policy + rate limit policy + rollout

---

## 8. Phase B status

**BLOCKED.**

Do NOT unblock until:
1. PR #14 reviewed + merged
2. D4/D6 functional smoke passes (Boss-side)
3. Observation window clean (24h+ post-smoke)
4. Stock decrement decision understood (Option X/Y/Z chosen)
5. Boss + ChatGPT explicit Phase B unblock verdict

---

## 9. Recommended next-session order

**A.** Review and merge PR #14 if docs-only + green.
**B.** Boss runs D4/D6 functional smoke via admin UI per checklist.
**C.** If smoke FAILS → Claude opens hotfix branch (`fix/sale-tier3.6-smoke-<topic>` or similar) + diagnose.
**D.** If smoke PASSES → record IDs (BP / Booking / Order) + start 24h+ observation.
**E.** Boss decides stock decrement model X/Y/Z. Recommend Y.
**F.** Only after E → discuss Phase B unblock.
**G.** If Boss approves Tier 4.1 (gates in § 16 of plan) → Claude opens `feat/tier4.1-messenger-webhook-receive`.
**H.** Continue admin onboarding readiness:
- `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- Add password-change UI before real admin invite
- Decide observability lightweight wins (request-id middleware + Vercel cron smoke + Telegram alert)

---

## 10. What NOT to do next

- ❌ Do not run Phase B yet
- ❌ Do not mutate real customer data (none exists; treat all as real if uncertain)
- ❌ Do not use raw SQL seed for test data
- ❌ Do not request or use admin secrets / cookies / storageState / tokens
- ❌ Do not touch checkout / payment / shipping runtime without stock decision
- ❌ Do not start Tier 5 parser runtime before Tier 4 receive-only ships
- ❌ Do not send outbound customer messages (Boss explicit no-go)
- ❌ Do not touch pak-ta-kra (separate project)
- ❌ Do not merge risky PRs without smoke/tests
- ❌ Do not delete `/live-selling` routes — still own LiveSession CRUD until Tier 2 fold ships
- ❌ Do not fix `/robots.txt` (already fixed PR #8)
- ❌ Do not flip any feature flag without runbook
- ❌ Do not push directly to master — PR-first always
- ❌ Do not commit emergency scripts / backup dump / storageState / screenshots / test-results / playwright-report

---

## 11. Local artifacts and safety

### Backup dump

- File: `backups/backup-pr2-d1-20260514-132409.dump`
- Status: local-only, gitignored via `.gitignore` line `backups/`
- Origin: pre-D1 Railway production `pg_dump -Fc` via Docker `postgres:18-alpine`
- SHA-256: `151f5cb6b24063516e7f1e7050bed64fcaa1b585735e99dd8c5947b7a4df5cae`
- Size: 117KB
- Retention: 30 days post-D6 success → delete (Boss schedule)
- **Never upload / commit / print contents**

### Emergency scripts

Three local-only ops scripts:
- `scripts/check-user-full.ts`
- `scripts/reset-admin-password.ts`
- `scripts/rotate-db-password.ts`

Status: PERMANENT gitignored via PR #9. Even `git add scripts/*.ts` silently ignored. Touch credentials at runtime; not safe to share. Boss may move out of repo per `docs/superpowers/2026-05-15-local-ops-scripts-policy.md`.

### storageState / screenshots / test artifacts

Not present. Gitignored via:
- `tests/e2e/.auth/`
- `tests/e2e/screenshots/`
- `test-results/`
- `playwright-report/`

### Local-only branches (forensics-preserved)

- `docs/robots-middleware-gated-followup` — superseded by merged PR #8; Boss can delete.
- Various merged feat branches (`feat/sale-omnichannel-booking-pr2`, `feat/sale-tier1-ui-omnichannel`, etc) — retained per `--delete-branch=false` convention.

### Railway CLI token

Boss revoked the temporary Project Token used for D1 migration. Token dead. If new session needs Railway access: Boss creates fresh Project Token via Railway dashboard, paste into chat (or store in user-scope `RAILWAY_TOKEN` env var via PowerShell `[System.Environment]::SetEnvironmentVariable`), revoke after use.

---

## 12. Latest verification

| Check | Result |
|---|---|
| Production smoke (15-probe) after PR #13 merge | 15/15 PASS |
| Master HEAD | `5a4b6f2` |
| Vercel last deploy | SUCCESS |
| Production DB mutation by Claude | NONE this session |
| Authenticated production POST | NONE this session |
| Booking / Order / BroadcastProduct created in production | NONE ever |
| Checkout / payment / shipping change | NONE this session |
| Parser / inbound runtime change | NONE |
| pak-ta-kra touch | NONE |
| Forbidden file commits | NONE |

---

## 13. New-session startup checklist

When fresh Claude session starts:

1. **Read this handoff first.**
   `docs/superpowers/2026-05-15-session-handoff-for-next-claude.md`
2. **Verify repo state:**
   ```
   git status --short
   git checkout master
   git pull --ff-only origin master
   git log --oneline -10
   ```
3. **Confirm master HEAD matches `5a4b6f2`** (or newer if PR #14 merged).
4. **List open PRs:**
   ```
   gh pr list --state open --json number,title,headRefOid,mergeable,statusCheckRollup
   ```
   - Expect PR #14 open unless Boss merged.
5. **Run production smoke** (15-probe pattern from `tests/e2e/prod-unauth-smoke.spec.ts` or curl loop). Expect 15/15 PASS.
6. **Confirm flag state in Vercel Production via Boss verification** (or assume unchanged from this handoff if Boss confirms no env edits).
7. **Read these cross-reference docs as needed:**
   - `docs/superpowers/2026-05-15-post-pr12-pr13-handoff.md` (previous handoff)
   - `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md` (smoke runbook)
   - `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md` (Boss decision pending)
   - `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md` (next implementation PR plan)
   - `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md` (readiness verdict)
   - `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md` (gaps)
   - `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md` (flag rollback procedure)
8. **Do NOT act on production mutation until Boss confirms** functional smoke result or explicitly approves next implementation step.
9. **Confirm CLAUDE.md rules active:**
   - `C:\Users\Asus\COWORK\code\liveshop-pro\CLAUDE.md` — NO MAGIC / VERIFY / DISSENT 4-bullet / SCOPE / R0-R1-R2
   - This is `liveshop-pro` not pak-ta-kra; global pak-ta-kra-biased skill routing does not apply.
10. **CAVEMAN MODE active by default** (per session-start hook). Terse responses; code/commits/security in normal English. "stop caveman" to disable.

---

## 14. Quick reference — Key file paths

### Schema

- `prisma/schema.prisma` — single source of truth
- `prisma/migrations/20260514000000_sale_omnichannel_booking/migration.sql` — D1 omnichannel migration

### Backend

- `src/server/repositories/booking.repository.ts` — Booking CRUD + V1/V2 conversion
- `src/server/repositories/broadcast-product.repository.ts` — BP CRUD (Tier 3 + Tier 3.5)
- `src/lib/validation/booking.schemas.ts`
- `src/lib/validation/sale.schemas.ts`
- `src/lib/validation/broadcast-product.schemas.ts`
- `src/lib/sale/feature-flags.ts` — 3 flags
- `src/lib/sale/booking-rules.ts` — V2 idempotency key helper
- `src/lib/env.ts` — env zod schema
- `src/lib/auth/permissions.ts` — RBAC + PUBLIC_PATHS

### Routes

- `src/app/api/sale/bookings/route.ts` (GET + POST)
- `src/app/api/sale/bookings/[bookingId]/confirm/route.ts`
- `src/app/api/sale/bookings/[bookingId]/cancel/route.ts`
- `src/app/api/sale/orders/from-bookings/route.ts` (V1 + V2)
- `src/app/api/sale/broadcast-products/route.ts` (GET + POST, Tier 3)
- `src/app/api/sale/broadcast-products/[id]/route.ts` (PATCH + DELETE, Tier 3.5)
- `src/app/api/sale/live-sessions/[liveSessionId]/broadcast-products/route.ts` (legacy GET)
- `src/app/api/sale/live-sessions/route.ts`
- `src/app/api/sale/customers/search/route.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/proxy.ts` — middleware
- `src/app/robots.ts` — robots metadata route (PR #8)

### UI

- `src/app/(app)/sale/page.tsx` — `/sale` page
- `src/components/sale/SaleWorkspaceShell.tsx` — orchestrator (Tier 1.5 layout)
- `src/components/sale/SaleProductGridPlaceholder.tsx` — Product Codes panel (Tier 3 + 3.6)
- `src/components/sale/SaleBookingQueuePlaceholder.tsx` — Booking Queue
- `src/components/sale/AddFromStockDialog.tsx` — Add BP dialog (Tier 3)
- `src/components/sale/EditProductCodeDialog.tsx` — Edit/delete BP dialog (Tier 3.6)
- `src/components/sale/BookingSourceChip.tsx` — Source pill (Tier 1)
- `src/components/sale/SaleSourceFilterChips.tsx` — Filter chips (Tier 1)
- `src/components/sale/ManualCreateBookingDialog.tsx` — Manual booking dialog
- `src/components/shared/SidebarNav.tsx` — sidebar config (Tier 1.5 collapsed entry)

### Tests

- `tests/e2e/prod-unauth-smoke.spec.ts` — 16-case unauth smoke harness (PR #7)
- `tests/e2e/manual-create-phase-a.prod-smoke.spec.ts` — authenticated Phase A smoke
- `tests/unit/components/sale/` — sale component + helper tests
- `tests/unit/lib/validation/` — zod schema tests
- `tests/unit/lib/auth/permissions.test.ts` — RBAC tests
- `tests/unit/app/api/sale/` — route mock tests

### Docker verifiers

- `scripts/verify-booking-flow.ts` — 9/9 confirm/cancel/integrity
- `scripts/verify-booking-create.ts` — 13/13 createManual
- `scripts/verify-booking-conversion.ts` — 8/8 V1 + V2 conversion
- `scripts/verify-order-reservation-cleanup.ts` — 5/5
- `scripts/verify-expire-reservations-cron.ts` — 1/1
- `scripts/verify-omnichannel-booking.ts` — 5/5 omnichannel A-E
- `scripts/verify-broadcast-product-crud.ts` — 16/16 BP CRUD A-P

All gated by `CONFIRM_NON_PROD_DB=true` + host deny-list (junction.proxy.rlwy.net / rlwy.net / nazhahatyai).

### Plan + handoff docs

- `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`
- `docs/superpowers/2026-05-13-sale-omnichannel-booking-migration-plan.md`
- `docs/superpowers/2026-05-14-sale-omnichannel-booking-pr2-handoff.md` — D1 runbook
- `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- `docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md`
- `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- `docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md`
- `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md`
- `docs/superpowers/2026-05-14-sale-tier1-ui-handoff.md`
- `docs/superpowers/2026-05-14-comment-to-booking-parser-plan.md` — Tier 5
- `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md` — Tier 4 initial
- `docs/superpowers/2026-05-14-production-smoke-harness-plan.md`
- `docs/superpowers/2026-05-15-sale-unified-workspace-handoff.md`
- `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- `docs/superpowers/2026-05-15-observability-error-tracking-plan.md`
- `docs/superpowers/2026-05-15-sitemap-policy-plan.md`
- `docs/superpowers/2026-05-15-tier4-receive-only-implementation-plan.md` — refined Tier 4
- `docs/superpowers/2026-05-15-unified-workspace-continuation-handoff.md`
- `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
- `docs/superpowers/2026-05-15-stock-decrement-decision-memo.md`
- `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
- `docs/superpowers/2026-05-15-post-pr12-pr13-handoff.md`
- `docs/superpowers/2026-05-15-local-ops-scripts-policy.md`
- `docs/superpowers/followups/2026-05-14-public-robots-middleware-gated.md`
- `docs/superpowers/2026-05-14-hygiene-followups-disposition.md`

---

## 15. Hard rules (CLAUDE.md summary)

From `C:\Users\Asus\COWORK\code\liveshop-pro\CLAUDE.md`:

1. **NO MAGIC** — never assume. Verify code / API shape / env before claiming.
2. **VERIFY BEFORE DONE** — evidence before claims. Banned: "should work", "this is correct", "fixed". Use "tsc clean (ran)", "X/Y tests pass (paste)".
3. **DISSENT 4 bullets BEFORE first edit on MAJOR** — schema/auth/API/payment/R2/CSP/currency/>3 files/>200 LOC. Skip for single file <50 lines.
4. **SCOPE DRIFT GUARD** — flag "while I'm here / let's also". STOP + ask before expanding scope.
5. **R0/R1/R2 REVERSIBILITY**:
   - **R0** (STOP ASK FIRST): force push master, prisma migrate reset, DROP TABLE, secret rotation, R2 mass delete, order data deletion, mass email, deploy with failing tests, FB App live mode change.
   - **R1** (DO + EXPLAIN): Prisma migration, public API signature change, CSP header change, currency/pricing logic, add Vercel env var, rename feature flag.
   - **R2** (JUST DO): comment / typo / internal helper / test / lint / docs.

---

## 16. Final state confirmation

- ✅ Docs-only handoff
- ✅ No code change
- ✅ No production action
- ✅ No env change
- ✅ No PR merge
- ✅ No secrets exposed
- ✅ No pak-ta-kra touch
- ✅ Master HEAD unchanged at `5a4b6f2`

End of handoff.
