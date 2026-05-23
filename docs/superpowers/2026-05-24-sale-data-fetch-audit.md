# `/sale` Workspace — Data-Fetch + Performance Audit

**Filed:** 2026-05-24 (autonomous Track 6)
**Author:** Claude Sonnet 4.6
**Master baseline:** `b0774a5` (post #107)
**Status:** Audit only. NO runtime change.

Audits the current state of data fetching across the `/sale`
workspace before wiring more UI (V Rich board, Phase 1.5, FB inbox).
Identifies risks and recommended refactors. Not all risks need
immediate fixes — the "do not fix now" list is explicit.

---

## 1. Components that fetch (current state)

11 client components in `src/components/sale/` issue `fetch(...)` calls. Mapped here:

| Component | Endpoint | Method | Trigger | Cancellation |
|---|---|---|---|---|
| `SaleWorkspaceShell` | `/api/sale/live-sessions` | GET | mount | none |
| `SaleWorkspaceShell` | `/api/sale/broadcast-products?scope=all&saleDate=...` | GET | saleDate change | `cancelled` flag |
| `SaleWorkspaceShell` | `/api/sale/bookings?saleDate=...&limit=100` | GET | saleDate change + refetchToken | `cancelled` flag |
| `SaleSummaryPanel` | `/api/sale/summary?saleDate=...` | GET | saleDate change + refetchToken | `AbortController` |
| `SaleCustomerPanelPlaceholder` | `/api/customers/[id]` | GET | selectedCustomerId change | none |
| `SaleProductGridPlaceholder` | `/api/categories` | GET | mount | none |
| `CreateQuickProductCodeDialog` | `/api/sale/quick-product-codes` | POST | submit | none |
| `AddFromStockDialog` | `/api/sale/broadcast-products/batch` | POST | submit | none |
| `ManualCreateBookingDialog` | `/api/sale/bookings` | POST | submit | none |
| `CreateOrderDialog` | `/api/sale/orders/from-bookings` | POST | submit | none |
| `ConfirmBookingDialog` | `/api/sale/bookings` (confirm body) | POST | submit | none |
| `CancelBookingDialog` | `/api/sale/bookings` (cancel body) | POST | submit | none |
| `EditProductCodeDialog` | `/api/sale/broadcast-products/[id]` | PATCH | submit | none |

Plus inventory-side: `QuickInventoryProductDialog` fetches `/api/products` (single) or `/api/inventory/quick-product-bulk` (bulk).

---

## 2. saleDate propagation

`selectedSaleDate` lives in `SaleWorkspaceShell`. Flows downstream via props:

```
SaleWorkspaceShell (state: selectedSaleDate)
  ├── SaleSessionPickerPlaceholder   (read)
  ├── SaleProductGridPlaceholder     (read + AddFromStock + Edit)
  ├── SaleBookingQueuePlaceholder    (read + Confirm + Cancel + CreateOrder)
  ├── SaleCustomerPanelPlaceholder   (read)
  └── SaleSummaryPanel               (read)
```

On saleDate change:
- BP list refetches (`SaleWorkspaceShell` effect)
- Bookings list refetches (same effect)
- Summary panel refetches (own effect)
- Customer panel re-runs ONLY if selectedCustomerId also changed (separate concern)

**OK pattern.** Single source of truth for date. No prop drilling depth > 1.

---

## 3. Refetch token mechanism

`SaleWorkspaceShell` exposes a `refetchToken: number` state, incremented after each mutation success. Components observe it via prop:

```ts
// In each consumer:
useEffect(() => {
  // re-fetch on saleDate change OR refetchToken bump
}, [saleDate, refetchToken, ...]);
```

Components observing:
- `SaleSummaryPanel` ✅
- BP list inside `SaleWorkspaceShell` (same effect) ✅
- Bookings list inside `SaleWorkspaceShell` (same effect) ✅

Components NOT observing (likely OK):
- `SaleCustomerPanelPlaceholder` — customer data doesn't change on sale mutations
- `SaleProductGridPlaceholder.categories` — categories rarely change

**OK pattern.** Mutation → bump → consumers refetch.

---

## 4. Cancellation patterns

| Component | Pattern | Robust? |
|---|---|---|
| `SaleSummaryPanel` | `AbortController` + `signal.aborted` checks | ✅ best |
| `SaleWorkspaceShell` (BP + bookings) | `cancelled` local flag closure | ⚠️ fetch still runs; just discards response |
| `SaleCustomerPanelPlaceholder` | none | ⚠️ stale response can race |
| Mutation dialogs | none | ✅ user-initiated, no race expected |

**Risk:** `SaleCustomerPanelPlaceholder` has no cancellation. If admin clicks customer A then quickly customer B, response A may arrive after B and overwrite display. Low likelihood (admin clicks slowly) but real.

**Recommendation:** Adopt `AbortController` pattern for all GET fetches (low effort, high consistency). Defer to future refactor.

---

## 5. Duplicate fetches

| Scenario | Risk |
|---|---|
| saleDate change → BP + bookings + summary all refetch | ✅ intentional — separate datasets |
| refetchToken bump after mutation → BP + bookings + summary all refetch | ✅ intentional |
| Mounting → SaleWorkspaceShell fetches `/api/sale/live-sessions` once | ✅ |
| Multiple dialogs open in parallel → each issues own POST | ✅ admin shouldn't but safe |

No duplicate-fetch storms observed in current architecture.

**Future risk:** when V Rich board wires, it needs the same BP + bookings + reservations data already loaded by `SaleWorkspaceShell`. Naive wire would double-fetch. **Recommendation:** lift data to a shared hook / context once V Rich wires (Tier 3.10-B-WIRE-2).

---

## 6. Stale state after mutation

| Mutation | Refetch trigger | Stale risk |
|---|---|---|
| Quick Create product code | refetchToken++ → BP list refetches | ✅ |
| AddFromStock batch | refetchToken++ → BP list refetches | ✅ |
| Confirm booking | refetchToken++ → bookings + summary refetch | ✅ |
| Cancel booking | refetchToken++ → bookings + summary refetch | ✅ |
| Create order | refetchToken++ → bookings + summary refetch | ✅ |
| Edit product code | refetchToken++ → BP list refetches | ⚠️ verify token is bumped (audit needed) |
| Inventory bulk (D2-B) | calls `router.refresh()` — different mechanism | ⚠️ separate from refetchToken, only refreshes inventory route |

**Audit gap:** confirm `EditProductCodeDialog` bumps `refetchToken` on save. If not, edited price/name will stay stale until next manual refresh.

---

## 7. Loading and error states

| Component | Loading state | Error state |
|---|---|---|
| `SaleSummaryPanel` | ✅ explicit skeleton | ✅ destructive banner |
| `SaleWorkspaceShell` BP list | ✅ kind: 'loading' | ✅ kind: 'error' |
| `SaleWorkspaceShell` bookings | ✅ kind: 'loading' | ✅ kind: 'error' |
| `SaleCustomerPanelPlaceholder` | ⚠️ minimal | ⚠️ minimal |
| Mutation dialogs | ✅ spinner | ✅ field errors + top-level |

**Recommendation:** Customer panel loading/error UX could improve. Low priority.

---

## 8. Potential caching / race conditions

### 8.1 Race: saleDate → selectedSessionId reset

When admin switches saleDate, `selectedLiveSessionId` should reset (a session belongs to one date). Need to verify `SaleWorkspaceShell` resets it. Inspection shows session selection persists across saleDate changes which may be intentional (multi-day session?) or a bug.

**Action:** flag for Boss UI smoke.

### 8.2 Race: customer search

`SaleCustomerPanelPlaceholder` fetches `/api/customers/[id]` without abort. If admin types quickly into customer search, multiple `[id]` fetches stack. Display reflects last-arriving response, not last-clicked.

**Recommendation:** AbortController pattern. Low priority unless admin reports flicker.

### 8.3 Cache: no in-memory cache layer

No SWR / React Query / TanStack Query in use. Every saleDate change → full network round-trip. Acceptable for current scale but will hurt UX once V Rich wires (frequent saleDate switches).

**Recommendation:** evaluate SWR or React Query when wiring V Rich. Hard-held for now (out of scope).

---

## 9. What should be centralized later

| Concern | Current | Future |
|---|---|---|
| saleDate state | `SaleWorkspaceShell` local state | OK as-is; consider URL sync (`?saleDate=`) later |
| refetchToken | `SaleWorkspaceShell` state + prop drill | Could become context, but depth 1 is fine now |
| BP + bookings data | each consumer fetches independently | Lift to shared hook when V Rich wires |
| AbortController | only summary panel uses | Apply to all GETs in a small refactor PR |
| Error handling | per-component | Could centralize toast bus; not urgent |
| Loading skeletons | per-component | Acceptable variation |

---

## 10. Risk list (prioritized)

| # | Risk | Severity | Likelihood | Recommended action |
|---|---|---|---|---|
| 1 | EditProductCodeDialog may not bump refetchToken — stale display | M | M | Audit + fix if confirmed bug |
| 2 | SaleCustomerPanelPlaceholder race on rapid customer switch | L | L | AbortController retrofit |
| 3 | Naive V Rich wire would double-fetch BP/bookings | M | H once V Rich wires | Lift to shared hook in Tier 3.10-B-WIRE-2 |
| 4 | No SWR/TanStack — frequent saleDate switches cost network | L | M | Evaluate at V Rich wire time |
| 5 | Session selection may not reset on saleDate change | L | L | Verify in Boss UI smoke |
| 6 | router.refresh() in inventory dialog ≠ refetchToken | L | L | Document separation; no fix |
| 7 | Mutation dialog without AbortController on form-state-driven fetch | L | L | Acceptable; user-initiated |

---

## 11. Recommended future refactor sequence

(NOT to be done now — Boss approval per PR required)

| PR | Title | Scope | Risk |
|---|---|---|---|
| audit-1 | `refactor(sale): adopt AbortController for all sale GET fetches` | swap `cancelled` flag → AbortController in 4 consumers | R1 |
| audit-2 | `refactor(sale): lift sale workspace data to useSaleWorkspaceData hook` | extract BP+bookings+reservations fetch into one hook | R1 |
| audit-3 | `feat(sale): URL-sync saleDate via query param` | `?saleDate=...` in URL bar, deep-linkable | R1 |
| audit-4 | `refactor(sale): adopt React Query or SWR for caching` | major library introduction | R1 — needs broad team buy-in |
| audit-5 | `fix(sale): verify EditProductCode bumps refetchToken` | confirm + fix bug if present | R0 if bug (production stale state) |

audit-5 is the only one with immediate value if the bug exists. Others are deferred.

---

## 12. Do NOT fix now

- ❌ Do NOT introduce SWR / React Query in this autonomous block (too broad, needs design)
- ❌ Do NOT refactor SaleWorkspaceShell into a state machine library
- ❌ Do NOT change refetchToken mechanism — works correctly
- ❌ Do NOT add caching layer to repository
- ❌ Do NOT add server-side push (websockets) for live updates — Phase 1.5+
- ❌ Do NOT migrate to React Server Components for sale workspace (UI is highly interactive)

---

## 13. Conclusion

Current `/sale` data-fetch architecture is sound for present scale:
- single source of truth (selectedSaleDate)
- mutation-triggered refetch (refetchToken)
- discriminated-union state (loading/error/ready)
- separation between sale and inventory refresh mechanisms

Risks are bounded and prioritized in §10. Highest-impact future improvement: lift shared data into a hook when V Rich wires (Track 5 readiness §2.2).

**No immediate refactor PR opened from this audit.** Recommendations are queued for Boss verdict when prioritization warrants.

---

## 14. Cross-references

- `src/components/sale/SaleWorkspaceShell.tsx` — orchestrator
- `src/components/sale/SaleSummaryPanel.tsx` — summary panel
- `src/components/sale/board/` — V Rich skeleton (not wired)
- `docs/superpowers/2026-05-24-v-rich-board-readiness.md` — Track 5 readiness
- `docs/superpowers/2026-05-24-sale-summary-range-contract.md` — Track 4 contract
- `docs/superpowers/2026-05-23-sale-api-reference.md` — sale API ref
