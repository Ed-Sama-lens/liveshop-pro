# Booking → Order Conversion (Phase 1C) — Dissent Doc

Date: 2026-05-09
Author: Claude (under Boss instruction)
Project: liveshop-pro
Phase: Phase 1C — manual `/sale` MVP, booking → order conversion design
Status: **DOC ONLY**. No code, no schema, no migration, no API, no UI, no platform integration, no checkout/payment behavior change. Pak-ta-kra zero-touch.

Companion to:
- `docs/superpowers/2026-04-06-sale-mvp-dissent.md` (initial /sale dissent + Boss decisions)
- `docs/superpowers/2026-05-09-sale-booking-runtime-design.md` (Commit 2A runtime design)
- Schema source: Commit 1 (`bb8b973`) + migration `20260508171617_add_unified_inbox_and_sale_mvp`
- Booking confirm/cancel runtime: Commit 2B (`689a83a`) + 2B-AUDIT-001 (`552562a`) + 2D-FIX (`6681e0d`)
- Booking confirm/cancel API: Commit 2E (`90ff382`)
- E2E verification: `scripts/verify-booking-flow.ts` 9/9 pass against local Docker DB
- RBAC: Commit 2F (`c707391`) — `/sale` permission map landed

---

## Goal

Convert one or more `CONFIRMED` `Booking` rows for a single customer in a single live session into one `Order` row plus its `OrderItem` rows, **without double-counting stock and without introducing new race windows**.

After conversion, the existing storefront-equivalent order pipeline runs unchanged: `Order(status='RESERVED') → CONFIRMED → PACKED → SHIPPED → DELIVERED`. Payment slip upload, admin verify, shipment, etc. all reuse production code.

---

## 1. Blast radius

- **Stock**: every conversion mutates two ProductVariant rows × N items. Wrong path = oversell or overcorrection.
- **Booking lifecycle**: bookings flip `CONFIRMED → CONVERTED_TO_ORDER`; once flipped, they cannot revert. R0-grade if applied to the wrong booking IDs.
- **Order pipeline**: emits an `Order` row that immediately enters production order flow (admin verify, shipment, payment). Emits side effects: optional email + `notifyNewOrder` + `dispatchWebhook('order.created')`.
- **StockReservation invariant**: each row carries either `bookingId` OR `orderId` today. Conversion must move from booking-side to dual-bound state without losing the `reservedQty++` already in the variant.
- **Existing storefront checkout flow**: completely untouched. Conversion path is a SECOND order-creation entry point (after `checkoutRepository.checkout()`) — must not affect storefront cart or storefront `StockReservation` semantics.
- **Customer-facing messaging**: order summary / payment instruction must support **zh / en / th** (Boss new requirement). Currency MYR/RM only. Must not regress to THB.
- **Audit**: `BookingHistory` flows + `OrderAudit` flows must both emit; today they live in separate tables and are independently rolled back inside the same transaction.
- **Idempotency**: admin double-click on "Create order from confirmed bookings" button must not create two orders or lose stock.

R-classification:
- Doc commit (this file): R2.
- Schema change: NONE in this dissent. R2 if all assumptions below verify.
- Runtime commit (Commit 2H, future): **R1** — touches stock, order, booking, audit; lives in production transaction path on first deploy regardless of UI.
- Production rollout requires Vercel deploy + smoke + booking-flow E2E re-run.

---

## 2. Assumptions

**Verified (read in repo, not invented):**

- A1. `Order.idempotencyKey String? @unique` exists today (`prisma/schema.prisma:296`). Native Postgres NULL-distinct semantics let multiple rows have NULL.
- A2. `Booking.convertedOrderId String?` + `convertedOrder Order?` relation already exists (Commit 1). No schema add needed for the FK.
- A3. `Booking.idempotencyKey String?` with `@@unique([shopId, idempotencyKey])` exists (Commit 1). Phase 1 reserved for parser; UNUSED in conversion flow.
- A4. `BookingStatus.CONVERTED_TO_ORDER` is a terminal state in `canTransitionBookingStatus` (`booking-rules.ts`). Cancel against `CONVERTED_TO_ORDER` is rejected with `BOOKING_INVALID_STATUS` (verified in `verify-booking-flow.ts` Test 9).
- A5. Order's `VALID_TRANSITIONS` (`src/lib/validation/order.schemas.ts:96`):
  ```
  RESERVED  → CONFIRMED, CANCELLED
  CONFIRMED → PACKED, CANCELLED
  PACKED    → SHIPPED, CANCELLED
  SHIPPED   → DELIVERED
  ```
  Conversion must create the order at `RESERVED`, the natural entry state.
- A6. Order `RESERVED → CONFIRMED` decrements BOTH `quantity` and `reservedQty` (existing logic at `order.repository.ts:376-386`). This means conversion MUST NOT decrement `reservedQty` again — it must leave the booking-side increment in place so it gets decremented exactly once at `Order.RESERVED → CONFIRMED`.
- A7. `StockReservation.orderId String?` is nullable (verified during Commit 1 migration safety check). Adding `orderId` to a row that already has `bookingId` is a `prisma.update` of an optional column — NO schema change, NO migration.
- A8. `Booking.broadcastProduct.variantId` is the variant the booking reserved against (validated by `bookingRepository.confirm()`).
- A9. Existing `checkout.repository.checkout()` writes:
  - `Order` (status `RESERVED`, `channel='STOREFRONT'`)
  - `OrderItem[]` per cart line
  - `ProductVariant.reservedQty +=` per item
  - `StockReservation` per item (`orderId` set, `expiresAt = now + 24h`)
  - `OrderAudit` (`action='CREATED'`)
  - `Cart` cleared
  - Non-blocking: email, `notifyNewOrder`, `dispatchWebhook('order.created')`
- A10. Bookings tied to a single `(shop, liveSession, customer)` are queryable via existing relations; no new index needed (existing `@@index([liveSessionId, status])` and `@@index([customerId, status])` cover the lookup).

