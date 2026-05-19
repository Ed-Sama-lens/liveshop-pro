# Admin onboarding — day-1 operational runbook

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
**Status:** docs-only. Read after the readiness checklist passes.

The readiness checklist answers "can we onboard?" This file answers "what does the first admin do on day 1, day 2, and every day after?"

---

## 1. Pre-onboarding Boss-only actions

Boss must complete these before sending the admin invite. Each row blocks onboarding until done.

| # | Action | Owner | Where | Risk if skipped |
|---|---|---|---|---|
| 1 | Decide stock decrement model X / Y / Z | Boss | `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md` | drift, manual reconciliation burden |
| 2 | Run D4/D6 functional smoke (Stage A-G) | Boss | visual guide | unknown production behavior |
| 3 | Capture test fixture IDs in MEMORY.md | Boss | local memory | no regression baseline |
| 4 | Implement password-change UI (deferred) | Boss approves, Claude implements | feat PR | admin cannot rotate password |
| 5 | Add request-id middleware (lightweight obs) | Boss approves, Claude implements | feat PR | hard to trace cross-route errors |
| 6 | Confirm telegram/discord/email alert sink | Boss | Vercel env or external | no on-call signal |
| 7 | Document carrier handoff process | Boss writes, Claude can scaffold | docs | shipping inconsistent |
| 8 | Document slip verification policy | Boss | docs | payment misvalidation |
| 9 | Boss + admin agree on hours / SLA | Boss + admin verbally | n/a | expectation mismatch |
| 10 | Boss decides "real customer onboarding" cutoff date | Boss | calendar | premature exposure |

If any row blank → onboarding blocked.

---

## 2. Day 1 admin workflow

First day after admin invite. Run with Boss watching the first three orders.

### Morning (admin orientation, ~60 min)

1. Admin logs in via next-auth at `https://nazhahatyai.com/auth/sign-in`.
2. Boss walks admin through `/sale` workspace:
   - Sidebar `ขายของไลฟ์สด` is the only sales entry
   - Product Codes panel
   - Booking Queue panel
   - Customer Panel
   - Order Conversion panel
   - Collapsible Live Sessions + Inbox
3. Boss walks admin through Add from Stock dialog (Tier 3).
4. Boss walks admin through Edit / Delete dialog (Tier 3.6).
5. Boss walks admin through Manual Create Booking dialog.
6. Boss explains:
   - flag state (D3 + D4 + D6 ON)
   - what evergreen vs live-bound means
   - what reservedQty means
   - that stock does NOT auto-decrement on DELIVERED yet — admin must do it manually unless option Y / Z chosen

### Midday (paired execution, ~60 min)

Admin executes a sandbox flow on Boss test fixtures (the test BP + Booking + Order from the smoke). Boss watches.

1. Create new BroadcastProduct with displayCode `ADMIN-DAY1-001`.
2. Create manual booking for Boss customer, quantity 1.
3. Confirm booking.
4. Verify reservedQty +1.
5. Cancel a second booking; verify reservation released.
6. Convert first booking → order.
7. Verify order is RESERVED in `/orders`.

If any step errors → STOP. Admin reports to Boss, Boss reports to Claude.

### Afternoon (read-only shadow, ~60 min)

Admin observes:

1. The Activity feed (if reachable).
2. The Inventory page columns: quantity, Reserved, Available.
3. The Orders page filter / search.
4. Customer search.
5. Live Sessions list.

No actions. Just reading + asking questions.

### End of day 1

- Boss reviews each action admin took.
- Boss decides whether admin gets day-2 unsupervised access.
- Admin receives written summary of:
  - what they did
  - what they should NOT do without Boss approval
  - escalation path

---

## 3. Daily operations checklist (post day-1)

Admin runs at start of every shift.

### Open of shift (5 min)

- [ ] Check Vercel "Production" deploy status (Vercel Dashboard → Deployments → top row Ready)
- [ ] Open `/sale` workspace. Verify panels load.
- [ ] Scan Booking Queue for PENDING_REVIEW from inbound channels (currently MANUAL only; future Tier 4)
- [ ] Scan Orders for stuck RESERVED orders older than 24h (manual triage)
- [ ] Scan Inventory for any variant with Reserved > quantity (data integrity flag — escalate to Boss)

### During shift

