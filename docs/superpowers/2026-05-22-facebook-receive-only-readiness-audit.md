# Facebook-First Receive-Only Readiness Audit

**Filed:** 2026-05-22
**Status:** Audit only — docs-only PR. No runtime change.
**Master HEAD baseline:** `bef98aa`
**Scope:** liveshop-pro Tier 4.1 prep
**Audience:** Boss + ChatGPT
**Track:** Overnight Track 12

Maps current liveshop-pro Facebook-related code + schema, identifies prerequisites for Tier 4.1 (Facebook Page Inbox + Post Comment + Live Comment receive-only), and lists Boss-only setup steps.

**No outbound. No parser auto-booking. No runtime code in this PR.**

---

## 1. Current Facebook surface (audited)

### 1.1 Existing code modules

| Path | Purpose | Runtime status |
|---|---|---|
| `src/lib/facebook/live-comments.ts` | Live comment polling client | Helper exists; not wired to a route |
| `src/app/api/facebook/exchange-token/route.ts` | Exchange short-lived → long-lived Page token | EXISTS — used during Facebook App Review setup |
| `src/app/api/webhooks/route.ts` | Generic webhook receiver (admin-managed) | Custom shop webhooks (NOT Meta) — different system |
| `src/app/api/webhooks/[id]/route.ts` + `logs/route.ts` | Webhook config CRUD + log viewer | Admin UI for shop-managed outbound hooks |
| `src/components/shared/FacebookSignInButton.tsx` | Customer-side FB Login button | Used on /shop storefront only |
| `src/lib/auth/...` next-auth FB provider | Admin sign-in via FB | Admin auth — separate from Page integration |
| `src/server/repositories/webhook.repository.ts` + `webhook.service.ts` | Webhook config repo (no Meta integration) | Generic outbound hooks; not used for inbound FB |

### 1.2 Existing FB-related env vars

Per `docs/CODEMAP/10-ops-deploy.md`:
- `FACEBOOK_APP_ID` = `780277861568430` (Master Nivest 合艾哪吒三太子)
- `FACEBOOK_APP_SECRET` = Vercel env (admin sign-in)
- `FACEBOOK_PAGE_ACCESS_TOKEN` = Encrypted in `Shop.facebookToken` (Page-level token, last rotated 2026-06-03 per memory)

### 1.3 Schema layer (already in place — verified)

`prisma/schema.prisma`:

| Model | Purpose | Status for FB receive-only |
|---|---|---|
| `Shop.facebookPageId` + `Shop.facebookToken` | Page identity + encrypted Page token | ✅ READY |
| `Conversation` | Unified conversation thread (FB / IG / LINE / TIKTOK / MANUAL / STOREFRONT) | ✅ READY |
| `Conversation.liveSessionId?` | Optional link to live session | ✅ |
| `ChannelIdentity` | Customer-platform identity mapping (one per FB Page commenter) | ✅ READY (unique `[shopId, platform, platformUserId]`) |
| `Message` | Inbound + outbound message rows; supports text/image/video/audio | ✅ READY |
| `Message.externalMessageId` | Platform-side message ID for dedup | ✅ READY (UNIQUE pattern via `Message_externalMessageId_idx`) |
| `Message.rawPayload` + `rawPayloadRedactedAt` + `retentionUntil` | Audit + GDPR retention | ✅ READY |
| `Booking.conversationId?` + `channelIdentityId?` + `sourceMessageId?` | Link booking to source message | ✅ READY |
| `BookingSource` enum | LIVE_COMMENT / PAGE_INBOX / POST_COMMENT / WHATSAPP_CHAT / TELEGRAM_CHAT + MANUAL / IMPORT / SYSTEM | ✅ READY |
| `CommentParseLog` | Audit trail for comment-to-booking parsing attempts | ✅ READY (Phase 4 parser layer) |
| `ConversationSource` enum | FACEBOOK_LIVE_COMMENT / FACEBOOK_PAGE_INBOX / FACEBOOK_POST_COMMENT / ... | ✅ READY |
| `Platform` enum | FACEBOOK / INSTAGRAM / LINE / TIKTOK / WHATSAPP / TELEGRAM / STOREFRONT | ✅ READY |
| `MessageStatus` + `ParseStatus` + `MessageDirection` enums | Lifecycle states | ✅ READY |

