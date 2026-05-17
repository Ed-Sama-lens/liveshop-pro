# Order / Payment / Shipping readiness audit

**Filed:** 2026-05-17
**Status:** Docs-only. No runtime change. Boss decision input before real admin onboarding.

---

## 1. Why this audit

`/sale` workflow now reaches end of booking → order conversion. Before onboarding real admins / customers, we must understand:

- What is implemented vs placeholder vs missing in the order/payment/shipping chain?
- What can admins safely use today on Boss's own data?
- What would break under real customer load?

The app has matured rapidly: Tier 1 + Tier 1.5 + Tier 3 + Tier 3.5 + Tier 3.6 all shipped. But sale-to-fulfillment is only one half of e-commerce. This audit covers the back half.

## 2. Order lifecycle (current state)

### Order creation paths

1. **`POST /api/sale/orders/from-bookings`** (V1 + V2) — converts CONFIRMED bookings to a single Order. Ships RESERVED status. StockReservation transfers from booking to order. ✅ Verified via Docker verifier (`verify-booking-conversion.ts` 8/8).
2. **`POST /api/orders`** (legacy admin manual order creation) — direct Order creation outside booking flow.
3. **Storefront checkout** — `src/app/shop/[shopId]/checkout/...` paths. Not yet smoke-tested under real load.

### Order statuses

