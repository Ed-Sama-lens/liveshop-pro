import { describe, it, expect } from 'vitest';
import { isPublicPath, getAllowedRoles, canAccess } from '@/lib/auth/permissions';

describe('isPublicPath()', () => {
  it('returns true for /auth/sign-in', () => expect(isPublicPath('/auth/sign-in')).toBe(true));
  it('returns true for /api/auth/providers', () => expect(isPublicPath('/api/auth/providers')).toBe(true));
  it('returns true for /_next/static/chunk.js', () => expect(isPublicPath('/_next/static/chunk.js')).toBe(true));
  it('returns true for /favicon.ico', () => expect(isPublicPath('/favicon.ico')).toBe(true));
  it('returns true for /store/anything', () => expect(isPublicPath('/store/product-123')).toBe(true));
  it('returns false for /dashboard', () => expect(isPublicPath('/dashboard')).toBe(false));
  it('returns false for /orders/123', () => expect(isPublicPath('/orders/123')).toBe(false));
  it('returns false for /analytics', () => expect(isPublicPath('/analytics')).toBe(false));
  it('returns false for /settings', () => expect(isPublicPath('/settings')).toBe(false));
});

describe('getAllowedRoles()', () => {
  it('returns OWNER and MANAGER for /settings/team', () => {
    const roles = getAllowedRoles('/settings/team');
    expect(roles).toContain('OWNER');
    expect(roles).toContain('MANAGER');
    expect(roles).not.toContain('WAREHOUSE');
    expect(roles).not.toContain('CHAT_SUPPORT');
  });

  it('returns only OWNER for /settings/shop', () => {
    const roles = getAllowedRoles('/settings/shop');
    expect(roles).toContain('OWNER');
    expect(roles).not.toContain('MANAGER');
  });

  it('returns all 4 roles for /orders', () => {
    const roles = getAllowedRoles('/orders');
    expect(roles).toHaveLength(4);
    expect(roles).toContain('OWNER');
    expect(roles).toContain('MANAGER');
    expect(roles).toContain('WAREHOUSE');
    expect(roles).toContain('CHAT_SUPPORT');
  });

  it('returns null for unregistered path (no restriction)', () => {
    expect(getAllowedRoles('/some/unknown/path')).toBeNull();
  });

  it('returns a new array — modifying return does not affect source', () => {
    const roles = getAllowedRoles('/analytics');
    roles?.push('CHAT_SUPPORT' as never);
    const fresh = getAllowedRoles('/analytics');
    expect(fresh).not.toContain('CHAT_SUPPORT');
  });

  it('returns OWNER and MANAGER for /analytics', () => {
    const roles = getAllowedRoles('/analytics');
    expect(roles).toContain('OWNER');
    expect(roles).toContain('MANAGER');
    expect(roles).not.toContain('WAREHOUSE');
  });
});

