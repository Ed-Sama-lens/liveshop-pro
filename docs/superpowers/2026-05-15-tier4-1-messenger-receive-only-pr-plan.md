# Tier 4.1 — Messenger receive-only PR plan

**Filed:** 2026-05-17
**Status:** PR-shaped plan. Refines `2026-05-15-tier4-receive-only-implementation-plan.md` into actionable PR scope. NO runtime code yet. Boss approval + Meta token freshness check required before opening PR.

---

## 1. PR identity

- **Branch:** `feat/tier4.1-messenger-webhook-receive`
- **Title:** `feat(messenger): receive-only webhook for page inbox + post comments`
- **Risk:** R1 (touches webhook boundary, uses App Secret env)
- **Estimated diff:** ~700-900 lines (route + repo + helpers + tests + verifier + docs)

## 2. Why first

Messenger Page inbox + Post comments share the same Meta Graph webhook subscription. One PR unlocks two source channels (`PAGE_INBOX` and `POST_COMMENT` BookingSource enum values).

Tier 4.2-4.5 (Live comments / Telegram / WhatsApp) are separate PRs to keep blast radius small.

## 3. Feature flag

`ALLOW_MESSENGER_WEBHOOK_RECEIVE` (new env var):

- Default `false`.
- Repository layer reads at call-time (matches D3/D4/D6 pattern).
- When false: webhook route returns 200 OK but does NOT persist messages. Meta sees green; we silently drop.
- When true: full receive + persist path runs.

Rationale: PR can ship behind flag = OFF; deploy is behavior-neutral until Boss flips. Same pattern as D3/D4/D6 paired flags.

## 4. Route contracts

### `GET /api/webhooks/messenger`

Verification challenge handshake. Meta calls once when Boss subscribes Page to webhook via Developer dashboard.

**Query:**
- `hub.mode` = `subscribe`
- `hub.verify_token` = arbitrary secret Boss configures in Meta dashboard + matches `FACEBOOK_WEBHOOK_VERIFY_TOKEN` env
- `hub.challenge` = random string Meta wants echoed

**Response:**
- 200 with `hub.challenge` body if `hub.verify_token` matches env.
- 403 otherwise.

No DB touch. No flag check (route must always respond so Boss can subscribe even before flag flip).

### `POST /api/webhooks/messenger`

Receives events. Meta posts JSON payload signed with HMAC-SHA-256 of body using App Secret.

**Headers:**
- `X-Hub-Signature-256` = `sha256=<hex>`

**Body:** Meta Messaging payload (see Meta Graph API docs). Two relevant event shapes:
- `messaging` (Page inbox DM)
- `feed` change (post comment / live comment / reaction — filter to comment kind only)

**Response:**
- 200 within 5 seconds always (Meta retries on timeout/non-200).
- 200 even on signature failure (log + drop) — Meta retries forever if we 403, and a successful attacker wouldn't be helped by retries anyway.
- 200 even on flag OFF (silent drop).

**Side effects (flag ON only):**
- Resolve Page → Shop via `Shop.facebookPageId`.
- Upsert `ChannelIdentity` for the sender PSID + platform.
- Upsert `Conversation` for (shop, channelIdentity, platform).
- Insert `Message` with `externalMessageId` unique constraint (idempotent on retry).

## 5. HMAC verification

