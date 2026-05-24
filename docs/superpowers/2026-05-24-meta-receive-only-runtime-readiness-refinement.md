# Meta Facebook Receive-Only Runtime — Readiness Refinement

**Filed:** 2026-05-24 (autonomous Phase 5)
**Author:** Claude Sonnet 4.6
**Status:** Pre-runtime refinement. NO runtime. NO webhook route. NO Meta API call. NO env change.

Refines the existing Meta webhook signature preflight checklist with concrete event mapping + future booking/order path + Boss manual prerequisites. Companion to:

- `docs/superpowers/2026-05-24-meta-webhook-signature-preflight-checklist.md` (Phase D preflight)
- `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md` (PR plan + HMAC spec)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (raw-body + HMAC discovery)
- `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md` (receive-only architecture)
- `src/server/repositories/webhook.repository.ts:212` (existing HMAC helper)

---

## 0. What's already documented (cite-only)

| Topic | Source doc | Status |
|---|---|---|
| Meta App Dashboard 5 prereq gates | Phase D §1 | Boss-owned manual |
| Vercel env vars (`FACEBOOK_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`) | Phase D §2 | Boss-owned manual |
| HMAC verification checklist (raw body / `X-Hub-Signature-256` / `timingSafeEqual` / always-200 / no log) | Phase D §3 + Tier 4.1 PR plan §5 | implementation contract |
| Reference `verifyMetaSignature` snippet | Phase D §3 + Tier 4.1 PR plan §5 | implementation contract |
| Local tunnel options (cloudflared / ngrok / Vercel preview) | Phase D §4 | implementation reference |
| Pre-route-PR Boss-tick checklist | Phase D §5 | Boss-owned |
| Hard no-go list | Phase D §6 | binding |
| 5-PR runtime sequence (4.1-A through 4.1-E) | Phase D §7 | binding |

This doc EXTENDS Phase D with:
- explicit env names mapping (Boss confirmed vs Phase D speculative)
- exact App Dashboard checklist
- webhook verification flow
- page inbox / post / live event mapping
- message → customer → booking → order future path
- what Boss must do manually later

---

## 1. Env name mapping (CONFIRMED)

Phase D listed `META_APP_SECRET` + `META_WEBHOOK_VERIFY_TOKEN` as suggested names. **Actual existing schema entries in `src/lib/env.ts`:**

| Var | Status | Source |
|---|---|---|
| `FACEBOOK_APP_ID` | already in schema (optional default '') | `env.ts:17` |
| `FACEBOOK_APP_SECRET` | already in schema (optional default '') — **HIGH sensitivity** | `env.ts:18` |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | already in schema (optional default '') | `env.ts:19` |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | already in schema (optional default '') | `env.ts:20` |
| `FACEBOOK_CLIENT_ID` | already required | `env.ts:13` |
| `FACEBOOK_CLIENT_SECRET` | already required | `env.ts:14` |

**Phase D's `META_APP_SECRET` = use `FACEBOOK_APP_SECRET`** (already in schema).
**Phase D's `META_WEBHOOK_VERIFY_TOKEN` = use `FACEBOOK_WEBHOOK_VERIFY_TOKEN`** (already in schema).

No new env name needed. Boss sets values directly in Vercel against existing schema entries. `4.1-A` PR opens with no schema change required.

---

## 2. App Dashboard checklist (Boss does in browser BEFORE 4.1-A PR opens)