**Unverified (flagged as ASSUMPTION):**

- AU1. `ASSUMPTION:` `Order.orderNumber` generation pattern `ORD-${count + 1}` is per-shop (uses `prisma.order.count({ where: { shopId } })`). Confirmed by reading code BUT under concurrency, two simultaneous order-create calls can produce same number. **Not introduced by us — pre-existing issue in storefront checkout. Out of scope to fix.** Conversion will use the same pattern for parity.
- AU2. `ASSUMPTION:` Email sending via Resend in conversion path uses same `lib/email/templates.ts` `orderConfirmationEmail()`. Existing template is English-only — needs i18n work as separate Phase 2+ commit OR Phase 1 inlines a 3-language template helper. See §11 for decision.
- AU3. `ASSUMPTION:` `dispatchWebhook` event name `order.created` matches what existing webhook subscribers expect. Conversion will use the same name to avoid breaking existing integrations.
- AU4. `ASSUMPTION:` Customer model has all data needed for shipping (address, district, province, postalCode). Phase 1 booking flow does NOT collect shipping address yet — conversion must either (a) use Customer's stored address, or (b) require admin to fill shipping fields at conversion-time. See §9.

---

## 3. Reversibility (R0/R1/R2)

| Action | Class | Why | Mitigation |
|---|---|---|---|
| This dissent doc | R2 | Doc-only, no behavior | n/a |
| Commit 2H runtime: `bookingRepository.convertToOrder()` + route + tests | R1 | First production order-creation path #2; bookings flip to terminal state | E2E test (extend `verify-booking-flow.ts`) PASS before push; staged Vercel deploy + smoke + manual probe with admin session |
| Commit 2I UI: `/sale/[sessionId]` "Create order from N confirmed bookings" button | R1 | Exposes conversion to admin clicks in production | Soft-launch behind feature flag (env var) OR ship UI after 2H runtime stable for ≥24h |
| Per-conversion individual call | R0 once executed | Bookings flip to `CONVERTED_TO_ORDER` (terminal); Order row created with side effects (email may fire) | Idempotency key prevents duplicate; rollback = manual order cancel + booking history note |
| Hypothetical schema change | R1 | Migration on Railway prod | NOT planned in this dissent — schema is sufficient |

R0 sub-list (operations the future runtime MUST never perform without explicit Boss approval per existing R0 rules):
- Modify existing storefront `checkoutRepository.checkout()` behavior
- Alter `VALID_TRANSITIONS` for Order
- Decrement `quantity` outside Order transition path
- Auto-send customer-facing message without admin preview (per Boss decision §13)

---

## 4. Blind spots

- **B1. Multi-confirm-then-convert race**: admin A clicks "Create order" while admin B clicks "Cancel booking" on one of the bookings. Order conversion + cancel run concurrently. If conversion picks up the booking before B's cancel commits, A wins; B sees `BOOKING_INVALID_STATUS`. Acceptable (last-writer-wins on the booking lock) but UI must surface the conflict.
- **B2. Exchange rate / pricing drift**: `Booking.unitPrice` is captured at booking confirm time. If admin overrode `BroadcastProduct.priceOverride` between confirm and convert, the booking's `unitPrice` is the source of truth — verify in code that conversion reads `Booking.unitPrice`, NOT current `BroadcastProduct.priceOverride`.
- **B3. Customer address absence**: per AU4, the booking flow doesn't collect shipping address. Conversion must either reject if address missing OR allow admin to fill at conversion-time. Phase 1 may need to ship a small "required shipping fields at conversion" form. Out of dissent text scope but flagged for Commit 2I UI.
- **B4. `StockReservation.expiresAt` semantics drift**: booking-side reservation uses `NO_EXPIRY_SENTINEL = 2099-12-31`. Storefront-side reservation uses `now + 24h`. After conversion, the row picks up `orderId` while keeping its `expiresAt`. Question: should we re-set `expiresAt` to `now + 24h` to match storefront semantics, OR leave the sentinel in place because admin already manually-confirmed and stock is "committed"? Recommended: **leave sentinel** — admin confirmation is stronger commitment than 24h cart hold. Document explicitly. (Conservative alternative: re-set to 24h. Boss may override.)
- **B5. Localization key explosion**: zh/en/th order summary template requires 3 messages × {greeting, item-line, totals, payment, footer} = ~15 strings minimum. If we hand-roll inside conversion code, that creates tech debt. Recommend extracting to `messages/{en,th,zh}.json` namespace `orderSummary.*` so existing next-intl machinery handles it. But that machinery is currently wired for ADMIN UI only — i18n for a SERVER-RENDERED message string requires a server-side `getTranslations()` call against the customer's preferred locale (which we don't have unless `Customer` row stores a `locale` field — it doesn't). **NEW UNVERIFIED: customer locale storage is missing**. Phase 1 fallback: render all 3 languages stacked in one message body. Boss-locked decision needed.
- **B6. Email i18n vs HTML template**: `orderConfirmationEmail()` returns hardcoded HTML. Multi-language version may need MJML or just 3 separate template strings concatenated. R2 to extend; doesn't block conversion.
- **B7. Webhook payload localization**: `dispatchWebhook('order.created', {...})` payload uses field names — language-agnostic. No i18n needed.
- **B8. Concurrent two-admin "Create order" race**: idempotency key planned (§11) but two clicks within ~milliseconds can both pass the unique-key check if their key inputs differ (e.g. one clicks while a third booking just confirmed). Order ends up with 2 confirmed bookings, second order ends up with 1 booking. Acceptable if admins understand "Create order" snapshots the current confirmed set. UI must show count clearly.
- **B9. Booking → Order route should NOT exist on `/api/sale/bookings/[bookingId]/...` namespace** since it's a customer-batch operation, not a single-booking action. Recommended: `POST /api/sale/orders` body `{ liveSessionId, customerId }` → finds confirmed bookings server-side. OR `POST /api/sale/conversions` for clarity. Naming locked in §17.
- **B10. Existing `Order.idempotencyKey @unique` (global) vs `@@unique([shopId, idempotencyKey])` on Booking**: Order is global-unique on the key. Conversion key includes `shopId` already so no collision risk, but worth noting because copy-pasting the same key for cross-shop testing would break. Future hardening: convert `Order.idempotencyKey` to scoped unique. Out of scope.
- **B11. `BookingHistory` row order in transaction**: many bookings flip status in one transaction. Each flip = one BookingHistory insert. Ordering preserved by `createdAt` timestamps if Postgres clock resolution is sufficient. ASSUMPTION: ms resolution is enough for audit; explicit `orderInBatch` field is overkill.
- **B12. Pak-ta-kra confusion**: this design is liveshop-pro only. pak-ta-kra has its own dissent docs in its repo. Do NOT cross-reference.

---

## 5. StockReservation transfer — Option A vs Option B (chosen path)

### Option A — same row gains `orderId` (CHOSEN)

```
BEFORE conversion:
StockReservation { id: r1, variantId: v1, bookingId: b1, orderId: NULL, quantity: 2, expiresAt: SENTINEL, releasedAt: NULL }

AFTER conversion (single UPDATE inside transaction):
StockReservation { id: r1, variantId: v1, bookingId: b1, orderId: o1, quantity: 2, expiresAt: SENTINEL, releasedAt: NULL }
```

`reservedQty` UNCHANGED — the existing increment from booking-confirm carries the order through to the existing Order pipeline. When admin later clicks Order `RESERVED → CONFIRMED`, the existing transition logic decrements `reservedQty` and `quantity` exactly once.

### Option B — close + recreate (REJECTED)

```
BEFORE:
SR { id: r1, bookingId: b1, orderId: NULL, releasedAt: NULL }
ProductVariant.reservedQty = R

INSIDE transaction:
- SR.update { id: r1, releasedAt: now } — closes booking-side row
- ProductVariant.update { reservedQty -= 2 } — releases booking reservation
- SR.create { variantId: v1, orderId: o1, quantity: 2, expiresAt: now+24h } — order-side row
- ProductVariant.update { reservedQty += 2 } — re-reserves under order

AFTER:
SR { id: r1, bookingId: b1, orderId: NULL, releasedAt: <now> }
SR { id: r2, bookingId: NULL, orderId: o1, releasedAt: NULL }
ProductVariant.reservedQty = R
```

**Why rejected**:
- Two decrement / increment ops on `reservedQty` inside the same transaction → atomic but increases SQL surface
- Audit trail produces TWO rows per conversion
- Transient state inside transaction — between the close and the recreate, `reservedQty` is briefly correct only because we did both decrements in same txn; harder to reason about
- More SQL → more failure surface
- No real benefit over Option A for current Phase 1 needs

### Locked decision

**Option A.** Conversion `prisma.$transaction` does:
1. SELECT confirmed bookings + their active StockReservation rows
2. Validate eligibility (status, count > 0, etc.)
3. Compute order totals from `Booking.unitPrice * Booking.quantity`
4. CREATE Order (status='RESERVED', `idempotencyKey` deterministic, `channel`= TBD, see §17)
5. CREATE OrderItem rows (consolidated per §10)
6. UPDATE each StockReservation to set `orderId = newOrder.id` (KEEP `bookingId`, KEEP `expiresAt` sentinel)
7. UPDATE each Booking: `status = 'CONVERTED_TO_ORDER'`, `convertedOrderId = newOrder.id`
8. INSERT BookingHistory rows for each booking transition
9. INSERT OrderAudit row (`action='CREATED'`, `metadata.source='sale_booking_conversion'`)
10. RETURN Order id + orderNumber + booking IDs

After commit (NOT in transaction):
- `notifyNewOrder` (non-blocking)
- `dispatchWebhook('order.created', payload)` (non-blocking)
- **NO email auto-send** per Boss decision §13 (Phase 1)
- Optional: return localized order-summary template HTML for admin to copy/preview/send

---

## 6. How to avoid double `reservedQty` decrement

The fundamental invariant:
> `reservedQty` is incremented exactly once per stock unit that is committed to a booking-or-order, and decremented exactly once when that commitment ends (cancel) or is fulfilled (Order.CONFIRMED).

### State diagram for one StockReservation row through the whole life

```
                                 +---------------------------+
                                 | bookingRepository.confirm |
                                 |  reservedQty +=           |
                                 |  SR.create(bookingId)     |
                                 +-------------+-------------+
                                               |
              +--------------------------------+----------------------+
              |                                                       |
   bookingRepository.cancel                              bookingRepository.convertToOrder
   (CONFIRMED → CANCELLED|EXPIRED)                          (CONFIRMED → CONVERTED_TO_ORDER)
              |                                                       |
   reservedQty -=                                          reservedQty UNCHANGED
   SR.update(releasedAt = now)                             SR.update(orderId = o1)
   END                                                     |
                                                           |
                                              +------------+------------+
                                              |                         |
                                Order RESERVED → CONFIRMED   Order RESERVED → CANCELLED
                                              |                         |
                                  reservedQty -= AND quantity -=  reservedQty -=
                                  (existing order.repository      (existing order.repository
                                   transition logic, NOT changed)  transition logic, NOT changed)
                                  END                              END
```

**Total `reservedQty` deltas for one happy-path stock unit**: `+1` at booking confirm, `-1` at Order `RESERVED → CONFIRMED`. Net zero, perfectly mirrored by `quantity -= 1` at the same Order transition. Identical to the existing storefront checkout flow.

### What the convertToOrder transaction does NOT do

- Does NOT call `tx.productVariant.update({ reservedQty: { increment: ... } })` — the increment happened at booking-confirm time
- Does NOT call `tx.productVariant.update({ reservedQty: { decrement: ... } })` — the decrement happens at Order transition
- Does NOT touch `quantity` — only Order `RESERVED → CONFIRMED` does

### Verification points (must be in Commit 2H tests)

- T1. After conversion, `ProductVariant.reservedQty` is unchanged from pre-conversion value
- T2. After conversion, `ProductVariant.quantity` is unchanged
- T3. After conversion + Order `RESERVED → CONFIRMED`, `reservedQty` AND `quantity` decrement by exactly N (sum of converted booking quantities)
- T4. After conversion + Order `* → CANCELLED`, `reservedQty` decrements by exactly N, `quantity` unchanged
- T5. Booking rows with status `CONVERTED_TO_ORDER` cannot be cancel/expire'd (Test 9 in `verify-booking-flow.ts` already passes; will continue to pass after conversion adds the rows)
- T6. Double-click on "Create order" returns same Order id, no duplicate Order row, no duplicate BookingHistory entries (idempotency)
- T7. Partial failure mid-transaction (e.g. one Booking already in `CONVERTED_TO_ORDER` from a parallel admin click) → entire transaction rolls back; no Booking flips, no Order created

---

## 7. Existing storefront checkout flow constraints

Storefront checkout (`checkout.repository.ts`) is the **production reference path**. Conversion must preserve its invariants:

| Invariant | Storefront checkout | Conversion (must match) |
|---|---|---|
| Order created with `status='RESERVED'` | ✅ | ✅ |
| `Order.channel` value | `'STOREFRONT'` | New `'LIVE'` value? Or reuse `'FACEBOOK'`/`'MANUAL'`? See §17 |
| `OrderItem` rows per line | One per cart item | Consolidated per §10 |
| `ProductVariant.reservedQty +=` | Per OrderItem | NOT done (booking already +=) |
| `StockReservation.create({ orderId, expiresAt: now+24h })` | Yes | NOT done — repurpose existing row |
| `OrderAudit({ action: 'CREATED' })` | Yes | Yes |
| `Cart.deleteMany` | Yes | N/A (no cart involved) |
| Email confirmation | Yes (best-effort) | NO in Phase 1 (per Boss §13) |
| `notifyNewOrder` | Yes | Yes (parity) |
| `dispatchWebhook('order.created')` | Yes | Yes (parity) |
| Customer record create-or-update | Yes (from checkout form) | NO — customer already exists (booking has `customerId`) |
| Address fields | From checkout form | TBD — see B3, §9, AU4 |
| Order number generation | `ORD-NNNNNN` per shop | Same pattern (parity, AU1) |

**Critical guard**: storefront checkout's race-prone `reservedQty +=` is NOT touched by conversion. Conversion-side path has zero `reservedQty` arithmetic. Storefront checkout race window remains a separate tech-debt item (per Discovery report Production Risk Map).

---

## 8. Order grouping rule

Per Boss answer (Q2):

**Phase 1**: One order per `(customerId, liveSessionId)` from ALL currently `CONFIRMED` bookings of that customer in that live session.

```sql
SELECT * FROM "Booking"
WHERE "shopId" = $shopId
  AND "liveSessionId" = $liveSessionId
  AND "customerId" = $customerId
  AND "status" = 'CONFIRMED'
```

If `count() = 0`: throw `NO_BOOKINGS_TO_CONVERT` (422).

If `count() ≥ 1`: convert the entire set in one transaction.

**Future**: support partial conversion via per-booking-id selection (Boss confirmed). Design must NOT block this. Specifically:
- Repository method should accept an optional `bookingIds?: string[]` parameter
- If omitted, defaults to "all confirmed for this customer × session"
- Phase 1 route layer always omits (admin button is "Create order from all confirmed bookings")
- Phase 2 route layer can pass selected IDs from a future "select bookings" UI

**Cross-broadcast bookings**: a single customer might have confirmed bookings in TWO different live sessions (rare). Boss decision: separate orders per session. Design naturally enforces this via `liveSessionId` filter.

---

## 9. OrderItem consolidation rule

Per Boss answer (Q3):

Group bookings by tuple `(productId, variantId, unitPrice)`. Each group becomes one `OrderItem`:

```ts
// Pseudocode
const groups = new Map<string, { productId, variantId, unitPrice, totalQty: number, sourceBookingIds: string[] }>();
for (const b of confirmedBookings) {
  const key = `${b.broadcastProduct.productId}|${b.broadcastProduct.variantId}|${b.unitPrice}`;
  const existing = groups.get(key);
  if (existing) {
    existing.totalQty += b.quantity;
    existing.sourceBookingIds.push(b.id);
  } else {
    groups.set(key, { ...newGroup });
  }
}
```

Result:
- Same variant + same price → ONE `OrderItem { quantity = sum }`
- Same variant + DIFFERENT price (e.g. priceOverride changed mid-broadcast) → TWO `OrderItem` rows
- Different variants → separate `OrderItem` rows

`totalPrice = unitPrice * quantity` per group.

**Audit chain for grouping**:
- `Booking.convertedOrderId` = newOrder.id (one-to-many: many bookings → one order)
- `BookingHistory` per booking transition
- `OrderItem` does NOT carry `sourceBookingIds` (no schema field). Audit traversal is via `Booking.convertedOrderId` reverse lookup, which is sufficient.

ASSUMPTION: shop owners do NOT need to see "which booking became which OrderItem" in the order detail view. If they do, future addition: `OrderItem.metadata Json?` (out of scope).

**Customer-facing summary** (zh/en/th): groups are presented to customer as line items naturally. No "you booked T31 twice" detail unless admin chooses to display.

---

## 10. Deterministic `Order.idempotencyKey`

Per Boss answer (Q6):

```
sale-conv:{shopId}:{liveSessionId}:{customerId}:{sortedBookingIdsHash}
```

