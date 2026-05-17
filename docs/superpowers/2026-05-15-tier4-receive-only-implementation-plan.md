# Tier 4 — receive-only inbound runtime implementation plan

**Filed:** 2026-05-17
**Status:** Implementation-ready plan. NO runtime code yet. Boss approval required before opening Tier 4.1 PR.

Supersedes the earlier docs-only plan `2026-05-14-omnichannel-inbound-receive-only-plan.md` by adding concrete PR-sized scope, route contracts, schema verification, security details, and test plan.

---

## 1. Goal

Receive (not send) messages from omnichannel sources and write them to existing `Conversation` / `ChannelIdentity` / `Message` rows. Tier 5 parser later turns matched messages into Booking suggestions; Tier 4 just captures + stores.

No outbound reply. No auto-booking. No customer-facing UI change. Admin sees inbound messages via future inbox tab.

## 2. Phase order

| Phase | Platform | Risk | Boss action |
|---|---|---|---|
| Tier 4.1 | Facebook Messenger Page inbox (webhook) | R1 (FB App secret) | Boss provides + Vercel env |
| Tier 4.2 | Facebook Page post comments (webhook) | R1 (same App) | reuse |
| Tier 4.3 | Facebook Live comments | R1 (same App + RTM API) | reuse |
| Tier 4.4 | Telegram bot | R1 (Telegram bot token) | Boss creates bot |
| Tier 4.5 | WhatsApp Cloud API | R1 (Meta WA App) | Boss App Review |

Each phase is its own PR. Do NOT bundle.

## 3. Tier 4.1 — Messenger webhook (recommended first)

### 3.1 Why first

- FB App already exists per project memory (App ID `780277861568430`)
- ChannelIdentity table already has `platform: MESSENGER` enum value
- Lowest surface — single webhook endpoint

### 3.2 Route contracts

```
GET  /api/webhooks/messenger
- Used by Meta to verify webhook on subscription
- Query: hub.mode=subscribe & hub.verify_token=<env> & hub.challenge=<random>
- Response: echo hub.challenge if hub.verify_token matches env
- Status: 200 on match, 403 on mismatch

POST /api/webhooks/messenger
- Receives message + comment + delivery events
- Header: X-Hub-Signature-256 — HMAC SHA-256 of raw body with FB App secret
- Verify signature BEFORE any DB work
- Response: 200 within 5 seconds (Meta retries on timeout)
- Idempotency: dedupe by Meta's message ID (Message.externalMessageId)
- Side effect: insert Conversation + ChannelIdentity + Message rows
```

### 3.3 Required env

| Var | Source | Sensitive |
|---|---|---|
| `FACEBOOK_APP_ID` | already set | low |
| `FACEBOOK_APP_SECRET` | already set | HIGH (used for HMAC) |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | already set | medium (any random string) |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | already set | HIGH (per-page) |

All four already in `src/lib/env.ts`. ✅ No new env needed.

### 3.4 Schema check

`Conversation` / `ChannelIdentity` / `Message` already exist (per Phase 1 schema). Verify before PR:
- `Message.externalMessageId` unique per platform — required for idempotency
- `Message.platform` enum includes `MESSENGER`
- `Message.rawPayload` Json — store raw for debugging + future parser
- `Message.receivedAt` — Meta timestamp
- `ChannelIdentity.platform` + `ChannelIdentity.externalUserId` unique pair
- `Conversation.shopId` required — derive from Page → Shop lookup

No schema change expected. Tier 4.1 = additive code only.

### 3.5 Idempotency

```typescript
// pseudo
try {
  await prisma.message.create({ data: { externalMessageId: <meta-id>, ... } });
} catch (P2002) {
  // duplicate webhook delivery; log + 200 OK
  return 200;
}
```

Meta retries failed webhook deliveries up to 3 times over 24h. P2002 on unique violation = expected dedup.

### 3.6 HMAC verification

```typescript
const signature = request.headers.get('x-hub-signature-256');
const rawBody = await request.text();
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
  .update(rawBody)
  .digest('hex');
if (signature !== expected) return 403;
```

Use `crypto.timingSafeEqual` to avoid timing attacks.

### 3.7 Rate limiting

Use existing `withRateLimit` middleware (per-IP). Meta sends from multiple IPs; consider per-AppID or per-Page limit instead. Defer to PR review.

### 3.8 Replay protection

