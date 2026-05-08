# 04 — Database

PostgreSQL via Prisma 7 + `@prisma/adapter-pg` (Edge runtime compatible).

29 models. Source of truth: `prisma/schema.prisma`.

Generated client: `src/generated/prisma/` (gitignored, regenerated on `postinstall`).

## Auth & Users (5)

| Model | Purpose |
|---|---|
| `User` | next-auth user. Roles: `OWNER` `MANAGER` `STAFF` `CHAT_SUPPORT`. `facebookId` unique for storefront customers reusing this table NOT used — they go to `Customer`. |
| `Account` | next-auth OAuth account link |
| `Session` | next-auth session token |
| `VerificationToken` | next-auth email verify |
| `LoginEvent` | Login audit (IP, UA, success) |

## Shop & Team (3)

| Model | Purpose |
|---|---|
| `Shop` | Tenant. `slug` (unique, e.g. "nazha-hatyai") for readable URLs. `name` for display. |
| `ShopMember` | User ↔ Shop with role (multi-shop support) |
| `ShopBranding` | Logo, banner, primary/accent colors, description, payment settings (PromptPay QR, bank details) |

## Catalog (4)

| Model | Purpose |
|---|---|
| `Product` | `shopId` `stockCode` (display) `saleCode` (internal) `name` `images String[]` (R2 URLs) `categoryId?` `isActive` |
| `ProductCategory` | `shopId` `name` |
| `ProductVariant` | `productId` `sku` `attributes JSON` `price Decimal` `costPrice?` `quantity` `reservedQty` `lowStockAt?` |
| `StockReservation` | Cart-level qty hold with `expiresAt` |

## Customers (1)

| Model | Purpose |
|---|---|
| `Customer` | `shopId` `facebookId?` `name` `email?` `phone?` `addresses JSON[]` `lifetimeValue Decimal` `isBanned` |

## Orders (4)

| Model | Purpose |
|---|---|
| `Order` | `shopId` `customerId` `orderNumber` `status` `subtotal` `shippingFee` `totalAmount Decimal` `currency` (MYR) `notes?` |
| `OrderItem` | `orderId` `productId` `variantId` `productName` (snapshot) `unitPrice` `quantity` `totalPrice` |
| `OrderAudit` | Status change log: `from` `to` `by` `at` `note?` |
| `Payment` | `orderId` `amount` `method` (PROMPTPAY / BANK / OTHER) `status` `slipUrl?` `verifiedAt?` `verifiedBy?` |

`OrderStatus` enum: `PENDING` `PAID` `PACKING` `SHIPPED` `DELIVERED` `CANCELLED` `REFUNDED`
`PaymentStatus`: `PENDING` `VERIFIED` `REJECTED`

## Shipments (1)

| Model | Purpose |
|---|---|
| `Shipment` | `orderId` `trackingNumber?` `carrier?` `status` `address JSON` `shippedAt?` `deliveredAt?` |

## Chat (2)

| Model | Purpose |
|---|---|
| `Chat` | `shopId` `customerId` `assignedToId?` (User) `status` `lastMessageAt` `unreadCount` |
| `ChatMessage` | `chatId` `from` (CUSTOMER / AGENT) `text` `attachments String[]` |

## Live Selling (1)

| Model | Purpose |
|---|---|
| `LiveSession` | `shopId` `title` `platform` `startedAt` `endedAt?` `totalRevenue Decimal` `viewerCount?` |

## Storefront (3)

| Model | Purpose |
|---|---|
| `StorefrontProduct` | Junction: `shopId` `productId` `isVisible` `sortOrder` `publishedAt` |
| `Cart` | `shopId` `customerId` (anon-id allowed) `expiresAt` |
| `CartItem` | `cartId` `productId` `variantId` `quantity` |

## Misc (5)

| Model | Purpose |
|---|---|
| `Notification` | `userId` `shopId` `type` `title` `body` `read` `link?` |
| `Webhook` | `shopId` `url` `events String[]` `secret` `isActive` |
| `WebhookLog` | `webhookId` `event` `payload JSON` `responseStatus?` `responseBody?` |
| `ActivityLog` | `shopId` `userId` `action` `entityType` `entityId` `metadata JSON?` |
| `ExchangeRate` | `from` `to` `rate Decimal` `updatedAt` (admin reference, not used for pricing) |

## Key indexes

- `Shop.slug` unique + `@@index([slug])`
- `User.facebookId` unique + `@@index([facebookId])`
- `Customer.facebookId` (per-shop)
- `Product` `@@index([shopId, isActive])` `@@index([shopId, categoryId])`
- `Order` `@@index([shopId, status, createdAt])` `@@index([customerId])`
- `StorefrontProduct` `@@unique([shopId, productId])`

## Repositories

`src/server/repositories/` (19 files) — one per model area:

```
activity / analytics / branding / cart / category / chat / checkout
customer / exchange-rate / live / notification / order / payment
product / shipment / shop / stock / storefront / webhook
```

All repos:
- Use `prisma` from `src/lib/db/prisma.ts`
- Return frozen serialized rows (Decimal → string)
- Throw `NotFoundError` for missing
- Multi-tenant: every method takes `shopId` first arg

## Migration workflow

```
# Local dev
DATABASE_URL=postgresql://...railway... npx prisma migrate dev --name add_field_x

# Production (Railway DB) — use db push for hotfix only, migrate for proper
DATABASE_URL=postgresql://...railway... npx prisma db push
```

**WARN**: Running `prisma db push` without explicit `DATABASE_URL` reads `.env` which may point to localhost. Always set explicitly.

## Connection

`src/lib/db/prisma.ts` uses `PrismaPg` adapter (Edge-compatible). Single `globalForPrisma` cache. Logs queries in dev only.
