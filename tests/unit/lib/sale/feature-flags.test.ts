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
});