Per `prisma/schema.prisma` Order model: `PENDING`, `RESERVED`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED` (enum order may differ; verify before merge).

| Status | Trigger | Behavior |
|---|---|---|
| RESERVED | bookingIds-only conversion | StockReservation row created/transferred; orderId set; reservedQty increments |
| CONFIRMED | admin confirms payment slip | reservedQty stays; status flips |
| PROCESSING | warehouse picks order | Track via /shipping |
| SHIPPED | shipping label printed | Track via /shipping |
| DELIVERED | manual mark | terminal |
| CANCELLED | admin action | reservedQty decrements; reservation released |

### Gaps

- ❌ No automated state machine — admin transitions manually. No guard preventing skip (e.g. PENDING → DELIVERED).
- ❌ No order audit trail in UI (OrderAudit table exists; not surfaced in `/orders`).
- ❌ No customer-facing order tracking page (or not yet smoked under load).

## 3. Booking → Order handoff

### Healthy paths (verified)

- V1 conversion (liveSessionId + customerId + bookingIds) → 8/8 verifier PASS
- V2 conversion (bookingIds only) → 5/5 verifier PASS for the omnichannel path
- Replay idempotency (same bookingIds → same Order) → verified
- Multi-customer rejection (mixed bookings → 409) → verified
- Cross-shop variant rejection → verified

### Risks

- StockReservation transfer: bookingId preserved, orderId set. If a delete on Booking somehow runs (admin script), reservation linkage breaks — but no UI/API allows Booking delete today, so risk is low.
- Pricing snapshot: Booking captures `unitPrice` at create-time. Order inherits it via OrderItem. Subsequent `priceOverride` edit (Tier 3.5/3.6) does NOT affect existing Order rows. ✅ Correct behavior.

## 4. Payment slip upload + verify

### Current state

- `/payments` admin page exists.
- Payment model has `slipUrl`, `slipUploadedAt`, `status` fields.
- `POST /api/payments/[id]/upload-slip` accepts file upload to R2 (`src/lib/upload/storage.ts`).
- `POST /api/payments/[id]/verify` admin marks paid.

### Gaps

- ❌ Slip OCR / auto-verify not implemented (manual admin click only).
- ❌ No customer-facing slip upload UX validated under load (storefront route exists but not smoke-tested with real bank slip image).
- ❌ Payment gateway (PromptPay QR generation, Maybank deeplink) integration not audited in this PR.
- ❌ Failed-slip retry path unclear.

### Hard guard

Currently Boss is the only customer record + Boss's own bookings are the only data. Payment flow has zero customer-impact risk.

## 5. Payment status

| Status | Meaning |
|---|---|
| PENDING | order created, slip not uploaded |
| AWAITING_VERIFICATION | slip uploaded, admin not yet reviewed |
| VERIFIED | admin clicked verify |
| FAILED | admin rejected slip |
| REFUNDED | money returned |

### Gaps

- ❌ No automated transition triggers (timer / SLA / reminder).
- ❌ No customer notification when slip verified (out of scope per Boss customer-message no-go).
- ❌ Currency MYR hardcoded — multi-currency support not implemented.

## 6. Shipment / fulfillment status

### Current state

- `/shipping` admin page exists.
- Shipment model with `trackingNumber`, `carrier`, `shippedAt`, `deliveredAt`.
- Manual admin entry of tracking number.

### Gaps

- ❌ No carrier API integration (J&T / Flash / Kerry / Lalamove etc).
- ❌ No shipping label print integration.
- ❌ No customer tracking page validated under load.
- ❌ No SLA / reminder for pending shipments.

## 7. Stock decrement timing

### Current model

| Event | Stock effect |
|---|---|
| Booking PENDING_REVIEW created | none — soft hold via booking row only |
| Booking CONFIRMED | StockReservation row created; `reservedQty += quantity` |
| Booking CANCELLED before order | StockReservation released; `reservedQty -= quantity` |
| Booking CONVERTED_TO_ORDER | StockReservation `orderId` set; `reservedQty` unchanged |
| Order DELIVERED | (currently no decrement of `quantity` — see gap below) |

### Gaps

- ⚠️ **No actual stock decrement on DELIVERED.** `ProductVariant.quantity` stays high indefinitely after fulfillment. `reservedQty` stays elevated for all CONFIRMED/RESERVED items. Eventually reservedQty > quantity → broken.
- Workaround: admin manually adjusts inventory (out of band).
- Recommended Tier 6 PR: cron `/api/cron/decrement-on-delivered` to run nightly + zero out reservations for DELIVERED orders aged > 7d.

### Boss action before real onboarding

Decide stock model:
- **Option X** — decrement on DELIVERED (current spec implies but not wired).
- **Option Y** — decrement on CONFIRMED (cash-on-hand model).
- **Option Z** — leave manual; admins update inventory via `/inventory`.

Without this decision, real production usage will accumulate stock drift.

## 8. ReservedQty behavior

### Verified

- Confirm booking → reservedQty += quantity (Docker verifier PASS)
- Cancel booking → reservedQty -= quantity (verified)
- Convert to order → reservedQty unchanged, orderId set (verified)

### Gap

- **Race condition risk on Confirm + concurrent admin:** two admins confirming the same booking would both succeed if database row lock is not enforced. Existing `confirmBookingTx` wraps in `prisma.$transaction` → should be safe under postgres serializable isolation. Not load-tested.

## 9. Manual / live / non-live order risks

| Source | Risk |
|---|---|
| Manual booking | Boss-tested only. Real customer name/phone leaks possible if PII validation incomplete. |
| Live comment booking | Inbound runtime NOT implemented (Tier 4). Path is admin-only today. |
| Non-live evergreen booking | D4/D6 flags ON; flow code-verified, Boss-side functional smoke NOT yet run. |
| Post comment booking | NOT implemented (Tier 4). |
| Messenger inbox booking | NOT implemented (Tier 4). |

## 10. What admins can safely use TODAY

- ✅ Manual booking creation via `/sale` → Manual Create dialog
- ✅ Add from Stock product code management (Tier 3 + Tier 3.5 + Tier 3.6)
- ✅ Booking confirm / cancel
- ✅ Booking → Order V2 conversion
- ✅ Order list / detail view (read-only)
- ✅ Inventory list / variant edit
- ✅ Customer list / detail view (limited PII surface)
- ✅ Live session CRUD (`/live-selling` direct URL)

## 11. What is NOT yet ready

- ❌ Customer-facing checkout under real load
- ❌ Payment slip verification under real load
- ❌ Shipping integration with carriers
- ❌ Stock decrement on DELIVERED
- ❌ Cron jobs for SLA / reminder / expiration
- ❌ Outbound customer messaging
- ❌ Tier 4 inbound runtime (Messenger / Post / WhatsApp / Telegram)
- ❌ Tier 5 parser
- ❌ Returns / refunds workflow
- ❌ Multi-currency
- ❌ Tax calculation
- ❌ Discount / promo codes
- ❌ Subscription billing

## 12. Test / verifier gaps

| Domain | Coverage | Gap |
|---|---|---|
| Booking | Docker verifier 9/9 + vitest | none significant |
| Booking conversion | Docker verifier 8/8 + vitest 19/19 | none significant |
| BroadcastProduct CRUD | Docker verifier 16/16 + vitest 34/34 | none significant |
| Order create direct | Limited vitest | no Docker verifier |
| Order status transitions | Limited vitest | no Docker verifier |
| Payment slip upload | None visible | needs E2E or verifier |
| Payment verify | None visible | needs verifier |
| Shipment creation | None visible | needs verifier |
| Stock decrement on DELIVERED | N/A (not wired) | needs implementation + verifier |
| Storefront checkout | None visible | needs E2E + load test |

## 13. Production readiness blockers (sorted by severity)

| Severity | Blocker |
|---|---|
| **HIGH** | Stock decrement on DELIVERED not wired. Real ops will drift inventory. |
| **HIGH** | Storefront checkout / payment / shipping not load-tested. |
| **MEDIUM** | No customer notification on order state change (intentional Boss no-go, but admins must manually inform). |
| **MEDIUM** | No shipping carrier integration. Manual tracking number entry only. |
| **MEDIUM** | Payment slip OCR / auto-verify absent. Manual review required. |
| **LOW** | No bulk operations (cancel all, refund batch, etc). |
| **LOW** | No analytics on conversion funnel (booking → order → paid → shipped). |

## 14. Recommended next PRs

In priority order:

1. **PR — Stock decrement model.** Boss decision X/Y/Z, then implement + Docker verifier.
2. **PR — Order status transition guards.** Validate PENDING → RESERVED → CONFIRMED → PROCESSING → SHIPPED → DELIVERED sequence. Reject skips.
3. **PR — OrderAudit surface in `/orders` UI.** Existing table, missing UI.
4. **PR — Payment slip upload E2E test.** Real bank slip image fixture.
5. **PR — Shipment carrier integration MVP.** Pick one carrier (Boss preference) + API key.
6. **PR — Cron jobs** for SLA / reminder / expiration / stock-drift reconciliation.
7. **PR — Customer-facing order tracking page load test.**

## 15. Cross-references

- D4/D6 runbook: `docs/superpowers/2026-05-14-sale-d4-d6-activation-runbook.md`
- Tier 3 handoff: `docs/superpowers/2026-05-14-sale-add-from-stock-handoff.md`
- Tier 3.5 plan: `docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md`
- Tier 4 inbound plan: `docs/superpowers/2026-05-14-omnichannel-inbound-receive-only-plan.md`
- Tier 5 parser plan: `docs/superpowers/2026-05-14-comment-to-booking-parser-plan.md`
- Unified workspace handoff: `docs/superpowers/2026-05-15-sale-unified-workspace-handoff.md`
