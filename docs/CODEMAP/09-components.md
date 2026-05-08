# 09 — Components

UI: shadcn/ui (built on @base-ui/react) + Tailwind v4 + lucide-react icons.

## Directory layout

```
src/components/
  ui/                shadcn primitives (Button, Card, Input, Select, Dialog, Table, etc.)
  shared/            App-wide layout — Sidebar, MobileNav, LanguageSwitcher, SidebarItem
  inventory/         ProductForm, VariantForm
  orders/            OrderForm, OrderTable, PaymentSection
  customers/         CustomerTable
  chat/              ChatList, ChatPanel, MessageInput
  live/              LiveSessionTable, LiveSessionDashboard
  storefront/        StorefrontAuth, StorefrontAuthWrapper, CurrencySelector
  shipping/          ShipmentTable, ShipmentStatus
  notification/      NotificationBell, NotificationDropdown
  providers/         Theme + i18n + Auth providers
  ErrorBoundary.tsx  Top-level error boundary
  ErrorBoundarySection.tsx  Per-section error boundary
```

## ui/ primitives (shadcn)

Standard shadcn components. Configure via `components.json`. Theme tokens in `src/app/globals.css`.

Common: `button` `card` `input` `label` `dialog` `select` `table` `badge` `skeleton` `switch` `textarea` `tabs` `dropdown-menu` `tooltip` `toast` (sonner).

## Sidebar layout pattern

`src/app/(app)/layout.tsx` — wraps admin pages with sidebar.

`src/components/shared/SidebarNav.tsx` — defines structure:

```ts
interface NavItemDef {
  href: string;
  labelKey: string;  // i18n key, NOT raw text
  icon: LucideIcon;
  roles?: UserRole[];
}

interface NavGroupDef {
  titleKey: string;
  items: readonly NavItemDef[];
}

export const NAV_GROUPS: readonly NavGroupDef[] = [
  { titleKey: 'overview', items: [...] },
  { titleKey: 'sales', items: [...] },
  { titleKey: 'management', items: [...] },
  { titleKey: 'system', items: [...] },
];
```

`Sidebar.tsx` and `MobileNav.tsx`:
```tsx
const t = useTranslations('nav');
// ...
<SidebarItem label={t(item.labelKey)} ... />
<h3>{t(group.titleKey)}</h3>
```

`SidebarItem.tsx` — receives `label` already translated.

## Storefront auth components

`StorefrontAuth.tsx`:
- `StorefrontAuthProvider` (client) — context, FB SDK loader
- `StorefrontLoginButton` — Login or logged-in display
- `useStorefrontAuth()` hook

`StorefrontAuthWrapper.tsx` (client wrapper) — receives `shopId` + `facebookAppId` from server layout, wraps children with provider.

## Form patterns

### ProductForm
- name, stockCode, saleCode, categoryId, description, images[], variants[]
- Image upload via `<ProductImageUpload>` → POSTs to `/api/products/[id]/images` (multipart `files`)
- Variants: array of `<VariantForm index={i} value={v} onChange={...} />`

### VariantForm — `src/components/inventory/VariantForm.tsx`
- SKU, ราคา (RM), ราคาต้นทุน (RM), จำนวน, แจ้งเตือนต่ำกว่า, attributes Key/Value pairs
- Currency `(RM)` is HARDCODED in label — see 08

### OrderForm
- Customer select / create
- Product → variant search + qty
- Address, shipping fee, payment method
- Total computed live (RM)

### PaymentSection — under OrderForm
- Method select (PROMPTPAY / BANK / CASH)
- Amount, date
- Slip URL
- Verify button (admin only)

## Real-time

- SSE for chat (`/api/chats/stream`), notifications (`/api/notifications/stream`), live comments (`/api/live/[id]/comments`)
- Socket.io setup in `src/server/socket/` (not used for end-user features yet)

## Conventions

- Client components: `'use client'` at top
- Server components by default (no directive)
- Page components are `default export`
- Forms use `useState` + manual validation OR `react-hook-form` + Zod (mixed — pick one when expanding)
- `toast` (sonner) for user feedback — `toast.success(t('saved'))`, `toast.error(...)`
- Loading: `<Skeleton>` placeholder; Empty: centered text from i18n
- Dialogs: shadcn `Dialog` with `DialogTrigger render={<Button />}` pattern

## Cross-references

- 02 (page → component map)
- 05 (auth components)
- 06 (storefront components)
- 08 (i18n + currency labels)
