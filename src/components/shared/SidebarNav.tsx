import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Radio,
  MessageSquare,
  Package,
  Users,
  Truck,
  CreditCard,
  Store,
  FileBarChart,
  Bell,
  Settings,
  Activity,
  ArrowRightLeft,
  Layers,
  SearchCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/generated/prisma';

export interface NavItemDef {
  readonly labelKey: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly roles: readonly UserRole[];
}

export interface NavGroupDef {
  readonly titleKey: string;
  readonly items: readonly NavItemDef[];
}

export const NAV_GROUPS: readonly NavGroupDef[] = [
  {
    titleKey: 'overview',
    items: [
      {
        labelKey: 'dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        labelKey: 'analytics',
        href: '/analytics',
        icon: BarChart3,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'reports',
        href: '/reports',
        icon: FileBarChart,
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
  {
    titleKey: 'sales',
    items: [
      {
        labelKey: 'orders',
        href: '/orders',
        icon: ShoppingCart,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        labelKey: 'orderByProduct',
        href: '/orders/search-by-product',
        icon: SearchCheck,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        labelKey: 'liveSelling',
        href: '/live-selling',
        icon: Radio,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'chat',
        href: '/chat',
        icon: MessageSquare,
        roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'],
      },
    ],
  },
  {
    titleKey: 'management',
    items: [
      {
        labelKey: 'inventory',
        href: '/inventory',
        icon: Package,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        labelKey: 'customers',
        href: '/customers',
        icon: Users,
        roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'],
      },
      {
        labelKey: 'shipping',
        href: '/shipping',
        icon: Truck,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        labelKey: 'payments',
        href: '/payments',
        icon: CreditCard,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'storefront',
        href: '/storefront',
        icon: Store,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'exchangeRates',
        href: '/exchange-rates',
        icon: ArrowRightLeft,
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
  {
    titleKey: 'system',
    items: [
      {
        labelKey: 'notifications',
        href: '/notifications',
        icon: Bell,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        labelKey: 'activityLog',
        href: '/activity',
        icon: Activity,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'bulkOperations',
        href: '/bulk',
        icon: Layers,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        labelKey: 'settings',
        href: '/settings',
        icon: Settings,
        roles: ['OWNER'],
      },
    ],
  },
] as const;
