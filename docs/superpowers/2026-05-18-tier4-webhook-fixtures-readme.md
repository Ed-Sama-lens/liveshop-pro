# Tier 4 webhook fixtures — readme

**Filed:** 2026-05-18
**Status:** docs + fixtures only. No runtime route. No secrets.

This file explains the sanitized Messenger / Page-feed JSON fixtures under `tests/fixtures/messenger/` that will back the Tier 4.1 implementation PR (`feat/tier4.1-messenger-webhook-receive`).

---

## 1. Fixtures inventory

| File | Event shape | Purpose | Source ID |
|---|---|---|---|
| `page-inbox-text-message.json` | `messaging` array with `message.text` | Page DM text — happy path | `m_FIXTURE_INBOX_TEXT_000000000001` |
| `post-comment-feed-event.json` | `changes` with `field: feed`, `verb: add`, `item: comment` | Post comment add — happy path | `200000000000002_300000000000003` |
| `live-comment-feed-event.json` | `changes` with `field: feed`, `verb: add`, `item: comment`, `video_id` set | Live video comment — separate intent | `200000000000002_500000000000005` |
| `duplicate-replay-payload.json` | Identical to `page-inbox-text-message.json` | Replay test (same `mid`, idempotency check) | same `mid` as inbox-text |
| `replay-old-timestamp.json` | Message dated > 7 days ago | Reject-stale-replay test | `m_FIXTURE_REPLAY_OLD_000000000001` |
| `signature-test-payload.json` | Minimal `{"object":"page","entry":[]}` | HMAC compute fixture | n/a |
| `malformed-payload.json` | Wrong types (sender as string, timestamp as string, message.text as number) | Zod validation reject test | n/a |
| `missing-sender-payload.json` | Valid envelope but no `sender` object | Reject path — required field absent | `m_FIXTURE_MISSING_SENDER_000000001` |

---

## 2. Sanitization guarantees

Every fixture under `tests/fixtures/messenger/`:

- Every `id` is `1` followed by 14 zeros — clearly synthetic
- Every PSID is `100000000000001` — Meta-impossible
- Every Page ID is `200000000000002` — synthetic
- No real `app_secret`, `verify_token`, or `page_access_token` in any file
- No real customer name, phone, or email
- All timestamps are deterministic literals (no current date leakage)
- `mid` values prefixed `m_FIXTURE_*` so a grep can verify provenance

If a test accidentally leaks a real ID, name, or token in a future PR, this readme must be the audit trail.

---

## 3. Tier 4.1 implementation usage

When Tier 4.1 PR opens, fixtures back these unit tests:

| Test target | Fixture | Expected |
|---|---|---|
| HMAC verify happy path | `signature-test-payload.json` | true with computed sig |
| HMAC verify wrong sig | `signature-test-payload.json` | false |
| HMAC verify wrong algorithm prefix | `signature-test-payload.json` | false |
| Inbox text route happy path | `page-inbox-text-message.json` | 200 + 1 Message row |
| Inbox text replay | `duplicate-replay-payload.json` | 200 + still 1 Message row (idempotent) |
| Post comment routing | `post-comment-feed-event.json` | 200 + Conversation upsert + Message |
| Live comment routing | `live-comment-feed-event.json` | 200 + separate `video_id` linkage |
| Replay window | `replay-old-timestamp.json` | 200 + reject reason logged, 0 rows |
| Malformed body | `malformed-payload.json` | 200 + Zod fail logged, 0 rows |
| Missing sender | `missing-sender-payload.json` | 200 + reject logged, 0 rows |

All tests are pure unit tests against helper functions. No DB writes; repository layer is mocked.

---

## 4. Hard guarantees of this PR

- ❌ Does NOT add the Tier 4.1 runtime route
- ❌ Does NOT add the HMAC verification helper
- ❌ Does NOT add the parse-payload helper
- ❌ Does NOT add the persist-message helper
- ❌ Does NOT change `src/lib/env.ts`
- ❌ Does NOT add any feature flag
- ❌ Does NOT touch `src/server/repositories/*` or `src/server/services/*`
- ✅ Only adds 4 fixture JSON files + this readme

---

## 5. When the Tier 4.1 PR opens

The Tier 4.1 PR (`feat/tier4.1-messenger-webhook-receive`) will reference these fixtures by relative import (`tests/fixtures/messenger/*.json`). It will NOT re-paste payload content inline; tests load from these files for forensic auditability of payload shape.

Boss approval gates (G1-G10) per `2026-05-18-tier4-1-implementation-checklist.md` must clear first.

---

## 6. Cross-references

- Tier 4.1 PR plan: `docs/superpowers/2026-05-15-tier4-1-messenger-receive-only-pr-plan.md`
- Tier 4.1 implementation checklist: `docs/superpowers/2026-05-18-tier4-1-implementation-checklist.md`
- Fixtures: `tests/fixtures/messenger/`
- Meta Messenger Platform docs: https://developers.facebook.com/docs/messenger-platform/webhooks
