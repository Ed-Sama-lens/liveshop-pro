import { auth } from './auth';
import { AuthError, ForbiddenError } from '@/lib/errors';
import type { SessionUser, UserRole } from './types';

/**
 * Get current session or null. Pure read — no side effects.
 */
export async function getSession(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require authentication. Throws AuthError if not signed in.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new AuthError('You must be signed in to access this resource');
  }
  return user;
}

/**
 * Require that the user is a member of the given shop.
 * Throws ForbiddenError if the user's shopId doesn't match.
 */
export async function requireShopMember(shopId: string): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.shopId !== shopId) {
    throw new ForbiddenError('You are not a member of this shop');
  }
  return user;
}

/**
 * Require a specific role. Throws ForbiddenError if role doesn't match.
 */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Role ${user.role} is not authorized for this action`);
  }
  return user;
}

/**
 * Pure function — check if user has one of the specified roles.
 */
export function hasRole(user: SessionUser, ...roles: UserRole[]): boolean {
  return roles.includes(user.role);
}
