# 08 — i18n & Currency

## i18n — next-intl

Library: `next-intl@4.9.0`

Locales: `en` (default) `th` `zh`

### Routing — `src/i18n/routing.ts`

```ts
{
  locales: ['en', 'th', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'never',  // URLs never include /en /th /zh
}
```

### Locale resolution — `src/i18n/request.ts`

Reads `NEXT_LOCALE` cookie directly:

```ts
import { cookies } from 'next/headers';
const cookieStore = await cookies();
const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
const locale = cookieLocale && routing.locales.includes(cookieLocale)
  ? cookieLocale : routing.defaultLocale;
return {
  locale,
  messages: (await import(`../../messages/${locale}.json`)).default,
};
```

### Locale switcher — `src/components/shared/LanguageSwitcher.tsx`

```ts
function switchLocale(newLocale: string) {
  if (newLocale === locale) return;
  document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
  window.location.reload();  // full reload — server components re-render with new cookie
}
```

`router.refresh()` does NOT work — server components don't re-read the cookie. MUST use `window.location.reload()`.

### Translation files

`messages/en.json`, `messages/th.json`, `messages/zh.json`

Sidebar nav uses translation keys — `nav.overview` `nav.sales` `nav.management` `nav.system` for groups, `nav.dashboard` `nav.inventory` etc for items.

### Sidebar i18n pattern

`SidebarNav.tsx` — defines NAV_ITEMS with `labelKey` (NOT `label`).
`Sidebar.tsx` / `MobileNav.tsx` — call `useTranslations('nav')`, pass `t(item.labelKey)` as `label` prop.
`SidebarItem.tsx` — accepts `label` (already translated string).

## Currency — MYR (RM)

LiveShop Pro is for Malaysian market. Currency = MYR (Malaysian Ringgit), symbol = RM.

### Hardcoded MYR

`src/app/api/storefront/[shopId]/branding/route.ts`:

```ts
const defaultCurrency = 'MYR';
return NextResponse.json(ok({ ...branding, defaultCurrency }));
```

### Currency map — `src/lib/currency/constants.ts`

```ts
export const CURRENCY_SYMBOLS = {
  THB: '฿',
  MYR: 'RM',
  SGD: 'S$',
};

export const CURRENCY_NAMES = {
  THB: 'Thai Baht',
  MYR: 'Malaysian Ringgit',
  SGD: 'Singapore Dollar',
};

export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

### Helper — `src/components/storefront/CurrencySelector.tsx`

```ts
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as SupportedCurrency] ?? currency;
}
```

### Display fallback

In storefront `useState('RM')` — if branding API fails, default to RM.

### Where RM is displayed

- Storefront product cards, detail, cart, checkout, orders
- Admin dashboard, analytics, reports, payments, orders, customers
- Email templates (order confirm)
- Invoice HTML
- CSV exports — header `Price (RM)`, `Total (RM)`, etc.
- Inventory variant form — labels "ราคา (RM)" / "ราคาต้นทุน (RM)"

### Settings page — currency option

`src/app/(app)/settings/page.tsx` keeps THB option `'฿ THB — Thai Baht'` for selector but app currency is enforced MYR.

### ExchangeRate model

`ExchangeRate` Prisma model exists but used for ADMIN REFERENCE only. Not applied to product prices. Prices are fixed (per Boss memory).

## Common pitfalls

- **Locale switching shows 404**: `localePrefix: 'as-needed'` adds `/th/` segment but no `[locale]` route exists. Fix: use `'never'`.
- **Sidebar still in English after locale change**: hardcoded labels. Fix: use `labelKey` + `useTranslations`.
- **`router.refresh()` doesn't apply locale**: server components don't re-read cookie. Use `window.location.reload()`.
- **Mixed currency (RM + ฿)**: file missed in find-replace. Grep `฿` to find leftovers (skip `constants.ts` and settings dropdown).
- **Adding a new locale**: add to `routing.ts.locales` + create `messages/<locale>.json` + add option in `LanguageSwitcher`.