```typescript
import crypto from 'node:crypto';

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

Pure function. Unit-testable. Constant-time compare to defeat timing oracle.

## 6. Idempotency

Two layers:

1. `Message.externalMessageId` UNIQUE (already in schema). P2002 catch → log + 200 OK.
2. Same-payload dedup window: if (shopId, channelIdentityId, body hash, timestamp ± 5s) matches existing row, skip. Defends against Meta sending the same payload with two different externalMessageIds (rare but documented).

## 7. Replay protection

- Reject events with `entry[].time` older than 7 days (`Date.now() - 7*86400e3`).
- Reject events with `entry[].time` more than 1 hour in the future (clock skew).
- Log + 200 OK on rejection.

## 8. Schema audit (no change expected)

Verify before PR:

- `Message.externalMessageId String? @unique`
- `Message.platform Platform` — enum includes `MESSENGER`
- `Message.rawPayload Json`
- `Message.receivedAt DateTime`
- `Message.shopId String` + FK
- `Message.conversationId String?` + FK
- `Message.channelIdentityId String?` + FK
- `ChannelIdentity` model has `platform`, `externalUserId`, `shopId` + composite unique
- `Conversation` model has `shopId`, `channelIdentityId`, `platform` + composite unique
- `Shop.facebookPageId String? @unique` — required for Page → Shop lookup

If any field missing: Tier 4.1.0 schema migration PR first (separate, additive).

## 9. PII handling

- `Message.rawPayload` stores the full Meta payload AS-IS (admin debug visibility).
- `Message.text` derived field stores only the cleaned text content.
- Vercel logs (pino) include `messageId`, `platform`, `conversationId`, `shopId` — NEVER raw text or sender PSID directly.
- Sender display name fetched separately via Graph API only when admin opens the conversation in inbox UI (Tier 4.1 does not pre-fetch).

## 10. Rate limiting

Existing `withRateLimit` middleware uses Redis-backed per-IP token bucket. Meta sends from a pool of IPs.

Recommendation: skip per-IP for the webhook route. Instead:
- Per-Page event rate sanity check (>100 events/sec for same Page → log + 200 + drop).
- HMAC failure spike detector (>10 failures in 60s from same IP → temporarily 403).

Implementation: lightweight in-memory counter via existing Redis `lib/rate-limit.ts` helper. Out-of-scope to lift to its own module.

## 11. Required env (all already present per `src/lib/env.ts`)

| Var | Sensitive | Purpose |
|---|---|---|
| `FACEBOOK_APP_ID` | low | Page subscription verification |
| `FACEBOOK_APP_SECRET` | HIGH | HMAC body verification |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | medium | challenge handshake |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | HIGH | Graph API calls (later — Tier 4.1 receive doesn't call Graph) |
| `ALLOW_MESSENGER_WEBHOOK_RECEIVE` | low | NEW flag default false |

Boss verifies these are current. Per project memory, `FACEBOOK_PAGE_ACCESS_TOKEN` rotates every ~60 days; check expiry before PR.

## 12. Files (estimate)

| File | Status | Lines |
|---|---|---|
| `src/app/api/webhooks/messenger/route.ts` | NEW | ~220 |
| `src/lib/webhooks/hmac.ts` | NEW | ~40 |
| `src/lib/webhooks/messenger-event-normalizer.ts` | NEW | ~150 |
| `src/server/repositories/inbound-message.repository.ts` | NEW | ~180 |
| `src/lib/validation/messenger-webhook.schemas.ts` | NEW | ~60 |
| `src/lib/sale/feature-flags.ts` | MOD | +6 (allowMessengerWebhookReceive helper) |
| `src/lib/env.ts` | MOD | +6 (zod entry) |
| `tests/unit/lib/webhooks/hmac.test.ts` | NEW | ~80 |
| `tests/unit/lib/webhooks/messenger-event-normalizer.test.ts` | NEW | ~120 |
| `tests/unit/app/api/webhooks/messenger.route.test.ts` | NEW | ~180 |
| `scripts/verify-messenger-webhook.ts` | NEW | ~250 |
| `docs/superpowers/2026-05-??-tier4.1-messenger-handoff.md` | NEW | ~200 |

**Estimated total:** ~1500 lines new + ~12 lines modified.

## 13. Test plan

### Unit

- HMAC verify pass / fail / timing-safe.
- HMAC verify rejects mismatched signature length.
- HMAC verify rejects malformed `sha256=` prefix.
- Event normalizer extracts Page inbox messaging event correctly.
- Event normalizer extracts Post comment feed change event correctly.
- Event normalizer rejects unknown event types.
- Event normalizer handles emoji + non-Latin text.

### Integration (route)

- GET handshake returns challenge on token match.
- GET handshake returns 403 on token mismatch.
- POST returns 200 + persists on valid signed payload.
- POST returns 200 + drops on invalid signature.
- POST returns 200 + drops on flag OFF.
- POST returns 200 + idempotent on duplicate externalMessageId.
- POST returns 200 + drops on stale timestamp.
- POST never touches Booking / Order tables.
- POST never sends outbound message.

### Docker verifier `verify-messenger-webhook.ts`

- Test A: HMAC valid + flag ON → Message row inserted.
- Test B: HMAC valid + duplicate → no second row.
- Test C: HMAC invalid → 200 + no row.
- Test D: Flag OFF + valid HMAC → 200 + no row.
- Test E: Stale event (>7d old) → 200 + no row.
- Test F: New sender → ChannelIdentity created.
- Test G: Existing sender → ChannelIdentity reused.
- Test H: Page-Shop mapping → correct shopId.
- Test I: Cross-shop attempt (unknown Page ID) → 200 + no row + log.
- Test J: rawPayload preserved exactly.

## 14. Deployment

1. PR review + merge.
2. Vercel auto-deploy. Flag default OFF.
3. Boss subscribes Page to webhook via Meta Developer dashboard:
   - Callback URL: `https://nazhahatyai.com/api/webhooks/messenger`
   - Verify token: matches `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
   - Fields: `messages`, `messaging_postbacks`, `feed`
4. Meta sends GET handshake → 200 + challenge.
5. Test message → Meta POSTs → flag OFF, route returns 200, no row.
6. Boss flips `ALLOW_MESSENGER_WEBHOOK_RECEIVE=true` + redeploys.
7. Test message → row persists in `Message` table.
8. Inspect via Prisma Studio (no UI yet — that's Tier 4.2+).

## 15. Hard no-go

- ❌ No outbound message — receive-only by definition.
- ❌ No auto-booking — Tier 5 parser territory.
- ❌ No customer-visible side effect.
- ❌ No raw text in Vercel logs.
- ❌ No HMAC skip ever.
- ❌ No Meta App Review change (use existing approved permissions).
- ❌ No pak-ta-kra.
- ❌ No backup dump.

## 16. Boss approval gates (must clear before PR)

- [ ] Confirm `FACEBOOK_APP_SECRET` in Vercel Production is current (Meta dashboard → App Settings → Basic → App Secret).
- [ ] Confirm `FACEBOOK_PAGE_ACCESS_TOKEN` not expired (last rotation date per project memory `feedback_facebook_token.md`).
- [ ] Confirm `Shop.facebookPageId` field exists in schema + Boss has filled in for `nazha-hatyai` shop.
- [ ] Confirm Meta App is in "Live" mode OR Boss test Page is added as App Tester.
- [ ] Approve flag name `ALLOW_MESSENGER_WEBHOOK_RECEIVE`.
- [ ] Approve PII policy: rawPayload stored AS-IS, never logged.
- [ ] Approve rate-limit policy: per-Page sanity + HMAC failure detector (no per-IP).
- [ ] Approve rollout: flag default false, Boss flips after subscription tested.

## 17. Cross-references

- Earlier Tier 4 plan: `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md`
- Refined doc: `docs/superpowers/2026-05-15-tier4-receive-only-implementation-plan.md`
- Tier 5 parser plan (consumer): `docs/superpowers/2026-05-14-comment-to-booking-parser-plan.md`
- Existing FB token feedback memory: per project memory
- Existing schema: `prisma/schema.prisma` § Conversation / ChannelIdentity / Message / CommentParseLog