Step-by-step at [developers.facebook.com](https://developers.facebook.com):

### 2.1 App identity verify

- [ ] App ID `780277861568430` matches Vercel `FACEBOOK_APP_ID`
- [ ] App display name set
- [ ] App icon set
- [ ] App Domain includes `nazhahatyai.com`
- [ ] Privacy Policy URL set (public)
- [ ] Terms of Service URL set (public)
- [ ] Data Deletion mechanism (callback OR instructions URL) set

### 2.2 Permissions / App Review

- [ ] `pages_messaging` — Advanced Access (App Review approved)
- [ ] `pages_show_list` — Advanced Access
- [ ] `pages_read_engagement` — Advanced Access
- [ ] `pages_manage_metadata` — Advanced Access (required to subscribe webhook to Page)

### 2.3 Webhook configuration

- [ ] **Object:** Page
- [ ] **Callback URL:** `https://nazhahatyai.com/api/webhooks/meta/messages` (route does NOT yet exist — Boss configures URL during Dashboard step so it's ready when 4.1-C PR lands)
- [ ] **Verify Token:** matches Vercel `FACEBOOK_WEBHOOK_VERIFY_TOKEN` value (Boss generates 32+ hex chars random, enters BOTH in App Dashboard AND in Vercel env)
- [ ] **Subscription fields:**
  - `messages` (DM to Page)
  - `messaging_postbacks` (button click events on Messenger)
  - `feed` (post comment / live comment / reaction)
- [ ] **App Secret Proof:** enabled
- [ ] **Webhook subscribed to specific Page** (Add Subscriptions → select Page → confirm)
- [ ] Boss saves Verify Token value to 1Password / secret manager — never email / chat / commit

### 2.4 App Mode

- [ ] App is **Live** mode (not Development) for production
- [ ] If App Review needed for Live: Privacy + Terms public URLs + Data Deletion + screencast + test users complete

### 2.5 Roles

- [ ] Boss is App Admin (full)
- [ ] No other developer roles assigned unless intentional
- [ ] Test users created if App Review screencast needs them

---

## 3. Webhook verification flow (GET handshake + POST events)

### 3.1 GET `/api/webhooks/meta/messages` (Tier 4.1-B)

Meta verification probe. Single round-trip handshake. Route must:

- Read query params: `hub.mode` + `hub.verify_token` + `hub.challenge`
- If `hub.mode === 'subscribe'` AND `hub.verify_token === env.FACEBOOK_WEBHOOK_VERIFY_TOKEN`:
  - Return `200` with response body = `hub.challenge` (raw text, not JSON)
- Else return `403`

Constant-time compare on verify_token (defense against timing oracle).

Reference:

```typescript
import crypto from 'node:crypto';

export function verifyMetaToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected)
  );
}
```

### 3.2 POST `/api/webhooks/meta/messages` (Tier 4.1-C)

Event delivery. Meta posts JSON payload signed with HMAC-SHA-256 of body using App Secret. Route must:

1. Read **raw body** via `await request.text()` BEFORE any JSON parse (HMAC is over raw bytes)
2. Read header `X-Hub-Signature-256` (must start with `sha256=`)
3. Compute expected: `sha256= + HMAC-SHA256(rawBody, FACEBOOK_APP_SECRET).hex`
4. Compare with `crypto.timingSafeEqual` — guard length first
5. If mismatch → return **200** (NOT 403; Meta retries forever on 4xx) + log + drop
6. If pass → JSON parse body → branch by event shape (see §4)

Per Tier 4.1 PR plan §5. Existing helper at `src/server/repositories/webhook.repository.ts:212` already implements the sign side; verify side is new in 4.1-C.

---

## 4. Page event mapping

Meta Page webhook delivers two top-level event shapes:

### 4.1 `messaging` (Page inbox DM)

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<page_id>",
      "time": <unix_ms>,
      "messaging": [
        {
          "sender": { "id": "<psid>" },
          "recipient": { "id": "<page_id>" },
          "timestamp": <unix_ms>,
          "message": {
            "mid": "<external_message_id>",
            "text": "<customer text>"
          }
        }
      ]
    }
  ]
}
```

Receive-only handler maps:
- `entry[].id` → Shop via `Shop.facebookPageId` lookup (cross-tenant guard)
- `messaging[].sender.id` → upsert `ChannelIdentity` (PSID + platform=MESSENGER)
- `messaging[].sender.id + recipient.id` → upsert `Conversation`
- `messaging[].message.mid` → insert `Message` with unique constraint on `externalMessageId`
- `messaging[].message.text` → store as `Message.body` (no PII extraction)
- `messaging[].timestamp` → `Message.platformReceivedAt`

If Page ID not in any Shop → log + 200 OK (silent drop). Defends against Meta sending events for Pages not connected to LiveShop Pro.

### 4.2 `feed` change (post / live comment / reaction)

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<page_id>",
      "time": <unix_ms>,
      "changes": [
        {
          "field": "feed",
          "value": {
            "item": "comment" | "post" | "like" | "reaction",
            "verb": "add" | "edit" | "remove",
            "post_id": "<post_id>",
            "comment_id": "<comment_id>",
            "from": { "id": "<commenter_psid>", "name": "<commenter_name>" },
            "message": "<comment text>",
            "created_time": <unix_seconds>
          }
        }
      ]
    }
  ]
}
```

