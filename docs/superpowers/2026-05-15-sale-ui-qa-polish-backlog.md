# Sale UI QA polish backlog

**Filed:** 2026-05-18
**Status:** docs-only. Backlog of small, low-risk UX/test improvements found by audit.

This is a prioritized backlog. Items here are SAFE to ship in small PRs after the D4/D6 smoke completes. No item below requires schema, auth, payment, R2, or env changes.

---

## 1. Audit method

Read every file under `src/components/sale/` (19 files, ~4700 lines), the page `src/app/(app)/sale/page.tsx`, and the helper `src/components/shared/SidebarNav.tsx`. Reviewed against:

- Component size (>500 lines flagged for split)
- Hook density (>10 hooks per component flagged for split)
- Magic strings (Thai copy, error messages, status labels)
- Loading + empty + error states
- Accessibility (aria, focus, keyboard)
- Mobile responsiveness signals
- TODO / FIXME (none found)

---

## 2. File-by-file inventory

| File | Size | Hooks | Notes |
|---|---|---|---|
| `AddFromStockDialog.tsx` | 362 | ~4 | OK |
| `BookingSourceChip.tsx` | 126 | 0 | Pure render — OK |
| `CancelBookingDialog.tsx` | 306 | ~5 | OK |
| `ConfirmBookingDialog.tsx` | 227 | ~4 | OK |
| `CreateOrderDialog.tsx` | 346 | ~5 | OK |
| `EditProductCodeDialog.tsx` | 332 | ~5 | OK |
| `ManualCreateBookingDialog.tsx` | **859** | **13** | **flag for split** |
| `SaleBookingQueuePlaceholder.tsx` | 593 | 6 | borderline; defer |
| `SaleCustomerPanelPlaceholder.tsx` | 205 | ~3 | OK |
| `SaleInboxPlaceholder.tsx` | 62 | 0 | placeholder |
| `SaleOrderConversionPlaceholder.tsx` | 42 | 0 | placeholder |
| `SalePanelCard.tsx` | 62 | 0 | shared layout |
| `SaleProductGridPlaceholder.tsx` | 234 | ~4 | OK |
| `SaleSessionPickerPlaceholder.tsx` | 156 | ~3 | OK |
| `SaleSourceFilterChips.tsx` | 106 | ~2 | OK |
| `SaleWorkspaceShell.tsx` | 373 | ~5 | OK |
| `booking-queue.helpers.ts` | 187 | n/a | pure |
| `edit-product-code.helpers.ts` | 64 | n/a | pure |
| `manual-create.helpers.ts` | 66 | n/a | pure |

---

## 3. Priority backlog

### P0 — before admin onboarding

