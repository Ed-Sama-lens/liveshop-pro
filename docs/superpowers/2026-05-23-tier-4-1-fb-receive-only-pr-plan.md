# Tier 4.1 — Facebook Receive-Only PR Plan

**Filed:** 2026-05-23 (overnight Track 6)
**Author:** Claude Sonnet 4.6 (autonomous overnight block)
**Master baseline:** `a1aef83` (post PR #59 merge)
**Status:** Plan only. No runtime code. Builds on PR #57 readiness audit (`2026-05-22-facebook-receive-only-readiness-audit.md`).
**Audience:** Boss + ChatGPT

This doc adds the **concrete PR sequence** Boss asked for on top of the
PR #57 readiness audit. PR #57 mapped the current surface; this doc
locks the implementation slices and Boss-only prerequisites per slice.

**No outbound. No parser auto-booking. No runtime code in this PR.**

---

## 1. PR slices

| PR | Title | Files | Risk | Dep |
|---|---|---|---|---|
| **4.1-A** | `docs(meta): app review checklist + Boss-only setup steps` | 1 doc | R2 | — |
| **4.1-B** | `feat(meta): webhook signature verification helper (no route)` | 2 src + 1 test | R1 | App secret in env |
| **4.1-C** | `feat(meta): inbound webhook route /api/meta/webhook (receive-only, dedup by externalMessageId)` | 3 src + 2 test | R1 | 4.1-B merged, FB App webhook subscription configured |
| **4.1-D** | `feat(meta): Live Comment polling worker (cron-driven, idempotent)` | 3 src + 2 test | R1 | 4.1-C merged |
| **4.1-E** | `feat(sale): inbox panel reads from Conversation+Message (no outbound)` | 4 src + 2 test | R1 | 4.1-D merged |
| **4.1-F** | `test(meta): integration tests w/ canned Meta payloads` | 5 test fixtures | R2 | 4.1-E merged |
| **4.1-G** | `docs(meta): Tier 4.2 next steps (Live Comment+Post Comment) handoff` | 1 doc | R2 | 4.1-F merged |

### Why this split

- **4.1-A** isolates Boss-only Meta setup (App Review, webhook subscription, permission verification). Code lands no faster than Boss completes setup; doc gives a checklist.
- **4.1-B** ships the HMAC verification helper alone. Easy to review, tiny attack surface. No route, no DB write.
- **4.1-C** ships the route. Lands fast because the verification helper + schema are already done.
- **4.1-D** adds Live Comment polling. Different ingestion path (poll vs push); kept separate from webhook route so review is local.
- **4.1-E** wires the existing `SaleInboxPlaceholder.tsx` to real `Message` rows. UI-only.
- **4.1-F** integration tests with canned payloads land after the dust settles.
- **4.1-G** sets the next handoff so Tier 4.2 (Post Comment) doesn't start cold.

### What is intentionally NOT in 4.1-* scope

- ❌ Outbound message send (Tier 4.5 owns Send API)
- ❌ Parser auto-booking (Tier 4.6+)
- ❌ Telegram / WhatsApp runtime (Tier 4.3 / 4.4)
- ❌ V Rich board drag/drop integration (Tier 3.10-E)
- ❌ Auto-confirm / auto-order (PR #54 separate verdict)
- ❌ Schema migration (Conversation / ChannelIdentity / Message already exist)

---

## 2. Boss-only prerequisites (MUST complete before 4.1-C)

Listed as standalone steps Claude cannot do:

| # | Prerequisite | Owner | Verification |
|---|---|---|---|
| 1 | Confirm `FACEBOOK_PAGE_ACCESS_TOKEN` rotation cadence is on a calendar (60-day expiry) | Boss | Calendar reminder set |
| 2 | Add `META_APP_SECRET` to Vercel env (used for webhook signature verification) | Boss | Vercel env list shows key (server-side only, no NEXT_PUBLIC) |
| 3 | Subscribe FB App to webhooks for `messages`, `messaging_postbacks`, `feed`, `live_videos` events | Boss | Meta App Dashboard → Webhooks tab shows ✓ |
| 4 | Set webhook callback URL `https://nazhahatyai.com/api/meta/webhook` + verify token | Boss | "Verify and Save" button green |
| 5 | Submit App Review for `pages_messaging`, `pages_read_engagement`, `pages_show_list` if not yet approved | Boss | Meta App Dashboard → App Review status `Live` |
| 6 | Confirm Page is owned by the FB App business manager account | Boss | Page Settings → "Add People → App" shows the App |

Claude does NOT:
- Touch any Meta credentials
- Open the FB App Dashboard
- Submit App Review
- Change Vercel env vars
- Subscribe to webhook events

---

## 3. Webhook signature verification (4.1-B)

Helper file `src/lib/meta/webhook-signature.ts`:

```ts
// Pure function (no I/O). Used by both webhook route + tests.
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;
  // FB sends 'sha256=<hex>' or legacy 'sha1=<hex>'.
  // Accept sha256 only; sha1 is deprecated by Meta.
  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')}`;
  // Constant-time compare.
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}
```

Tests `tests/unit/lib/meta/webhook-signature.test.ts`:
- valid signature → true
- wrong secret → false
- mismatched body → false
- malformed header → false
- legacy `sha1=` → false (deprecated)
- empty signature header → false
- length-mismatch → safe rejection (no `RangeError` from `timingSafeEqual`)

---

## 4. Inbound webhook route (4.1-C)

`src/app/api/meta/webhook/route.ts`:

```
GET  → handle Meta `hub.mode=subscribe` challenge (return hub.challenge)
POST → verify HMAC → parse payload → upsert ChannelIdentity → upsert
       Conversation → insert Message (skip if externalMessageId exists)
       → return 200 fast (Meta retries on 5xx within 60s)
```

Constraints:
- Hard timeout: 5s end-to-end (Meta retries aggressively past 60s)
- Idempotent: `externalMessageId` UNIQUE on Message — duplicate inserts no-op
- No outbound: response is `{ ok: true }` only
- No customer notification
- Log raw payload to `Message.rawPayload` with `retentionUntil = now + 30d`
- Redact PII after 30d via existing scheduled task (`Message.rawPayloadRedactedAt` flow)

Tests `tests/unit/app/api/meta/webhook.route.test.ts`:
- GET challenge with correct verify token → 200 + challenge body
- GET challenge with wrong token → 403
- POST with valid signature + new message → 200 + Message row inserted
- POST with valid signature + dup externalMessageId → 200 + no second row
- POST with invalid signature → 401
- POST with malformed body → 200 (return fast; log for review)
- POST with unknown event type → 200 + log warning (forward compat)
- Cross-shop isolation: payload references unknown Page → no Message row (silent skip)

---

## 5. Live Comment polling worker (4.1-D)

Different ingestion path from webhook. Meta does NOT push Live Comments
reliably — polling is the documented pattern.

`src/server/jobs/poll-live-comments.ts`:

- Cron-driven (Vercel cron or `vercel.json` schedule)
- Iterates active `LiveSession` rows where `status = 'LIVE'` AND `Shop.facebookPageId` not null
- For each, calls existing `src/lib/facebook/live-comments.ts` to fetch comments since `lastPolledAt`
- Upserts ChannelIdentity + Conversation + Message rows (same path as webhook)
- Updates `LiveSession.lastPolledAt`

Constraints:
- Per-page rate limit respect: max 1 poll per page per 30s
- Skip pages with expired tokens (log + alert)
- Idempotent by `externalMessageId` (same as webhook)
- No outbound

Tests:
- Worker handles 0 active sessions → no-op
- Worker dedupes already-seen comments
- Worker skips pages with `null` `facebookPageId`
- Worker handles token expiry gracefully (log only)
- Worker updates `lastPolledAt` even when 0 new comments

---

## 6. Inbox panel wiring (4.1-E)

Existing UI placeholder: `src/components/sale/SaleInboxPlaceholder.tsx`.

Wire to:
- `GET /api/sale/inbox?saleDate=YYYY-MM-DD&channels=...` (designed in Tier 3.10-A §3.7)
- Returns `UnifiedMessage[]` (Conversation + Message + ChannelIdentity joined)
- Filter by selected saleDate (Tier 3.9 anchor)
- No outbound — clicking a message ONLY pops a read-only viewer

For Tier 4.1 single-channel scope, `channels=fb_inbox,fb_live_comment`
is the default. Other channels return empty (added in Tier 4.3 / 4.4).

Constraints:
- No `customer.phone` / `customer.email` in API response (PII gate)
- Customer name + channel icon + message preview + timestamp only
- Click → opens a read-only `MessageViewerDialog` (no reply field)
- Outbound CTA is greyed-out with tooltip "Tier 4.5"

---

## 7. Integration tests (4.1-F)

`tests/integration/meta/webhook-fixtures/` directory:

- `messages-text.json` — single text message
- `messages-image.json` — image attachment
- `messages-postback.json` — quick reply postback
- `feed-comment.json` — Post comment event
- `live-video-comment.json` — Live comment event (push variant; primary is polling)

Tests load fixture → POST to webhook route → verify Message row shape.

---

## 8. Tier 4.2 handoff (4.1-G)

After 4.1-F:
- Document Live Comment + Post Comment specific quirks
- Note Meta's rate-limit ladder for both
- Set Tier 4.2 PR scope (channel-specific filters, "promote to booking" affordance — still no outbound)
- Hand off to Boss to verdict Tier 4.2 timing

---

## 9. Stop conditions (per PR)

Any of these triggers a stop + report to Boss:

- Boss-only prerequisite not yet completed (App Review pending, env var missing)
- Webhook subscription not yet configured at Meta side
- HMAC verification fails on canned payloads (helper bug)
- Schema needs migration (Conversation / Message / ChannelIdentity already exist, so this shouldn't trigger — but flag if Boss adds a new field)
- Outbound send call accidentally introduced
- Customer PII leaks in response shape
- Rate-limit issues blocking polling worker
- Vercel cron unavailable on current plan

---

## 10. Hard no-go

All 4.1-* PRs:

- ❌ No outbound message send (Tier 4.5 only)
- ❌ No auto-booking from message parser (Tier 4.6+)
- ❌ No customer PII in inbox response
- ❌ No new schema column (Conversation / Message / ChannelIdentity ready)
- ❌ No env / flag flip by Claude (Boss owns Meta config)
- ❌ No production webhook subscription action by Claude
- ❌ No Meta App Dashboard touch by Claude
- ❌ pak-ta-kra untouched

---

## 11. Cross-references

- `docs/superpowers/2026-05-22-facebook-receive-only-readiness-audit.md` (PR #57) — current surface map
- `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md` — `GET /api/sale/inbox` endpoint shape
- `src/lib/facebook/live-comments.ts` — existing Live Comment polling helper
- `prisma/schema.prisma` — Conversation / Message / ChannelIdentity already exist
- `docs/CODEMAP/13-unified-commerce-inbox.md` — unified inbox model

---

## 12. Decision

This doc lands as `docs(meta): Tier 4.1 receive-only PR plan`. Boss +
ChatGPT verdict on §1 PR sequence + §2 prerequisites unlocks PR 4.1-A.
