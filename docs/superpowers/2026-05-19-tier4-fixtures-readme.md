# Tier 4 fixtures readme — current set

**Filed:** 2026-05-19
**Pairs with:** `docs/superpowers/2026-05-18-tier4-webhook-fixtures-readme.md` (prior set)
**Status:** docs + 1 new fixture. No runtime receiver. No secrets.

This file extends the Tier 4 webhook fixture set with one new attachment fixture for the eventual Messenger receive-only PR. All fixtures still synthetic IDs + sanitized content per § 2 of the prior readme.

---

## 1. Fixtures inventory (current)

| File | Event shape | Purpose | Source ID |
|---|---|---|---|
| `page-inbox-text-message.json` | DM text | happy path | `m_FIXTURE_INBOX_TEXT_000000000001` |
| `post-comment-feed-event.json` | feed comment | happy path | `200000000000002_300000000000003` |
| `live-comment-feed-event.json` | live video comment | Tier 4.2 future | `200000000000002_500000000000005` |
| `duplicate-replay-payload.json` | same `mid` as inbox-text | idempotency check | same as inbox-text |
| `replay-old-timestamp.json` | > 7d old | reject-stale-replay | `m_FIXTURE_REPLAY_OLD_000000000001` |
| `signature-test-payload.json` | minimal `{}` | HMAC compute | n/a |
| `malformed-payload.json` | wrong types | Zod reject | n/a |
| `missing-sender-payload.json` | no `sender` | required-field reject | `m_FIXTURE_MISSING_SENDER_000000001` |
| **NEW** `attachment-image-payload.json` | DM with image attachment | non-text content handling | `m_FIXTURE_INBOX_ATTACH_000000000001` |

Total: **9 fixtures**.

---

## 2. New fixture rationale

`attachment-image-payload.json` covers a path the existing fixtures didn't:

- Real Messenger inboxes routinely receive image attachments (customer sends photo of bank slip, screenshot of product, etc)
- The receive-only Tier 4.1 implementation must persist the message metadata + attachment URL, but should NOT auto-download the image to R2 (out of scope for receive-only)
- The Tier 4.1 parser/normalizer test will assert: `message.text` is undefined, `message.attachments[].type === 'image'`, `payload.url` present, no implicit download

Sanitization:
- `https://example.test/fixture-image.png` — RFC 6761 reserved TLD, never real
- Same synthetic PSID + Page ID as other fixtures
- `m_FIXTURE_INBOX_ATTACH_*` mid prefix for grep-able provenance

---

## 3. Hard guarantees (still apply)

- ❌ No runtime route deployed
- ❌ No HMAC verify helper
- ❌ No parse-payload helper
- ❌ No persist-message helper
- ❌ No env / secrets / tokens
- ❌ No outbound message capability
- ✅ Only sanitized JSON fixture files + this readme

---

## 4. When Tier 4.1 PR opens

The new fixture extends the test-target list in `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md` § 4:

| Test target | Fixture | Expected |
|---|---|---|
| Attachment handling | `attachment-image-payload.json` | 200 + 1 Message row with attachments array, NO image download to R2 |

---

## 5. Cross-references

- Prior readme: `docs/superpowers/2026-05-18-tier4-webhook-fixtures-readme.md`
- Tier 4.1 implementation checklist: `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md`
- Tier 4.1 PR plan: `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
- Meta Messenger Platform attachment docs: https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages
