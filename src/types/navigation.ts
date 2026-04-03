import type { UserRole } from '@/generated/prisma';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly roles: readonly UserRole[];
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}