- Create bookings only for known test customers OR Boss-pre-approved real customers
- Confirm bookings only after verifying with customer
- Cancel bookings on customer request OR on stock unavailability
- Convert bookings to orders only after payment slip received
- Upload slip + mark VERIFIED only after visual confirmation against bank app
- Enter tracking number only after handoff to carrier (manual today)
- Mark DELIVERED only after delivery confirmation from carrier OR customer
- If chosen stock model = Z (manual): adjust inventory immediately after marking DELIVERED

### Close of shift

- [ ] No PENDING_REVIEW bookings older than 4 hours without owner
- [ ] No RESERVED orders without slip uploaded older than 24h
- [ ] No tracking-pending orders older than 48h
- [ ] Inventory reservedQty matches sum of CONFIRMED bookings (manual sanity check until automated)
- [ ] Write end-of-shift note in handoff doc / chat

---

## 4. Emergency contacts / actions

Each row must be filled BEFORE inviting the admin.

| Scenario | Who admin contacts | How | Expected response time |
|---|---|---|---|
| Production 500 | Boss | LINE / WhatsApp | within 1 hour business hours |
| Cannot login | Boss | LINE | same-shift |
| Order data looks wrong | Boss | LINE + screenshot | within 4 hours |
| Customer escalation | Boss | LINE | same-day |
| Suspected fraud | Boss | immediate phone | immediate |
| System slow / timeout | Boss | LINE | within 1 hour |

Admin must NOT:
- Restart Vercel deploys
- Edit Vercel env vars
- Delete records via Prisma Studio
- Use raw SQL
- Rotate secrets
- Touch FB App settings

---

## 5. Escalation flowchart

```
admin issue
  ├─ UI display only → admin retries (Ctrl+Shift+R hard refresh) once
  │                  → if persists → screenshot + report Boss
  │
  ├─ 400 / 404 / 409 with clear message → admin reads message, follows hint
  │                                      → if unclear → screenshot + Boss
  │
  ├─ 401 → admin re-login. If persists → Boss
  │
  ├─ 500 → STOP. Screenshot full page + DevTools Network panel. Report Boss immediately.
  │       Boss decides: roll back deploy / open hotfix / escalate Claude.
  │
  └─ data corruption suspicion → STOP. Do NOT click anything more.
                                Screenshot. Report Boss. Boss investigates.
```

---

## 6. Day-1 success criteria

End of day 1 PASS if all of these are true:

- [ ] Admin completed all paired-execution steps without errors
- [ ] Admin understood the difference between MANUAL / future-inbound bookings
- [ ] Admin understood reservedQty + stock decrement gap
- [ ] Admin executed at least one read-only shadow rotation
- [ ] Boss did not have to intervene more than 3 times for the same kind of question
- [ ] No production 500 surfaced from admin actions
- [ ] No real customer was touched
- [ ] Admin can articulate escalation path

If 6+ pass → admin proceeds to day-2 supervised mode.
If < 6 pass → restart day-1 paired training tomorrow.

---

## 7. Day-2 to day-7

- Day 2: admin handles bookings + confirmations alone, Boss reviews end-of-shift.
- Day 3: admin handles conversion + slip review under Boss review.
- Day 4: admin handles full booking → delivered cycle on Boss-pre-approved customers.
- Day 5: 1 real customer (Boss known), if previous days pass.
- Day 6-7: gradually widen real customer set.

If any day's review fails → roll back one stage.

---

## 8. Boss-required decisions before admin onboarding

Currently pending — must be resolved:

- [ ] Stock decrement model X / Y / Z (Track 5)
- [ ] Sitemap policy (Track 10)
- [ ] Observability minimum (Track 6)
- [ ] D4/D6 functional smoke PASS (Track 2 / external)
- [ ] Phase B unblock criteria reviewed (Track 8)
- [ ] Tier 4.1 gate / no-go for first onboarding cohort (Track 7)

---

## 9. What this runbook is NOT

- Not a replacement for the readiness checklist
- Not a training manual (Boss runs in person)
- Not a contractual SLA
- Not a substitute for the D4/D6 smoke
- Not authorization to invite admins — Boss decides

---

## 10. Cross-references

- Readiness checklist: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- D4/D6 smoke checklist: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-checklist.md`
- D4/D6 smoke visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Stock decision matrix: `docs/superpowers/2026-05-15-stock-decrement-decision-matrix.md`
- Commerce readiness: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Observability plan: `docs/superpowers/2026-05-15-observability-error-tracking-plan.md`