Receive-only handler filters to `value.item === 'comment'` AND `value.verb === 'add'` only. Drop other shapes (post / like / reaction / edit / remove) at this tier.

Mapping:
- `entry[].id` → Shop via `Shop.facebookPageId`
- `value.from.id` → upsert `ChannelIdentity` (PSID, platform=MESSENGER_COMMENT or FACEBOOK_PAGE_COMMENT — per existing `Platform` enum)
- `value.post_id` → store as `Conversation.externalContextId` (groups comments by post)
- `value.comment_id` → `Message.externalMessageId` UNIQUE
- `value.message` → `Message.body`
- `value.created_time` (seconds, convert to ms) → `Message.platformReceivedAt`

Live comments (during a `LiveSession`) follow the same mapping. The boundary between "post" and "live" is the source `post_id` — if it matches an active `LiveSession.facebookLivePostId`, the Conversation can be tagged but the comment still ingests as `Message` regardless.

### 4.3 What is NOT mapped in receive-only Tier 4.1

| Shape | Why dropped |
|---|---|
| `messaging_postbacks` button clicks | No actionable UX in receive-only (would need outbound reply) |
| `messaging_optins` | No subscription mgmt in this tier |
| `messaging_referrals` | Not in v1 |
| `feed` items other than `add comment` | Out of scope (reactions / edits / removes ignored) |
| `messaging.delivery` receipts | No outbound to ack |
| `messaging.read` receipts | No outbound to ack |
| Empty `messaging[]` / `changes[]` arrays | No-op, 200 OK |

---

## 5. Message → Customer → Booking → Order future path (POST receive-only, NOT in Tier 4.1)

This is the BIG PICTURE of where the receive-only data eventually flows. Receive-only Tier 4.1 stops at Message insertion. Higher tiers wire downstream:

```
Tier 4.1 (receive-only — THIS PHASE)
  Webhook POST
    → HMAC verify
    → resolve Page → Shop
    → upsert ChannelIdentity
    → upsert Conversation
    → insert Message (idempotent on externalMessageId)
    → 200 OK
    → STOPS HERE

Tier 4.5+ (outbound — HARD-HELD globally)
  Manual admin send
    → Boss types reply in admin inbox UI
    → Server posts to Meta Send API with App Secret HMAC
    → Insert outbound Message
    → No auto-replies, no triggers

Tier 4.7+ (auto-booking — FURTHER OUT)
  Parser
    → Reads Message.body for product code patterns
    → Matches against active BroadcastProduct codes
    → Auto-creates Booking with status PENDING_REVIEW
    → Customer auto-linked via ChannelIdentity → Customer FK
    → Admin still confirms manually in /sale workspace
    → Phase 1.5-B auto-confirm policy (if enabled per customer) takes over from there

Tier 4.8+ (auto-order conversion — DEPENDENT)
  After Boss verdicts Phase 1.5-C
    → Auto-order append via existing convertToOrder path
    → Order detail "appended" badge surfaces
    → Still admin-initiated PaymentSlip upload + verify

Tier 5.0+ (multi-platform — DEPENDENT)
  Add WhatsApp + Telegram with same receive-only pattern
    → Separate webhook routes per platform
    → ChannelIdentity gets new platform enum values
    → Conversation routing unchanged
    → Message body schema unchanged (text-first)
```

