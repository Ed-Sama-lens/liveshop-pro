# 06 — Storefront & Checkout Flow

Customer-facing flow at `/shop/[shopId]/...`. `[shopId]` accepts both slug (`nazha-hatyai`) and cuid.

## Slug resolution

`src/lib/shop/resolve-shop.ts`:

```ts
export async function resolveShopId(identifier: string): Promise<string | null> {
  const bySlug = await prisma.shop.findUnique({ where: { slug: identifier }, select: { id: true } });
  if (bySlug) return bySlug.id;
  const byId = await prisma.shop.findUnique({ where: { id: identifier }, select: { id: true } });
  return byId?.id ?? null;
}
```

**Used in**:
- `src/app/shop/[shopId]/layout.tsx` (server) — `notFound()` if null
- ALL `/api/storefront/[shopId]/**` routes (11 files) — throw `NotFoundError('Shop not found')`

## Pages

```
shop/[shopId]/
  layout.tsx                          Resolve slug, wrap with StorefrontAuthWrapper
  page.tsx                            Product grid (uses StorefrontLoginButton + cart link)
  product/[productId]/page.tsx        Variant select, qty, add-to-cart
  cart/page.tsx                       List items, qty edit, total, checkout button
  checkout/page.tsx                   Customer info form + payment method select
  orders/page.tsx                     Customer's orders + slip upload
```

All client components — fetch data via `/api/storefront/[shopId]/...`.

## Customer flow

```
1. Browse → GET /api/storefront/<slug>/products (paginated)
2. Click product → /shop/<slug>/product/<productId>
3. Select variant + qty → POST /api/storefront/<slug>/cart  body: { customerId, productId, variantId, quantity }
4. View cart → GET /api/storefront/<slug>/cart?customerId=...
5. Edit qty → PATCH /api/storefront/<slug>/cart/<itemId>
6. Checkout → /shop/<slug>/checkout
   - Fill form: name, phone, address, payment method
   - POST /api/storefront/<slug>/checkout body: { customerId, items, address, paymentMethod }
   - Backend: create Order + OrderItems, reserve stock, return orderId
7. Pay → user transfers (PromptPay QR or bank), uploads slip
   - POST /api/storefront/<slug>/orders/<orderId>/slip multipart form
8. Admin verifies → updates payment status → notifies customer
```

## Customer identity

Anonymous: `getAnonCustomerId()` in `StorefrontAuth.tsx` generates `anon_<uuid>`, stored in `localStorage['liveshop_customer_id']`.

After FB login: real `Customer.id` replaces the anon ID. Cart items can be associated with either.

## Cart expiry

`Cart.expiresAt` — 24h from creation. `CartItem` qty held via `StockReservation.expiresAt` (release on expiry).

## Order placement

`/api/storefront/[shopId]/checkout`:
1. Validate: customerId, items[], address, paymentMethod
2. For each item: check `quantity <= variant.quantity - variant.reservedQty`
3. Create `Order` with `status: PENDING`, `currency: MYR`, computed totals
4. Create `OrderItem`s with snapshot prices
5. Decrement `variant.quantity` + clear reservation
6. Clear `Cart`
7. Return `{ orderId, orderNumber }`

## Branding fetch

`GET /api/storefront/[shopId]/branding` returns:
```json
{
  shopId, shopName, logo, banner, primaryColor, accentColor,
  description, defaultCurrency: "MYR"
}
```

`defaultCurrency` is hardcoded `'MYR'` in route handler. See 08 for currency.

## Payment info fetch

`GET /api/storefront/[shopId]/payment-info` returns PromptPay QR URL + bank details from `ShopBranding`.

## Repository

`src/server/repositories/storefront.repository.ts` — `findPublic(shopId, query)` joins `StorefrontProduct` + `Product` + `ProductVariant` + `ProductCategory`. Filters `isVisible=true`.

## Common pitfalls

- **Storefront API returns 0 products**: forgot to call `resolveShopId()`. Pattern: ALL `[shopId]` routes need it.
- **Cart customerId mismatch**: anon ID changed between sessions (browser cleared localStorage). Cart orphaned. No fix yet — accept loss.
- **Product not appearing**: `StorefrontProduct.isVisible` is false OR `Product.isActive` is false.
- **Checkout fails silently**: stock check rejects but UI doesn't show specific error. Check `body.error`.
