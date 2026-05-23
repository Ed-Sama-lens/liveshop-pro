# Sale Summary + V Rich Board Integration Plan

**Filed:** 2026-05-23 (Block 2 Track T6)
**Author:** Claude Sonnet 4.6 (autonomous block)
**Master baseline:** `d870931`
**Status:** Integration plan. No runtime in this PR.

Maps the relationships between three independent surfaces so the
implementation PRs don't drift:

- **Sale Summary API** (PR #70 + #77) + UI panel (PR #85)
- **V Rich Board** (PR #63 design + #72/#79/#88 component foundation)
- **Future Facebook stream** (PR #57/#64/#65/#74/#82 design)

---

## 1. Three surfaces, one store

All three lenses read from the same Postgres tables. None duplicates
storage. None mutates without going through the existing booking /
order repositories.

| Surface | Lens | Read scope | Write scope |
|---|---|---|---|
| Sale Summary panel/route | aggregate | `BroadcastProduct + Booking + StockReservation + OrderItem` for `(shopId, saleDate)` | none |
| V Rich Board | live state | same as summary + `Booking` rows for active slots | manual-fill / cancel (Tier 3.10-D) |
| Facebook stream | inbox | `Conversation + Message + ChannelIdentity` | none (Tier 4.1) → drag→booking (Tier 3.10-E) |

---

## 2. Numbers admin sees, where they come from

For a selected `saleDate`, the admin sees these numbers across the
three surfaces. This table locks consistency.

| Number | Summary panel field | V Rich board surface | Source query |
|---|---|---|---|
| Total bookings | `totals.totalBookings` | sum across pill drawers | `Booking groupBy status WHERE BP.saleDate = X` |
| Pending bookings | per-status fold | yellow slot rows in expanded drawer | `Booking WHERE status = PENDING_REVIEW` |
| Confirmed bookings | per-status fold | green slot rows | `Booking WHERE status = CONFIRMED` |
| Cancelled bookings | per-status fold | history disclosure (PR #52) | `Booking WHERE status = CANCELLED` |
| Converted bookings | per-status fold | hidden from active slot list (PR #72) | `Booking WHERE status = CONVERTED_TO_ORDER` |
| Distinct orders | `totals.totalOrders` | — (not surfaced on board) | distinct `convertedOrderId` across BPs |
| Order touches | `totals.totalOrderTouches` | — | sum of per-BP orderCount |
| Total qty ordered | `totals.totalOrderedQuantity` | — | sum of `OrderItem.quantity` |
| Gross RM | `totals.totalGross` | — | `sumMoney2(OrderItem.totalPrice)` |
| Stock total | items[].stock.totalQuantity | pill total in `(7/13)` | `Variant.quantity` |
| Stock available | items[].stock.availableQty | pill available in `(7/13)` | `quantity - reservedQty` |
| Stock reserved | items[].stock.reservedQty | implied by available | sum `StockReservation.quantity WHERE releasedAt IS NULL` |
| Low stock count | derived in panel | low-stock color state on pill | `availableQty <= lowStockAt` |
| Out of stock count | derived in panel | out-of-stock color state on pill | `availableQty <= 0` |

---

## 3. Selected saleDate drives all three

`SaleWorkspaceShell` owns `selectedSaleDate`. Every surface refetches
when it changes:

- **Summary panel** (PR #85): refetches via `useEffect([saleDate, refetchToken])`
- **V Rich board** (PR #88 skeleton; future wiring): same pattern
- **Inbox panel** (future Tier 4.1-E): same pattern, filters Conversation by `Booking.broadcastProduct.saleDate = X`

No surface caches across saleDate switches; each refetches fresh.

---

## 4. Booking creation paths (current + future)

### 4.1 Manual Create (existing — Tier 2N)

```
ManualCreateBookingDialog
  → POST /api/sale/bookings { broadcastProductId, customerId, qty, ... }
  → bookingRepository.createManual
  → Booking { source: 'MANUAL', conversationId: null, sourceMessageId: null }
  → bumps refetchToken in SaleWorkspaceShell
  → all three surfaces refetch
```

### 4.2 V Rich slot click (Tier 3.10-D, future)

```
Click empty slot in expanded drawer
  → opens ManualCreateBookingDialog with broadcastProductId prefilled
  → same Booking row creation as 4.1
  → refetch surfaces
```

### 4.3 Drag from inbox to slot (Tier 3.10-E, future)

```
Drag Message from inbox → drop on empty slot
  → POST /api/sale/bookings {
      broadcastProductId,
      customerId (must be linked to ChannelIdentity first),
      channelIdentityId,
      conversationId,
      sourceMessageId,
      source: 'PAGE_INBOX' | 'LIVE_COMMENT' | 'POST_COMMENT',
      quantity: 1,
    }
  → bookingRepository.createManual (same fn; source set by caller)
  → refetch all surfaces
```

---

## 5. Cancellation path (current + V Rich)

### 5.1 Existing (PR #52)

`CancelBookingDialog` → `POST /api/sale/bookings/[id]/cancel` →
`bookingRepository.cancel` → terminal status → hidden from active list
+ shown in history disclosure.

### 5.2 V Rich slot X click (Tier 3.10-D, future)

Slot row X button → confirms via dialog or inline → calls same
cancel endpoint. Same refetch cascade. Slot becomes empty in drawer;
booking appears in history disclosure (PR #52 partition).

---

## 6. Order conversion (existing — Tier 2I)

`CreateOrderDialog` selects confirmed bookings → `POST /api/sale/orders/from-bookings` →
`bookingRepository.convertToOrder` → Booking.status = CONVERTED_TO_ORDER + Order.id linked.

### Effect on three surfaces:

- **Summary panel**: convertedToOrder count +N; orderCount +1 (distinct); orderedQuantity += sum; gross += sum
- **V Rich board**: converted booking removed from active slot list (buildSlots filter); slot becomes empty again
- **Inbox** (future): no change (conversation-level state)

---

## 7. Future Facebook parser flow (Tier 4.6+, deep future)

Speculative, NOT in current scope. Documented to lock the integration
boundary.

```
Inbound FB Page comment with "+1 CM1"
  → Parser extracts (productCode, quantity)
  → Resolves productCode → BroadcastProduct on current saleDate
  → If Customer linked: auto-suggest booking creation (admin clicks Confirm)
  → If not linked: prompts admin to link first
  → Booking created with source: 'POST_COMMENT'
  → All surfaces refetch
```

Hard rule: parser NEVER auto-creates without admin click in this
design. Auto-create is a separate Tier 4.7+ decision.

---

## 8. State propagation contract

`SaleWorkspaceShell` owns:
- `selectedSaleDate: string`
- `refetchToken: number`
- `selectedCustomerId: string | null`
- `selectedDisplayCode: string | null` (NEW for V Rich drawer; today implicit)

When any of these changes, downstream panels refetch. Single source of
truth lives in the shell.

After Tier 3.10-B/C lands, `selectedDisplayCode` controls V Rich
drawer expand state. Other surfaces don't read it.

---

## 9. Refetch chain

```
Mutation success
  → onMutationSuccess()
  → setRefetchToken(n => n + 1)
  → Summary panel useEffect refetches /api/sale/summary
  → Product grid useEffect refetches /api/sale/broadcast-products
  → Booking queue useEffect refetches /api/sale/bookings
  → V Rich board useEffect refetches (whichever endpoint it consumes)
  → Inbox panel (future) refetches /api/sale/inbox
```

All five fetches in parallel. No coordination needed; each surface is
self-contained.

---

## 10. Performance budget

| Surface | Query count per refetch | Max rows per query |
|---|---|---|
| Summary (single-day) | 4 fan-out queries | 100 BPs × 100 bookings × 50 orders ≈ 5k rows |
| Summary (range, 31-day) | 4 × 31 = 124 queries | same per day |
| Product grid | 1 query (existing) | 200 BPs |
| Booking queue | 1 query (existing) | 100 bookings per session |
| V Rich board | 1 query (reuses product grid + booking queue data) | same |
| Inbox (future) | 1 query | TBD |

Total worst-case for single-day refetch: ~7 prisma calls. Bounded;
admin-only. No streaming needed.

---

## 11. Compatibility checklist

When a new feature lands, verify:

- [ ] Summary panel still shows correct totals after the mutation
- [ ] V Rich board pill color updates after stock change
- [ ] Slot drawer reflects booking transition (PENDING → CONFIRMED → CONVERTED_TO_ORDER)
- [ ] History disclosure picks up cancelled bookings
- [ ] Order detail shows the line that came from this booking
- [ ] No double-fetch / over-fetch
- [ ] No PII leak to summary
- [ ] Cross-shop isolated everywhere

---

## 12. Hard no-go

- ❌ No surface mutates without going through existing booking/order repos
- ❌ No surface caches stale data across saleDate switches
- ❌ No PII duplicated across surfaces
- ❌ No cross-shop leak
- ❌ No outbound from any surface (Tier 4.5)
- ❌ No parser auto-create (Tier 4.7+)
- ❌ pak-ta-kra untouched

---

## 13. Cross-references

- PR #70 / #77 — summary API
- PR #85 — summary panel
- PR #63 — V Rich audit
- PR #72 + #79 + #88 — V Rich helpers + components
- PR #54 + #81 — Phase 1.5
- PR #57 / #64 / #65 / #74 / #82 — Facebook / Oho
- PR #56 — route security
- `src/components/sale/SaleWorkspaceShell.tsx` — shell state

---

## 14. Decision

This doc lands as `docs(sale): summary+board integration plan`. Zero
runtime. Existing PRs already follow the contract; future PRs reference
this when adding a new surface.
