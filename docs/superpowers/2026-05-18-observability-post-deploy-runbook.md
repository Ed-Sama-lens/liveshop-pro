# Observability — post-deploy / post-smoke runbook

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-observability-error-tracking-plan.md`
**Status:** docs-only. What to inspect after a deploy or functional smoke.

The 2026-05-17 plan covers the strategic gaps. This runbook covers the tactical checklist: what specifically to look at, in what order, and how long the window is.

---

## 1. Post-deploy inspection (every Vercel master deploy)

Run within 15 minutes of "Ready" in Vercel Deployments.

### 1.1 Smoke (mandatory)

```bash
npm run smoke:prod:unauth
```

Expect 16/16 pass in ~10 seconds. If any FAIL → STOP. Rollback the deploy via Vercel dashboard → previous deploy → Promote to Production.

### 1.2 Vercel logs scan (5 min window after deploy)

In Vercel project → Functions → Logs. Filter window: deploy time + 5 min.

Look for:

| Pattern | Verdict |
|---|---|
| `level: 50` (pino error) in any line | suspicious — investigate |
| `Error: ` stack trace | suspicious |
| `PrismaClientKnownRequestError` | DB issue — escalate |
| `ECONNREFUSED` / `ETIMEDOUT` | infra — check Railway |
| `Cannot find module` | build issue — re-deploy from clean |
| Repeated 401 from same IP within seconds | scraping or misconfig — usually harmless |

Acceptable noise:
- 401 on `/api/sale/*` from unauth health checks
- 404 on `/sitemap.xml` (Option A, no metadata route)
- 307 on `/` (sign-in redirect for unauth visits)

### 1.3 Railway Postgres logs scan (deploy + 10 min)

Railway dashboard → liveshop-pro DB service → Logs. Skim for:

- Connection storm (> 50 simultaneous from Vercel) → connection pool exhaustion
- Long-running queries (> 5s) → missing index or N+1
- `pg_isready` failures → DB outage

### 1.4 Spot-check Vercel function metrics

Vercel → Functions → top 5 slowest in last 10 min. None should be > 2s p95 for sale routes.

### 1.5 Spot-check error rate

Vercel → Analytics → 4xx/5xx rate for last 1 hour. No spike compared to pre-deploy hour.

### 1.6 Stop conditions

Roll back the deploy if any of:
- Smoke fails
- Vercel logs show repeated 500 from sale routes
- DB connection errors
- p95 latency > 5s on any route

---

## 2. Post-functional-smoke inspection (Boss D4/D6 result)

Run when Boss reports the D4/D6 PASS/FAIL.

### 2.1 If PASS

1. Verify the captured IDs match Vercel function logs (search by booking ID + order ID + BroadcastProduct ID).
2. Verify `ActivityLog` row count increased by the expected number (~7 events per full happy path: create BP, create booking, confirm, create order).
3. Verify `BookingHistory` rows for the booking ID show: created (PENDING_REVIEW) → confirmed (CONFIRMED) → converted (CONVERTED_TO_ORDER).
4. Verify `OrderAudit` row for the order ID exists with conversionPath `v2`.
5. Verify `StockReservation` for the variant has `orderId` set (not null), `releasedAt` null (until DELIVERED).
6. Verify `ProductVariant.reservedQty` matches expectation (+ qty for each CONFIRMED booking not yet converted; remains same after conversion).
7. Record fixture IDs in MEMORY.md for future regression.

### 2.2 If FAIL

1. Identify which stage (A-G).
2. Pull Vercel logs for the exact timestamp window.
3. Look for the 500/4xx response that triggered fail.
4. Open hotfix branch `fix/sale-smoke-<stage>-<topic>`.
5. Do NOT push to master without re-running the smoke.

### 2.3 Common false positives

| Symptom | Real cause |
|---|---|
| 409 idempotency on REPLAY but new orderId | bug in V2 conversion path — real fail |
| 409 idempotency on REPLAY with same orderId | working as designed, not fail |
| 401 anywhere in Stage A-G | session expired or admin not OWNER role |
| 404 on Add from Stock variant search | DB has 0 ProductVariant for the search term |
| 500 in Stage C | check `ALLOW_EVERGREEN_BROADCAST_PRODUCT` and `ALLOW_NON_LIVE_BOOKING` are ON |

---

## 3. Daily observability checklist (admin onboarding period)

Boss runs once per business day for the first 2 weeks after first admin invite.

### Morning (5 min)

- [ ] Vercel dashboard → no failed deploys overnight
- [ ] `npm run smoke:prod:unauth` → 16/16 pass
- [ ] Railway DB connections < 50% pool utilization
- [ ] Activity feed (if surfaced) → no unexpected entries

### Evening (5 min)

- [ ] Vercel logs → no unexpected 500 patterns
- [ ] OrderAudit table grew commensurate with reported orders
- [ ] BookingHistory shows expected transitions
- [ ] ProductVariant.reservedQty + quantity sums make sense

### Weekly

- [ ] Sum of `reservedQty` across all variants → not climbing without bounded shipment activity (stock drift signal)
- [ ] Count of bookings stuck PENDING_REVIEW > 7 days → escalation review
- [ ] Count of orders stuck RESERVED > 7 days → payment slip backlog

---

## 4. Alerting thresholds (if Telegram/Sentry wired later)

| Metric | Warn | Alert | Page |
|---|---|---|---|
| 5xx rate on `/api/sale/*` | > 1% over 5min | > 5% over 5min | > 10% over 1min |
| Smoke harness failure | once | twice in 1h | three in 4h |
| DB connection failures | once in 10min | once in 5min | once in 1min |
| `/api/auth/*` 5xx | > 1% over 5min | > 5% over 5min | any sustained |
| Stock reservedQty > quantity for any variant | once detected | n/a | n/a |
| Booking integrity error count | > 0 in 24h | > 0 in 1h | > 0 in 5min |

Defaults assume low real-traffic. Adjust after first week of real ops.

---

## 5. What this runbook does NOT do

- Does not configure Sentry, Telegram, or any external service
- Does not change Vercel cron settings
- Does not add code
- Does not promise these checks run automatically

---

## 6. Cross-references

- Strategic observability plan: `docs/superpowers/2026-05-15-observability-error-tracking-plan.md`
- Smoke harness runbook: `docs/superpowers/2026-05-18-prod-smoke-harness-runbook.md`
- D4/D6 smoke visual guide: `docs/superpowers/2026-05-15-boss-side-d4-d6-functional-smoke-visual-guide.md`
- Admin day-1 runbook: `docs/superpowers/2026-05-18-admin-onboarding-day1-runbook.md`
