# Tier 1.5 unified sales workspace — handoff

**Filed:** 2026-05-17 (session continuous from 2026-05-15)
**Branch:** `feat/sale-unified-workspace`
**PR:** https://github.com/Ed-Sama-lens/liveshop-pro/pull/11
**Head SHA:** `56609be`

---

## 1. Route / nav inventory before

| Entry | Path | Roles | Status |
|---|---|---|---|
| `ไลฟ์สด` | `/live-selling` | OWNER / MANAGER | legacy LiveSession CRUD |
| `ขายผ่านไลฟ์` | `/sale` | OWNER / MANAGER / CHAT_SUPPORT | V Rich-style MVP workspace |

Plus internal `/live-selling/[id]` + `/live-selling/new` routes.

## 2. Route / nav inventory after

| Entry | Path | Roles | Status |
|---|---|---|---|
| `ขายของไลฟ์สด` | `/sale` | OWNER / MANAGER / CHAT_SUPPORT | **unified omnichannel workspace** |

`/live-selling/*` routes:
- Still file-present
- Still permission-protected via `ROUTE_PERMISSIONS`
- Hidden from sidebar
- Reachable via direct URL bookmark
- Reachable via "จัดการรอบไลฟ์" outline link in `/sale` header
- Internal `router.push('/live-selling')` calls unchanged
- No redirect added (Option A from `2026-05-13-sale-ux-ia-consolidation-plan.md` § 5)

## 3. Sidebar behavior

| Item | Change |
|---|---|
| Sales group | 5 → 4 entries (removed legacy `liveSelling` entry) |
| Single sales workspace entry | `ขายของไลฟ์สด` → `/sale` |
| Other Sales group items | unchanged (Orders, Order by Product, Chat) |

i18n labels (`nav.liveSale` key):
- TH: `ขายผ่านไลฟ์` → `ขายของไลฟ์สด`
- EN: `Live Sale` → `Live Commerce`
- ZH: `直播下单` → `直播销售工作台`

`nav.liveSelling` keys retained — used by `/live-selling/*` pages internally.

## 4. `/live-selling` strategy

Option A — keep route, hide from sidebar. Reasoning:

- `/live-selling` owns unique LiveSession CRUD (create new live, edit, status filter, pagination). `/sale` does not implement these yet.
- Redirect would lose CRUD or force re-implementation in `/sale` workspace (out of Tier 1.5 scope).
- Direct URL bookmarks continue to work.
- Future Tier 2 can fold LiveSession CRUD into `/sale` then redirect `/live-selling`.

Boss + admins reach LiveSession CRUD from inside `/sale` via the new header outline link.

## 5. Layout changes

### Before — 6-card grid

```
+----------------+----------------+----------------+
| Session picker | Product Codes  | Booking Queue  |
+----------------+----------------+----------------+
| Customer Panel | Order Convert  | Inbox          |
+----------------+----------------+----------------+
```

All panels equal weight. Session picker top-left. Products + Bookings (primary work) buried middle.

### After — 3-row hierarchy

```
+------------------------------------------------+
| Header: ขายของไลฟ์สด + "จัดการรอบไลฟ์" link    |
+------------------------------------------------+
| Source filter chips card                       |
+------------------------------------------------+
| Product Codes      |    Booking Queue          | <- Primary row
+------------------------------------------------+
| Customer Panel     |    Order Conversion       | <- Secondary row
+------------------------------------------------+
| <details> Live session picker + Inbox          | <- Collapsible tertiary
+------------------------------------------------+
```

Operator workflow: "pick what to sell → take a booking → close the customer/order".

## 6. Source / context model

- Source filter chips (Tier 1 PR #3) sit just below header — visible without scrolling
- Live session became collapsible context (not universal root)
- Page stays useful when no live session selected
- Manual + evergreen flows reachable without picking a session
- Future inbound channels (Inbox / Telegram / WhatsApp) declared visually as "coming soon" via existing Tier 1 disabled chips

## 7. Add from Stock placement

Already shipped in Tier 3 PR #4 inside `SaleProductGridPlaceholder`. Now top-priority row → directly visible when admin lands on `/sale`. No additional change.

## 8. Manual Create placement

Already shipped in Tier 1 PR #3 inside `SaleBookingQueuePlaceholder`. Now top-priority row alongside Product Codes. No additional change.

## 9. Tests

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | tsc result unchanged; only the 2 known pre-existing socket test errors remain |
| `tests/unit/components/sale` | 124/124 PASS |
| `tests/unit/lib/auth/permissions.test.ts` | 63/63 PASS |
| Full vitest | 869/869 PASS across 43 files |

## 10. Screenshots

None committed. Boss can inspect via Vercel preview URL on PR #11. If Boss wants screenshots in handoff, attach manually after preview review — Tier 1.5 does NOT auto-commit screenshots (per `.gitignore` policy).

## 11. Remaining blockers

| Item | Owner |
|---|---|
| D4 / D6 functional smoke | Boss admin login per `2026-05-14-sale-d4-d6-activation-runbook.md` § 2.4 |
| PR #11 review + merge | Boss + ChatGPT |
| Phase B | Boss verdict (still BLOCKED) |
| Tier 2 — LiveSession CRUD fold into `/sale` + redirect `/live-selling` | Future PR |
| Tier 3.6 — BP edit/delete UI for Tier 3.5 backend | After functional smoke |
| Tier 4 — Messenger / WhatsApp / Telegram / parser runtime | Separate epic |
| Payment / shipping readiness audit | Deferred Track 8 from prior overnight |
| Admin onboarding readiness checklist | Deferred Track 9 from prior overnight |
| Observability plan | Deferred Track 10 from prior overnight |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Admin bookmarks to `/live-selling` work but no sidebar link | Documented + header outline link from `/sale` |
| Translation key drift (`liveSelling` orphaned in some lang file) | Key retained, `/live-selling` pages still consume it |
| Hidden `<details>` element bad accessibility | Native HTML element supports keyboard + screen reader |
| Layout regression on mobile (`lg:grid-cols-2`) | Default 1-col stacks gracefully; smoke before D-day |
| Permissions regression | None — `ROUTE_PERMISSIONS` untouched, sidebar role filter unchanged |

## 13. Cross-references

- Plan: `docs/superpowers/2026-05-13-sale-ux-ia-consolidation-plan.md`
- Tier 1 plan: `docs/superpowers/2026-05-14-sale-tier1-ui-implementation-plan.md`
- Tier 3 handoff: `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- Tier 3.5 plan: `docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md`
- D4/D6 runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- Tier 4 receive-only plan: `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md`
- Smoke harness: `docs/superpowers/2026-05-14-production-smoke-harness-plan.md`
