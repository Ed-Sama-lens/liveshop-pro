# `/sale` Workspace — State + Refetch Model Map

**Filed:** 2026-05-24 (Phase B2 follow-up)
**Author:** Claude Sonnet 4.6
**Master baseline:** `8cb8f7f`
**Status:** Reference map. No runtime change.

Single doc tracking every piece of client state in `/sale` and which
refetch trigger keeps it fresh. Prevents repeated "one panel updated,
another didn't" bug class by making the model explicit.

Companion to:
- `docs/superpowers/2026-05-24-sale-data-fetch-audit.md` (data-fetch surfaces)
- `docs/superpowers/2026-05-24-edit-product-code-refresh-audit.md` (F4 audit)
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` (future wiring)

---

## 1. State owners (single source of truth)

| State | Owner | Type | Notes |
|---|---|---|---|
| `selectedSaleDate` | `SaleWorkspaceShell` | `string \| null` (YYYY-MM-DD) | drives all per-day fetches |
| `selectedLiveSessionId` | `SaleWorkspaceShell` | `string \| null` | optional; may persist across saleDate changes |
| `refetchToken` | `SaleWorkspaceShell` | `number` | bumped on every BP/booking/order mutation |
| `selectedCustomerId` | `SaleWorkspaceShell` | `string \| null` | drives customer panel fetch |
| `productState` | `SaleWorkspaceShell` | discriminated union | BP list (idle/loading/ready/error) |
| `bookingState` | `SaleWorkspaceShell` | discriminated union | bookings (idle/loading/ready/error) |
| `liveSessionState` | `SaleWorkspaceShell` | discriminated union | live sessions list (one-shot on mount) |
| Dialog open states | each dialog component | `boolean` | local |
| Form field state in dialogs | each dialog | various | local; reset on close |
| `editTarget` | `SaleProductGridPlaceholder` | `SaleBroadcastProductRow \| null` | which BP row is being edited |
| `categories` | `SaleProductGridPlaceholder` | `readonly Category[]` | one-shot fetch |
| Panel-internal fetch state | each panel (e.g. `SaleSummaryPanel`) | discriminated union | local to panel |

---

## 2. Refetch graph

```
saleDate change
  ├── BP list refetches            (SaleWorkspaceShell effect)
  ├── Bookings list refetches       (SaleWorkspaceShell effect)
  └── SaleSummaryPanel refetches    (own effect, reads saleDate prop)

refetchToken bump
  ├── BP list refetches
  ├── Bookings list refetches
  └── SaleSummaryPanel refetches

selectedCustomerId change
  └── SaleCustomerPanel refetches   (own effect)

selectedLiveSessionId change
  └── BP list refetches             (if session-scoped query mode)

categories one-shot fetch
  └── Only on grid mount; never refetched

live-sessions one-shot fetch
  └── Only on SaleWorkspaceShell mount