| # | Item | File | Effort | Risk |
|---|---|---|---|---|
| P0.1 | Split `ManualCreateBookingDialog.tsx` into sub-components | sale/manual-create/* | M | R2 |
| P0.2 | Verify all dialog form-submit shows loading state (button disabled + spinner) | all `*Dialog.tsx` | S | R2 |
| P0.3 | Verify all destructive actions (Cancel / Delete) show confirm-with-reason flow | `Cancel*`, `Delete*` | S | R2 |
| P0.4 | Audit error states — every dialog should show error toast or inline error on 4xx/5xx response | all `*Dialog.tsx` | S | R2 |
| P0.5 | Confirm `RM` currency symbol used everywhere — no `฿` or stale THB | all sale files | S | R2 |

### P1 — after D4/D6 smoke

| # | Item | File | Effort | Risk |
|---|---|---|---|---|
| P1.1 | Surface `OrderAudit` history in `/orders` UI | `/orders/[id]` (out of `sale/`) | M | R2 |
| P1.2 | Surface `BookingHistory` timeline in booking row expand | `SaleBookingQueuePlaceholder.tsx` | M | R2 |
| P1.3 | Add empty-state illustrations + helper text per panel | all `*Placeholder.tsx` | S | R2 |
| P1.4 | Keyboard shortcut `n` to open "+ New booking" in `/sale` | `SaleWorkspaceShell.tsx` | S | R2 |
| P1.5 | Inline preview of variant image in Add from Stock dialog search results | `AddFromStockDialog.tsx` | M | R2 |
| P1.6 | Sticky table header in BookingQueue when scrolling | `SaleBookingQueuePlaceholder.tsx` | S | R2 |
| P1.7 | Loading skeleton (not spinner) for product code grid initial load | `SaleProductGridPlaceholder.tsx` | S | R2 |
| P1.8 | Friendly retry button when route returns 5xx | `*Placeholder.tsx` | S | R2 |
| P1.9 | Source filter chips: empty-state badge "ยังไม่มี Tier 4 inbound" on disabled chips | `SaleSourceFilterChips.tsx` | S | R2 |
| P1.10 | Add `aria-live="polite"` for status badge changes (Confirm → CONFIRMED) | `SaleBookingQueuePlaceholder.tsx` | S | R2 |

### P2 — later

| # | Item | File | Effort | Risk |
|---|---|---|---|---|
| P2.1 | Booking queue drag-and-drop to re-order pinned | `SaleBookingQueuePlaceholder.tsx` | L | R2 |
| P2.2 | Multi-select bookings → bulk confirm action | `SaleBookingQueuePlaceholder.tsx` | L | R1 (bulk = larger blast radius) |
| P2.3 | CSV export of bookings + orders for date range | `/sale` + new helper | M | R2 |
| P2.4 | Mobile responsive layout (current is desktop-first) | `SaleWorkspaceShell.tsx` + Tailwind | L | R2 |
| P2.5 | Thai copy review pass by native speaker | all sale files | M | R2 |
| P2.6 | Dark-mode polish for sale workspace | all sale files | M | R2 |
| P2.7 | Per-panel collapse memory (localStorage) | `SaleWorkspaceShell.tsx` | S | R2 |
| P2.8 | Customer panel: quick-add new customer inline (without leaving /sale) | `SaleCustomerPanelPlaceholder.tsx` | M | R2 |

---

## 4. Test coverage gaps

| Component | Unit | Integration |
|---|---|---|
| `AddFromStockDialog` | partial | none against API |
| `ManualCreateBookingDialog` | partial | none against API |
| `CreateOrderDialog` | partial | none against V2 flow |
| `EditProductCodeDialog` | partial | none against PATCH route |
| `SaleBookingQueuePlaceholder` | partial | none |
| `BookingSourceChip` | likely good (pure render) | n/a |
| `SaleSourceFilterChips` | partial | n/a |
| `booking-queue.helpers.ts` | likely good (pure) | n/a |
| `edit-product-code.helpers.ts` | likely good (pure) | n/a |
| `manual-create.helpers.ts` | likely good (pure) | n/a |

Recommended: add 1 vitest case per dialog covering "submit + 4xx response → error message rendered." Small PR.

---

## 5. Tiny safe wins (single-file < 50 line changes)

These are R2 and could be done in one micro-PR each. Listed in rough effort order.

1. Add `disabled` attribute to all submit buttons while pending (P0.2 above; one line per dialog)
2. Replace any literal `'฿'` or `'THB'` with `'RM'` or `'MYR'` (grep first; none found in initial audit but verify before P0 onboard)
3. Add `aria-label` to icon-only buttons in `SaleBookingQueuePlaceholder.tsx` (accessibility)
4. Add `noValidate` to forms to ensure custom error UI is the only error surface (prevents browser's native validation bubble overriding our message)
5. Add `autoComplete="off"` to admin-side forms (security hygiene)
6. Inline link "ดูคู่มือการใช้งาน" → `/help` on `/sale` header (when help page exists)

---

## 6. NOT in this backlog

- ❌ Stock decrement UI (depends on Boss X/Y/Z decision)
- ❌ Tier 4 inbound UI (Tier 4.1+ PRs)
- ❌ Tier 5 parser UI
- ❌ Customer-facing checkout polish (separate audit)
- ❌ Payment slip review UX (separate audit)
- ❌ Shipping carrier UI (no integration yet)
- ❌ Returns / refunds UI (not implemented)

---

## 7. How to use this backlog

For Boss:
- Pick rows from P0 first
- Approve single-PR-per-row
- Reject if any item touches stock / payment / shipping runtime (those are out of scope here)

For Claude:
- Open one micro-PR per backlog row
- Branch name: `polish/sale-<short-tag>` e.g. `polish/sale-manual-dialog-split`
- Each PR: tsc clean + targeted tests + acceptance matrix
- No bundling more than 1 backlog row per PR (small reviewable diffs)

---

## 8. Cross-references

- Tier 1.5 unified workspace handoff: `docs/superpowers/2026-05-15-sale-unified-workspace-handoff.md`
- Tier 3.6 (edit/delete dialog) PR #12 commit `6a035e5`
- Tier 1 (workspace) PR #11 commit `eba64cf`
- Admin onboarding readiness: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- Admin day-1 runbook: `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md`
