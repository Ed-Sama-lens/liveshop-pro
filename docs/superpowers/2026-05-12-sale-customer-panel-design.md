# Sale Customer Panel — live data design

**Status:** DISCOVERY ONLY for Phase 3. Phase 4 (read-only API) + Phase 5 (UI wiring) follow contingent on this design.
**Date:** 2026-05-12
**Author:** Claude Opus 4.7

Customer Panel in `/sale` workspace currently renders a hard-coded demo customer (Wang Lijuan, preferredLocale=zh, lifetimeValue 1,248.50). Goal: turn it into live data tied to the booking row admin selects.

## Discovery findings

### Existing customer surface

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/api/customers` | GET | requireAuth + shopId | List + pagination |
| `/api/customers` | POST | requireAuth + shopId | Create |
| `/api/customers/[id]` | GET | requireAuth + shopId | findById + order count |
| `/api/customers/[id]` | PATCH | OWNER/MANAGER | Update |
| `/api/customers/[id]` | DELETE | OWNER/MANAGER | Remove |
| `/api/customers/[id]/orders` | GET | requireAuth + shopId | Orders list |
| `/api/customers/[id]/ban` | POST | OWNER/MANAGER | Ban |
| `/api/customers/[id]/unban` | POST | OWNER/MANAGER | Unban |

### `customerRepository.findById(shopId, id)`

[src/server/repositories/customer.repository.ts:136](../../src/server/repositories/customer.repository.ts) — returns `CustomerRow | null` with:
- Full customer record (name, phone, email, address, district, province, postalCode, labels, shippingType, notes, isBanned, bannedReason, channel, lifetimeValue, createdAt, updatedAt).
- `_count.orders` aggregate.
- shopId scoped — cross-shop returns null.

### Customer + Booking + Order relations

- `Booking.customerId` → `Customer.id`. Each booking row carries `customer.name + customer.phone` already in the GET `/api/sale/bookings` response.
- `Customer.bookings` (reverse relation) — per-session count via `prisma.booking.count({where: {customerId, liveSessionId}, status: {in: ['PENDING_REVIEW','CONFIRMED']}})`.
- `Customer.orders` — `_count.orders` already in `findById` response.
- `Customer.conversations` + `Customer.channelIdentities` — exist in schema but Phase 1 inbox not wired.

### Customer Panel demo block

[SaleCustomerPanelPlaceholder.tsx](../../src/components/sale/SaleCustomerPanelPlaceholder.tsx) — pure presentational. Shows: name / phone / shippingType / preferredLocale / lifetimeValue / isBanned badge. No props for customer id. No fetch.

## Decision: reuse existing `GET /api/customers/[id]` for sale workspace

Reasons:
1. Route already shop-scoped + auth gated.
2. CHAT_SUPPORT can call it (only requireAuth + shopId check; no role gate on GET).
3. Response shape sufficient for Customer Panel MVP — name, phone, shippingType, lifetimeValue, isBanned, _count.orders all present.
4. Avoids namespace duplication (`/api/customers/[id]` vs `/api/sale/customers/[id]`).
5. Single source of truth.

**Tradeoffs:**
- Cross-cutting (admin /customers page + /sale page both consume it). Future changes to one consumer affect the other.
- `preferredLocale` field NOT in Customer schema today — gradient. Schema does not have it. Demo data invented this. Out of MVP.
- Address summary is admin-facing only; not exposed in any per-row response today. Adding it to /sale doesn't leak PII because the page is admin-only.

**Alternative path (rejected for Phase 4):** new `GET /api/sale/customers/[id]` thin wrapper.
- Pros: namespace cohesion; can shape response to /sale needs.
- Cons: doubles maintenance; near-zero added value over existing route. Defer until /sale needs diverge.

## Phase 4 plan — UI wiring only, NO new API

Since the existing route is sufficient, Phase 4 simplifies to:
- Update `SaleCustomerPanelPlaceholder` to accept a `customerId: string | null` prop + optional `customerHints?: {name?: string, phone?: string}` for instant display while fetching.
- Fetch from `GET /api/customers/[customerId]` on mount + on customerId change.
- Render real fields. Drop demo block.
- Show empty-state when `customerId === null` (no booking selected).

Selection state plumbing (Phase 5 — Boss spec):
- Booking Queue gains row-click handler → setSelectedCustomerId(row.customerId).
- Click does NOT interfere with checkbox selection (checkbox onClick already stops propagation via standard event handling).
- Customer Panel reads selectedCustomerId from parent.

State location:
- Option A: lift selectedCustomerId to `SaleWorkspaceShell` (parent of both panels). Pass down via props. Already passes `state` + `onMutationSuccess` to BookingQueue.
- Option B: keep `SaleBookingQueuePlaceholder` as owner, expose via callback prop `onCustomerSelected(customerId)`. Shell holds state + threads it to CustomerPanel.

Recommend Option B: state owner stays in BookingQueue (where the click happens). Shell holds the cross-panel context. Mirrors existing onMutationSuccess pattern.

## PII safeguards

| Field | Show in Customer Panel? | Notes |
|---|---|---|
| name | yes | already shown in booking row |
| phone | yes | admin already sees in storefront/admin contexts |
| email | yes if not null | admin-only page |
| address | NOT in Phase 4 MVP | requires separate UX decision; defer |
| district / province / postalCode | NOT in MVP | same |
| labels | not in MVP | admin /customers page handles |
| notes | NOT in MVP | sensitive; admin /customers page only |
| isBanned + bannedReason | yes | direct relevance to Confirm action gating |
| lifetimeValue | yes | admin metric, no PII |
| _count.orders | yes | aggregate, no PII |
| channel | not in MVP | redundant with bookings list |
| createdAt | not in MVP | |

Cross-shop protection: `findById(shopId, id)` already enforces. Cross-shop GET returns null → 404.

## Response shape for Customer Panel MVP

Existing route response (no change):
```ts
{
  success: true,
  data: {
    id, shopId, facebookId, name, phone, email, address, district,
    province, postalCode, labels, shippingType, notes, isBanned,
    bannedReason, channel, lifetimeValue, createdAt, updatedAt,
    _count: { orders }
  }
}
```

Customer Panel MVP renders subset: name, phone, email, shippingType, lifetimeValue, isBanned + bannedReason badge, _count.orders.

Extras to add LATER (separate commit) if needed:
- Per-session booking count (separate small endpoint `GET /api/sale/customers/[id]/booking-stats?liveSessionId=...` OR client-side derive from existing booking queue response).
- Channel identities list.

## Test plan

### Phase 4 (UI only)
- `SaleCustomerPanelPlaceholder` test:
  - props `state: 'no-selection'` → empty-state message
  - props `state: 'loading'` → skeleton
  - props `state: 'error'` → error message
  - props `state: 'ready', customer: {...}` → render fields

No route tests needed (existing `/api/customers/[id]` GET test if any — discovery did not find one, but the path is older than the sale work; can add later).

### Phase 5 (UI wiring + click handler)
- Manual smoke step: click booking row → Customer Panel populates.
- Mutation grep stays at 3 POSTs (no new POST).
- No new client-side mutation.

## Stop conditions for Phase 4

- Existing `/api/customers/[id]` shape unexpectedly changes shop scoping.
- CHAT_SUPPORT cannot GET via existing route → STOP, design new sale-namespaced route with CHAT_SUPPORT allowed.
- Row click handler conflicts with checkbox click handler → STOP, design row-click event isolation.
- Customer Panel state grows beyond simple `{customerId, hints}` → STOP, surface state-model question.

## Recommendation

Proceed to Phase 4 directly, but make Phase 4 = **UI wiring** (no new API).

Phase 4 commit shape:
- MOD: `src/components/sale/SaleCustomerPanelPlaceholder.tsx` — accept props, fetch real data, render real fields.
- MOD: `src/components/sale/SaleBookingQueuePlaceholder.tsx` — row click handler → `onCustomerSelected` callback.
- MOD: `src/components/sale/SaleWorkspaceShell.tsx` — hold `selectedCustomerId` state, thread to both panels.
- MOD: `docs/superpowers/2026-05-11-sale-read-only-manual-smoke.md` — changelog row + Customer Panel section.
- MOD: `docs/sale-api-map.md` — note Customer Panel reuses `/api/customers/[id]`.

Phase 5 in Boss spec becomes redundant with Phase 4 in this revised plan. Combine into single commit.

## Refs

- Existing route: [src/app/api/customers/[id]/route.ts](../../src/app/api/customers/%5Bid%5D/route.ts)
- Repo: [src/server/repositories/customer.repository.ts](../../src/server/repositories/customer.repository.ts)
- Current panel: [src/components/sale/SaleCustomerPanelPlaceholder.tsx](../../src/components/sale/SaleCustomerPanelPlaceholder.tsx)
- Sale API map: [docs/sale-api-map.md](../sale-api-map.md)
- Manual smoke (living): [2026-05-11-sale-read-only-manual-smoke.md](2026-05-11-sale-read-only-manual-smoke.md)