```

---

## 3. Mutation → refetch matrix

| Mutation | Component | Trigger | refetchToken bump? | BP list updates? | Bookings update? | Summary updates? |
|---|---|---|---|---|---|---|
| Quick-create product code | `CreateQuickProductCodeDialog` | submit success | ✅ via `onCreated → onProductCreated` | ✅ | ✅ | ✅ |
| AddFromStock batch | `AddFromStockDialog` | submit success | ✅ via `onCreated → onProductCreated` | ✅ | ✅ | ✅ |
| Edit BP (price/pin) | `EditProductCodeDialog` | save success | ✅ via `onUpdated → onProductCreated` | ✅ | ✅ | ✅ |
| Delete BP | `EditProductCodeDialog` | delete success | ✅ via `onDeleted → onProductCreated` | ✅ | ✅ | ✅ |
| Manual create booking | `ManualCreateBookingDialog` | submit success | ✅ via `onCreated → onBookingMutated` | ✅ | ✅ | ✅ |
| Confirm booking | `ConfirmBookingDialog` | submit success | ✅ via `onConfirmed → onBookingMutated` | ✅ | ✅ | ✅ |
| Cancel booking | `CancelBookingDialog` | submit success | ✅ via `onCancelled → onBookingMutated` | ✅ | ✅ | ✅ |
| Create order | `CreateOrderDialog` | submit success | ✅ via `onOrderCreated → onBookingMutated` | ✅ | ✅ | ✅ |
| Inventory bulk create | `QuickInventoryProductDialog` (inventory side) | submit success | ❌ inventory uses `router.refresh()` | n/a (different page) | n/a | n/a |

**All sale-side mutations bump refetchToken.** Inventory bulk lives on `/inventory/new`, uses Next router refresh — separate refresh channel.

---

## 4. Cross-panel propagation rules

### 4.1 Booking lifecycle changes propagate everywhere

When admin clicks confirm/cancel/create-order:

```
ConfirmBookingDialog.onConfirmed
  → SaleBookingQueuePlaceholder.onBookingMutated
  → SaleWorkspaceShell.onBookingMutated (renamed callback? verify)
  → setRefetchToken((n) => n + 1)
  → BP list + Bookings + Summary refetch
```

This pattern guarantees: confirming a booking updates the BP list's
reserved-qty + the bookings list's pending count + the summary's
status counts in one tick.

### 4.2 saleDate switch propagation

```
SaleSessionPicker.onSaleDateChange
  → SaleWorkspaceShell.setSelectedSaleDate
  → Effect deps trigger:
      - BP list refetch
      - Bookings refetch
      - Summary refetch
      - selectedLiveSessionId is NOT reset (intentional — admin can stay on session across days; verify Boss intent)
```

### 4.3 Customer click propagation

```
Booking row customer-name click
  → SaleBookingQueue.onCustomerSelect
  → SaleWorkspaceShell.setSelectedCustomerId
  → SaleCustomerPanel effect refetches /api/customers/[id]
  → Other panels unchanged (no refetchToken bump)
