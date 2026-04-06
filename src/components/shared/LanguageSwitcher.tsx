'use client';

import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  th: 'ไทย',
  zh: '中文',
};

/**
 * Cookie-based locale switcher.
 * Sets NEXT_LOCALE cookie then does full page reload to apply server-side.
 */
export function LanguageSwitcher() {
  const locale = useLocale();

  function switchLocale(newLocale: string) {
    if (newLocale === locale) return;
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Switch language" />}
      >
        <Globe className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(LOCALE_LABELS).map(([code, label]) => (
          <DropdownMenuItem
            key={code}
            onClick={() => switchLocale(code)}
            className={locale === code ? 'font-bold' : ''}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
