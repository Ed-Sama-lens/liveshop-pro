# Observability + error tracking plan

**Filed:** 2026-05-17
**Status:** Docs-only audit. Lightweight improvements proposed; nothing implemented in this doc.

---

## 1. Current state

| Source | Available | Quality |
|---|---|---|
| Vercel function logs | ✅ Vercel dashboard | Default Vercel stdout/stderr; no structured filtering |
| Vercel build logs | ✅ | Per-deploy |
| Railway Postgres logs | ✅ Railway dashboard | DB-level only; no app correlation |
| Railway Redis logs | ✅ | Rate limiter source |
| Application structured logger | ✅ `src/lib/logging/logger.ts` (pino) | wraps console.log replacements |
| Activity log table | ✅ `ActivityLog` model | per booking/order/BP mutation |
| OrderAudit table | ✅ `OrderAudit` model | populated by V2 conversion |
| BookingHistory table | ✅ `BookingHistory` model | populated by status transitions |
| Client error boundary | ✅ `src/components/ErrorBoundarySection.tsx` | wraps each sale panel |
| Sentry / Datadog / paid APM | ❌ none configured |
| Slack / Telegram alerting | ❌ none configured |
| Uptime monitoring | ❌ none (smoke harness exists but not on cron) |

## 2. Gaps

### A. No alerting

Currently nothing pings Boss when production breaks. Vercel emails on build failure, but no runtime 500 alert.

### B. Structured logs not parsed

`pino` logs to stdout. Vercel shows them but no query / aggregation. Pattern matching by eye only.

### C. No correlation

ActivityLog row, Vercel stdout line, and BookingHistory row all describe the same event but no single request ID links them.

### D. Smoke harness not on cron

`tests/e2e/prod-unauth-smoke.spec.ts` (16 cases) exists but only Boss runs it manually. Could run on schedule.

### E. No client error capture

If admin UI throws in production, no telemetry. ErrorBoundarySection catches but only renders fallback; doesn't report.

## 3. Lightweight recommendations (no paid vendor)

### Quick wins (R2 each)

1. **Add request-id middleware** — generate UUID per request, log it in pino, return in `X-Request-Id` header. Admin reports an error → asks for the header value → ops grep Vercel logs.
2. **Add Vercel cron for `prod-unauth-smoke` spec** — run hourly. Vercel Cron + GitHub Actions can call Playwright headless. Failure → automatic email to Boss.
3. **Surface `OrderAudit` in `/orders` UI** — admin can see who did what + when without inspecting DB.
4. **Surface `BookingHistory` in `/sale` booking row** — click row → expand history timeline.

### Medium-term (Boss approval)

5. **Free Sentry tier** — 5k events/month, install via `@sentry/nextjs`. Client + server capture. Slack webhook for high-severity.
6. **Telegram bot for ops alerts** — existing telegram plugin (per project memory). On Vercel build failure + production smoke failure, post to Boss's Telegram.
7. **Status page (simple)** — public `/status` page rendering smoke-harness output. Stretch.

### Heavy (defer)

8. Datadog / New Relic APM — paid, overkill for current scale.
9. Distributed tracing — OpenTelemetry, complex setup.
10. Real user monitoring (RUM) — not needed until customer traffic exists.

## 4. Specific monitoring targets

### Per-route 4xx/5xx rate

Vercel dashboard shows aggregate. Without aggregation tooling, the signal is:
- 401 rate normal for unauth probes (expected; do not alert)
- 404 rate normal for storefront probes (expected)
- 500 rate must be alerted (currently no alert)
- 409 rate from booking conversion = potential booking integrity issues; should alert if elevated

### Booking → Order conversion rate

ActivityLog action `ORDER_CREATED_FROM_BOOKINGS` count / Booking CONFIRMED count over 7d window. If conversion drops below baseline → admin behavior change.

### Stock drift

`SELECT SUM(reservedQty) FROM "ProductVariant"` over time. If grows linearly without bounded shipment activity → stock decrement gap exposing itself.

### Payment slip backlog

Count of `Payment.status = AWAITING_VERIFICATION` older than 24h. Should alert.

### Booking integrity

`BookingHistory` rows with `fromStatus = CONFIRMED` and `toStatus = CONFIRMED` (i.e. re-confirm attempts) — could indicate integrity issues.

## 5. Minimal observability checklist for real admin onboarding

Boss before inviting admins:

- [ ] Request-ID header wired
- [ ] Vercel Cron running `prod-unauth-smoke` hourly
- [ ] OrderAudit surface in `/orders` UI (or at least documented Prisma query)
- [ ] Telegram bot alert for production 5xx
- [ ] Manual log review SOP — Boss commits to reviewing Vercel logs daily for first week

## 6. Cross-references

- Smoke harness: `docs/superpowers/2026-05-14-production-smoke-harness-plan.md`
- Order audit: `docs/superpowers/2026-05-15-order-payment-shipping-readiness-audit.md`
- Admin onboarding: `docs/superpowers/2026-05-15-admin-onboarding-readiness-checklist.md`
- Telegram plugin (Boss already enabled per project memory)