This map does NOT authorize anything past Tier 4.1. Listed only so Boss + reviewers understand the destination architecture.

---

## 6. What Boss must do manually before each tier

### 6.1 Before Tier 4.1-A (env schema entries already exist; no schema PR needed)

- [ ] Set `FACEBOOK_APP_SECRET` in Vercel env (production + preview) — value from App Dashboard
- [ ] Set `FACEBOOK_WEBHOOK_VERIFY_TOKEN` in Vercel env — Boss-generated 32+ hex chars
- [ ] Trigger Vercel redeploy after env set so process picks up new values

### 6.2 Before Tier 4.1-B (GET verify route)

- [ ] Confirm App Dashboard webhook Callback URL = `https://nazhahatyai.com/api/webhooks/meta/messages`
- [ ] Confirm Verify Token matches Vercel env value
- [ ] Confirm App in Live mode (or have test Page in Dev mode)

### 6.3 Before Tier 4.1-C (POST receive-only)

- [ ] Confirm `Shop.facebookPageId` populated for the production Shop
- [ ] Confirm Page Admin role for Boss on the production Page
- [ ] Confirm webhook subscribed to specific Page (per §2.3)
- [ ] Boss decides: keep `ALLOW_MESSENGER_WEBHOOK_RECEIVE` flag default `false` until first e2e test PASS

### 6.4 Before Tier 4.1-D (tests) + 4.1-E (runbook)

- [ ] Boss confirms first end-to-end Meta event ingested + Message row created
- [ ] Boss UI smoke admin inbox page (if any) shows ingested message
- [ ] Boss + ChatGPT review final PR + runbook

---

## 7. Hard no-go (apply to Tier 4.x indefinitely)

- ❌ NEVER ask Boss for `FACEBOOK_APP_SECRET` or `FACEBOOK_WEBHOOK_VERIFY_TOKEN` value
- ❌ NEVER hardcode any Meta token in source / commits / tests
- ❌ NEVER commit `.env.local` or `.env.production`
- ❌ NEVER log raw signature header
- ❌ NEVER log raw webhook body
- ❌ NEVER log `FACEBOOK_APP_SECRET` value
- ❌ NEVER skip HMAC verification "for testing"
- ❌ NEVER 403 on signature failure — return 200 + log + drop
- ❌ NEVER use `===` to compare signature — always `timingSafeEqual`
- ❌ NEVER process payload before HMAC pass
- ❌ NEVER touch outbound runtime in receive-only PR
- ❌ NEVER touch payment / shipping in receive-only PR
- ❌ NEVER mutate beyond `ChannelIdentity` + `Conversation` + `Message` upsert
- ❌ NEVER ship without DISSENT 4-bullet (Tier 4.x = R1)
- ❌ NEVER make a Meta Graph API call in this PR
- ❌ NEVER touch pak-ta-kra

---

## 8. Cross-references

- `docs/superpowers/2026-05-24-meta-webhook-signature-preflight-checklist.md` (Phase D preflight)
- `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md` (PR plan + HMAC spec)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (discovery)
- `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md` (architecture)
- `src/server/repositories/webhook.repository.ts:212` (existing HMAC sign helper)
- `src/lib/env.ts:13-20` (FACEBOOK_* env schema entries)
- `prisma/schema.prisma` (Shop, ChannelIdentity, Conversation, Message models)

---

## 9. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero env mutation
- Zero Meta API call
- Zero secret read or write
- Zero new test
- No request for App Secret / Verify Token from Boss
- Env name mapping CONFIRMED: use existing `FACEBOOK_APP_SECRET` + `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (no schema change needed at PR 4.1-A)
- App Dashboard 5-section checklist Boss completes manually
- Webhook verification flow documented for GET (verify) + POST (HMAC)
- Page event mapping covers `messaging` + `feed[add comment]` only
- Tier 4.5+ outbound + Tier 4.7+ parser future path mapped but HELD
- pak-ta-kra untouched
- Awaiting Boss completion of §2 + §6 before Tier 4.1 runtime PR opens
