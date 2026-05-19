/**
 * Unit tests for SidebarNav navigation data.
 *
 * Tier 1.5 (PR #11) collapsed the previous two sales entries
 * (`liveSelling` → `/live-selling` + `liveSale` → `/sale`) into a
 * single unified workspace entry pointing at `/sale`. This file
 * asserts that policy at the data layer so an accidental
 * "while I'm here" edit re-adding a /live-selling sidebar link is
 * caught before merge.
 *
 * Also asserts the role gates on the sales entry stay consistent with
 * the route handlers (OWNER / MANAGER / CHAT_SUPPORT can see it).
 */
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS } from '@/components/shared/SidebarNav';

function allItems() {
  return NAV_GROUPS.flatMap((g) => g.items);
}

describe('SidebarNav NAV_GROUPS', () => {
  it('exports at least one group', () => {
    expect(NAV_GROUPS.length).toBeGreaterThan(0);
  });

  it('has exactly one entry pointing at /sale (unified workspace, Tier 1.5)', () => {
    const items = allItems().filter((i) => i.href === '/sale');
    expect(items.length).toBe(1);
  });

  it('uses labelKey "liveSale" on the /sale entry', () => {
    const item = allItems().find((i) => i.href === '/sale');
    expect(item).toBeDefined();
    expect(item?.labelKey).toBe('liveSale');
  });

  it('does NOT expose /live-selling in any sidebar entry (Tier 1.5 policy)', () => {
    const matches = allItems().filter((i) => i.href === '/live-selling');
    expect(matches.length).toBe(0);
  });

  it('does NOT expose nested /live-selling/* in any sidebar entry', () => {
    const matches = allItems().filter((i) => i.href.startsWith('/live-selling/'));
    expect(matches.length).toBe(0);
  });

  it('grants /sale to OWNER + MANAGER + CHAT_SUPPORT (matches API RBAC)', () => {
    const item = allItems().find((i) => i.href === '/sale');
    expect(item).toBeDefined();
    const roles = new Set(item?.roles ?? []);
    expect(roles.has('OWNER')).toBe(true);
    expect(roles.has('MANAGER')).toBe(true);
    expect(roles.has('CHAT_SUPPORT')).toBe(true);
  });

  it('does NOT grant /sale to WAREHOUSE or CUSTOMER (matches API RBAC)', () => {
    const item = allItems().find((i) => i.href === '/sale');
    expect(item).toBeDefined();
    const roles = new Set(item?.roles ?? []);
    expect(roles.has('WAREHOUSE')).toBe(false);
    expect(roles.has('CUSTOMER')).toBe(false);
  });

  it('every nav item has a non-empty href starting with /', () => {
    for (const item of allItems()) {
      expect(item.href.length).toBeGreaterThan(0);
      expect(item.href.startsWith('/')).toBe(true);
    }
  });

  it('every nav item has a non-empty labelKey', () => {
    for (const item of allItems()) {
      expect(item.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('every nav item has at least one role gate', () => {
    for (const item of allItems()) {
      expect(item.roles.length).toBeGreaterThan(0);
    }
  });

  it('every group has a non-empty titleKey + at least one item', () => {
    for (const group of NAV_GROUPS) {
      expect(group.titleKey.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate href across all groups', () => {
    const hrefs = allItems().map((i) => i.href);
    const seen = new Set(hrefs);
    expect(seen.size).toBe(hrefs.length);
  });
});
