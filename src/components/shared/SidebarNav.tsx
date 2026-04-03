import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Radio,
  MessageSquare,
  Package,
  Users,
  Truck,
  Settings,
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
        label: 'Live Selling',
        href: '/live',
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
    ],
  },
  {
    title: 'System',
    items: [
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
] as const;
