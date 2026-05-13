# Phase A Closeout — Manual Create empty-queue fix + Playwright production smoke

**Status:** `PATCH_ACCEPTED` + `PHASE_A_PARTIAL_ACCEPTED` + `NOT_FULL_PHASE_A_PASS`
**Date:** 2026-05-13
**Author:** Claude Opus 4.7 (corrected per Boss/ChatGPT 2026-05-13 review)
**Predecessors:**
- `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md` (bug discovery)
- `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md` (V Rich research)

---

## Why "PARTIAL_ACCEPTED" not "PASS"

Boss/ChatGPT 2026-05-13 review flagged the prior `PHASE_A_PASS` wording as inaccurate. The original Phase A scope approved Steps 0–9. Step 7 was BLOCKED by production test-data limitation (no BroadcastProduct rows in auto-selected LiveSession) and Steps 8–9 were NOT RUN as a consequence.

**Correct status hierarchy (Boss spec):**

| Code | Meaning |
|---|---|
| `PATCH_ACCEPTED` | Commit `2f52e01` (empty-queue fix) is accepted: tsc clean, vitest 801/801, mutation grep 4 POSTs, smoke 15/15, production behavior corrected. |
| `PHASE_A_PARTIAL_ACCEPTED` | Core UI, auth, Manual Create visibility, modal mount, customer search, PII whitelist, and zero-mutation guard passed. |
| `NOT_FULL_PHASE_A_PASS` | Product picker / quantity clamp / summary block remain blocked by missing BroadcastProduct test data — NOT by code defects. |

A future rerun against a LiveSession seeded with ≥1 BroadcastProduct row will cover Steps 7–9 without further code change.

---

## Patch accepted — recap

| Field | Value |
|---|---|
| Commit | `2f52e01 fix(sale): show manual create action in empty booking queue` |
| Parent | `3dd72c7` (Manual Create harden) |
| Pushed to | `origin/master` |
| Vercel deploy | `GuNYb34pX` Ready (Current Production) |
| Files changed | `src/components/sale/SaleBookingQueuePlaceholder.tsx` (+26/-19) |
| Schema change | none |
| New route | none |
| Mutation surface | unchanged (4 POSTs: Confirm + Cancel + CreateOrder + ManualCreate) |
| Verification | tsc clean (2 pre-existing socket errors only) / vitest 801/801 across 40 files / mutation grep 4 / production smoke 15/15 |

### What the patch changed

Pre-patch (`SaleBookingQueuePlaceholder.tsx`): on `state.bookings.length === 0`, early-return rendered only an empty-state message. The dashed-border strip that hosts Create Order + Manual Create buttons never mounted → admin couldn't seed the first booking on a fresh session.

Post-patch: empty hint moved inline; strip block always mounts when `state.kind === 'ready'`. Booking-row list hidden via `hidden` class when empty. Subtitle updated:

> "ยังไม่มีรายการจอง — กดสร้าง booking เองด้านล่างเพื่อเริ่ม"

Empty-state hint copy updated:

> "ยังไม่มีลูกค้าจองในรอบนี้ — เริ่มจองจาก inbox/comment เมื่อพร้อม หรือกดสร้าง booking เองด้านล่าง."

### Production smoke (15/15)

Probed against `https://nazhahatyai.com` post-deploy:

| # | Probe | Expected | Got |
|---|---|---|---|
| 1 | `GET /` | 307 | ✅ 307 |
| 2 | `GET /favicon.ico` | 200 | ✅ 200 |
| 3 | `GET / (Cookie NEXT_LOCALE=th, -L)` | 200 | ✅ 200 |
| 4 | `GET / (Cookie NEXT_LOCALE=zh, -L)` | 200 | ✅ 200 |
| 5 | `GET /login` | 307 | ✅ 307 |
| 6 | `GET /admin` | 307 | ✅ 307 |
| 7 | `GET /sale` | 307 | ✅ 307 |
| 8 | `GET /api/sale/live-sessions` (unauth) | 401 | ✅ 401 |
| 9 | `GET /api/sale/live-sessions/dummy/broadcast-products` (unauth) | 401 | ✅ 401 |
| 10 | `GET /api/sale/bookings?liveSessionId=dummy` (unauth) | 401 | ✅ 401 |
| 11 | `GET /api/sale/customers/search?q=test` (unauth) | 401 | ✅ 401 |
| 12 | `POST /api/sale/bookings/dummy/confirm` (unauth) | 401 | ✅ 401 |
| 13 | `POST /api/sale/bookings/dummy/cancel` (unauth) | 401 | ✅ 401 |
| 14 | `POST /api/sale/orders/from-bookings` (unauth) | 401 | ✅ 401 |
| 15 | `POST /api/sale/bookings` (unauth) | 401 | ✅ 401 |

Zero 5xx. Zero 429. Auth gates fire correctly before any DB touch.

---

## Phase A Step-by-step corrected table

