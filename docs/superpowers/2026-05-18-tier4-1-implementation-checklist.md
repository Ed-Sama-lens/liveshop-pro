# Tier 4.1 — Messenger receive-only implementation checklist

**Filed:** 2026-05-18
**Pairs with:** `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
**Status:** docs + fixtures only. NO runtime route, NO env, NO secrets, NO Meta App changes.

This file decomposes the PR plan into an actionable checklist Boss can review one row at a time before approving the runtime PR. When every gate is GREEN, Claude opens `feat/tier4.1-messenger-webhook-receive`.

---

## 1. Boss approval gates (must all be GREEN before runtime PR)

| # | Gate | Owner | Status | How to verify |
|---|---|---|---|---|
| G1 | `FACEBOOK_APP_SECRET` exists + fresh in Vercel Production | Boss | unknown | Vercel → Settings → Env Vars → Sensitive |
| G2 | `FACEBOOK_PAGE_ACCESS_TOKEN` not expired (60-day rotation per project memory) | Boss | unknown | Meta Graph: `GET /me?access_token=<token>` returns 200 |
| G3 | `FACEBOOK_WEBHOOK_VERIFY_TOKEN` set + saved both in Vercel + Meta dashboard | Boss | unknown | echo handshake test |
| G4 | `Shop.facebookPageId` populated for `nazha-hatyai` | Boss | unknown | Prisma Studio or admin UI |
| G5 | Meta App in "Live" mode OR Boss test Page added as App Tester | Boss | unknown | Meta App Dashboard → App Review |
| G6 | Meta App permissions: `pages_messaging`, `pages_read_engagement` approved | Boss | unknown | Meta App Dashboard → Permissions |
| G7 | Boss explicitly approves flag name `ALLOW_MESSENGER_WEBHOOK_RECEIVE` | Boss | pending | written confirmation in chat |
| G8 | Boss explicitly approves PII storage policy (raw message text in DB) | Boss | pending | written confirmation |
| G9 | Boss explicitly approves rate-limit policy (suggested: 100 req/min per page, drop excess silently) | Boss | pending | written confirmation |
| G10 | Boss explicitly approves rollout plan (flag OFF on deploy → flip ON after 24h smoke window) | Boss | pending | written confirmation |

Until G1-G10 are all GREEN, this is a **paper** plan. Runtime code does not ship.

---

## 2. PR scope (what lands in `feat/tier4.1-messenger-webhook-receive`)

| Component | New / Modified | Test approach |
|---|---|---|
| `src/app/api/webhooks/messenger/route.ts` | NEW | unit test for GET handshake + POST receive |
| `src/server/services/messenger/verify-signature.ts` | NEW | unit test for HMAC verification (timing-safe compare) |
| `src/server/services/messenger/parse-payload.ts` | NEW | unit test against fixtures in `tests/fixtures/messenger/` |
| `src/server/services/messenger/persist-message.ts` | NEW | unit test for idempotent insert (P2002 catch) |
| `src/server/repositories/conversation.repository.ts` | MAYBE NEW | repo CRUD + tests |
| `src/server/repositories/channel-identity.repository.ts` | MAYBE NEW | upsert + tests |
| `src/lib/env.ts` | MOD | add `ALLOW_MESSENGER_WEBHOOK_RECEIVE` to Zod schema |
| `src/lib/sale/feature-flags.ts` | MOD | export `allowMessengerWebhookReceive` reader |
| `prisma/schema.prisma` | NO CHANGE | existing Conversation, ChannelIdentity, Message support shape |
| `tests/fixtures/messenger/*.json` | NEW (this PR — Track 7) | static |
| `tests/unit/app/api/webhooks/messenger/route.test.ts` | NEW | mock req → assert 200/400/403 |
| `tests/unit/server/services/messenger/*.test.ts` | NEW | service layer |
| `scripts/verify-messenger-webhook.ts` | NEW Docker verifier | full happy path |
| `docs/superpowers/2026-05-18-tier4-1-handoff.md` | NEW (when PR opens) | handoff + smoke runbook |

Estimated diff: ~700-900 lines (excluding fixtures already in tree).

---

## 3. Hard guarantees of the receive-only PR

- ❌ Does NOT send any outbound Messenger message
- ❌ Does NOT auto-create Booking from comment text (that's Tier 5)
- ❌ Does NOT subscribe Meta page to webhook (Boss does in Meta dashboard)
- ❌ Does NOT enable Meta App Live mode
- ❌ Does NOT rotate FACEBOOK_APP_SECRET
- ❌ Does NOT change CSP or `next.config.ts`
- ❌ Does NOT touch `/sale` UI
- ✅ Receives + verifies + persists messages behind a flag
- ✅ Idempotent on Meta retries
- ✅ Drops replays older than 7 days or futures > 1 hour
- ✅ Logs every event with request-id for audit
- ✅ Returns 200 even on failure (Meta SLO requirement — internal log captures real outcome)

---

## 4. Local testing without Meta

The fixtures committed in this PR enable full unit testing without a real Meta App secret. Test strategy:

```typescript
// pseudocode
import payload from 'tests/fixtures/messenger/page-inbox-text-message.json';
import { verifySignature } from '@/server/services/messenger/verify-signature';

const APP_SECRET = 'test-secret-fixture-only';
const rawBody = JSON.stringify(payload);
const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

expect(verifySignature(rawBody, sig, APP_SECRET)).toBe(true);
expect(verifySignature(rawBody, sig.slice(0, -1) + '0', APP_SECRET)).toBe(false);
expect(verifySignature(rawBody, null, APP_SECRET)).toBe(false);
expect(verifySignature(rawBody, 'sha1=' + sig, APP_SECRET)).toBe(false);
```

No real secret leaves the file. The test secret `test-secret-fixture-only` is a hard-coded fixture, not a production value.

---

## 5. Docker verifier scope

`scripts/verify-messenger-webhook.ts` (gated by `CONFIRM_NON_PROD_DB=true` + host deny-list):

1. Insert one synthetic Shop with `facebookPageId = '200000000000002'`.
2. POST `tests/fixtures/messenger/page-inbox-text-message.json` to the local route with computed HMAC.
3. Assert: 200 response, one `ChannelIdentity` row, one `Conversation` row, one `Message` row with `externalMessageId = 'm_FIXTURE_INBOX_TEXT_000000000001'`.
4. POST the same payload again.
5. Assert: 200 response, still exactly one `Message` row (idempotent).
6. POST `replay-old-timestamp.json`.
7. Assert: 200 response, but no `Message` row created (replay rejected).
8. POST `signature-test-payload.json` with wrong signature.
9. Assert: 200 response, no rows created, signature failure logged.
10. Cleanup: delete fixtures via Prisma `deleteMany`.

Expected: 9/9 PASS.

---

## 6. Smoke runbook (post-deploy, Boss-side)

After Claude opens the PR + Boss reviews + merge:

1. Vercel deploy goes Ready.
2. Boss subscribes Page to webhook in Meta dashboard.
3. Verification handshake should succeed (`GET /api/webhooks/messenger` returns `hub.challenge`).
4. Boss sends a test DM from Boss's own Facebook account to the Page.
5. Boss runs `npm run smoke:prod:unauth` → 16/16 pass.
6. Boss queries DB (Prisma Studio): expects 1 new Conversation + Message row.
7. Boss flips `ALLOW_MESSENGER_WEBHOOK_RECEIVE=true` in Vercel.
8. Boss re-tests with a second DM.
9. If clean → 24h observation.
10. Tier 4.2 (Live comments) PR planning starts after 24h clean.

---

## 7. Risk-prioritized concerns

| Severity | Concern | Mitigation |
|---|---|---|
| HIGH | Meta retries with same payload → duplicate rows | `Message.externalMessageId` unique + P2002 catch |
| HIGH | Replay attack with old payload | Reject `time > 7 days old` |
| HIGH | HMAC bypass | Timing-safe compare + exact `sha256=` prefix check |
| MEDIUM | Page resolution to wrong Shop | Validate `Shop.facebookPageId` exact match before persist |
| MEDIUM | Large payload OOM | Reject body > 1MB at route level |
| MEDIUM | Bot/scraping noise | Rate limit 100 req/min per Page; silent drop excess |
| LOW | Race on Conversation upsert | Prisma transaction + retry-on-conflict |
| LOW | Webhook timeout (Meta 5s) | Persist in background; return 200 fast |

---

## 8. Out of scope (Tier 4.2+ or separate)

- Live comments (separate webhook subscription type)
- WhatsApp Business webhooks (different App / different signature header)
- Telegram bot updates (different platform entirely)
- Outbound message send
- Parser auto-booking from comment text
- Customer profile fetch via Graph API
- Threading / reply chain reconstruction
- Bulk historical message import

---

## 9. What Boss confirms in chat before PR opens

Copy-paste back to Claude:

```
Tier 4.1 gates verified:
- G1 FACEBOOK_APP_SECRET fresh: yes/no
- G2 FACEBOOK_PAGE_ACCESS_TOKEN not expired: yes/no
- G3 FACEBOOK_WEBHOOK_VERIFY_TOKEN set in Vercel + Meta dashboard: yes/no
- G4 Shop.facebookPageId populated: yes/no
- G5 Meta App Live OR Boss test Page Tester: yes/no
- G6 pages_messaging + pages_read_engagement approved: yes/no
- G7 flag name ALLOW_MESSENGER_WEBHOOK_RECEIVE approved: yes/no
- G8 PII storage approved: yes/no
- G9 rate limit 100 req/min/page approved: yes/no
- G10 rollout flag-OFF → 24h → flip-ON approved: yes/no
- Boss authorizes Claude to open feat/tier4.1-messenger-webhook-receive: yes/no
```

If all yes → Claude opens the PR.

---

## 10. Cross-references

- PR plan: `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
- Tier 4 (original): `docs/superpowers/2026-05-15-tier4-receive-only-implementation-plan.md`
- Fixtures: `tests/fixtures/messenger/`
- Meta Messenger Platform docs: https://developers.facebook.com/docs/messenger-platform/webhooks
