# Meta Webhook Signature — Preflight Checklist

**Filed:** 2026-05-24 (autonomous docs block Track D)
**Author:** Claude Sonnet 4.6
**Status:** Preflight checklist. NO real secrets. NO runtime change. NO env mutation. NO Meta API call. Boss-actionable list of what must be in place BEFORE any Tier 4.1 Facebook webhook runtime PR opens.

Companion to:
- `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md` (PR plan + HMAC spec)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (raw-body + HMAC plan)
- `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md` (receive-only architecture)
- `docs/superpowers/2026-05-15-session-handoff-for-next-claude.md` (`FACEBOOK_APP_SECRET` env policy)
- `src/server/repositories/webhook.repository.ts:212` (existing HMAC-SHA256 helper)

Scope: this doc only enumerates **what must exist before runtime PR opens**. It does NOT implement, deploy, configure, or test the runtime. It does NOT request secrets. It does NOT call any Meta endpoint.

---

## 0. Hard gates (NONE cleared today)

| Gate | Status |
|---|---|
| Boss explicit `EXECUTE TIER 4.1 NOW` verdict | ❌ not given |
| Meta App in Live mode (vs Development) | ❌ unverified — Boss owns this in Meta App Dashboard |
| Meta App Review approved for `pages_messaging` + `pages_show_list` + `pages_read_engagement` | ❌ unverified — Boss owns this |
| Webhook subscription added to the Page in Meta App Dashboard | ❌ unverified — Boss owns this |
| Vercel env `FACEBOOK_APP_SECRET` set (production + preview) | ❌ unverified — Boss owns this |
| Vercel env `META_WEBHOOK_VERIFY_TOKEN` set | ❌ unverified — Boss owns this |
| `Shop.facebookPageId` populated for live shop (so receiver can resolve page → shop) | ❌ unverified |
| Receive-only PR plan reviewed + verdicted | ⏸ pending |

**Nothing in this checklist authorizes Claude to act.** Boss does each Meta Dashboard step, then signals when ready.

---

## 1. Meta App Dashboard — Boss does in browser