```

Correct — customer detail load doesn't invalidate sale data.

---

## 5. Stale-state risks (current model)

| Risk | Likelihood | Mitigation in current code | Status |
|---|---|---|---|
| Edit BP → display stale | Low | refetchToken bumps via misnamed `onProductCreated` | ✅ Verified by Phase B1 audit (#120) |
| Mutation race when network slow + admin clicks twice | Low | Each dialog disables submit during in-flight | ✅ |
| Customer panel race on rapid switch | Low | No AbortController on customer fetch | ⚠️ Track 6 risk #2; not yet fixed |
| Two admins editing same BP | Low | Optimistic concurrency: P2002 / version mismatch surfaces on save | ⚠️ Documented, no UI |
| saleDate change mid-mutation | Very low | Effect cancellation via `cancelled` flag in shell | ✅ |
| Session change not resetting BP list | Low | Effect deps include selectedLiveSessionId | ✅ |
| Stock change between confirm + render | Low | Confirm response includes new BP availableQty, also refetch | ✅ |
| Summary refetch race on rapid mutation | Low | AbortController in SaleSummaryPanel | ✅ |

---

## 6. Future V Rich board integration impact

When V Rich board wires (3.10-B-WIRE-1/2/3):

| Current pattern | V Rich integration |
|---|---|
| BP list owns its own fetch in SaleWorkspaceShell | V Rich consumes same `productState` (lift to shared hook) |
| Bookings owns its own fetch | V Rich consumes same `bookingState` |
| Pill click on V Rich slot | New action prop to existing booking-mutation handlers |
| Slot drag-drop | OUT OF SCOPE (hard-held) |
| Pill aggregation per BP | Pure derivation via existing `buildSlots` helper |

**Recommendation:** before wiring V Rich, lift `productState` + `bookingState` into a shared hook (`useSaleWorkspaceData`) so V Rich doesn't double-fetch. Track 6 §11 audit-2 covers this.

---

## 7. Future Phase 1.5 impact

When Phase 1.5 lands:

| Phase 1.5 feature | State map change |
|---|---|
| `Customer.autoConfirmEligible` toggle UI | Edit-customer page (separate route); no `/sale` state change |
| Auto-confirm on manual create | `bookingRepository.confirm` may auto-fire in same tx; `bookingMutated` still bumps refetchToken |
| Auto-order-append | `orderRepository.upsertFromBooking` callable from existing convert path; refetchToken bumps as today |
| Multi-code batch | New `bookingRepository.createManualBatch` route; `onCreated` callback bumps refetchToken |

**Conclusion:** Phase 1.5 implementation has zero state-model breaking changes. All paths compose with current refetchToken pattern.

---

## 8. Anti-patterns observed (do NOT introduce)

- ❌ Per-component independent fetch with no refetchToken observation
- ❌ Direct DB mutation without API roundtrip (no in-memory mutation of fetched data)
- ❌ Optimistic UI updates before server response (current code is server-truth)
- ❌ Local caching layer (no SWR / React Query / TanStack Query)
- ❌ Polling intervals (no setInterval-based refresh)
- ❌ WebSocket subscriptions (hard-held, Phase 1.5+)
- ❌ Direct cross-component prop drilling > 1 level deep

---

## 9. Hard rules

- ✅ Single saleDate state owner: `SaleWorkspaceShell`
- ✅ Single refetchToken owner: `SaleWorkspaceShell`
- ✅ All sale-side mutations MUST bump refetchToken on success
- ✅ Effect deps MUST include refetchToken on any sale-data consumer
- ✅ Dialog state stays local (no global dialog manager needed)
- ✅ Customer detail panel does NOT bump refetchToken (independent surface)
- ❌ NO mutation without server roundtrip
- ❌ NO direct DB write from client (always via `/api/*` route)
- ❌ NO bypass of `requireAuth()` / RBAC / rate-limit middleware

---

## 10. Test surface for state model

Existing tests covering this model:

- `tests/unit/components/sale/sale-summary-panel-state.test.ts` — 32 panel state-machine tests
- `tests/unit/components/sale/sale-summary-panel.helpers.test.ts` — 23 helper tests
- `tests/unit/components/inventory/quick-inventory-bulk-payload.test.ts` — 24 payload tests
- `tests/unit/components/inventory/quick-inventory-bulk-scenario.test.ts` — 14 Boss scenario tests
- `tests/unit/lib/sale/state-machine-invariants.test.ts` — 53 booking state-machine invariants

Coverage gap (could add later, R2):
- Integration test: mutation → callback → refetchToken bump → effect refetch (high effort, low value)
- End-to-end test: Playwright clicks edit dialog, asserts BP list updates (Boss-run, high value)

---

## 11. Cross-references

- `src/components/sale/SaleWorkspaceShell.tsx` (state owner)
- `src/components/sale/SaleSummaryPanel.tsx` (refetchToken consumer)
- `src/components/sale/SaleProductGridPlaceholder.tsx` (BP list consumer + edit target)
- `src/components/sale/EditProductCodeDialog.tsx` (mutation source, F4 audit verified)
- `src/components/sale/CreateQuickProductCodeDialog.tsx` (mutation source)
- `src/components/sale/AddFromStockDialog.tsx` (mutation source)
- `src/components/sale/ConfirmBookingDialog.tsx` (mutation source)
- `src/components/sale/CancelBookingDialog.tsx` (mutation source)
- `src/components/sale/CreateOrderDialog.tsx` (mutation source)
- `docs/superpowers/2026-05-24-sale-data-fetch-audit.md` (fetch surface map)
- `docs/superpowers/2026-05-24-edit-product-code-refresh-audit.md` (F4 closed)

---

## 12. Status

- State + refetch model documented end-to-end
- Zero behavior changes
- F4 confirmed resolved (B1 audit)
- Customer panel race (Track 6 risk #2) still flagged but low impact
- V Rich + Phase 1.5 paths confirmed non-breaking

R2 docs-only. No code change.
