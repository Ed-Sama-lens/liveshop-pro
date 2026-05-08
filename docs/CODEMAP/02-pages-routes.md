# 02 — Pages & Routes

## Three route groups

| Group | Path prefix | Auth | Purpose |
|---|---|---|---|
| `(app)` | `/` (admin) | Required (next-auth) | Admin dashboard |
| `(legal)` | `/privacy` `/terms` `/data-deletion` | Public | FB App Review |
| `shop` | `/shop/[shopId]/...` | Public + optional FB Login | Customer storefront |
| `auth` | `/auth/...` | Public | Login/signup |

## Admin pages — `(app)/`

```
(app)/
  dashboard/page.tsx           Stats overview (revenue, conversion, low stock)
  inventory/
    page.tsx                   Product list
    [id]/page.tsx              Edit product (form + variants)
  orders/
    page.tsx                   Order list (filters, bulk status)
    [id]/page.tsx              Order detail (items, payments, audit)
  customers/
    page.tsx                   Customer list (LTV, ban status)
    [id]/page.tsx              Customer detail (orders, lifetime)
  storefront/
    page.tsx                   Manage published products + branding + payment settings
  payments/page.tsx            Payment review + manual entry
  shipping/page.tsx            Shipment list + status
  live-selling/
    page.tsx                   Live session list
    [id]/page.tsx              Live session dashboard
  chat/page.tsx                Customer chat support
  analytics/page.tsx           Revenue + product analytics
  reports/page.tsx             Revenue report (CSV export)
  notifications/page.tsx       Admin notification feed
  activity/page.tsx            Activity log
  exchange-rates/page.tsx      Reference exchange rates
  bulk/page.tsx                Bulk product import/export
  settings/page.tsx            Shop + team + currency settings
  layout.tsx                   Sidebar layout (uses Sidebar + MobileNav)
```

RBAC enforcement: `src/proxy.ts` checks `ROUTE_PERMISSIONS` for page routes. See 05.

## Storefront pages — `shop/[shopId]/`

`shopId` accepts BOTH slug ("nazha-hatyai") and cuid. Resolved via `resolveShopId()` in layout.

```
shop/[shopId]/
  layout.tsx                   StorefrontAuthWrapper (FB SDK init)
  page.tsx                     Product grid (search, category filter)
  product/[productId]/
    page.tsx                   Product detail + variant select + add to cart
  cart/page.tsx                Cart line items + qty edit + checkout button
  checkout/page.tsx            Customer info + shipping + payment select
  orders/page.tsx              Customer order history + slip upload
```

## Legal pages — `(legal)/`

```
(legal)/
  layout.tsx                   Clean layout, max-w-3xl, back-to-home + cross-links
  privacy/page.tsx             Privacy Policy (FB App Review)
  terms/page.tsx               Terms of Service
  data-deletion/page.tsx       Data deletion instructions (FB requirement)
```

URLs:
- https://nazhahatyai.com/privacy
- https://nazhahatyai.com/terms
- https://nazhahatyai.com/data-deletion

## Auth pages — `auth/`

```
auth/
  login/page.tsx               Admin login (next-auth signin)
  ...
```

## Special pages

| Path | Purpose |
|---|---|
| `/` | Root redirect (to `/dashboard` if logged in) |
| `/unauthorized` | 403 — middleware redirects here on permission deny |

## Middleware behavior — `src/proxy.ts`

1. Skip `/api/*` paths (early return)
2. Redirect legacy locale URLs `/en|/th|/zh/...` → strip prefix
3. Check next-auth session for `(app)/*` paths
4. RBAC check via `ROUTE_PERMISSIONS` map
5. Permit `(legal)/*` and `shop/*` without auth

## i18n

`localePrefix: 'never'` — locale stored in `NEXT_LOCALE` cookie. URLs do NOT include `/en`, `/th`, `/zh` segments. Switch via `LanguageSwitcher` component which sets cookie + `window.location.reload()`.

Translations: `messages/en.json`, `messages/th.json`, `messages/zh.json`.