| # | Step | Status | Screenshot | Notes |
|---|---|---|---|---|
| 0 | Auth/session in place | **PASS** | `00-login-or-session.png` | storageState restored. `/sale` accessible. |
| 1 | `/sale` + 6 panels visible | **PASS** | `01-sale-page-loaded.png` | All 6 panel titles found. Booking GET resolved before screenshot. |
| 2 | Manual Create button visible | **PASS** | `02-manual-create-button.png` | Fix confirmed live. Button visible despite empty booking queue. |
| 3 | Modal opens | **PASS** | `03-manual-create-modal-open.png` | DialogTitle visible. Form fields rendered. CONFIRMED radio absent. Submit disabled (form invalid). |
| 4 | Customer search + GET response | **PASS** | `04-customer-search-network.png` | `GET /api/sale/customers/search?q=war&limit=20` → 200. |
| 5 | PII whitelist verification | **PASS** | `05-customer-search-pii-whitelist.png` | 18 forbidden keys assertion — none observed. 6 allowed keys verified per row. |
| 5b | Banned customer state | **NOT_AVAILABLE** | (overlap with 06) | No banned customer in result set for "war". Spec marks NOT_AVAILABLE per Boss D2 rule. Acceptable. |
| 6 | Customer selected | **PASS** | `07-customer-selected.png` | Test customer selected. Clear button visible. |
| 7 | Product picker | **BLOCKED** | (no separate screenshot — modal still shown) | Auto-selected session `cmp1fszdo000004jmli3qvf33` has zero BroadcastProduct rows. Modal displays "ไม่มี BroadcastProduct ในรอบนี้". Spec graceful `test.skip` with reason logged. **Test-data limitation, not code defect.** |
| 8 | Quantity clamp | **NOT RUN** | — | Blocked by Step 7 |
| 9 | Summary block | **NOT RUN** | — | Blocked by Step 7 |

## Network safety result

| Metric | Value |
|---|---|
| Total `/api/*` requests captured by network guard | 5 (live-sessions, broadcast-products, bookings, notifications/count, notifications/stream) + customers/search GET in modal step |
| Methods seen | GET only |
| Mutation request count (POST/PUT/PATCH/DELETE against `/api/sale/*` or `/api/customers*`) | **0** |
| Forbidden-method violations | 0 |

Network guard listener `attachNetworkGuard()` records every `/api/*` event and asserts at end of test. Spec design = single intentional GET surfaces during Phase A inspection; Submit never clicked; cancel button used to close modal.

## PII whitelist result

| Field | Value |
|---|---|
| Endpoint | `GET /api/sale/customers/search?q=war&limit=20` |
| Status | 200 |
| Rows inspected | 1 |
| Allowed keys observed | `customerId, name, phone, email, isBanned, orderCount` |
| Forbidden keys observed | **none** — all 18 of `address, district, province, postalCode, labels, notes, channel, facebookId, bannedReason, shopId, shippingType, lifetimeValue, createdAt, updatedAt, rawPayload, platformUserId, platformThreadId, metadata` confirmed absent |

## Test-data blocker (separate)

To unblock Steps 7–9 in a future Phase A rerun, the production DB needs **one of**:

- (a) Existing LiveSession (LIVE or SCHEDULED) with ≥1 BroadcastProduct row, **or**
- (b) Boss creates a test BroadcastProduct row pointing to a safe test ProductVariant with throwaway stock count

After seeding, env override `PHASE_A_SEARCH_TERM=<customer-prefix>` lets the spec match a known test customer. Full Steps 0–9 expected to pass.

**No code change required to unblock.** No schema change. No new route.

---

## Scope confirmation

NO:
- Submit clicked
- POST/PUT/PATCH/DELETE against `/api/sale/*` or `/api/customers*` during Phase A
- Booking created
- Confirm / Cancel / Create Order action
- Production DB mutation
- Customer-facing message
- Push / deploy beyond `2f52e01`
- Schema / migration
- Vercel env modification
- pak-ta-kra change

---

## Recommendation

1. Accept patch + PARTIAL Phase A as documented.
2. Treat full Phase A as blocked until test data exists.
3. **Do NOT proceed to Phase B** (mutation steps 10–13) without:
   - Explicit Boss GO
   - Enumerated safe test data (customer / variant / live session)
   - Separate spec with `PHASE_B_APPROVED=yes` env gate
4. Curated harness commit per Option D — Playwright config + setup + spec + bug followup doc + this closeout. Emergency credential/rotation scripts stay local.
5. Next PR slice (proposed, NOT started): `sale-ux-ia-consolidation` — UI/IA layer per V Rich gap analysis. No backend mutation. No schema. No new APIs. See `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`.

---

## Cross-references

- Patch commit: `2f52e01`
- Bug discovery: `docs/superpowers/followups/2026-05-13-manual-create-button-hidden-on-empty-queue.md`
- V Rich UX/IA + omnichannel booking gap analysis: `docs/superpowers/2026-05-13-vrich-reference-gap-analysis.md`
- Manual Create design: `docs/superpowers/2026-05-12-sale-manual-create-booking-design.md`
- Manual Create readiness audit: `docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md`
- Manual Create POST harden (Round 1 push): `3dd72c7` + `docs/superpowers/2026-05-13-sale-manual-create-booking-readiness.md`
- Phase A spec: `tests/e2e/manual-create-phase-a.prod-smoke.spec.ts` (uncommitted at time of this doc)
- Playwright prod-smoke config: `playwright.prod-smoke.config.ts` (uncommitted)
- Setup script: `tests/e2e/setup-prod-auth.ts` (uncommitted)
- Authenticated manual test checklist: `docs/superpowers/2026-05-12-sale-authenticated-manual-test-checklist.md`
