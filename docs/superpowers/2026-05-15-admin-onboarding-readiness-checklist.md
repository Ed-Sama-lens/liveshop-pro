# Admin onboarding readiness checklist

**Filed:** 2026-05-17
**Status:** Docs-only. Boss uses this before inviting real admins. No runtime change.

---

## 1. Why this exists

Boss has intentionally NOT yet onboarded real admins because the system was not complete. After Tier 1.5 + Tier 3 + Tier 3.5 + Tier 3.6, the workflow is closer to ready. This checklist makes the readiness call objective.

Sections marked ✅ are admin-safe today. Sections marked ⚠️ have known limitations. Sections marked ❌ should NOT be used by real admins until upgrades ship.

## 2. Account / login readiness

| Item | State | Note |
|---|---|---|
| next-auth credentials login | ✅ | working |
| Facebook OAuth admin login | ⚠️ | configured but not heavily smoke-tested |
| Password reset flow | ⚠️ | `scripts/reset-admin-password.ts` exists local-only; no UI flow |
| Email verification | ⚠️ | model field exists; flow incomplete |
| 2FA | ❌ | not implemented |
| Session timeout | ✅ | next-auth default |

### Onboarding requirement

Boss creates admin User row via Prisma Studio or `/api/users` admin route. Email + initial password set out-of-band. Admin logs in, changes password via... actually NO password-change UI exists. **Defer: implement password-change UI before real admin onboarding.**

## 3. Roles / permissions readiness

| Role | Routes accessible |
|---|---|
| OWNER | all (`/dashboard`, `/sale`, `/orders`, `/inventory`, `/customers`, `/shipping`, `/payments`, `/storefront`, `/exchange-rates`, `/settings/shop`, `/settings/team`, `/analytics`, `/reports`, `/notifications`, `/activity`, `/bulk`, `/chat`, `/live-selling` direct URL) |
| MANAGER | most (except `/settings/shop`) |
| WAREHOUSE | `/orders`, `/orders/search-by-product`, `/inventory`, `/shipping`, `/notifications`, `/dashboard` |
| CHAT_SUPPORT | `/orders`, `/sale` (read), `/customers`, `/chat`, `/notifications`, `/dashboard` |

### Onboarding requirement

✅ Roles are well-defined. Permissions tests 63/63 PASS. Safe to invite admins per role.

## 4. Shop setup

| Item | State |
|---|---|
| Shop record creation | ⚠️ Boss-only (no admin UI for creating new shops) |
| Shop branding upload | ✅ `/storefront/branding` exists |
| Shop slug | ✅ unique constraint, validated |
| Facebook Page integration | ⚠️ `facebookPageId` + `facebookToken` fields; setup via `/settings/shop` not smoke-tested |
| Multi-shop per admin | ✅ ShopMember table supports |

### Onboarding requirement

Boss sets up shops; admins join via ShopMember invite. No admin self-service shop creation.

## 5. Product / variant setup

| Item | State |
|---|---|
| Product CRUD | ✅ `/inventory` works |
| ProductVariant CRUD | ✅ |
| Variant attributes (size/color JSON) | ✅ |
| Stock quantity edit | ✅ |
| Bulk upload (CSV) | ✅ `/api/products/import` exists |
| Image upload to R2 | ✅ |
| Multi-image gallery | ✅ |
| Cost price tracking | ✅ field exists |
| Category assignment | ✅ |

### Onboarding requirement

✅ Ready. Admin can fully manage product catalog.

## 6. Stock setup

| Item | State |
|---|---|
| Initial stock entry | ✅ on variant create |
| Stock adjustment | ✅ via `/inventory` edit |
| Reserved quantity tracking | ✅ |
| Low-stock indicator | ⚠️ `lowStockAt` field exists; not surfaced in UI |
| Stock history audit | ❌ no StockHistory table |

### Onboarding requirement

⚠️ Stock decrement on DELIVERED not wired (see `2026-05-15-order-payment-shipping-readiness-audit.md` § 7). Admins must MANUALLY reduce `quantity` after each shipment OR accept drift.

## 7. Product code / CF code setup

