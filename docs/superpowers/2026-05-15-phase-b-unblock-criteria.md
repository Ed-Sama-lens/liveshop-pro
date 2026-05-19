# Phase B unblock criteria

**Filed:** 2026-05-18 (criteria doc; Phase B remains BLOCKED until criteria met)
**Status:** docs-only. Boss decision package. No action taken in this doc.

---

## 1. What is Phase B

Phase B = authenticated production smoke + observation. Distinct from:

- **Phase A** = authenticated read-only production smoke (Manual Create — already executed, see `tests/e2e/manual-create-phase-a.prod-smoke.spec.ts`)
- **D4/D6 functional smoke** = Boss-side single-pass end-to-end (Stage A-G in the visual guide)
- **Tier 4+** = inbound runtime

Phase B is broader than D4/D6 — it covers:

1. Repeated runs of D4/D6 happy path
2. Cross-shop guard validation
3. Multiple concurrent admin sessions
4. Cancel-on-confirmed path
5. Idempotency under realistic load
6. Reservation integrity under contention
7. Booking-source variety (LIVE_COMMENT, PAGE_INBOX once Tier 4 ships — currently MANUAL only)
8. 24-72h observation with logged metrics

Phase B is the bridge between "code says it works" and "we're confident inviting real admins."

---

## 2. Why Phase B is blocked NOW

| Prerequisite | Status |
|---|---|
| D4/D6 functional smoke single-pass PASS | NOT done — blocked by Boss admin auth |
| 24h+ observation window post-D4/D6 | NOT started |
| Stock decrement decision X/Y/Z | NOT made |
| Order state machine guards in place | NOT implemented (P0 follow-up) |
| Production smoke harness on cron | NOT wired (P1 follow-up) |
| Telegram/email alert for 5xx | NOT wired (P1 follow-up) |
| Boss + ChatGPT explicit Phase B verdict | NOT given |

Until **all seven** rows are GREEN, Phase B does not start. The system continues to operate in Boss-only test mode.

---

## 3. Phase B prerequisites (must all be true)

### 3.1 Smoke prerequisites

- [ ] D4/D6 functional smoke (Stage A-G) PASS with captured IDs in MEMORY.md
- [ ] `npm run smoke:prod:unauth` 16/16 PASS at the same master HEAD
- [ ] No 5xx in Vercel logs for the 24h window leading up to Phase B start
- [ ] No DB error in Railway logs for the same window

### 3.2 Code prerequisites

- [ ] Order state machine enforcement in route layer (commerce readiness follow-up P0)
- [ ] Stock decrement model X/Y/Z implemented OR Z explicitly accepted with manual SOP docs
- [ ] Request-id middleware shipped (observability quick win 1)
- [ ] OrderAudit surface in /orders UI (observability quick win 3) — optional but recommended

### 3.3 Observability prerequisites

- [ ] Production smoke wired into a cron (Vercel Cron OR GitHub Actions) at least hourly
- [ ] Alert sink (Telegram bot OR email digest) wired to smoke failure + 5xx threshold
- [ ] Daily observability checklist (post-deploy runbook § 3) practiced by Boss for at least 5 days

### 3.4 Operational prerequisites

- [ ] Boss + (at most one) admin walked through D4/D6 visual guide together
- [ ] Stock decrement decision made + documented
- [ ] Day-1 admin runbook reviewed by Boss
- [ ] Emergency contact + escalation flow understood (day-1 § 4)
- [ ] Test fixture preserved (TEST-D6-001 BP + bookings + order from smoke)

### 3.5 Authorization

- [ ] Boss explicitly authorizes Phase B start in chat
- [ ] ChatGPT review of Phase B plan if applicable

---

## 4. What Phase B tests (when unblocked)

### 4.1 Repeat happy path × 10

Boss runs D4/D6 Stage A-G ten times in succession. Each run creates fresh test BP + Booking + Order. Captures IDs.

Expect: all 10 runs PASS. No drift in reservedQty. Each Order has unique ID. Each Booking has unique ID.

### 4.2 Cross-shop guard (4 scenarios)

1. Boss customer + Shop A variant → success
2. Boss customer + Shop B variant (where Boss is OWNER) → success (still Boss's data)
3. Non-Boss customer + Shop A variant → success (customer is shop's)
4. Wrong-shop customer (cross-shop) → 409 cross-shop rejection

### 4.3 Multi-session contention

Boss + admin (paired training) both attempt to confirm the same booking. One should succeed; the other should see 409 or stale state. Reservation must stay at +1, not +2.

### 4.4 Cancel-after-confirm

1. Create booking → confirm → reservation +1.
2. Cancel before order conversion.
3. Verify reservation released (reservedQty back to baseline).
4. Re-create equivalent booking → confirm → reservation +1.
5. Verify no orphan reservation rows.

### 4.5 Idempotency under stress

Boss runs V2 conversion REPLAY 5 times in rapid succession from DevTools Console. Each replay must return same orderId + `idempotent: true`.

### 4.6 Reservation integrity badge sweep

Use Booking Queue panel filter to surface bookings with integrity badges other than `OK`. Expect zero. Any other badge state → investigate.

### 4.7 Booking source variety (when Tier 4 ships)

Repeat 4.1 with `source = PAGE_INBOX` and `source = LIVE_COMMENT`. Currently blocked until Tier 4.1+ ships.

### 4.8 24-72h observation

After Phase B test rounds finish, watch production for 24-72h. Verify:

- No unexpected 500 in Vercel logs
- No stuck PENDING_REVIEW bookings older than 4h
- No stuck RESERVED orders older than 24h
- reservedQty matches sum of CONFIRMED bookings + RESERVED orders
- ActivityLog row count matches expected events

---

## 5. Phase B exit criteria

Phase B is COMPLETE when:

- [ ] All Phase B test rounds (4.1-4.6) PASS
- [ ] Observation window 24h+ shows zero anomalies
- [ ] Boss + ChatGPT explicit "Phase B complete" verdict
- [ ] Test fixtures captured + preserved
- [ ] Documentation of any deviations (none expected, but recorded if found)

Phase B is FAILED if:

- Any test round produces a 5xx
- reservedQty drifts unexpectedly
- Any orphan StockReservation row appears
- ActivityLog count diverges from expected events

On FAIL → roll back to pre-Phase-B state. Open hotfix branch. Re-run Phase B from scratch after fix.

---

## 6. What Phase B is NOT

- Not a load test (no synthetic traffic generation)
- Not a security pen test (separate Tier)
- Not a UX test
- Not authorization to invite real customers (that's Phase C, separate)
- Not authorization to enable Tier 4 webhook (separate gate)
- Not a substitute for the per-route unit tests

---

## 7. Rollback plan if Phase B partially executed

If Boss starts Phase B and a mid-round failure surfaces:

1. STOP all test execution.
2. Document the exact failure point + IDs involved.
3. Do NOT delete test rows (they are forensic evidence).
4. Boss decides:
   - Roll back deploy → Vercel previous deploy promote
   - Hotfix branch + rerun
   - Pause Phase B and continue Boss-only ops
5. Update this doc with the failure mode + resolution.

---

## 8. Cross-references

- D4/D6 visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Commerce readiness audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Observability post-deploy runbook: `docs/superpowers/2026-05-18-observability-post-deploy-runbook.md`
- Admin onboarding readiness: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- Admin day-1 runbook: `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md`
- Tier 4.1 checklist: `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md`
