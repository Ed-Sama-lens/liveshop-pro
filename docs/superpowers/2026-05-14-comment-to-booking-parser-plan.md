# Tier 5 — Comment-to-booking parser plan

**Filed:** 2026-05-15
**Status:** Planning only. NO runtime parser. Implementation gated on Tier 4 inbound receive-only landing first + Boss approval.

---

## 1. Why this matters

Once Tier 4 inbound receive-only runtime ships, the system will have a stream of `Message` rows from MESSENGER / FACEBOOK live comments / FACEBOOK post comments / TELEGRAM / WHATSAPP arriving via webhook. Each carries `text` + `senderPlatformId` + `liveSessionId` + `channelIdentityId`.

Tier 5 parses each inbound message text to detect booking intent: "A1 +2", "B12", "ขอ EVG3 จำนวน 1", etc., and links the result to an admin-approval queue. Tier 5 v1 does NOT auto-book — admin reviews suggested matches and clicks "Confirm" to materialize a Booking row.

This sequence keeps customer-facing risk at zero (no automated charge / commit) while massively reducing admin manual-typing load during live commerce.

## 2. Scope

In scope (Tier 5 v1):

- Parser service `commentParserService` that takes a Message row and returns an array of `ParseResult`.
- Parser writes results to existing `CommentParseLog` table (schema already present, lines 880-895 in prisma/schema.prisma).
- New admin UI panel `/sale` Inbox → "Suggested bookings" tab showing PENDING parse results with 1-click confirm.
- Confirm action calls existing `bookingRepository.createManual()` — no new booking-creation path.
- Multi-language: Thai + Chinese (simplified + traditional) + English.
- Deduplication: same `(messageId, broadcastProductId)` pair only logs once.

Out of scope (Tier 5 v1):

- Auto-booking without admin review.
- Quantity > 999 (existing booking quantity max).
- Multi-product per message (Tier 5.5 — supports single product per parse result; multiple products from one message = multiple parse results).
- Price override detection.
- Customer identity creation (uses existing ChannelIdentity → Customer resolution path from Tier 4).
- Outbound reply.
- pak-ta-kra.

## 3. Schema (no change)

`CommentParseLog` already exists post-Phase-1 migration:

```prisma
model CommentParseLog {
  id               String       @id @default(cuid())
  messageId        String
  parserVersion    String
  matchedCode      String?
  ...
  @@index([messageId])
}
```

Tier 5 uses this table as-is. May need to extend with:

- `matchedVariantId String?` — FK to ProductVariant (for cross-shop guard at confirm time).
- `suggestedQuantity Int?` — extracted from text.
- `confidence Float` — parser confidence score 0..1.
- `adminAction` enum: `PENDING / CONFIRMED / IGNORED`.
- `adminActedAt DateTime?`.

Schema change is a Tier 5 v0.5 prep PR before parser ships. Additive only, no breaking change.

## 4. Parser algorithm

### 4.1 Input

```typescript
interface ParseInput {
  readonly messageId: string;
  readonly text: string;
  readonly shopId: string;
  readonly liveSessionId: string | null;
  readonly platform: Platform;
  readonly senderPlatformId: string;
}
```

### 4.2 Steps

1. **Normalize text** — lowercase Latin chars, strip emoji, collapse whitespace, normalize Unicode (NFC).
2. **Tokenize** — split on whitespace + common punctuation (`,`, `.`, `+`, `×`, `*`, `จำนวน`, `qty`, `量`).
3. **Detect product codes** — scan for tokens matching the shop's `displayCode` pattern `[A-Za-z0-9_-]{1,32}`. Lookup against active BroadcastProducts for the live session (or evergreen pool if `liveSessionId IS NULL`).
4. **Detect quantity** — adjacent integer to product code; default to 1 if absent.
5. **Confidence score**:
   - Exact match displayCode + adjacent qty → 0.95
   - Match displayCode only → 0.80
   - Partial match (Levenshtein ≤ 1) → 0.50
   - No match → 0.0 (skip log row)
6. **Output** — array of `ParseResult` per message.

### 4.3 Output

```typescript
interface ParseResult {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly suggestedQuantity: number;
  readonly confidence: number;
  readonly senderChannelIdentityId: string | null; // resolved upstream
}
```

### 4.4 Examples

| Text | Expected results |
|---|---|
| `A1 +2` | `[{displayCode: 'A1', qty: 2, conf: 0.95}]` |
| `เอา B12 หนึ่งอันค่ะ` | `[{displayCode: 'B12', qty: 1, conf: 0.95}]` |
| `จอง A1 และ B2 ครับ` | `[{displayCode: 'A1', qty: 1}, {displayCode: 'B2', qty: 1}]` |
| `+1 EVG-RED-L` | `[{displayCode: 'EVG-RED-L', qty: 1, conf: 0.95}]` |
| `要 C3 三件` (Chinese) | `[{displayCode: 'C3', qty: 3, conf: 0.95}]` |
| `A1 A2 A3` | `[{A1, q:1}, {A2, q:1}, {A3, q:1}]` |
| `Hello` | `[]` (no match) |

