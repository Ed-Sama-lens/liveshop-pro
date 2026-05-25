/**
 * Tests for omnichannel booking feature flags (PR 2).
 *
 * Each flag must:
 * - default to false when env var unset
 * - return true only when env var is exactly the string "true"
 * - reject other truthy-looking values (1, yes, on, TRUE) — strict
 *   string match keeps misconfiguration safe
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  allowEvergreenBroadcastProduct,
  allowNonLiveBooking,
  allowBookingIdsOnlyConversion,
  isSaleLayoutV2Enabled,
} from '@/lib/sale/feature-flags';

describe('feature-flags', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('allowEvergreenBroadcastProduct', () => {
    it('defaults to false when env unset', () => {
      expect(allowEvergreenBroadcastProduct()).toBe(false);
    });

    it('returns true when set to "true"', () => {
      vi.stubEnv('ALLOW_EVERGREEN_BROADCAST_PRODUCT', 'true');
      expect(allowEvergreenBroadcastProduct()).toBe(true);
    });

    it('returns false when set to "false"', () => {
      vi.stubEnv('ALLOW_EVERGREEN_BROADCAST_PRODUCT', 'false');
      expect(allowEvergreenBroadcastProduct()).toBe(false);
    });

    it('returns false for non-"true" truthy-looking values (safety)', () => {
      const values = ['1', 'yes', 'on', 'TRUE', 'True', 'enabled', ''];
      for (const v of values) {
        vi.stubEnv('ALLOW_EVERGREEN_BROADCAST_PRODUCT', v);
        expect(allowEvergreenBroadcastProduct()).toBe(false);
      }
    });
  });

  describe('allowNonLiveBooking', () => {
    it('defaults to false when env unset', () => {
      expect(allowNonLiveBooking()).toBe(false);
    });

    it('returns true when set to "true"', () => {
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', 'true');
      expect(allowNonLiveBooking()).toBe(true);
    });

    it('returns false when set to "false"', () => {
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', 'false');
      expect(allowNonLiveBooking()).toBe(false);
    });

    it('returns false for misconfigured values', () => {
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', '1');
      expect(allowNonLiveBooking()).toBe(false);
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', 'YES');
      expect(allowNonLiveBooking()).toBe(false);
    });
  });

  describe('allowBookingIdsOnlyConversion', () => {
    it('defaults to false when env unset', () => {
      expect(allowBookingIdsOnlyConversion()).toBe(false);
    });

    it('returns true when set to "true"', () => {
      vi.stubEnv('ALLOW_BOOKINGIDS_ONLY_CONVERSION', 'true');
      expect(allowBookingIdsOnlyConversion()).toBe(true);
    });

    it('returns false when set to "false"', () => {
      vi.stubEnv('ALLOW_BOOKINGIDS_ONLY_CONVERSION', 'false');
      expect(allowBookingIdsOnlyConversion()).toBe(false);
    });

    it('flags are independent', () => {
      vi.stubEnv('ALLOW_EVERGREEN_BROADCAST_PRODUCT', 'true');
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', 'false');
      vi.stubEnv('ALLOW_BOOKINGIDS_ONLY_CONVERSION', 'true');
      expect(allowEvergreenBroadcastProduct()).toBe(true);
      expect(allowNonLiveBooking()).toBe(false);
      expect(allowBookingIdsOnlyConversion()).toBe(true);
    });
  });

  describe('isSaleLayoutV2Enabled — V Rich Stage 3.10-C WIRE-1', () => {
    it('defaults to false when env unset', () => {
      expect(isSaleLayoutV2Enabled()).toBe(false);
    });

    it('returns false when env set to empty string', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', '');
      expect(isSaleLayoutV2Enabled()).toBe(false);
    });

    it('returns true when set to "true"', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'true');
      expect(isSaleLayoutV2Enabled()).toBe(true);
    });

    it('returns true when set to "1" (extended truthy convention)', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', '1');
      expect(isSaleLayoutV2Enabled()).toBe(true);
    });

    it('returns false when set to "false"', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'false');
      expect(isSaleLayoutV2Enabled()).toBe(false);
    });

    it('returns false when set to "0"', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', '0');
      expect(isSaleLayoutV2Enabled()).toBe(false);
    });

    it('returns false for case variants (case-sensitive — "TRUE" rejected)', () => {
      const values = ['TRUE', 'True', 'tRuE', 'YES', 'on', 'enabled', 'yes', 'On'];
      for (const v of values) {
        vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', v);
        expect(isSaleLayoutV2Enabled()).toBe(false);
      }
    });

    it('returns false for whitespace / leading-trailing-space variants', () => {
      const values = [' true', 'true ', ' 1', '1 ', '\ttrue'];
      for (const v of values) {
        vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', v);
        expect(isSaleLayoutV2Enabled()).toBe(false);
      }
    });

    it('returns false for unrelated truthy-looking strings', () => {
      const values = ['truthy', 'enable', '2', '-1', 'undefined', 'null'];
      for (const v of values) {
        vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', v);
        expect(isSaleLayoutV2Enabled()).toBe(false);
      }
    });

    it('never throws on any input', () => {
      const values = ['', 'true', '1', 'false', '0', 'random', '   '];
      for (const v of values) {
        vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', v);
        expect(() => isSaleLayoutV2Enabled()).not.toThrow();
      }
    });

    it('independent of legacy server-only flags', () => {
      vi.stubEnv('ALLOW_EVERGREEN_BROADCAST_PRODUCT', 'true');
      vi.stubEnv('ALLOW_NON_LIVE_BOOKING', 'true');
      vi.stubEnv('ALLOW_BOOKINGIDS_ONLY_CONVERSION', 'true');
      // No NEXT_PUBLIC_SALE_LAYOUT_V2 stub — should still default false
      expect(isSaleLayoutV2Enabled()).toBe(false);
    });

    it('flipping does not affect legacy flags', () => {
      vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'true');
      // Legacy flags untouched should remain default false
      expect(allowEvergreenBroadcastProduct()).toBe(false);
      expect(allowNonLiveBooking()).toBe(false);
      expect(allowBookingIdsOnlyConversion()).toBe(false);
    });
  });
});
