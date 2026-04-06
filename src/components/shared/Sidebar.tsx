'use client';

import { useTranslations } from 'next-intl';
import { NAV_GROUPS } from './SidebarNav';
import { SidebarItem } from './SidebarItem';
import type { UserRole } from '@/generated/prisma';

interface SidebarProps {
  readonly userRole: UserRole;
}

export function Sidebar({ userRole }: SidebarProps) {
  const t = useTranslations('nav');

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <h1 className="text-lg font-bold">LiveShop Pro</h1>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            item.roles.includes(userRole)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.titleKey}>
              <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(group.titleKey)}
              </h2>
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <SidebarItem key={item.href} item={item} label={t(item.labelKey)} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