Components:
- Prefix `sale-conv:` distinguishes from any future idempotency keys (storefront checkout doesn't use one today)
- `shopId`: tenant scope
- `liveSessionId`: per-broadcast scope
- `customerId`: per-customer scope
- `sortedBookingIdsHash`: SHA-256 hex of `bookingIds.sort().join(',')` truncated to first 16 chars

Why hash and not raw IDs:
- Raw IDs would push the key over Postgres unique-index practical length (`Order.idempotencyKey String? @unique` is `text`, no length cap, but indexes get large; hash is constant-size 16 chars)
- Order doesn't need to know which bookings — `Booking.convertedOrderId` reverse-references

Why **sorted** booking IDs:
- Different sort order in client → different hash → false-positive duplicate. Sorting normalizes.

Why include `bookingsHash` and not just `(shopId, liveSessionId, customerId)`:
- Boss correctly flagged: customer might have a 2nd round of confirmed bookings later in the same session (after the first batch was converted). Without `bookingsHash`, the second convert call would hit the unique constraint and fail. With hash, each unique set of bookings produces its own key.

**Concurrent-click semantics**:
- Two admin clicks within milliseconds, same booking set → same hash → second insert hits unique constraint → catch + return existing Order (idempotent success)
- Two admin clicks with slight booking-set change between them → different hashes → both succeed → second order has the new bookings only. **This is acceptable** per B8.

**Implementation note**: idempotency-key insert collision must be caught at the Prisma error level (`P2002 Unique constraint failed`) and return the EXISTING Order found by the same key. Pseudocode:

```ts
try {
  await tx.order.create({ data: { ..., idempotencyKey } });
} catch (err) {
  if (isPrismaUniqueViolation(err)) {
    const existing = await tx.order.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotent: true, orderId: existing.id, ... };
  }
  throw err;
}
```

---

## 11. Customer-facing localization (NEW Boss requirement)

Customer base: **Malaysian** (mostly). Common languages: **zh** (Chinese, primary), **en** (English), **th** (Thai, minority). Currency: **MYR / RM only**.

### Phase 1 scope

**No auto-send** (per Boss answer Q7). Conversion produces an order but does NOT push messages to customer's Messenger / WhatsApp / Telegram.

**Optional**: conversion can RETURN a localized order-summary preview that admin manually copies into Messenger / WhatsApp. Returned as part of the API response payload OR fetched via a separate `GET /api/sale/orders/:orderId/summary?locale=zh` route.

Recommendation: separate route. Conversion endpoint returns the bare Order id + status; summary endpoint produces the localized text. Cleaner separation; admin can re-fetch with different locale.

### Locale resolution chain

For Phase 1, customer locale is unknown. Default to:
1. `Customer.metadata.locale` if exists (NOT in current schema — schema has no `Customer.locale`)
2. `LiveSession.metadata.locale` (NOT in current schema)
3. Shop default = `'zh'` (per Boss "Chinese as default/main language")

**ASSUMPTION**: zero `locale` columns exist today. Phase 1 = always default `'zh'` until Customer.locale or session-locale fields land.

Future: add `Customer.locale String? @default('zh')` migration. Out of dissent scope.

### Template structure

Order summary message must include:
- Greeting (zh: 您好, en: Hello, th: สวัสดี)
- Order number
- Items list (product name, variant attrs, quantity, unit price RM, line total RM)
- Subtotal RM
- Shipping fee RM
- Total RM (bold)
- Payment instructions (PromptPay QR URL OR bank transfer details — from `ShopBranding`)
- Footer with shop contact

Three separate full templates in `src/lib/email/templates.ts` extension OR new `src/lib/sale/order-templates.ts`. Recommendation: new file dedicated to sale-flow templates so storefront templates stay untouched.

### Stacked-language fallback

If admin doesn't know customer's locale at all, summary endpoint accepts `?locale=stacked` and concatenates all 3 with separators. Common in Malaysian commerce ("here's your order in EN | ZH | TH"). Boss confirmation needed.

### Currency strict guard

All amount renderings use `formatCurrency(amount, 'MYR')` from `src/lib/currency/constants.ts`. Helper outputs `RM 12.34`. **No hardcoded `'฿'` allowed in any conversion-flow code or templates**. Lint rule (future): grep for `฿` in `src/lib/sale/**` would catch regressions.

### Phase 2+ MessageTemplate model (idea, not built)

Future schema addition:

```prisma
model MessageTemplate {
  id        String   @id @default(cuid())
  shopId    String
  type      MessageTemplateType  // ORDER_SUMMARY, PAYMENT_INSTRUCTION, SHIPPED_NOTICE
  locale    String                // 'zh', 'en', 'th'
  body      String   @db.Text
  variables String[]              // expected placeholders
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  shop Shop @relation(...)

  @@unique([shopId, type, locale])
  @@index([shopId])
}
```

Phase 2+: admin can edit per-shop / per-language templates from `/sale/settings`. Not built in Phase 1.

### Future chat translation helper

Phase 4+ (after platform webhook ingestion lands):
- Inbound customer messages auto-translated to admin's preferred language (zh/en/th → th)
- Admin's outbound drafts auto-translated back to customer's language
- Always with admin preview + edit-before-send (per Boss "Human preview/edit required")
- LLM provider TBD; out of dissent scope

---

## 12. No auto-send in Phase 1

Boss decision Q7 is explicit: **do not auto-send customer-facing messages on conversion**.

Conversion produces:
- Order row (DB state)
- BookingHistory entries (audit)
- OrderAudit (audit)
- `notifyNewOrder` admin SSE notification (in-app)
- `dispatchWebhook('order.created')` (admin-configured outbound webhooks fire — these are NOT customer-facing)

Conversion does NOT:
- Send Messenger message
- Send WhatsApp message
- Send Telegram message
- Send email to customer (unlike storefront checkout, which DOES send)

**Why diverge from storefront checkout**: storefront customer typed their email at checkout; expects confirmation. Live-sale customer is being invoiced from chat — no email collected, and pushing a Messenger DM without admin context is risky.

**Phase 2+** (Messenger send adapter): conversion may queue a draft message into a "ready to send" tray; admin clicks "Send" to release. Schema accommodation:

```prisma
model OrderDraftMessage {  // hypothetical
  id          String
  orderId     String  @unique
  locale      String
  body        String  @db.Text
  state       'PENDING' | 'SENT' | 'CANCELLED'
  createdAt   DateTime
  sentAt      DateTime?
}
```

Out of Phase 1 scope.

---

## 13. Future MessageTemplate model

See §11 ("Phase 2+ MessageTemplate model"). Documented; not built.

## 14. Future chat translation helper

See §11 ("Future chat translation helper"). Documented; not built.

---

## 15. Test plan for Commit 2H runtime

Per Boss answer Q8: **extend `scripts/verify-booking-flow.ts`**, no full Docker/Vitest harness yet.

### Pure helper tests (vitest, in-memory)

New file: `tests/unit/lib/sale/booking-conversion-rules.test.ts` (or extend `booking-rules.test.ts`).

Pure helpers to add to `src/lib/sale/booking-rules.ts`:

- `groupBookingsForOrderItems(bookings: ConfirmedBookingSnapshot[]): OrderItemGroup[]` — implements §9 grouping
- `computeOrderTotals(groups: OrderItemGroup[]): { subtotal, shippingFee, total }` — sums + zero shipping in Phase 1
- `buildConversionIdempotencyKey({ shopId, liveSessionId, customerId, bookingIds }): string` — implements §10 hash format
- `selectConfirmedBookings(allBookings, { shopId, liveSessionId, customerId, bookingIds? }): ConfirmedBookingSnapshot[]` — filter logic
- `validateBookingsConvertible(bookings: BookingSnapshot[]): { ok: true } | { ok: false, code: 'NO_BOOKINGS_TO_CONVERT' | 'BOOKING_INVALID_STATUS' }` — preflight

Test cases (proposed, ~12 new pure-fn tests):

1. groupBookingsForOrderItems: 2 bookings same variant + same price → 1 group, qty summed
2. groupBookingsForOrderItems: 2 bookings same variant + different price → 2 groups
3. groupBookingsForOrderItems: 3 bookings, 2 variants → 2 groups
4. groupBookingsForOrderItems: empty input → empty output
5. computeOrderTotals: single group qty 5 × 10 → subtotal 50, shipping 0, total 50
6. computeOrderTotals: multiple groups → sums correctly
7. buildConversionIdempotencyKey: deterministic for same inputs
8. buildConversionIdempotencyKey: different bookingIds → different hash
9. buildConversionIdempotencyKey: sort order doesn't matter (sorted internally)
10. selectConfirmedBookings: filters by shop+session+customer+CONFIRMED
11. selectConfirmedBookings: respects optional bookingIds whitelist
12. validateBookingsConvertible: empty → NO_BOOKINGS_TO_CONVERT
13. validateBookingsConvertible: any non-CONFIRMED → BOOKING_INVALID_STATUS

### E2E tests (extend `verify-booking-flow.ts`)

Current 9 tests pass. Add 5+ new tests:

- T10. **Conversion success**: 2 confirmed bookings (same variant, same price, qty 1+2) → 1 Order with 1 OrderItem qty 3, totals correct, BookingHistory rows for both transitions, both Booking.convertedOrderId set
- T11. **Conversion success — different prices**: 2 confirmed bookings same variant but priceOverride differs → Order has 2 OrderItems
- T12. **Conversion idempotency**: convert call → second call with same booking set → returns same Order id, no duplicate insert, no extra BookingHistory rows
- T13. **No bookings → error**: convert with 0 confirmed bookings → throws NO_BOOKINGS_TO_CONVERT (or graceful "nothing to convert" response, decided in §17 error mapping)
- T14. **Partial failure rollback**: simulate concurrent — set one of two bookings to `CONVERTED_TO_ORDER` directly via SQL between fixture setup and convert call → expect convert to fail (one booking already converted) → expect NO Order created → expect OTHER booking still CONFIRMED → no stock change
- T15. **No double reservedQty decrement**: pre-conversion `reservedQty = N`, after conversion `reservedQty = N` (unchanged). After Order RESERVED→CONFIRMED, `reservedQty = 0` AND `quantity` decreased by N exactly. After Order * → CANCELLED instead, `reservedQty = 0`.
- T16. **CONVERTED_TO_ORDER cannot cancel** (already passing as Test 9; will continue passing)
- T17. **StockReservation row gains orderId, keeps bookingId**: assert dual-FK state after conversion

### Production smoke

After Commit 2H push + Vercel deploy:
- 6 baseline endpoints still 200 (existing)
- New `POST /api/sale/orders` (or whatever name §17 locks) returns 401 unauthenticated (auth gate live)
- Manual probe with real session: TBD per Boss — likely defer to Commit 2I UI for end-to-end verification

---

## 16. API / RBAC plan

### Route naming (B9 lock)

Conversion is a per-customer batch operation, not a per-booking action. Best-fit:

`POST /api/sale/orders`

- Body: `{ liveSessionId: string, customerId: string, bookingIds?: string[] }`
- `bookingIds` optional — Phase 1 route always omits; Phase 2 future UI passes selected IDs
- Returns: `{ orderId, orderNumber, status, idempotent, bookingCount, totalAmount }`

Alternative considered: `POST /api/sale/conversions` — less obvious in URL. `POST /api/sale/orders` matches REST conventions (creates Order resource).

### RBAC

- OWNER + MANAGER: write (can call this route)
- CHAT_SUPPORT: 403 (read-only on `/sale` per Commit 2F; mutation blocked at API layer per dissent §9)
- WAREHOUSE: 403

### Validation

```ts
// src/lib/validation/sale.schemas.ts (NEW in Commit 2H)
export const createOrderFromBookingsSchema = z.object({
  liveSessionId: z.string().min(1),
  customerId: z.string().min(1),
  bookingIds: z.array(z.string().min(1)).min(1).optional(),
});
```

### Error mapping

| Throw | HTTP | Code |
|---|---|---|
| `NotFoundError('LiveSession not found')` | 404 | `NOT_FOUND` |
| `NotFoundError('Customer not found')` | 404 | `NOT_FOUND` |
| `AppError('NO_BOOKINGS_TO_CONVERT', 422)` | 422 | new code |
| `ConflictError('One or more bookings already converted')` | 409 | `CONFLICT` |
| `ValidationError(zod issues)` | 400 | `VALIDATION_ERROR` |
| `ForbiddenError('Insufficient permissions')` | 403 | `FORBIDDEN` |
| Unique violation on idempotencyKey caught + returned as success | 200 | `success: true, idempotent: true` |
| Other error | 500 | `INTERNAL_ERROR` |

### Repository signature (Commit 2H)

```ts
// src/server/repositories/booking.repository.ts (extend, not replace)

export interface ConvertBookingsToOrderInput {
  readonly shopId: string;
  readonly liveSessionId: string;
  readonly customerId: string;
  readonly bookingIds?: readonly string[];  // optional whitelist; Phase 1 omits
  readonly changedById: string;             // admin user id
}

export interface ConvertBookingsToOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: 'RESERVED';
  readonly idempotent: boolean;
  readonly bookingCount: number;
  readonly bookingIds: readonly string[];
  readonly totalAmount: string;
}

export const bookingRepository = Object.freeze({
  // existing confirm, cancel ...
  async convertToOrder(input: ConvertBookingsToOrderInput): Promise<ConvertBookingsToOrderResult> {
    // implementation per §5 + §6 + §10
  },
});
```

### Channel value

`Order.channel` for conversion — NEW value or reuse?

| Existing values | Fit? |
|---|---|
| `FACEBOOK` | Acceptable (live-sales are FB-driven today) but conflates with FB Messenger orders later |
| `INSTAGRAM` | No |
| `LINE` | No |
| `TIKTOK` | No |
| `MANUAL` | Closest semantic — admin manually converted bookings |
| `STOREFRONT` | NO — clearly different |

Recommendation: **`MANUAL`** in Phase 1. Clean addition `LIVE` value would require enum migration — out of dissent scope. Future R2 to add `LIVE` enum value when admin reporting needs to distinguish.

---

## 17. Stop conditions before implementation

Commit 2H runtime is BLOCKED until:

1. ✅ This dissent is reviewed by Boss + ChatGPT
2. ✅ Locale strategy (§11) gets Boss decision: stacked-language fallback OK? Add `Customer.locale` later (R2 schema)?
3. ✅ Channel value (§17) gets Boss decision: `MANUAL` OK or wait for `LIVE` enum migration?
4. ✅ Customer address handling (B3, AU4) gets Boss decision: reject if missing OR ship Commit 2I UI form for shipping fields?
5. ✅ Stacked-language preview format gets Boss decision (3 stacked or admin-chosen single-locale fallback only)
6. ✅ Idempotency `P2002` catch implementation pattern reviewed (raw Prisma error vs typed-helper)
7. ✅ E2E test count + scope green-lit by ChatGPT (proposed +5 tests, +13 pure helpers)
8. ✅ Commit 2H allowed-files list locked: likely `booking-rules.ts`, `booking.repository.ts`, `booking-rules.test.ts`, `verify-booking-flow.ts`, NEW `sale.schemas.ts`, NEW `/api/sale/orders/route.ts`, optionally NEW `order-templates.ts`. No checkout/order/payment touched.
9. ✅ Boss-side Docker session ready for E2E re-run (per Path A2 protocol established in 2D-AUDIT)

If any of the above is unclear, STOP and ask.

---

## 18. R0 list (irreversible operations to avoid in implementation)

- ❌ Modify `checkoutRepository.checkout()` behavior
- ❌ Modify `orderRepository.transition()` state machine
- ❌ Add to `Order.VALID_TRANSITIONS`
- ❌ Decrement `quantity` outside Order CONFIRMED transition path
- ❌ Auto-send Messenger / WhatsApp / Telegram / Email to customer without admin preview
- ❌ Schema migration in Commit 2H (this dissent confirms zero schema needed)
- ❌ Touch storefront cart / checkout / payment-slip flows
- ❌ Modify `MessageDirection` enum
- ❌ Touch `Chat` / `ChatMessage` / `Conversation` / `ChannelIdentity` / `Message` tables
- ❌ Touch pak-ta-kra files

---

## 19. Future-proofing (informational)

Not built in Phase 1 but designed-around:

- **Customer.locale field** — `String? @default('zh')` — informs all customer-facing localization. R2 schema migration when needed.
- **OrderDraftMessage model** — for Phase 2 Messenger send queue. R2 schema.
- **MessageTemplate model** — for shop-editable per-locale templates. R2 schema.
- **OrderItem.metadata Json?** — for "which bookings produced this OrderItem" trace if shop owners ask. R2 schema.
- **`Order.channel` enum extension** — add `LIVE` value. R2 enum migration.
- **Customer chat translation helper** — Phase 4+; LLM provider TBD; admin-preview-required.

---

## 20. Confirmation

| Constraint | Status |
|---|---|
| Doc only | ✅ |
| No code | ✅ |
| No schema | ✅ |
| No migration | ✅ |
| No API | ✅ |
| No UI | ✅ |
| No platform integration | ✅ |
| No checkout / payment / order behavior change | ✅ |
| No legacy Chat / ChatMessage migration | ✅ |
| No pak-ta-kra changes | ✅ |
| No pre-existing untracked files committed | ✅ |

Awaiting Boss + ChatGPT review of this dissent. Commit 2H BLOCKED until questions in §17 answered.

---

## 21. Questions for Boss + ChatGPT (proactive consultation per Boss instruction)

Below questions are NOT blockers for accepting this dissent doc — they're things to lock BEFORE writing Commit 2H runtime.

### Q1. `StockReservation.expiresAt` after conversion (B4)
Booking-side row carries `NO_EXPIRY_SENTINEL` (year 2099). Storefront-side rows carry `now + 24h`. After conversion, the row gains `orderId` while keeping `expiresAt`. Two options:
- (a) **KEEP sentinel** — admin already manually-confirmed; no auto-release ever.
- (b) **RESET to `now + 24h`** — match storefront semantics; the cron `expireReservations()` would auto-release if customer never pays in 24h.

Recommended: **(a) keep sentinel**. Admins control booking-side reservations manually, including post-conversion. Auto-release would surprise admins who already committed to the customer.

### Q2. Customer-facing channel for order summary (§11, §12)
Phase 1 = no auto-send. But the order-summary template — should it be:
- (a) Returned in conversion API response payload (admin sees it immediately)
- (b) Fetched via separate `GET /api/sale/orders/:orderId/summary?locale=zh|en|th|stacked`
- (c) Both (a) returns default-locale; (b) lets admin re-fetch other locales)

