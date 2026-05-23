# Meta Webhook Fixtures

**Filed:** 2026-05-23 (Block 2 Track T8)
**Status:** Fixture data only. No runtime side effects.

These JSON files represent canned Meta webhook payloads used by Tier
4.1 receive-only tests (when the implementation PRs land). All
identifiers are placeholders — no real Page IDs, user IDs, message IDs,
or URLs.

## Fixtures

| File | Event type | Tests it will cover (Tier 4.1-F) |
|---|---|---|
| `messages-text.json` | Page Messenger inbound text | happy-path text parse |
| `messages-image.json` | Page Messenger inbound image attachment | media handling |
| `messages-postback.json` | Page Messenger quick-reply postback | postback parse |
| `feed-comment.json` | Page feed comment (Post Comment) | post engagement |
| `live-video-comment.json` | Facebook Live Comment (polling shape) | Live polling |

## Placeholder values

| Placeholder | Replace with | Notes |
|---|---|---|
| `PAGE_ID_PLACEHOLDER` | real Page ID from Shop.facebookPageId | NEVER commit real value |
| `FB_USER_ID_*` | fake user IDs for the test customer | numeric/string format matches Meta |
| `m_FAKE_MESSAGE_ID_*` | unique fake message IDs | UNIQUE constraint dedup tests rely on these |
| `POST_ID_FAKE_*` | fake post IDs | for feed event tracing |
| `LIVE_VIDEO_FAKE_*` | fake live video IDs | for live polling |
| `https://example.com/...` | fake URLs | NEVER point at real CDN |

## Usage in tests (when Tier 4.1-F lands)

```ts
import textFixture from '@/tests/fixtures/meta/messages-text.json';

const result = parseMetaWebhookPayload(textFixture);
expect(result.platformMessageId).toBe('m_FAKE_MESSAGE_ID_text_001');
expect(result.text).toBe('+1 CM5');
```

## Hard rules

- ❌ NEVER replace placeholders with real production values in committed
  fixtures
- ❌ NEVER add real Meta App Secret or Page Access Token
- ❌ NEVER POST these fixtures at the production webhook
- ❌ NEVER auto-generate fixtures from production data without scrubbing

These fixtures exist purely so Tier 4.1-F integration tests have
deterministic input. The runtime route (Tier 4.1-C) is not present
yet.

## Cross-references

- PR #57 — Facebook receive-only readiness audit
- PR #64 — Tier 4.1 receive-only PR plan
- PR #74 — Meta App Review checklist
- PR #82 — Local webhook test plan + message→order mapping
