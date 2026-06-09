# Goal Deep Audit — Handoff & Findings

**Filed:** 2026-05-25 (Goal directive: ultrathink + deep test + UX review)
**Master baseline:** `94adfe8` (post WIRE-2 merge; WIRE-3 PR #154 awaiting Boss UI smoke)
**Status:** Audit pass — findings catalogued + R2 cleanup PR #155 opened

This doc captures what the deep audit found across the codebase. Goal directive = build per roadmap + debug + test + UX/UI review. Roadmap items requiring Boss verdict (Phase 1.5 runtime / V Rich beyond WIRE-3 / Tier 4.1 / bucket policy) remain HELD per directive boundaries.

---

## 1. Test baseline (post-Goal deep run)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **EXIT=0** |
| `npm run lint` (after #155) | **0 errors / 48 warnings** (was 55 before #155 — improvement -7) |
| **Full vitest** | **1978/1978 PASS** (91 files / 334s) |
| `tests/unit/lib/` subset | 1151/1151 PASS (48 files / 68.7s) |
| `npm run smoke:prod:unauth` | **17/17 PASS** (27.0s) |

Test surface healthy. No flakes. No skips. Auth test hoisting warning fixed (#155).

---

## 2. Roadmap state vs reality

### Shipped (master `94adfe8`)

| Item | PR | Status |
|---|---|---|
| R2 G3 PII risk fully closed | #137 + #146 + #147 | LIVE on production (Vercel auto-deployed) |
| R2 G4 path traversal guard | #138 | LIVE |
| R2 G1 lazy env validation | #139 + #147 | LIVE |
| Security header regression coverage | #140 | LIVE |
| Sale P2002 Thai parity | #141 | LIVE |
| Phase 1.5 final verdict packet | #142 | LIVE — awaiting Boss `IMPLEMENT NOW` per PR |
| V Rich Stage 3.10-B mapper | #149 | LIVE |
| V Rich Stage 3.10-C readiness audit | #150 | LIVE |
| Boss Decision Packet 3.10-C | #151 | LIVE |
| WIRE-1 flag scaffold | #152 | LIVE — `isSaleLayoutV2Enabled()` exists; not called yet by production code |
| WIRE-2 mapper consumption | #153 | LIVE — `SaleBoardReadOnly` consumes `BoardViewModel`; component unrendered in production |

### Open PRs (2)

| PR | Title | Status |
|---|---|---|
| #154 | WIRE-3 shell flag gating | **BLOCKED — Boss UI smoke verdict required** |
| #155 | Lint cleanup (this audit) | OPEN — R2, ready to merge |

### Blocked (Boss-gated)

| Item | Blocker |
|---|---|
| Phase 1.5-B-1-schema runtime | Boss explicit `IMPLEMENT 1.5-B-1 NOW` |
| Phase 1.5-C-* runtime | Same + B-series production-stable ≥1 week |
| Phase 1.5-D-1 multi-code | Boss `IMPLEMENT 1.5-D-1 NOW` |
| V Rich WIRE-3 merge | Boss UI smoke PASS on PR #154 |
| V Rich Stage 3.10-D Manual Create | Stage 3.10-C stable + Q4.4 verdict |
| Tier 4.1 Meta webhook runtime | Boss completes App Dashboard + Vercel env |
| R2 bucket policy refactor (R0) | Boss explicit + ≥1 week prod stability |
| Workbook v5 Sections A–L UI smoke | Boss-owned |

---

## 3. Audit findings — by severity

### HIGH — None

Codebase healthy. No prod-breaking bugs surfaced.

### MEDIUM — 4 items (deferred per Boss policy)

| # | Finding | Path | Defer reason |
|---|---|---|---|
| M1 | `<img>` warnings (8 sites) — should use `next/image` for LCP | various `(app)/*` + storefront pages | UX polish; each site needs `<Image>` migration + breakpoint config. R2 per site. |
| M2 | `react-hooks/exhaustive-deps` warnings (3 sites) — missing `getCustomerId` dep | components/sale | Existing pattern — adding dep risks infinite refetch loop. Needs individual review per site. |
| M3 | `'AppError' defined but never used` (2 sites) | error route files | Imported for type but never referenced. Trivial R2 unused-import cleanup. |
| M4 | `setTeamMembers never used` (settings page) | settings/page.tsx:45 | Dead state setter — either feature half-shipped or feature deferred. |

### LOW — 11 items

| # | Finding | Path |
|---|---|---|
| L1 | 37 unused import warnings (still ~30 after #155 fixes 7) | various |
| L2 | Generated Prisma TODOs (3 hits) | `src/generated/prisma/runtime/client.d.ts` — IGNORE (generated) |
| L3 | Legit booking-rules TODO | `src/lib/sale/booking-rules.ts:81` — future shop-policy work, leave |
| L4 | Email client console.log stub | `src/lib/email/client.ts:31` — intentional dev stub, leave |
| L5 | `_request` unused arg in API route | trivial — Next App Router convention |
| L6 | `ok` import unused in 4+ API routes | trivial cleanup |
| L7 | `CardHeader/CardTitle` unused in components | trivial |
| L8 | `Eye/EyeOff` unused in auth UI | trivial |
| L9 | `CURRENCY_NAMES` defined never used | exchange-rates page — feature stub |
| L10 | `_result` unused in test helper | test cleanup |
| L11 | `beforeAll` unused in crypto test | trivial |

---

## 4. UX/UI deep review — admin pages

Spot-checked entry points: `/dashboard`, `/orders`, `/inventory`, `/payments`, `/sale`.

### `/sale` (SaleWorkspaceShell)

- ✅ Well-structured 3-row hierarchy (primary + secondary + tertiary)
- ✅ Date-first + LiveSession optional (per Tier 3.9-B-Fix-2)
- ✅ Source filter chips for multi-channel future
- ✅ `refetchToken` pattern keeps panels in sync
- ✅ Error boundaries wrap each panel
- ⚠️ WIRE-3 board renders BETWEEN primary + secondary rows when flag on — adds vertical scroll. Boss UX review will validate placement.

### `/orders`

- ✅ Filters with debounced search (300ms)
- ✅ Pagination + reset-page-on-filter-change pattern correct
- ✅ Toast on fetch error
- ✅ Loading state in OrderTable

### `/inventory`

- ✅ Filters + debounced search
- ✅ Selection state for bulk operations
- ✅ Low stock alert surfaced separately
- ✅ Categories cached + non-critical (silent fail OK)

### `/payments`

- ✅ Post #146: uses `<SlipImage paymentId>` (signed URL, no raw R2 exposure)
- ✅ 4 status badges (Pending/Verified/Failed/Refunded)
- ✅ Manual payment dialog for cash/COD
- ✅ Detail dialog for slip view + action buttons

### `/dashboard`

- ⚠️ 373 LOC — large file, could benefit from extraction (LOW)
- ✅ Stats cards
- ✅ Recent activity
- (skip deep dive — not a hot loop)

---

## 5. Security audit

### Pass

- ✅ R2 G3 closed (signed URL + UI swap)
- ✅ Path traversal guard (route + storage layers)
- ✅ CSP headers pinned with regression coverage (#140)
- ✅ Auth boundary: `requireAuth + role check` at every admin route
- ✅ Cross-shop denial: `findByIdAdmin(user.shopId, id)` pattern (#137 review)
- ✅ No secrets logged anywhere (verified Phase 1A test)
- ✅ HSTS 2-year + includeSubDomains + preload
- ✅ frame-ancestors 'none'
- ✅ Session-fixated `csrf` token in `/api/auth/csrf`

### Pending (Boss-gated)

- ⏸ R2 bucket policy R0 (defer ≥1 week)
- ⏸ Slip URL signed (closed but bucket still public — defense-in-depth via UI + URL signing)
- ⏸ Meta App Secret rotation policy (Tier 4.1)

---

## 6. R2 audit gaps from PR #135 (still open)

| Gap | Status | Priority |
|---|---|---|
| G1 env validation | ✅ closed #139 + #147 |
| G2 R2 lifecycle policy | ❌ Cloudflare Dashboard Boss-action |
| G3 slip URL PII leak | ✅ FULLY CLOSED #137 + #146 + #147 |
| G4 path traversal | ✅ closed #138 |
| G5 deleteFile error logging | ❌ trivial R2 |
| G6 file-type sniff on slip + generic | ❌ R2 (file-type lib needed) |
| G7 per-shop bucket isolation | ❌ R0 — Boss explicit |
| G8 prefix convention convergence | ❌ R2 |
| G9 UploadAudit table | ❌ R1 (schema migration) |
| G10 virus scan | ❌ Cloudflare Workers AI |
| G11 R2 in next.config remotePatterns | ❌ R2 (only when Next `<Image>` needed) |

**Quickest wins:** G5 + G8 (R2, no infra).
**Highest value:** G6 file-type sniff (R2, defends against mime-type spoof on slip).

---

## 7. Recommendations (in priority order)

| # | Action | Risk | Effort | Notes |
|---|---|---|---|---|
| 1 | Merge #155 (lint cleanup) | R2 | trivial | Already passes CI |
| 2 | Boss UI smoke #154 → merge if PASS | R1 | 15-20 min Boss | Unblocks WIRE-4 (Playwright tests) |
| 3 | R2 G6 file-type sniff PR | R2 | 1h | Defends slip + generic upload against mime spoof |
| 4 | R2 G5 deleteFile error logging | R2 | 30m | Surfaces orphan-by-typo bugs |
| 5 | Remaining 30 unused imports cleanup PR | R2 | 1h | Drops lint baseline to ~18 warnings |
| 6 | M3 + M4 dead-state cleanup | R2 | 30m | settings/page.tsx + error.tsx |
| 7 | M1 `<img>` → `<Image>` migration (per page) | R2 | 4h total (8 sites) | LCP improvement; each site separately |
| 8 | M2 useCallback dep audit per site | R2 | 2h | Risk loop — careful review per site |
| 9 | Phase 1.5-B-1-schema (R1 + DISSENT) | R1 | 2h | Only on Boss `IMPLEMENT 1.5-B-1 NOW` |
| 10 | V Rich WIRE-4 Playwright tests | R2 | 3h | After WIRE-3 merges |
| 11 | Phase 1.5-D-1 multi-code (R1) | R1 | 2h | Independent of B/C; Boss explicit |
| 12 | Bucket policy R0 refactor | R0 | TBD | Defer ≥1 week post WIRE-3 stable + Boss approval |

---

## 8. What Claude CAN'T do (Boss-gated)

| Action | Why blocked |
|---|---|
| Merge #154 | Boss UI smoke verdict required |
| Set Vercel env | Boss-owned |
| Run prod migration | Boss-owned |
| Production mutation | Hard no-go |
| Auth POST to production | Hard no-go |
| Touch pak-ta-kra | Hard no-go |
| Rotate secrets | R0 |
| Change R2 bucket policy | R0 |

---

## 9. Production health snapshot

| Item | Status |
|---|---|
| master HEAD | `94adfe8` |
| Vercel deploy | LIVE — current `94adfe8` |
| `nazhahatyai.com` smoke 17/17 | ✅ |
| `NEXT_PUBLIC_SALE_LAYOUT_V2` Vercel | UNSET (production board hidden) |
| R2 bucket policy | unchanged (public CDN — slip leak mitigated by UI-only signed URL) |
| Phase 1.5 schema state | unchanged |
| FB webhook runtime | not started |
| Outbound runtime | disabled |
| Payment/shipping runtime | unchanged |
| Auth boundary | unchanged |
| pak-ta-kra | untouched |

---

## 10. Open PRs summary

| PR | Title | Status | Boss action |
|---|---|---|---|
| #154 | WIRE-3 shell flag gating | OPEN | **UI smoke** then merge |
| #155 | Lint cleanup (-7 warnings) | OPEN | review + merge |
| (this) #156 | Goal deep audit handoff | OPEN | review + merge |

---

## 11. Cross-references

- `docs/superpowers/2026-05-25-final-security-handoff.md` (prior security closeout)
- `docs/superpowers/2026-05-25-v-rich-3-10-c-boss-decision-packet.md` (V Rich verdict template)
- `docs/superpowers/2026-05-25-v-rich-stage-3-10-c-readiness-audit.md` (V Rich Stage 3.10-C audit)
- `docs/superpowers/2026-05-25-v-rich-3-10-c-wire-3-boss-ui-smoke-guide.md` (smoke guide)
- `docs/superpowers/2026-05-24-r2-storage-paths-audit.md` (G1-G11 source)
- `docs/superpowers/2026-05-24-phase-1-5-final-verdict-packet.md` (Phase 1.5 ready)

---

## 12. Status

| Item | Status |
|---|---|
| Goal directive accepted | ✅ |
| Full vitest 1978/1978 | ✅ |
| Lint cleanup PR (#155) | ✅ filed |
| Audit findings catalogued | ✅ |
| WIRE-3 still blocked on Boss smoke | ⏸ |
| Recommendations ranked | ✅ |
| No production change this block | ✅ |
| No env / schema / runtime semantics touched | ✅ |
| pak-ta-kra untouched | ✅ |
| Hard no-go violations | 0 |

R2 — docs only.