| Item | State |
|---|---|
| Create BP for live session | ✅ Tier 3 PR #4 |
| Create evergreen BP | ✅ Tier 3 PR #4 + D6 flag ON |
| Edit priceOverride / isPinned | ✅ Tier 3.6 (PR #12 pending review) |
| Delete BP with active-booking guard | ✅ Tier 3.6 (PR #12 pending review) |
| Pin order in list | ✅ Tier 3.6 |
| Display in /sale Product Codes panel | ✅ |

### Onboarding requirement

✅ Ready post-PR-#12 merge. Functional smoke pending Boss admin login.

## 8. Live session setup

| Item | State |
|---|---|
| Create new LiveSession | ✅ via `/live-selling/new` (hidden from sidebar but accessible) |
| Edit LiveSession metadata | ✅ via `/live-selling/[id]` |
| Status filter / pagination | ✅ |
| LiveSession → BroadcastProduct binding | ✅ via Add from Stock |
| Auto-archive ENDED sessions | ⚠️ no auto; admin closes manually |

### Onboarding requirement

✅ Admin can manage LiveSession via "จัดการรอบไลฟ์" link in `/sale` header (Tier 1.5 PR #11).

## 9. Manual booking

| Item | State |
|---|---|
| Create booking (live) | ✅ via Manual Create dialog |
| Create booking (evergreen, no session) | ✅ post-D4/D6 flag ON |
| Customer search | ✅ `/api/sale/customers/search` |
| Idempotency key support | ✅ |
| Source field | ✅ MANUAL only from client (LIVE_COMMENT etc reserved for future runtimes) |

### Onboarding requirement

✅ Ready. Boss functional smoke pending.

## 10. Confirm / cancel booking

| Item | State |
|---|---|
| Confirm booking | ✅ |
| Cancel with reason | ✅ |
| Reservation integrity badge | ✅ OK / MISSING / MULTIPLE / NOT_APPLICABLE |
| BookingHistory audit | ✅ |
| Cross-shop guard | ✅ |

### Onboarding requirement

✅ Ready.

## 11. Create order

| Item | State |
|---|---|
| Per-row Create Order action | ✅ |
| V1 conversion (legacy live-bound) | ✅ |
| V2 conversion (bookingIds-only) | ✅ |
| Multi-customer rejection | ✅ |
| Idempotency replay | ✅ |
| Activity log entry | ✅ |
| Order audit metadata (conversionPath v1/v2) | ✅ |

### Onboarding requirement

✅ Ready.

## 12. Payment / slip readiness

See `2026-05-15-order-payment-shipping-readiness-audit.md` § 4-5. ⚠️ Manual review only. No carrier integration. No OCR. Admins must visually verify slips.

### Onboarding requirement

⚠️ Admins must be trained on:
- How to recognize a valid bank slip
- How to mark VERIFIED vs FAILED
- What to do when slip is rejected (no automated customer notification — admin must contact customer manually out-of-band)

## 13. Shipping readiness

See audit § 6. ⚠️ Manual tracking number entry only.

### Onboarding requirement

⚠️ Admins must be trained on:
- Manual tracking number entry
- Carrier handoff (call / app)
- Status update timing

## 14. Known limitations

- ❌ Stock decrement on DELIVERED not wired — drift accumulates
- ❌ No customer-facing notification (email / SMS / Messenger)
- ❌ Tier 4 inbound runtime (Messenger / WhatsApp / Telegram / Post comments) NOT shipped
- ❌ No carrier API integration
- ❌ No payment OCR
- ❌ Password-change UI for admins missing
- ❌ No analytics on conversion funnel
- ❌ Multi-currency NOT supported (MYR hardcoded)
- ❌ Tax calculation NOT implemented
- ❌ Discount / promo NOT implemented
- ❌ Returns / refunds workflow NOT implemented

## 15. Do / Don't for admins

### DO

- ✅ Create manual bookings for Boss/test customers
- ✅ Confirm / cancel bookings
- ✅ Convert to orders via UI
- ✅ Edit / delete product codes (Tier 3.6 post-PR-#12)
- ✅ Manually adjust inventory after each shipment
- ✅ Manually contact customers about order status (out-of-band)
- ✅ Use `/sale` unified workspace for daily ops

### DON'T

- ❌ Don't onboard real customers until Tier 4 + Tier 5 ship OR Boss explicitly accepts manual-only ops
- ❌ Don't expect automatic notifications to customers
- ❌ Don't expect carrier API integration
- ❌ Don't expect inventory to auto-decrement on shipment
- ❌ Don't run bulk operations beyond what UI supports
- ❌ Don't try to manage refunds via UI (not implemented)
- ❌ Don't share credentials between admins (no 2FA)

## 16. Pre-onboarding smoke checklist

Boss runs before inviting first admin:

1. Create one test BroadcastProduct via Add from Stock.
2. Create one manual booking for Boss customer.
3. Confirm booking.
4. Convert booking → order.
5. Upload fake slip; mark verified.
6. Enter fake tracking number; mark shipped.
7. Mark delivered.
8. Verify inventory manually decremented (since auto-decrement not wired).
9. Verify activity log has entries for each step.
10. Document any error or unexpected behavior.

Pass = invite first admin.
Fail = file blocker as new PR / hotfix.

## 17. Support / rollback process

| Scenario | Action |
|---|---|
| Production 500 | Check Vercel logs; run prod-unauth-smoke spec to verify gates; rollback last deploy if needed |
| DB error | Railway dashboard logs; check `_prisma_migrations` for state; restore from snapshot if catastrophic |
| Admin reports broken UI | Reproduce via Vercel preview if available; hotfix PR; do NOT push direct to master |
| Booking integrity error | Check reservationIntegrity badge; manually inspect StockReservation rows; do NOT delete bookings via raw SQL |
| Order stuck PENDING | Admin can cancel via UI; reservation releases automatically |

## 18. What not to use yet

- `/storefront/admin` real customer-facing flows
- Payment gateway external integration
- Carrier API
- Messenger / WhatsApp / Telegram inbound
- Cron jobs (none deployed for SLA / reminder / expiration)
- Returns / refunds
- Tax / VAT
- Multi-currency

## 19. Verdict

| Question | Answer |
|---|---|
| Can Boss + 1-2 trusted admins use the system on test data? | ✅ Yes |
| Can the system handle real customer ops at low volume (< 10 orders/day)? | ⚠️ With manual workarounds for stock decrement + customer notification |
| Can the system handle real customer ops at moderate volume (10-100 orders/day)? | ❌ No — manual workarounds become unsustainable |
| Can the system handle live commerce ops with inbound from FB / Messenger? | ❌ No — Tier 4 not shipped |

**Recommendation:** invite max 1-2 admins for closed-test ops on Boss-known customers. Full public launch waits for Tier 4 + stock decrement + carrier integration.
