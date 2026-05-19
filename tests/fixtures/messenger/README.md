# Messenger webhook payload fixtures

**Purpose:** sanitized example payloads structurally matching Meta Messenger Platform webhook events. Used for unit tests of HMAC verification, idempotency dedup, and payload routing in the Tier 4.1 receive-only webhook implementation.

**Status:** docs/fixture only. No runtime code wires these in yet. Safe to commit.

---

## Files

| File | Event shape | Purpose |
|---|---|---|
| `page-inbox-text-message.json` | `messaging` array with `message.text` | Page DM text message |
| `post-comment-feed-event.json` | `changes` with `field: feed`, `verb: add`, `item: comment` | Post comment add |
| `signature-test-payload.json` | minimal `{}` body | HMAC compute fixture |
| `replay-old-timestamp.json` | message dated > 7 days ago | reject path |

---

## Hard guarantees

- Every `id` value is `1` followed by 14 zeros — clearly synthetic
- Every PSID is the literal `100000000000001` — Meta-impossible
- Every Page ID is `200000000000002` — synthetic
- No real `app_secret`, `verify_token`, or `page_access_token` in any file
- No real customer name, phone, or email
- All timestamps are deterministic literals (no current date leakage)

A test failure that exposes a real customer ID, page ID, or token in any of these files is a coding error — re-sanitize before committing.

---

## Cross-references

- Implementation plan: `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
- Implementation checklist: `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md`
- Meta Messenger Platform docs: https://developers.facebook.com/docs/messenger-platform/webhooks