**Verdict:** Schema is **fully forward-compat for Tier 4.1 receive-only**. No migration required for FB Inbox / Post Comment / Live Comment ingestion.

---

## 2. What Tier 4.1 needs (gaps)

### 2.1 Routes (NOT existing yet)

| Route | Method | Purpose |
|---|---|---|
| `/api/meta/webhook` | GET | Verify webhook subscription (Meta hub.verify_token challenge) |
| `/api/meta/webhook` | POST | Receive FB webhook events (HMAC SHA256 signature verification) |
| `/api/sale/inbox` | GET | Admin reads aggregated conversation list for selected saleDate |
| `/api/sale/conversations/[id]/messages` | GET | Per-thread message history |
| `/api/sale/live-comments` | GET | Live comment poll (when active LiveSession exists) |

### 2.2 Lib helpers (partially existing)

- `src/lib/facebook/live-comments.ts` — exists; needs review for current API version + production hardening
- `src/lib/facebook/webhook-verify.ts` — **NEEDS CREATE** — `verifyHmacSha256(rawBody, signature, secret)` per Meta spec
- `src/lib/facebook/page-api.ts` — **NEEDS CREATE** — Graph API client wrapper for Conversations/Messages endpoints

### 2.3 Services (NEEDS CREATE)

- `src/server/services/inbox-ingest.service.ts` — receive webhook event → upsert Conversation + ChannelIdentity + Message
- `src/server/services/post-comment-ingest.service.ts` — receive comment event → similar
- `src/server/services/live-comment-poll.service.ts` — periodic poller (Bull queue or cron) for active LiveSession

### 2.4 Worker (Bull queue)

- Live comment polling needs background worker. Already uses Bull (`bull` in package.json). Need queue + worker for `live-comment-poll` job.

### 2.5 UI (NEEDS CREATE)

- `/sale` add Inbox panel (left/right of Bookings) showing aggregated stream per saleDate
- Inbox filter chips by channel (FB Live / FB Inbox / FB Post Comment / future Telegram / WhatsApp)
- Click message → preview customer info + history; no auto-booking
- Future drag-drop from Inbox to sale slot (Tier 4.2)

---

## 3. Meta App Review prerequisites

### 3.1 Required Page permissions

| Permission | Use case | App Review needed? |
|---|---|---|
| `pages_messaging` | Read Page Inbox messages | YES (need approved review) |
| `pages_messaging_subscriptions` | Subscribe to message_deliveries / messages events | YES |
| `pages_show_list` | Token can list Pages admin manages | YES |
| `pages_read_engagement` | Read post comments + reactions | YES |
| `pages_manage_metadata` | Manage webhook subscriptions on Page | YES |

### 3.2 Webhook subscription topics (Meta)

Subscribe Page to:
- `messages` (Page Inbox)
- `messaging_postbacks` (button replies, future)
- `feed` (Post comments, reactions)
- `live_videos` (Live status changes — start/stop notification)

### 3.3 Privacy + Data Deletion (already shipped)

`docs/superpowers/handoffs/...` confirms:
- `/privacy` `/terms` `/data-deletion` legal pages SHIPPED + URLs added to FB App Settings
- Required for App Review

### 3.4 App Review status

Per memory: "Need: add Messenger product → expose `pages_messaging` permission → submit App Review". **NOT YET SUBMITTED.**

---

## 4. Boss-only prerequisites (cannot be automated)

These need Boss action — Claude cannot do them:

| Step | Action | Where |
|---|---|---|
| 1 | Add Messenger product to FB App | FB App Dashboard → Add Product → Messenger |
| 2 | Configure Messenger Settings webhook | App Dashboard → Messenger → Settings → Webhooks |
| 3 | Set Callback URL = `https://nazhahatyai.com/api/meta/webhook` | (after Track 12 ships the route) |
| 4 | Set Verify Token (random secret) | Save to Vercel env `META_WEBHOOK_VERIFY_TOKEN` |
| 5 | Subscribe to events: `messages`, `messaging_postbacks`, `feed`, `live_videos` | Same UI |
| 6 | Submit App Review with use case + screencast | App Dashboard → App Review → Permissions |
| 7 | Wait for Meta approval (~3-7 business days) | — |
| 8 | After approval: switch FB App to Live mode | App Dashboard → App Settings → Basic → Live toggle |
| 9 | Set Vercel envs: `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET` (for HMAC) | Vercel Dashboard |