Step-by-step list Boss must complete in [developers.facebook.com](https://developers.facebook.com) BEFORE any Tier 4.1 PR opens.

### 1.1 App identity (already in place — verify)

- [ ] App ID matches `780277861568430` (per `CLAUDE.md` Identity table)
- [ ] App display name + icon set
- [ ] App Domain includes `nazhahatyai.com`
- [ ] Privacy Policy URL set (Boss-owned URL pointing to public privacy page)
- [ ] Terms of Service URL set
- [ ] Data Deletion Callback URL or instructions URL set

### 1.2 App permissions

Required scopes for Messenger inbox + Page comment ingestion (per existing receive-only plan):

- [ ] `pages_messaging` — receive + respond to Page DMs
- [ ] `pages_show_list` — list user's Pages during admin OAuth
- [ ] `pages_read_engagement` — read post comments / live comments / reactions
- [ ] `pages_manage_metadata` — required to subscribe webhook to Page

Each scope must be in Advanced Access (App Review approved) — Standard Access only works in Development mode + with admin Page roles.

### 1.3 Webhooks setup

- [ ] **Object:** Page
- [ ] **Callback URL:** `https://nazhahatyai.com/api/webhooks/meta/messages` (Tier 4.1 route — does NOT yet exist; Boss configures URL during Dashboard step so it's ready when route lands)
- [ ] **Verify Token:** set to value matching Vercel env `META_WEBHOOK_VERIFY_TOKEN` (Boss generates a high-entropy random string; suggested ≥32 hex chars)
- [ ] **Subscription fields:** `messages` + `messaging_postbacks` + `feed`
- [ ] **App Secret Proof:** enabled
- [ ] **Webhook subscribed to the specific Page** (Add Subscriptions → select Page → confirm)
- [ ] Boss saves the verify-token value somewhere safe (1Password / secret manager) — never email / chat / commit

### 1.4 App Mode

- [ ] App is in **Live** mode (not Development) for production
- [ ] If Live mode requires App Review submission, Boss completes:
  - Privacy + Terms public URLs
  - Data Deletion mechanism (callback OR instructions)
  - Screencast of each permission usage
  - App icon + descriptions
  - Test user / Page details for reviewers

### 1.5 Roles

- [ ] Boss is App Admin (full)
- [ ] No other developer roles assigned unless intentional
- [ ] Test users created if App Review screencast needs them

---

## 2. Vercel env vars — Boss sets, Claude never sees

Production + Preview environments both need these. Boss sets in [vercel.com Dashboard → Project → Settings → Environment Variables](https://vercel.com).

| Var | Value source | Sensitivity | Used by |
|---|---|---|---|
| `FACEBOOK_APP_SECRET` | Meta App Dashboard → Settings → Basic → App Secret (click "Show") | **HIGH** — HMAC body verify; leak = signature forgery | future `/api/webhooks/meta/messages` route |
| `META_WEBHOOK_VERIFY_TOKEN` | Boss-generated high-entropy string (32+ hex chars); also entered in Meta App Dashboard → Webhooks → Verify Token | **MEDIUM** — used in GET verification handshake only | future `/api/webhooks/meta/messages` GET handler |
| `FACEBOOK_APP_ID` (already present via env defaults) | App Dashboard → Settings → Basic | LOW | OAuth flow + reference |
| `FACEBOOK_PAGE_ID` (optional, may be per-Shop in DB) | Page profile → About → ID | LOW | reference |

**Hard rules:**
- Boss enters values directly into Vercel; Claude never types or reads them
- Both production + preview must have the same values OR clearly distinct dev values
- After setting, Boss triggers a redeploy so env propagates

---

## 3. HMAC verification checklist (route handler will implement)

Reference implementation already lives in `src/server/repositories/webhook.repository.ts:212` and the Tier 4.1 plan §5 (`docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`). The runtime route must:

- [ ] Read **raw body** via `request.text()` BEFORE any JSON parse (HMAC is over raw bytes)
- [ ] Read header `X-Hub-Signature-256` (must start with `sha256=`)
- [ ] Compute `crypto.createHmac('sha256', FACEBOOK_APP_SECRET).update(rawBody).digest('hex')`
- [ ] Prepend `sha256=` to computed value
- [ ] Compare with **`crypto.timingSafeEqual`** (constant-time) — NOT `===`
- [ ] Compare requires **same-length buffers** — guard length first to avoid Node throw
- [ ] On mismatch: **return 200** (not 403) + log + drop (per receive-only plan §4)
- [ ] On mismatch spike: rate-limit per source IP after 10 failures in 60s
- [ ] Wrap entire HMAC code in `try/catch` — never let exception bubble to Meta (always 200)
- [ ] **NEVER** log the raw body or signature header (PII + secret material)
- [ ] **NEVER** log `FACEBOOK_APP_SECRET` value anywhere
- [ ] **NEVER** include signature in error messages returned anywhere
- [ ] Verify token GET handshake separately handled per Meta spec (`hub.mode=subscribe` + `hub.verify_token` match + echo `hub.challenge`)

### Reference HMAC snippet (per existing plan §5)

```typescript
import crypto from 'node:crypto';

function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
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

Pure function. Unit-testable without spinning Next.js. Existing test file `tests/unit/server/repositories/webhook.signPayload.test.ts` covers the sign side; runtime PR must add the verify side with HMAC tests.

---

## 4. Local tunnel notes (development testing)

When Boss tests locally before live, Meta requires a publicly reachable HTTPS callback URL. Options:

| Tool | Notes |
|---|---|
| `cloudflared tunnel` | Free, official Cloudflare, generates `*.trycloudflare.com` URL. Recommended. |
| `ngrok` | Free tier rate-limited, requires account. Subdomain changes per restart unless paid. |
| Local + Vercel preview branch | Push branch to GitHub → Vercel preview deploy → use preview URL. Slowest iteration. |

**Setup pattern (cloudflared):**
1. `cloudflared tunnel --url http://localhost:3000`
2. Copy printed `*.trycloudflare.com` URL
3. Replace Meta App Dashboard → Webhooks → Callback URL with the tunnel URL temporarily
4. Restart `npm run dev` if env changed
5. Trigger Meta event (send DM to Page, leave comment)
6. After testing: restore Callback URL to production URL
7. **NEVER** leave a tunnel URL in Meta Dashboard pointing at a dev machine longer than the active session

**Hard rules:**
- Tunnel URL must use HTTPS (cloudflared default)
- Tunnel verify token can be different from prod (use dev token in `.env.local`)
- Tunnel `FACEBOOK_APP_SECRET` MUST equal real App Secret (HMAC depends on it)
- After tunnel session: rotate `META_WEBHOOK_VERIFY_TOKEN` if dev token leaked (e.g. checked into git accidentally)

---

## 5. Pre-route-PR checklist (Boss must tick each)

Before Claude opens any `feat(webhooks): meta receive-only` PR, Boss confirms:

- [ ] **Gate 1.1–1.5** all complete (Meta App Dashboard ready)
- [ ] **Gate 2** Vercel env `FACEBOOK_APP_SECRET` + `META_WEBHOOK_VERIFY_TOKEN` set in both prod + preview
- [ ] **Gate 2** Vercel deployment triggered post-env-set so env propagates
- [ ] Boss explicit verdict: `EXECUTE TIER 4.1 RECEIVE-ONLY NOW`
- [ ] Boss confirms which Pages should be subscribed (Page IDs whitelist) — receiver must reject events for non-allowlisted Pages until manually authorized
- [ ] Boss confirms `ALLOW_MESSENGER_WEBHOOK_RECEIVE` flag default value (recommend: `false` until first end-to-end test PASS)
- [ ] Boss confirms data retention: how long to keep raw Meta payloads in `Message.rawPayload`?

If any item unchecked → Claude does NOT open the runtime PR.

---

## 6. Hard no-go (apply to all Tier 4.x webhook runtime)

- ❌ NEVER ask Boss for the App Secret value
- ❌ NEVER ask Boss for the Verify Token value
- ❌ NEVER hardcode any token in source / commits / tests
- ❌ NEVER commit `.env.local` or `.env.production` (verify `.gitignore` covers both)
- ❌ NEVER log the raw signature header
- ❌ NEVER log `FACEBOOK_APP_SECRET` value
- ❌ NEVER skip HMAC verification "for testing" — Tier 4.x route MUST verify even in dev
- ❌ NEVER 403 on signature failure — return 200 + log + drop (Meta retries forever on 4xx)
- ❌ NEVER use `===` to compare signature — always `timingSafeEqual`
- ❌ NEVER process payload before HMAC pass
- ❌ NEVER touch outbound runtime in receive-only PR (Tier 4.5+)
- ❌ NEVER touch payment / shipping in receive-only PR
- ❌ NEVER mutate production data from webhook beyond `ChannelIdentity` + `Conversation` + `Message` upsert (per receive-only plan)
- ❌ NEVER touch pak-ta-kra
- ❌ NEVER ship without DISSENT 4-bullet (Tier 4.1 = R1, schema-adjacent + auth boundary + public webhook surface)

---

## 7. Runtime PR sequence (when Boss verdict + Dashboard complete)

Per existing plan (`2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`):

| PR | Title | Risk | Depends on |
|---|---|---|---|
| 4.1-A | `feat(env): add META webhook env var schema entries` | R1 | env vars set in Vercel first |
| 4.1-B | `feat(webhooks): meta verify-token GET handshake handler` | R1 | 4.1-A |
| 4.1-C | `feat(webhooks): meta POST receive-only + HMAC verify + idempotent upsert` | R1 | 4.1-B + DISSENT 4-bullet |
| 4.1-D | `test(webhooks): meta HMAC + replay + idempotency unit + integration` | R2 | 4.1-C |
| 4.1-E | `docs(webhooks): meta runbook + on-call playbook + signature failure response` | R2 | 4.1-D |

Each PR ≤ 300 LOC ideally. Each Boss-verified before next opens. After 4.1-E: ≥1 week Vercel stable + Boss UI spot-check + zero HMAC failures in production logs.

---

## 8. Cross-references

- `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md` (full PR plan + HMAC code)
- `docs/superpowers/2026-05-13-omnichannel-live-commerce-inbox-discovery.md` (raw-body discovery)
- `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md` (receive-only architecture)
- `docs/superpowers/2026-05-15-session-handoff-for-next-claude.md` (env var policy)
- `src/server/repositories/webhook.repository.ts:212` (existing HMAC-SHA256 helper)
- `src/lib/env.ts:18` (FACEBOOK_APP_SECRET schema entry)
- `src/app/api/facebook/exchange-token/route.ts:22` (existing FACEBOOK_APP_SECRET usage)

---

## 9. Status

- Docs-only PR (R2)
- Zero runtime change
- Zero env change
- Zero Meta API call
- Zero secret read or write
- Zero new test
- No request for App Secret / Verify Token from Boss
- pak-ta-kra untouched
- Awaiting Boss completion of §1–§5 before Tier 4.1 runtime PR opens