Beyond Message.externalMessageId unique:
- Reject events older than 7 days (Meta sometimes replays during outage recovery)
- Reject events with timestamp > now + 1h (clock skew)
- Log + 200 OK on rejection (don't let Meta retry forever)

### 3.9 PII handling

Raw payload contains:
- `senderId` (PSID — already not raw FB ID; PSID-app-scoped)
- `senderName` (display name from FB profile API — needs separate call)
- `message.text` (may contain phone, address, slot, time)

Rules:
- Store rawPayload AS-IS in `Message.rawPayload` (admin-only readable)
- Do NOT log full text to Vercel stdout
- Log only Message ID + platform + Conversation ID
- Activity log entries omit text

### 3.10 Operational monitoring

- Counter: messages received per Page per hour
- Counter: HMAC verification failures per IP
- Counter: P2002 dedupes
- Counter: events rejected by timestamp guard
- Alert: HMAC failure spike (potential attack)
- Alert: Page Access Token expired (Meta returns specific error)

### 3.11 Test plan

#### Unit (vitest)

- HMAC verify function: pass / fail / timing-safe
- Idempotency: re-receive same externalMessageId → no duplicate
- Timestamp guard: stale / future / valid
- ChannelIdentity upsert: new sender / existing sender
- Conversation upsert: new convo / existing convo
- Shop resolution: Page → Shop mapping

#### Integration

- Route returns 200 on valid + signed payload
- Route returns 403 on invalid signature
- Route returns 403 on missing signature header
- Route returns 200 + idempotent on duplicate delivery
- Route returns 200 + skip on stale event
- Route does NOT touch any Booking/Order table
- Route does NOT send outbound message

#### Docker verifier `verify-messenger-webhook.ts`

- Test A: valid signed payload → Message row created
- Test B: duplicate same externalMessageId → no second row
- Test C: invalid signature → 403, no row
- Test D: stale event → 200, no row
- Test E: new sender → ChannelIdentity created
- Test F: existing sender → ChannelIdentity reused
- Test G: cross-shop Page → correct Shop linked
- Test H: rawPayload preserved

### 3.12 Branch + PR shape

- Branch: `feat/tier4.1-messenger-webhook-receive`
- Files (estimate):
  - `src/app/api/webhooks/messenger/route.ts` (NEW, ~200 lines)
  - `src/lib/webhooks/hmac.ts` (NEW, ~30 lines)
  - `src/server/repositories/inbound-message.repository.ts` (NEW, ~150 lines)
  - `src/lib/validation/messenger-webhook.schemas.ts` (NEW, ~50 lines zod)
  - `tests/unit/lib/webhooks/hmac.test.ts` (NEW)
  - `tests/unit/app/api/webhooks/messenger.route.test.ts` (NEW)
  - `scripts/verify-messenger-webhook.ts` (NEW)
  - `docs/superpowers/2026-05-??-tier4.1-handoff.md`
- No schema change
- No new env
- No flag (route accepts traffic immediately on deploy — gate via Meta subscription)

### 3.13 Deployment

1. PR merge.
2. Vercel deploys.
3. Boss subscribes Page to webhook URL via Meta Developer dashboard (out-of-band):
   - URL: `https://nazhahatyai.com/api/webhooks/messenger`
   - Verify token: `FACEBOOK_WEBHOOK_VERIFY_TOKEN` value
   - Subscribe to fields: `messages`, `messaging_postbacks`, `feed` (for post comments)
4. Meta sends GET verification → route echoes `hub.challenge` → subscription active.
5. Real customer message to Page → POST webhook → row in `Message` table.
6. Admin sees in future inbox tab (Tier 4.2+).

## 4. Tier 4.2-4.5 deferred

Each follows the same shape:
- Webhook route (or polling worker)
- HMAC / signature verification
- Idempotency via externalMessageId
- Rate limit
- PII rules
- Tests + verifier

Sequencing depends on Boss priority + which platform has highest customer signal.

## 5. Boss approval gates

Before opening Tier 4.1 PR:

- [ ] Confirm Meta App ID is still active + has webhook subscription permissions
- [ ] Confirm `FACEBOOK_APP_SECRET` + `FACEBOOK_WEBHOOK_VERIFY_TOKEN` + `FACEBOOK_PAGE_ACCESS_TOKEN` in Vercel Production env are current (token expires every ~60 days per project memory)
- [ ] Decide acceptable rate-limit policy (per-IP vs per-Page)
- [ ] Confirm PII storage policy aligns with `docs/superpowers/...-data-deletion.md` if it exists
- [ ] Confirm Meta App Review status (Page subscriptions need approved permissions)

## 6. Hard no-go

- ❌ No outbound message — Tier 4 is receive-only by definition
- ❌ No auto-booking from parse — Tier 5 territory
- ❌ No customer-visible side effect — admin sees inbox, customer sees nothing different
- ❌ No raw text in Vercel logs
- ❌ No HMAC-skip in dev — always verify
- ❌ No Tier 4.5 (WhatsApp) until Meta App Review approves
- ❌ No pak-ta-kra

## 7. Cross-references

- Tier 4 plan (docs): `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md`
- Tier 5 parser plan: `docs/superpowers/2026-05-14-comment-to-booking-parser-plan.md`
- Existing inbound schema: `prisma/schema.prisma` § Conversation / ChannelIdentity / Message / CommentParseLog
- Existing FB token handling: `src/lib/crypto/token.ts` (token encryption per project memory)
- Existing pino logger: `src/lib/logging/logger.ts`
- Existing rate limiter: `src/lib/validation/middleware.ts` `withRateLimit`
