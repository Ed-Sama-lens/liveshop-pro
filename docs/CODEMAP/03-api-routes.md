# 03 — API Routes

80 routes total. Two halves: **admin** (auth required, RBAC) + **storefront** (public, customer-scoped).

All admin routes: `requireAuth()` + `user.shopId` check + role check.
All storefront routes: `resolveShopId(identifier)` first to convert slug → cuid.

Response format (all routes): `ok()` / `paginated()` / `error()` from `src/lib/api/response.ts`.

```ts
{ success: true, data: T }
{ success: true, data: T[], meta: { total, page, limit, totalPages } }
{ success: false, error: string }
```

---

## Admin — Products

| Method + Path | Purpose |
|---|---|
| `GET /api/products` | List (search, categoryId, isActive, page, limit ≤100) |
| `POST /api/products` | Create (OWNER, MANAGER) |
| `GET /api/products/[id]` | Detail |
| `PATCH /api/products/[id]` | Update |
| `DELETE /api/products/[id]` | Soft delete (`isActive=false`) |
| `POST /api/products/[id]/images` | Upload to R2 (multipart, sharp resize, webp) |
| `DELETE /api/products/[id]/images/[filename]` | Delete from R2 |
| `POST /api/products/[id]/variants` | Add variant |
| `PATCH /api/products/[id]/variants/[variantId]` | Update variant |
| `DELETE /api/products/[id]/variants/[variantId]` | Delete variant |
| `GET /api/products/export` | CSV export |
| `POST /api/products/import` | CSV import |

## Admin — Orders

| Method + Path | Purpose |
|---|---|
| `GET /api/orders` | List (status, search, customerId, dateFrom, dateTo) |
| `POST /api/orders` | Create order (admin POS) |
| `GET /api/orders/[id]` | Detail (items, payments, audit, shipment) |
| `PATCH /api/orders/[id]/status` | Status transition |
| `POST /api/orders/bulk-status` | Bulk status update |
| `GET /api/orders/[id]/audit` | Audit log |
| `GET /api/orders/[id]/invoice` | HTML invoice |
| `POST /api/orders/[id]/payment` | Record payment |
| `POST /api/orders/[id]/payment/slip` | Upload slip |
| `POST /api/orders/[id]/payment/verify` | Verify payment |
| `GET /api/orders/search-by-product` | Find orders containing product |

## Admin — Stock

| Method + Path | Purpose |
|---|---|
| `POST /api/stock/adjust` | Manual adjustment with reason |
| `GET /api/stock/low-stock` | Items below `lowStockAt` |
| `POST /api/stock/reserve` | Reserve qty (cart hold) |
| `POST /api/stock/release` | Release reservation |

## Admin — Customers / Categories / Payments / Shipments

```
GET    /api/customers              List
POST   /api/customers              Create
GET    /api/customers/[id]         Detail
GET    /api/customers/[id]/orders  Order history
POST   /api/customers/[id]/ban     Ban
POST   /api/customers/[id]/unban   Unban

GET    /api/categories
POST   /api/categories
PATCH  /api/categories/[id]
DELETE /api/categories/[id]

GET    /api/payments
GET    /api/payments/[id]
POST   /api/payments/manual
GET    /api/payments/pending-count

GET    /api/shipments
GET    /api/shipments/[id]
PATCH  /api/shipments/[id]/status
```

## Admin — Live Selling / Chat / Notifications

```
GET    /api/live                   List sessions
POST   /api/live                   Create
GET    /api/live/[id]
PATCH  /api/live/[id]/status       Start/stop
GET    /api/live/[id]/comments     SSE comments

GET    /api/chats
GET    /api/chats/[id]
GET    /api/chats/[id]/messages
POST   /api/chats/[id]/messages    Send
PATCH  /api/chats/[id]/assign      Assign agent
PATCH  /api/chats/[id]/read        Mark read
GET    /api/chats/stream           SSE all chats

GET    /api/notifications
GET    /api/notifications/count
PATCH  /api/notifications/read
GET    /api/notifications/stream   SSE
```

## Admin — Storefront management

```
GET    /api/storefront/admin/products            Published products
POST   /api/storefront/admin/products            Publish a product
PATCH  /api/storefront/admin/products/[id]       Toggle visibility / sortOrder
DELETE /api/storefront/admin/products/[id]       Unpublish
GET    /api/storefront/admin/branding
PUT    /api/storefront/admin/branding            Logo, colors, payment settings
```

## Admin — Settings / Activity / Analytics / Export

```
GET   /api/settings/shop
PUT   /api/settings/shop
GET   /api/settings/team
POST  /api/settings/team
PATCH /api/settings/team/[memberId]
DELETE /api/settings/team/[memberId]

GET /api/activity
GET /api/analytics

GET /api/export/inventory     CSV
GET /api/export/orders        CSV
GET /api/export/revenue       CSV
```

## Admin — Webhooks / Exchange / Misc

```
GET    /api/webhooks
POST   /api/webhooks
GET    /api/webhooks/[id]/logs

GET    /api/exchange-rates
POST   /api/exchange-rates
GET    /api/exchange-rates/convert

POST   /api/upload                 Generic R2 upload
POST   /api/facebook/exchange-token  FB token exchange (admin)
```

## Auth

```
POST /api/auth/[...nextauth]   next-auth (signin, signout, session, callbacks)
```

---

## Storefront (public) — `/api/storefront/[shopId]/...`

ALL routes call `resolveShopId(identifier)` to support both slug and cuid as `[shopId]`.

```
GET  storefront/[shopId]/products                  Public product listing
GET  storefront/[shopId]/products/[productId]      Detail
GET  storefront/[shopId]/branding                  Logo, colors, defaultCurrency=MYR
GET  storefront/[shopId]/payment-info              QR + bank details

POST storefront/[shopId]/auth                      FB token → customer record
GET  storefront/[shopId]/cart                      Get cart
POST storefront/[shopId]/cart                      Add item
PATCH storefront/[shopId]/cart/[itemId]            Update qty
DELETE storefront/[shopId]/cart/[itemId]           Remove item
DELETE storefront/[shopId]/cart                    Clear

POST storefront/[shopId]/checkout                  Place order

GET  storefront/[shopId]/orders                    Customer orders (by customerId)
GET  storefront/[shopId]/orders/[orderId]          Detail
POST storefront/[shopId]/orders/[orderId]/slip     Upload payment slip
```

## Patterns

- **Validation**: `validateBody(req, schema)` / `validateQuery(req, schema)` from `src/lib/validation/middleware.ts`
- **Errors**: throw `NotFoundError` / `ValidationError` / `ForbiddenError` from `src/lib/errors`. Caught by `toAppError(err)` → mapped to status code.
- **Pagination defaults**: page=1, limit=20, max limit=100. Query schema enforces `z.coerce.number().int().min(1).max(100)`.
- **shopId scoping**: every admin query filters by `user.shopId` (multi-tenant). Storefront filters by resolved shop ID.

## Common pitfalls

- Limit > 100 in query → 400 validation error (saw this with `limit=200` on storefront page).
- Forgetting `resolveShopId` on a new storefront route → returns 0 results when slug used.
- Not checking `user.shopId` in admin route → returns other shop's data.
