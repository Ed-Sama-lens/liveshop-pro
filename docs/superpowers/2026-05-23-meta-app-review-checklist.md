# Meta App Review — Boss Prerequisites Checklist

**Filed:** 2026-05-23 (Block G — daytime continuation)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `8503b2f` (post #68 #69 merge)
**Status:** Checklist only. Boss-owned actions. No runtime code.

Builds on PR #57 (`facebook-receive-only-readiness-audit.md`) + PR #64
(`tier-4-1-fb-receive-only-pr-plan.md`). Both docs describe what Tier
4.1 needs; this doc breaks **the Meta side** into a copy-paste
checklist Boss runs against the Meta App Dashboard.

Claude does NOT execute any of these. Claude has no Meta credentials,
no App Dashboard access, no webhook subscription power.

---

## 1. One-page Meta prerequisites

Order matters. Skipping a step blocks the one below.

### 1.1 App identity (already done — verify only)

```
[ ] Meta App ID:         780277861568430 (Master Nivest 合艾哪吒三太子)
[ ] App is in dev mode:  visible only to Boss + assigned testers
[ ] Production toggle:   NOT flipped to Live yet (R0 — needs all below)
```

### 1.2 Page link

```
[ ] FB Page exists:                 nazha-hatyai page
[ ] Page assigned to App:           Settings → Page Settings → Add People → App
[ ] Page Access Token issued:       long-lived (60-day), encrypted in
                                    Shop.facebookToken (verified PR #57 §1.3)
[ ] Token rotation calendar set:    every 50 days (10-day buffer before
                                    60-day expiry)
```

### 1.3 Permissions to request in App Review

```
[ ] pages_show_list           — list Pages owned by the user
[ ] pages_read_engagement     — read post comments / reactions
[ ] pages_messaging           — Messenger inbound (no send until Tier 4.5)
[ ] pages_manage_metadata     — webhook subscription on Page
[ ] business_management       — optional, only if Business Manager flow needed
```

NOT requested in Tier 4.1:
- `pages_messaging_phone_number` (template messages, Tier 4.5 outbound)
- `instagram_basic` + `instagram_manage_messages` (Tier 4.x optional)
- `whatsapp_business_messaging` (Tier 4.4)

### 1.4 Webhook subscription

```
[ ] App Dashboard → Webhooks → Page
[ ] Callback URL:               https://nazhahatyai.com/api/meta/webhook
[ ] Verify token:               value also set in Vercel env (any 32-char hex
                                random; Boss generates + saves)
[ ] Subscribe to fields:
    [ ] messages
    [ ] messaging_postbacks
    [ ] feed                   (post comments)
    [ ] live_videos            (Live comments — push variant; primary uses
                                polling per PR #64 §5)
[ ] "Verify and Save" click:    Meta makes a GET to /api/meta/webhook
                                with hub.mode=subscribe; expects the
                                hub.challenge echoed back
```

Tier 4.1-C ships the route that handles `hub.challenge`. Boss subscribes
AFTER 4.1-C merges + Vercel deploys.

### 1.5 Vercel env vars

Boss adds via Vercel dashboard, NOT Claude:

```
[ ] META_APP_SECRET           — App Secret from Meta App Dashboard
                                used to HMAC-verify webhook signatures
[ ] META_WEBHOOK_VERIFY_TOKEN — matches §1.4 verify token; chosen by Boss
[ ] META_FB_APP_ID            — already exists as FACEBOOK_APP_ID; verify
                                Tier 4.1 code does not duplicate naming
```

NEXT_PUBLIC_* gate: NONE of these should be `NEXT_PUBLIC_` — they are
server-only.

### 1.6 App Review submission

```
[ ] Privacy Policy URL:         https://nazhahatyai.com/privacy (already shipped)
[ ] Terms of Service URL:       https://nazhahatyai.com/terms (already shipped)
[ ] Data Deletion URL:          https://nazhahatyai.com/data-deletion (already shipped)
[ ] Screencast for each permission:
    [ ] pages_messaging        — show Inbox panel reading Messenger messages
    [ ] pages_read_engagement  — show Inbox panel reading Post comments
    [ ] pages_show_list        — show Page picker in admin onboarding
[ ] App icon (1024x1024 PNG):   added
[ ] App description:            "Live-selling SaaS for nazha-hatyai —
                                receives Facebook Page Inbox + Post +
                                Live comments to assist admin sale
                                workflow; no outbound automation in
                                this release"
[ ] Test user credential:       Boss provides a tester FB account
                                Meta reviewers use to verify
```

### 1.7 Go-live R0 gate

```
[ ] All §1.6 screencasts uploaded
[ ] App Review status = "Approved" for each permission
[ ] Vercel env vars §1.5 set
[ ] Webhook subscription §1.4 verified ✓
[ ] Code: PR 4.1-C `/api/meta/webhook` route DEPLOYED
[ ] Code: PR 4.1-D Live Comment polling worker DEPLOYED
[ ] Boss smoke: inbox panel shows real FB messages on Production
[ ] Boss explicit approval:     "FLIP TO LIVE" — irreversible R0
[ ] Then:                        App Dashboard → Settings → App Mode → Live
```

---

## 2. Tier 4.x rollout sequence (Boss action)

| Tier | Boss action | Claude action |
|---|---|---|
| 4.1-A | Complete §1.1-§1.3 + §1.5 vars | Ship PR plan (already done PR #64) |
| 4.1-B | none | Ship `verifyMetaWebhookSignature` helper |
| 4.1-C | none | Ship `/api/meta/webhook` route |
| 4.1-C+post-deploy | Complete §1.4 webhook subscription | Boss watches Vercel logs for verify hit |
| 4.1-D | none | Ship Live Comment polling worker |
| 4.1-E | none | Ship Inbox panel UI wiring |
| 4.1-F | none | Ship integration tests |
| 4.1-G | none | Ship Tier 4.2 handoff doc |
| 4.1 GO-LIVE | Complete §1.6 + §1.7 R0 gate | None — R0 is Boss-only |
| 4.2+ | TBD | TBD |
| 4.5 | Review Send API → mandate flag flip | None until Boss verdict |

---

## 3. Oho-style inbox mapping — refined

Building on PR #65, here is the **explicit module → /sale + /inbox →
Booking + Order mapping** so future Claude (and Boss) can navigate
the join without re-reading three docs.

### 3.1 Read paths (Tier 4.1 receive-only scope)

```
Meta webhook POST → /api/meta/webhook
                  → verifyMetaWebhookSignature(rawBody, headers, META_APP_SECRET)
                  → parsePayload(payload) → { platformUserId, externalMessageId, body, type }
                  → upsert ChannelIdentity(shopId, 'FACEBOOK', platformUserId)
                  → upsert Conversation(shopId, channelIdentityId, platform='FACEBOOK')
                  → insert Message(conversationId, externalMessageId UNIQUE, body, direction='INBOUND')
                  → 200 {ok:true}

Vercel cron → /server/jobs/poll-live-comments.ts
            → for each active LiveSession (status='LIVE')
              → facebook/live-comments.fetch(page, since=LiveSession.lastPolledAt)
              → same upsert path as webhook
              → LiveSession.lastPolledAt = now
```

### 3.2 Lens projections

`/inbox` lens (full conversation surface):

```
GET /api/inbox/conversations?status=open&channels=...
→ Conversation join Message + ChannelIdentity + Customer
→ Returns conversation list (no per-saleDate filter)
```

`/sale` lens (saleDate-anchored slot drawer):

```
GET /api/sale/inbox?saleDate=2026-05-23&channels=...
→ Conversation join Message + ChannelIdentity + Customer
  filtered to messages WHERE:
    Conversation.liveSessionId = current LiveSession  OR
    BookingProcedure: Booking referencing this conversation exists with
      broadcastProduct.saleDate = saleDate
→ Returns saleDate-scoped inbox feed for the slot drawer
```

### 3.3 Booking creation paths (Tier 3.10-D / -E)

```
Manual create (3.10-D):
  Admin clicks slot → ManualCreateBookingDialog
  → POST /api/sale/bookings { broadcastProductId, customerId, quantity, ... }
  → bookingRepository.createManual()
  → Booking { source='MANUAL', conversationId=null, sourceMessageId=null }

Drag from inbox stream (3.10-E):
  Admin drags Message → drop on slot
  → POST /api/sale/bookings {
      broadcastProductId, customerId, quantity,
      conversationId, channelIdentityId, sourceMessageId,
      source='LIVE_COMMENT'|'PAGE_INBOX'|'POST_COMMENT'|...
    }
  → bookingRepository.createManual() (same fn; source set by caller)
```

### 3.4 Outbound paths (Tier 4.5+, GATED)

```
Send confirmation on booking create (Tier 4.5):
  After bookingRepository.createManual() returns
  → outboundService.sendConfirmation({ bookingId, channelIdentityId })
  → ChannelAdapter[platform].sendOutbound({ to, body })
  → Message { direction='OUTBOUND', externalMessageId from Meta response }
  → Activity log

Hard gates (Tier 4.5 only):
  - ALLOW_OUTBOUND_CUSTOMER_MESSAGES env (default false)
  - ALLOW_OUTBOUND_MESSENGER per-channel env (default false)
  - Idempotency: dedup by (bookingId, channel, 'CONFIRMATION')
  - Activity audit per send
  - Boss-only opt-in per Page
```

### 3.5 Diagram in plain ASCII

```
                          ┌──────────────────┐
                          │ Meta Webhook     │ Tier 4.1-C
                          │ POST event       │
                          └────────┬─────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │ Persistence layer (Tier 4.1)           │
              │  Conversation + Message + Identity     │
              └───┬────────────────────────────────┬───┘
                  │                                │
                  ▼                                ▼
       ┌──────────────────────┐     ┌──────────────────────────┐
       │ /inbox lens          │     │ /sale lens (saleDate)    │
       │ Tier 5+              │     │ Tier 3.10-E              │
       │ all conversations    │     │ saleDate-scoped feed     │
       └──────────────────────┘     └────────────┬─────────────┘
                                                 │
                                                 ▼
                            ┌────────────────────────────────────┐
                            │ Slot drawer interaction            │
                            │ Tier 3.10-D manual + -E drag-drop  │
                            └─────────────┬──────────────────────┘
                                          │
                                          ▼
                               ┌─────────────────────┐
                               │ Booking creation    │
                               │ + Order conversion  │
                               └─────────┬───────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │ Outbound confirm (Tier 4.5) │
                          │ HARD GATED                  │
                          └─────────────────────────────┘
```

---

## 4. What this checklist does NOT do

- ❌ Touch Meta App Dashboard (Boss-only)
- ❌ Subscribe to webhooks (Boss-only)
- ❌ Add Vercel env vars (Boss-only)
- ❌ Submit App Review (Boss-only)
- ❌ Flip App to Live (Boss-only R0)
- ❌ Implement code (covered by PR plan #64)
- ❌ Touch pak-ta-kra

---

## 5. Cross-references

- PR #57 — Facebook receive-only readiness audit
- PR #64 — Tier 4.1 receive-only PR plan
- PR #65 — Oho-style unified inbox architecture
- PR #70 — Sale Operations Summary single-date impl
- `prisma/schema.prisma` — Conversation / Message / ChannelIdentity / Booking
- `docs/CODEMAP/13-unified-commerce-inbox.md`

---

## 6. Decision

This doc lands as `docs(meta): App Review checklist + Oho inbox mapping refinement`.
Zero runtime. Boss runs §1 + §2 at their own pace.
