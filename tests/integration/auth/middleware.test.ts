import { describe, it, expect } from 'vitest';
import { isPublicPath, canAccess } from '@/lib/auth/permissions';

describe('Middleware permission logic — integration', () => {
  it('all public paths bypass auth', () => {
    const publicPaths = ['/auth/sign-in', '/auth/error', '/api/auth/providers', '/_next/static/abc.js'];
    for (const path of publicPaths) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it('all protected paths are not public', () => {
    const protectedPaths = ['/dashboard', '/orders', '/inventory', '/analytics', '/chat', '/settings'];
    for (const path of protectedPaths) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it('OWNER has full access across all route groups', () => {
    const paths = [
      '/dashboard',
      '/orders',
      '/inventory',
      '/analytics',
      '/chat',
      '/customers',
      '/settings',
      '/settings/team',
      '/settings/shop',
      '/live',
      '/shipping',
    ];
    for (const path of paths) {
      expect(canAccess(path, 'OWNER').allowed).toBe(true);
    }
  });

  it('CHAT_SUPPORT is blocked from warehouse and owner routes', () => {
    const blockedPaths = ['/inventory', '/analytics', '/live', '/shipping', '/settings'];
    for (const path of blockedPaths) {
      expect(canAccess(path, 'CHAT_SUPPORT').allowed).toBe(false);
    }
  });

  it('WAREHOUSE is blocked from customer-facing and admin routes', () => {
    const blockedPaths = ['/chat', '/customers', '/analytics', '/live', '/settings'];
    for (const path of blockedPaths) {
      expect(canAccess(path, 'WAREHOUSE').allowed).toBe(false);
    }
  });

  it('WAREHOUSE can access warehouse-specific routes', () => {
    const allowedPaths = ['/inventory', '/shipping', '/orders', '/dashboard'];
    for (const path of allowedPaths) {
      expect(canAccess(path, 'WAREHOUSE').allowed).toBe(true);
    }
  });

  it('CHAT_SUPPORT can access customer-facing routes', () => {
    const allowedPaths = ['/chat', '/orders', '/customers', '/dashboard'];
    for (const path of allowedPaths) {
      expect(canAccess(path, 'CHAT_SUPPORT').allowed).toBe(true);
    }
  });

  it('canAccess returns allowed: true with public_path reason for public routes', () => {
    const result = canAccess('/auth/sign-in', 'WAREHOUSE');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('public_path');
  });

  it('canAccess returns allowed: false with no_permission_rule for unknown paths', () => {
    const result = canAccess('/unknown/path', 'OWNER');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_permission_rule');
  });
});