Recommended: **(c)**. Single click for fast path; route for re-fetch.

### Q3. `Order.channel` value (§16)
Conversion's Order.channel set to:
- (a) **`MANUAL`** (no enum migration needed)
- (b) Wait, do separate enum migration to add `LIVE` value, then use `LIVE`
- (c) Use `FACEBOOK` (matches today's reality: bookings come from FB Live polling)

Recommended: **(a) `MANUAL`** for Phase 1. Cleanest no-migration path. Admin reports can filter by `MANUAL` channel + LiveSession FK to identify live-sale orders.

### Q4. Address collection at conversion time (B3, AU4)
Customer model has address fields but Phase 1 booking flow doesn't collect them. At conversion:
- (a) **Reject if Customer.address is null** → admin must call CRM-style "edit customer" first → re-try conversion
- (b) Accept conversion + leave `Order.shipping.address` empty → admin fills at SHIPPED transition
- (c) Conversion API requires address fields in body if Customer doesn't have one

Recommended: **(b)** Phase 1 — Order can be created without address, admin fills later. Existing storefront orders also create with `shippingFee: 0` and address comes from Customer record. Reject only if address is needed to compute shippingFee (Phase 1 = always 0).

### Q5. Stacked-language summary format (§11)
For "I don't know customer's locale" case:
- (a) Stacked vertically (`zh\n---\nen\n---\nth`)
- (b) zh only (since it's the default per Boss)
- (c) Admin chooses at fetch time via `?locale=` query parameter

Recommended: **(c) admin chooses**. `/api/sale/orders/:orderId/summary?locale=zh` is default; admin can switch to `?locale=en|th|stacked` based on customer history.

### Q6. Email send from conversion (Q7 already says no, but clarification)
Boss said "do NOT auto-send customer-facing messages". Storefront checkout sends email today (best-effort). For PARITY:
- (a) Conversion sends email IF `Customer.email` exists (matches storefront; "best-effort customer notification")
- (b) Conversion NEVER sends email — strict no-auto-send
- (c) Conversion offers email send as part of admin preview UI (Phase 2+)

Recommended: **(b) strict no-send in Phase 1**. Live-sale customers usually communicate via FB Messenger / WhatsApp; they didn't necessarily provide email. Auto-emailing might be unwelcome. Admin can manually send via separate `POST /api/sale/orders/:orderId/send-email` route in Phase 2+.

### Q7. Idempotency key composition variant (§10)
Current proposal: `sale-conv:{shopId}:{liveSessionId}:{customerId}:{bookingsHash}`. Alternative:
- (a) **Include `bookingsHash`** (current proposal) — different booking sets get different keys
- (b) Drop bookingsHash — only one conversion per `(shop, session, customer)` ever; fail subsequent attempts
- (c) Add a counter (e.g. `:1`, `:2`) per `(shop, session, customer)` so Nth conversion gets a clean key

Recommended: **(a) current proposal**. Boss's reasoning was correct: customer might book more later in the same session. Hash is the cleanest natural-key.

### Q8. CHAT_SUPPORT visibility on conversion side effects
CHAT_SUPPORT can READ `/sale` per Commit 2F. They see booking confirm/cancel state. Should they see:
- (a) Conversion button disabled (visible) so they understand the workflow
- (b) Conversion button hidden entirely

Recommended: **(a) disabled visible**. UX clarity > UI hiding.

### Q9. Channel of communication for sending order summary later
Phase 2+ Messenger send. But specific design:
- (a) Use existing `Chat`/`ChatMessage` table to log the OUTBOUND admin message (legacy)
- (b) Use new `Conversation`/`Message` table (per dissent §10)
- (c) Both — write to legacy AND new for transition period

Recommended: **(b) new only**. New code targets new tables per Boss decision. Legacy stays read-only for old data.

### Q10. Test coverage threshold for Commit 2H
Current proposal: ~13 new pure-fn tests + 5 new E2E tests = ~18 new. Boss directive earlier was 80%+ coverage. Should we:
- (a) Ship as proposed (~18 new tests covering all happy + edge paths in §15)
- (b) Add coverage report tooling to verify ≥80%
- (c) Defer coverage tooling to separate prep commit; ship with proposed test list

Recommended: **(c)**. Coverage tooling (vitest --coverage) needs CI integration we don't have yet. Test count is honest; coverage reporting can come later.

---

## 22. Recommended next steps

1. Boss + ChatGPT review of this dissent doc
2. Boss locks answers to Q1-Q10 above
3. **Commit 2H** — runtime implementation per locked answers
4. **Commit 2I** — `/sale/[sessionId]` UI button "Create order from N confirmed bookings"
5. **Commit 2J** — order summary template + `/api/sale/orders/:orderId/summary` route (zh/en/th)

After Phase 1C (Commits 2H+2I+2J) ships and stabilizes:
- Phase 1 done. Move to Phase 2 (Manual Inbox Core) OR Tech Debt (storefront race fix, socket test errors, pre-existing untracked files cleanup)

End of Commit 2G dissent. Awaiting review.
