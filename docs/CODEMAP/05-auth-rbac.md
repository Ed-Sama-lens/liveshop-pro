# 05 — Auth & RBAC

Two auth flows: **admin** (next-auth) + **storefront customer** (Facebook Login).

---

## Admin auth — next-auth

Library: `next-auth@5.0.0-beta.30` + `@auth/prisma-adapter`

Handler: `src/app/api/auth/[...nextauth]/route.ts`

Stored in: `User` + `Account` + `Session` + `VerificationToken` Prisma models.

### Roles

```ts
enum UserRole {
  OWNER         // shop owner — full access
  MANAGER       // mgmt — most things except team admin
  WAREHOUSE     // inventory + shipping + orders read
  CHAT_SUPPORT  // chat + customers + orders read (default for new users)
}
```

### Session helper — `src/lib/auth/session.ts`

```ts
const user = await requireAuth();
// → { id, name, email, role, shopId }
// throws → caught by toAppError → 401
```

Use in EVERY admin API route:

```ts
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.shopId) return NextResponse.json(error('No shop'), { status: 403 });
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }
    // ... use user.shopId in queries
  } catch (err) { /* ... */ }
}
```

### Permission map — `src/lib/auth/permissions.ts`

`ROUTE_PERMISSIONS` array, first match wins:

| Path prefix | Allowed roles |
|---|---|
| `/settings/shop` | OWNER |
| `/settings/team` | OWNER, MANAGER |
| `/settings` | OWNER, MANAGER |
| `/inventory` | OWNER, MANAGER, WAREHOUSE |
| `/shipping` | OWNER, MANAGER, WAREHOUSE |
| `/orders` | OWNER, MANAGER, WAREHOUSE, CHAT_SUPPORT |
| `/customers` | OWNER, MANAGER, CHAT_SUPPORT |
| `/chat` | OWNER, MANAGER, CHAT_SUPPORT |
| `/live-selling` | OWNER, MANAGER |
| `/analytics` | OWNER, MANAGER |
| `/dashboard` | all 4 roles |
| `/reports` | OWNER, MANAGER |
| `/payments` | OWNER, MANAGER |
| `/storefront` | OWNER, MANAGER |
| `/exchange-rates` | OWNER, MANAGER |
| `/notifications` | all 4 roles |
| `/activity` | OWNER, MANAGER |
| `/bulk` | OWNER, MANAGER |

`PUBLIC_PATHS`: `/auth` `/api/auth` `/_next` `/favicon.ico` `/store` `/shop` `/unauthorized` `/privacy` `/terms` `/data-deletion`

### `canAccess(pathname, role)` — pure fn

Returns `{ allowed: boolean, reason: string }`. Used by middleware.

### Middleware — `src/proxy.ts`

```
1. Skip /api/* (early return — admin APIs use requireAuth() directly)
2. Strip legacy locale URLs /en|/th|/zh/...
3. isPublicPath(pathname)? → next()
4. Get session token
5. No session → redirect to /auth/login
6. canAccess(pathname, role) → next() OR redirect to /unauthorized
```

**Critical**: API routes MUST be excluded from middleware RBAC. Production bug pattern: middleware redirected `/api/products` to `/unauthorized` because no rule matched, breaking everything.

---

## Storefront customer auth — Facebook Login

Storefront pages are PUBLIC. FB Login is OPTIONAL — used to:
- Identify returning customers (link to `Customer` record)
- Send order confirmation via Messenger (after FB App Review approval)

### Setup

- FB App ID: `780277861568430` (env: `FACEBOOK_APP_ID`)
- App Secret: env `FACEBOOK_APP_SECRET`
- App must have **"Login with the JavaScript SDK"** = YES in FB Developer Console
- Allowed domains: `https://nazhahatyai.com`
- CSP must allow `connect.facebook.net` + `graph.facebook.com` (see 07)

### Components

`src/components/storefront/StorefrontAuth.tsx`:
- `StorefrontAuthProvider` — loads FB SDK, manages context
- `StorefrontLoginButton` — Login button + logged-in display
- `useStorefrontAuth()` — hook returning `{ customer, login, logout, getCustomerId }`

### Wrapper — `src/components/storefront/StorefrontAuthWrapper.tsx`

Used in `src/app/shop/[shopId]/layout.tsx` (server component) — passes `facebookAppId` from env to client provider.

### Flow

```
1. User clicks Login
2. FB.login() opens FB OAuth dialog
3. User approves, FB returns access_token
4. Frontend POSTs to /api/storefront/[shopId]/auth with token
5. Backend exchanges token → fetches FB profile (id, name, email)
6. Find or create Customer record by facebookId
7. Return { customerId, customerName, facebookId }
8. Frontend stores in localStorage (STORAGE_KEY = 'liveshop_customer')
```

### Anonymous customers

Before login, frontend generates `anon_<uuid>` and stores in `liveshop_customer_id`. Used as `customerId` in cart/order APIs. After login, real `customerId` replaces it.

---

## Common pitfalls

- **API 307 redirect**: middleware not skipping `/api/*`. Fix: early return for `pathname.startsWith('/api/')`.
- **Login button does nothing**: FB SDK blocked by CSP. Fix: `script-src 'self' ... https://connect.facebook.net`.
- **"JSSDK not selected" error from FB**: Toggle ON in FB Dev Console → Use Cases → Customize → Login with JavaScript SDK.
- **Locale switching 404**: `localePrefix: 'as-needed'` adds `/th/` but no `[locale]` segment exists. Fix: use `'never'` + cookie + `window.location.reload()`.
- **Facebook permission `pages_messaging` not in App Review options**: Must add "Messenger" product in FB App first.
