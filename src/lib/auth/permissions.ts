import type { UserRole } from '@/generated/prisma';

/**
 * Maps URL path prefixes to allowed roles. First match wins.
 * Deny by default: unlisted paths require explicit permission.
 */
export const ROUTE_PERMISSIONS = [
  { prefix: '/settings/shop', roles: ['OWNER'] as UserRole[] },
  { prefix: '/settings/team', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/settings', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/inventory', roles: ['OWNER', 'MANAGER', 'WAREHOUSE'] as UserRole[] },
  { prefix: '/shipping', roles: ['OWNER', 'MANAGER', 'WAREHOUSE'] as UserRole[] },
  { prefix: '/orders', roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'] as UserRole[] },
  { prefix: '/customers', roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'] as UserRole[] },
  { prefix: '/chat', roles: ['OWNER', 'MANAGER', 'CHAT_SUPPORT'] as UserRole[] },
  { prefix: '/live-selling', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/analytics', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/dashboard', roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'] as UserRole[] },
  { prefix: '/reports', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/payments', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/storefront', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/exchange-rates', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/notifications', roles: ['OWNER', 'MANAGER', 'WAREHOUSE', 'CHAT_SUPPORT'] as UserRole[] },
  { prefix: '/activity', roles: ['OWNER', 'MANAGER'] as UserRole[] },
  { prefix: '/bulk', roles: ['OWNER', 'MANAGER'] as UserRole[] },
] as const;

export const PUBLIC_PATHS = ['/auth', '/api/auth', '/_next', '/favicon.ico', '/store', '/shop', '/unauthorized', '/privacy', '/terms', '/data-deletion'] as const;

/**
 * Pure function — no side effects, returns boolean.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Find allowed roles for a pathname. Returns null if no rule matches (deny by default).
 * Returns a NEW array — callers cannot mutate the source configuration.
 */
export function getAllowedRoles(pathname: string): UserRole[] | null {
  const match = ROUTE_PERMISSIONS.find(({ prefix }) => pathname.startsWith(prefix));
  return match ? [...match.roles] : null;
}

/**
 * Check if a role can access the given pathname.
 * Pure function — returns new object, never throws, never mutates.
 */
export function canAccess(
  pathname: string,
  role: UserRole,
): { allowed: boolean; reason: string } {
  if (isPublicPath(pathname)) return { allowed: true, reason: 'public_path' };

  const allowedRoles = getAllowedRoles(pathname);
  if (allowedRoles === null) return { allowed: false, reason: 'no_permission_rule' };
  if (allowedRoles.includes(role)) return { allowed: true, reason: 'role_permitted' };

  return {
    allowed: false,
    reason: `role_${role}_not_in_[${allowedRoles.join(',')}]`,
  };
}