describe('canAccess() — all role x route combinations', () => {
  // OWNER — full access
  it('OWNER can access /settings/shop', () => expect(canAccess('/settings/shop', 'OWNER').allowed).toBe(true));
  it('OWNER can access /settings/team', () => expect(canAccess('/settings/team', 'OWNER').allowed).toBe(true));
  it('OWNER can access /analytics', () => expect(canAccess('/analytics', 'OWNER').allowed).toBe(true));
  it('OWNER can access /live', () => expect(canAccess('/live', 'OWNER').allowed).toBe(true));
  it('OWNER can access /inventory', () => expect(canAccess('/inventory', 'OWNER').allowed).toBe(true));
  it('OWNER can access /chat', () => expect(canAccess('/chat', 'OWNER').allowed).toBe(true));
  it('OWNER can access /orders', () => expect(canAccess('/orders', 'OWNER').allowed).toBe(true));
  it('OWNER can access /customers', () => expect(canAccess('/customers', 'OWNER').allowed).toBe(true));
  it('OWNER can access /dashboard', () => expect(canAccess('/dashboard', 'OWNER').allowed).toBe(true));

  // MANAGER — no settings/shop
  it('MANAGER cannot access /settings/shop', () => expect(canAccess('/settings/shop', 'MANAGER').allowed).toBe(false));
  it('MANAGER can access /settings/team', () => expect(canAccess('/settings/team', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /analytics', () => expect(canAccess('/analytics', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /live', () => expect(canAccess('/live', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /inventory', () => expect(canAccess('/inventory', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /chat', () => expect(canAccess('/chat', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /orders', () => expect(canAccess('/orders', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /customers', () => expect(canAccess('/customers', 'MANAGER').allowed).toBe(true));
  it('MANAGER can access /dashboard', () => expect(canAccess('/dashboard', 'MANAGER').allowed).toBe(true));

  // WAREHOUSE — inventory and shipping only
  it('WAREHOUSE cannot access /analytics', () => expect(canAccess('/analytics', 'WAREHOUSE').allowed).toBe(false));
  it('WAREHOUSE cannot access /live', () => expect(canAccess('/live', 'WAREHOUSE').allowed).toBe(false));
  it('WAREHOUSE cannot access /chat', () => expect(canAccess('/chat', 'WAREHOUSE').allowed).toBe(false));
  it('WAREHOUSE cannot access /customers', () => expect(canAccess('/customers', 'WAREHOUSE').allowed).toBe(false));
  it('WAREHOUSE cannot access /settings', () => expect(canAccess('/settings', 'WAREHOUSE').allowed).toBe(false));
  it('WAREHOUSE can access /inventory', () => expect(canAccess('/inventory', 'WAREHOUSE').allowed).toBe(true));
  it('WAREHOUSE can access /shipping', () => expect(canAccess('/shipping', 'WAREHOUSE').allowed).toBe(true));
  it('WAREHOUSE can access /orders', () => expect(canAccess('/orders', 'WAREHOUSE').allowed).toBe(true));
  it('WAREHOUSE can access /dashboard', () => expect(canAccess('/dashboard', 'WAREHOUSE').allowed).toBe(true));

  // CHAT_SUPPORT — chat, orders, and customers only
  it('CHAT_SUPPORT cannot access /analytics', () => expect(canAccess('/analytics', 'CHAT_SUPPORT').allowed).toBe(false));
  it('CHAT_SUPPORT cannot access /live', () => expect(canAccess('/live', 'CHAT_SUPPORT').allowed).toBe(false));
  it('CHAT_SUPPORT cannot access /inventory', () => expect(canAccess('/inventory', 'CHAT_SUPPORT').allowed).toBe(false));
  it('CHAT_SUPPORT cannot access /shipping', () => expect(canAccess('/shipping', 'CHAT_SUPPORT').allowed).toBe(false));
  it('CHAT_SUPPORT cannot access /settings', () => expect(canAccess('/settings', 'CHAT_SUPPORT').allowed).toBe(false));
  it('CHAT_SUPPORT can access /chat', () => expect(canAccess('/chat', 'CHAT_SUPPORT').allowed).toBe(true));
  it('CHAT_SUPPORT can access /orders', () => expect(canAccess('/orders', 'CHAT_SUPPORT').allowed).toBe(true));
  it('CHAT_SUPPORT can access /customers', () => expect(canAccess('/customers', 'CHAT_SUPPORT').allowed).toBe(true));
  it('CHAT_SUPPORT can access /dashboard', () => expect(canAccess('/dashboard', 'CHAT_SUPPORT').allowed).toBe(true));

  // Public paths always allowed regardless of role
  it('public path always allowed regardless of role', () => {
    expect(canAccess('/auth/sign-in', 'WAREHOUSE').allowed).toBe(true);
    expect(canAccess('/auth/sign-in', 'CHAT_SUPPORT').allowed).toBe(true);
  });

  it('canAccess reason is public_path for /auth/sign-in', () => {
    expect(canAccess('/auth/sign-in', 'WAREHOUSE').reason).toBe('public_path');
  });

  it('canAccess reason contains role name on denial', () => {
    const result = canAccess('/analytics', 'WAREHOUSE');
    expect(result.reason).toContain('WAREHOUSE');
  });

  it('canAccess reason is role_permitted on allowed access', () => {
    const result = canAccess('/orders', 'OWNER');
    expect(result.reason).toBe('role_permitted');
  });

  it('canAccess reason is no_permission_rule for unknown paths', () => {
    const result = canAccess('/unknown/path', 'OWNER');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_permission_rule');
  });
});