## 5. False-positive mitigation

| Risk | Mitigation |
|---|---|
| Random alphanumeric matches arbitrary product code | Only match against BroadcastProducts actually existing in the shop for current LiveSession + evergreen pool |
| Numbers in non-quantity context ("เก๊ดแล้ว 5555") | Quantity must be adjacent (within 2 tokens) of displayCode |
| Customer asks question, not booking ("A1 ราคาเท่าไหร่?") | Detect question marks + question phrases ("ราคา", "?", "เท่าไหร่", "怎么"); skip parse |
| Duplicate parses on same message | `@@unique([messageId, matchedCode])` index (add in Tier 5 v0.5 schema PR) |
| Admin already created booking from this message | Confirm action checks `Message.sourceBookings` count; skip if non-zero |

## 6. Duplicate / replay protection

- Each Message → CommentParseLog rows. If parser re-runs on same message (webhook retry), dedup via the proposed `@@unique([messageId, matchedCode])`.
- Admin confirm action is idempotent via existing `bookingRepository.createManual` idempotencyKey path — pass `idempotencyKey = parseLogId` so re-confirm returns the same Booking.

## 7. Customer identity matching

Tier 5 v1 uses Tier 4 receive-only output: each Message arrives with `channelIdentityId` set + that ChannelIdentity may already link to a Customer. Resolution rules:

1. If `ChannelIdentity.customerId` set → use it.
2. Else: admin sees a "Pick or create customer" dialog on Confirm → resolves before booking.
3. Never auto-create Customer rows from parse results (Tier 5 v1 keeps customer creation in admin hands).

## 8. Admin UI

New `/sale` panel tab "Suggested bookings":

- List PENDING `CommentParseLog` rows for the active LiveSession + evergreen pool, ordered by `createdAt DESC`.
- Each row shows: message preview, sender displayName, matched displayCode, suggestedQuantity, confidence badge, two buttons:
  - **Confirm + create booking** — opens existing Manual Create dialog pre-filled with parse result. Admin can adjust qty + customer before submit.
  - **Ignore** — sets `adminAction=IGNORED`, no booking created.
- Filter chip: confidence threshold (default 0.80+).

## 9. Audit trail

- Every Booking created from a parse result writes `BookingHistory` row with `reason = 'PARSED_FROM_COMMENT'`.
- Activity log entry `BOOKING_CREATED_FROM_PARSE` records `parseLogId`, `messageId`, `senderPlatformId`.
- `Booking.sourceMessageId` already exists (per Phase-1 schema) — populated.

## 10. Tests + verifier

### 10.1 Unit

- `parseMessageText(input)` returns expected array for each language pattern.
- Confidence scoring boundary cases.
- Cross-shop displayCode not matched.
- Question-mark detection.
- Duplicate-in-text dedup ("A1 A1 A1" → one result).

### 10.2 Integration

- Parser service idempotent on repeated runs.
- Parser respects `liveSessionId` scope.
- Confirm action calls `bookingRepository.createManual` correctly.

### 10.3 Docker verifier

`scripts/verify-comment-parser.ts`:

- Test A: parse simple "A1 +2" → 1 ParseResult.
- Test B: parse Thai "A1 1 ชิ้น" → 1 ParseResult.
- Test C: parse Chinese "A1 一个" → 1 ParseResult.
- Test D: parse "A1 ราคาเท่าไหร่?" → 0 results (question detected).
- Test E: parse with no matching BP in shop → 0 results.
- Test F: replay parser on same message → no duplicate logs.
- Test G: admin Confirm uses idempotencyKey = parseLogId.
- Test H: admin Confirm preserves audit trail.

## 11. Rollout phases

| Stage | Action |
|---|---|
| T5.0 | Schema additive PR (CommentParseLog fields + index) |
| T5.0 deploy | smoke + observation |
| T5.1 | Parser service + tests + verifier |
| T5.1 deploy | smoke; parser runs but no admin UI yet |
| T5.2 | Admin UI "Suggested bookings" panel + Confirm flow |
| T5.2 deploy | full smoke with Boss/test data |
| T5.3 (optional) | Confidence threshold tuning + per-shop dictionary |

No feature flag needed for Tier 5 — parser runs as soon as inbound messages arrive (Tier 4 dependency). Admin UI gates the actual booking creation.

## 12. Hard no-go

- No auto-booking. Admin must confirm every result.
- No outbound reply to customer based on parse result.
- No raw SQL to materialize Bookings from parse results — always via `bookingRepository.createManual`.
- No cross-shop parse spillover (shop-scoped BP lookup).
- No private-data leak in logs (text already in Message table; parser logs only IDs + matched codes, not raw text).

## 13. Cross-references

- Tier 4 receive-only plan: `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md`
- Inbound schema: `prisma/schema.prisma` § 784-895 (Conversation / ChannelIdentity / Message / CommentParseLog)
- Existing `bookingRepository.createManual` consumer: `src/server/repositories/booking.repository.ts`
- Boss V5 brand DNA pattern → not relevant here (pak-ta-kra)
