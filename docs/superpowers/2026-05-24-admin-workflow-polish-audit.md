# Admin Workflow Polish — Friction Audit

**Filed:** 2026-05-24 (autonomous Track 8)
**Author:** Claude Sonnet 4.6
**Master baseline:** `b0774a5`
**Status:** Audit only. NO runtime change.

Trace through a real Nazha Hatyai admin's day. Identify friction
points where the UI works but feels heavy. Prioritize fixes by
impact × effort. Output is a backlog, not implementation.

This audit treats production smoke as authoritative; nothing here
overrides Boss UI smoke verdicts on workbook v3/v4.

---

## 1. Daily flow assumed

```
07:00 — Admin opens inventory
        Adds new stock arriving from supplier
        Creates ~50 product codes via /inventory/new

09:00 — Switches to /sale
        Picks today's saleDate
        Attaches inventory to sale board (AddFromStock or Quick Create)

19:00 — Live broadcast starts
        Customers comment on Facebook (manual capture for now)
        Admin enters bookings via Manual Create dialog

20:00 — Mid-live moderation
        Confirms bookings as customers commit
        Cancels duplicate/spam bookings
        Spots out-of-stock items in summary

21:00 — Post-live wrap
        Converts confirmed bookings to orders per customer
        Reviews summary panel
        Prepares packing list (next day)
```

---

## 2. Top friction points (priority-ordered)

### F1 — Inventory bulk create requires toggle every session (LOW)

**Symptom:** Admin who always uses bulk creation must toggle "สร้างหลายรหัส" each time opening `/inventory/new`.

**Impact:** ~2 sec friction per session. Annoying but not blocking.

**Fix:** Remember toggle state in localStorage. R2.

**Boss-smoke needed?** No.

**Defer.** Effort ≈ value at this scale.

---

### F2 — saleDate not URL-synced (MEDIUM)

**Symptom:** Admin can't bookmark `/sale?saleDate=2026-05-24` to deep-link to a specific day. Switching tabs loses selection. Refresh page resets to today.

**Impact:** Multi-day comparison workflows require manual re-selection. Annoying.

**Fix:** Sync saleDate via `?saleDate=...` query param. R1 (URL routing).

**Boss-smoke needed?** Yes (UX surface).

**Sequence to fix:** open as separate R1 PR with explicit Boss verdict. Track 6 §11 audit-3.

---

### F3 — Customer panel shows minimal data (MEDIUM)

**Symptom:** When admin clicks customer name in booking list, side panel renders but provides limited context (no order history snippet, no lifetime value chip prominently).

**Impact:** Admin needs to navigate to customer profile page for context. Reduces panel utility during live.

**Fix:** Expand panel to show last 3 orders + lifetime value + label chips. R1.

**Boss-smoke needed?** Yes.

**Defer:** UX scope > current iteration. Backlog item.

---

### F4 — Edit product code may not refresh after save (HIGH if bug exists)

**Symptom:** After editing a BP's name/price via EditProductCodeDialog, the BP list may show stale display. (Track 6 §6 audit gap.)

**Impact:** Admin sees old data; might re-edit thinking save didn't take.

**Fix:** Verify EditProductCodeDialog bumps `refetchToken` on save. If not, 1-line fix.

**Boss-smoke needed?** Yes — Section A of workbook v3 should reveal.

**Action:** Audit code path in next R1 PR if Boss confirms bug. R0 if production stale state seen.

---

### F5 — AddFromStock doesn't filter by category (MEDIUM)

**Symptom:** AddFromStock dialog lists all stock products. With 200+ items, finding the right ones to attach is slow.

**Impact:** Admin spends time scrolling. Multi-select helps but no category filter.

**Fix:** Add category dropdown to filter AddFromStock list. R1.

**Boss-smoke needed?** Yes.

**Defer:** depends on §F3 priority and Boss verdict.

---

### F6 — No bulk-cancel for spam bookings (MEDIUM)

**Symptom:** During live, sometimes 5+ duplicate bookings come in (slow internet → multiple submits). Each must be cancelled individually.

**Impact:** ~10 sec per duplicate × N per live = real time.

**Fix:** Multi-select on PENDING bookings + bulk cancel. R1.

**Boss-smoke needed?** Yes.

**Defer:** Useful but not urgent until volume grows.

---

### F7 — Order creation requires manual selection of bookings per customer (MEDIUM)

**Symptom:** Admin clicks customer name → sees their confirmed bookings → manually selects which to convert → submits. If a customer has 12 bookings, all 12 must be ticked.

**Impact:** ~30 sec per multi-booking order at peak volume.

**Fix:** "Convert all confirmed for this customer" one-click. R1.

**Boss-smoke needed?** Yes.

