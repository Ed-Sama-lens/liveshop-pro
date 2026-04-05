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
import type { NavGroup } from '@/types/navigation';

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        label: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
  {
    title: 'Sales',
    items: [
      {
        label: 'Orders',
        href: '/orders',
        icon: ShoppingCart,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        label: 'Order by Product',
        href: '/orders/search-by-product',
        icon: SearchCheck,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        label: 'Live Selling',
        href: '/live-selling',
        icon: Radio,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Chat',
        href: '/chat',
        icon: MessageSquare,
        roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'],
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        label: 'Inventory',
        href: '/inventory',
        icon: Package,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        label: 'Customers',
        href: '/customers',
        icon: Users,
        roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'],
      },
      {
        label: 'Shipping',
        href: '/shipping',
        icon: Truck,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE'],
      },
      {
        label: 'Payments',
        href: '/payments',
        icon: CreditCard,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Storefront',
        href: '/storefront',
        icon: Store,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Exchange Rates',
        href: '/exchange-rates',
        icon: ArrowRightLeft,
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        label: 'Notifications',
        href: '/notifications',
        icon: Bell,
        roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'],
      },
      {
        label: 'Activity Log',
        href: '/activity',
        icon: Activity,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Bulk Operations',
        href: '/bulk',
        icon: Layers,
        roles: ['OWNER', 'MANAGER'],
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        roles: ['OWNER'],
      },
    ],
  },
] as const;