**HARD STOP** until steps 1-9 complete. Tier 4.1 cannot ship without Meta approval.

---

## 5. Tier 4.1 implementation plan (after Meta approval)

### 5.1 PR sequence

| PR | Title | Scope | Risk |
|---|---|---|---|
| 4.1-A | docs(meta): FB receive-only implementation contract | Detailed spec from this doc | R2 |
| 4.1-B | feat(meta): webhook GET hub.verify_token + HMAC helper | Verify route + verifyHmacSha256() | R1 (auth boundary) |
| 4.1-C | feat(meta): page-api client + types | Graph API wrapper (axios/fetch + types) | R2 |
| 4.1-D | feat(inbox): receive Page Inbox messages | webhook POST → upsert Conversation + Message | R1 (DB writes) |
| 4.1-E | feat(inbox): receive Post Comments | similar | R1 |
| 4.1-F | feat(inbox): Live Comment polling worker | Bull queue + cron | R1 |
| 4.1-G | feat(inbox): /sale Inbox panel UI | aggregated stream per saleDate | R1 |
| 4.1-H | tests + verifier + handoff | local fixture-based tests | R2 |

### 5.2 Test fixture plan

Local-only testing (no real Meta calls):
- Sample webhook payloads checked into `tests/fixtures/meta/`
- HMAC signature can be computed locally with test secret
- `tests/unit/lib/facebook/webhook-verify.test.ts` — verify HMAC pass/fail
- `tests/unit/server/services/inbox-ingest.test.ts` — fixture → upsert → assert Conversation/Message rows
- E2E webhook test via ngrok tunnel (DEV only, not committed)

### 5.3 Production rollout sequence

1. Land 4.1-A through 4.1-C (auth + helpers — no DB writes; safe to deploy behind feature flag)
2. Set `META_WEBHOOK_VERIFY_TOKEN` + `META_APP_SECRET` in Vercel
3. Land 4.1-D (Page Inbox ingest) behind flag `ENABLE_META_INBOX_INGEST=false`
4. Boss + ChatGPT verify in dev with ngrok webhook
5. Flip flag to `true` in Vercel; subscribe Page to events; verify in prod
6. Repeat 4.1-E + 4.1-F + 4.1-G

### 5.4 Stop conditions

- Meta App Review rejected → stop; iterate Privacy/Terms/Data Deletion compliance
- HMAC verification fails on production → stop; verify env secret
- Conversation/Message DB writes exceed 1k/min → stop; check Bull queue throttling
- Live comment poll exceeds Meta rate limit → stop; back off
- ANY outbound message implementation → STOP per hard no-go

---

## 6. HARD NO-GO honored

- ❌ No outbound message implementation in this audit OR Tier 4.1 phase A-G
- ❌ No Meta credential request from Boss
- ❌ No Vercel env change by Claude
- ❌ No App Review submission by Claude
- ❌ No production webhook call by Claude
- ❌ No customer message mutation

Outbound (auto-reply, manual send, broadcast) = Phase 8. Hard gate.

---

## 7. Cross-references

- `src/lib/facebook/live-comments.ts` — existing client (review needed)
- `prisma/schema.prisma` — Conversation/ChannelIdentity/Message ready
- `docs/superpowers/handoffs/2026-05-13-resume-after-customer-panel-await-next-go.md` — FB App Review prep
- `docs/CODEMAP/10-ops-deploy.md` — Vercel env list
- `docs/superpowers/2026-05-22-tier-3-9-phase-1-post-smoke-audit.md` — multi-channel readiness verdict

---

## 8. Verdict

**Schema READY. Code skeleton present (live-comments.ts). 9 Boss-only prerequisites block Tier 4.1.**

Recommended next: complete Sale Core stabilization (this overnight work) + auto-confirm/auto-order design verdict → then revisit Tier 4.1 after Boss has time for Meta App Review submission.

Estimated Tier 4.1 implementation time after Meta approval: **8-12 PRs over 2-3 weeks**.