**Defer:** Phase 1.5-C auto-order-append covers this exact pain. Hold until Phase 1.5 verdicts land.

---

### F8 — Summary panel doesn't link to drill-down (LOW)

**Symptom:** Summary shows "ออเดอร์ 18" but admin can't click to see those 18 orders.

**Impact:** Curiosity click goes to dead chip. Workaround = `/orders` page filter.

**Fix:** Make metric chips link to filtered `/orders?saleDate=...&status=...`. R2.

**Boss-smoke needed?** No (additive nav).

**Defer:** Polish, low impact.

---

### F9 — No "today" quick button in date picker (LOW)

**Symptom:** Switching back to today requires opening calendar widget and clicking. If admin is on tomorrow's date for prep, single-click "today" missing.

**Impact:** ~3 sec friction. Small.

**Fix:** Add "วันนี้" button next to date picker. R2.

**Boss-smoke needed?** No.

**Easy win.** Could fold into any small UI PR.

---

### F10 — Manual Create dialog doesn't auto-focus customer search (LOW)

**Symptom:** Open Manual Create → must click customer search field to start typing.

**Impact:** ~1 sec per booking × N per live. Adds up.

**Fix:** Auto-focus customer search on dialog mount. R2.

**Boss-smoke needed?** No.

**Easy win.**

---

## 3. Summary table

| # | Friction | Severity | Effort | Boss smoke needed? | Phase 1.5 dependent? |
|---|---|---|---|---|---|
| F1 | Bulk toggle no memory | Low | Low | No | No |
| F2 | saleDate URL sync | Medium | Med | Yes | No |
| F3 | Customer panel thin | Medium | Med | Yes | No |
| F4 | Edit BP stale display | **High** (if bug) | Low | Yes | No |
| F5 | AddFromStock no category filter | Medium | Med | Yes | No |
| F6 | No bulk cancel | Medium | Med | Yes | No |
| F7 | Order convert per-booking | Medium | High | No | **Yes** (1.5-C) |
| F8 | Summary chips no drill-down | Low | Low | No | No |
| F9 | No "today" button | Low | Low | No | No |
| F10 | Manual Create autofocus | Low | Low | No | No |

---

## 4. Recommended next PR sequence

If Boss approves these:

| Sequence | PR | Risk | Effort | Notes |
|---|---|---|---|---|
| **First** | Verify F4 — audit EditProductCodeDialog refetchToken | R2 → R0 if bug | 1 hr | Highest priority |
| Quick wins batch | F1 + F9 + F10 (localStorage toggle + today button + autofocus) | R2 | 2 hr | Bundle for low review cost |
| F2 | URL-sync saleDate | R1 | 4 hr | Deep-link unlock |
| F8 | Summary chips link to /orders filter | R2 | 2 hr | Quick UX win |
| F5 | AddFromStock category filter | R1 | 4 hr | Volume scaling |
| F3 | Customer panel deeper data | R1 | 6 hr | Live UX |
| F6 | Bulk cancel | R1 | 6 hr | Anti-spam |
| F7 | Hold until Phase 1.5-C lands | — | — | Solved by auto-order-append |

Total ~25 hr if all approved. Realistic: prioritize F4 (bug check), F1/F9/F10 (quick wins), F2 (URL sync) — ~9 hr.

---

## 5. Must wait for Boss UI smoke

These friction points require Boss to confirm they exist:

- F4 (EditProductCode stale display) — confirm bug
- F3 (customer panel thin) — verify Boss workflow needs more data
- F5 (AddFromStock filter) — verify Boss inventory volume warrants
- F6 (bulk cancel) — verify Boss live-cancel rate
- F7 (per-customer order convert) — verify Phase 1.5-C is the right fix

---

## 6. Out of scope (do NOT fix in this audit)

- ❌ Facebook live comment ingestion (Tier 4.1+)
- ❌ Outbound messaging (Tier 4.5+)
- ❌ Customer self-service portal
- ❌ Multi-shop switching UI
- ❌ Locale-aware date formatting (already next-intl, but no admin override)
- ❌ Dark mode contrast pass
- ❌ Mobile responsive pass
- ❌ Accessibility audit beyond ARIA basics

---

## 7. Cross-references

- `docs/superpowers/2026-05-24-sale-data-fetch-audit.md` — Track 6 (overlap on F4)
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` — Track 5 (V Rich wiring may resolve some friction)
- `docs/superpowers/2026-05-23-phase-1-5-verdict-packet.md` — F7 resolution path
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v3.md` — Boss smoke
- `docs/superpowers/2026-05-23-admin-smoke-workbook-v4.md` — Boss smoke (Section L)

---

## 8. Status

- Audit only. No fixes applied.
- F4 flagged as highest-priority audit-then-fix candidate.
- Boss verdict required before any implementation PR.
