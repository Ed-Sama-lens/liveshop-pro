import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHOP_TIMEZONE,
  formatSaleDate,
  todaySaleDate,
  parseSaleDate,
  isValidSaleDate,
} from '@/lib/sale/sale-date';

/**
 * Sale Date helper invariants — Tier 3.9-W6 (2026-05-22).
 *
 * Locks the date-first model assumptions Boss + ChatGPT approved in
 * PR #46 (Sale Date addendum) + PR #47 (migration deploy):
 *
 * 1. DEFAULT_SHOP_TIMEZONE = 'Asia/Kuala_Lumpur' (Nazha Hatyai)
 * 2. formatSaleDate returns YYYY-MM-DD in target tz
 * 3. parseSaleDate is strict (4-digit year, 2-digit month/day, dashes)
 * 4. parseSaleDate rejects out-of-range months/days + invalid calendar
 *    dates (Feb 30)
 * 5. Roundtrip: parse → format = identity within UTC
 *
 * These tests are referenced by Sale-Date-aware route + repo tests
 * (broadcast-products / quick-product-codes / bookings) which depend
 * on this helper's behavior being stable.
 */

describe('sale-date helper invariants — Tier 3.9-W6', () => {
  describe('DEFAULT_SHOP_TIMEZONE', () => {
    it('is Asia/Kuala_Lumpur (Nazha Hatyai)', () => {
      expect(DEFAULT_SHOP_TIMEZONE).toBe('Asia/Kuala_Lumpur');
    });
  });

  describe('formatSaleDate', () => {
    it('formats noon UTC as today in Asia/Kuala_Lumpur', () => {
      // 2026-05-22T12:00:00Z = 2026-05-22 20:00 in Kuala Lumpur
      const utc = new Date(Date.UTC(2026, 4, 22, 12, 0, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2026-05-22');
    });

    it('rolls forward when UTC late + tz +8', () => {
      // 2026-05-22T17:30:00Z = 2026-05-23 01:30 in Kuala Lumpur
      const utc = new Date(Date.UTC(2026, 4, 22, 17, 30, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2026-05-23');
    });

    it('rolls backward when UTC early + tz +8', () => {
      // 2026-05-22T00:30:00Z = 2026-05-22 08:30 in Kuala Lumpur
      const utc = new Date(Date.UTC(2026, 4, 22, 0, 30, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2026-05-22');
    });

    it('handles UTC tz unchanged', () => {
      const utc = new Date(Date.UTC(2026, 11, 31, 12, 0, 0));
      expect(formatSaleDate(utc, 'UTC')).toBe('2026-12-31');
    });

    it('handles year boundary correctly', () => {
      // 2026-12-31T20:00:00Z = 2027-01-01 04:00 in Kuala Lumpur
      const utc = new Date(Date.UTC(2026, 11, 31, 20, 0, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2027-01-01');
    });
  });

  describe('todaySaleDate', () => {
    it('returns YYYY-MM-DD format', () => {
      expect(todaySaleDate('Asia/Kuala_Lumpur')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('uses DEFAULT_SHOP_TIMEZONE when omitted', () => {
      const explicit = todaySaleDate(DEFAULT_SHOP_TIMEZONE);
      const defaulted = todaySaleDate();
      expect(defaulted).toBe(explicit);
    });
  });

  describe('parseSaleDate — strict format', () => {
    it('accepts canonical YYYY-MM-DD', () => {
      const d = parseSaleDate('2026-05-22');
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(4);
      expect(d.getUTCDate()).toBe(22);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
      expect(d.getUTCMilliseconds()).toBe(0);
    });

    it('rejects single-digit month', () => {
      expect(() => parseSaleDate('2026-5-22')).toThrow(/YYYY-MM-DD/);
    });

    it('rejects single-digit day', () => {
      expect(() => parseSaleDate('2026-05-2')).toThrow(/YYYY-MM-DD/);
    });

    it('rejects slashes', () => {
      expect(() => parseSaleDate('2026/05/22')).toThrow(/YYYY-MM-DD/);
    });

    it('rejects dots', () => {
      expect(() => parseSaleDate('2026.05.22')).toThrow(/YYYY-MM-DD/);
    });

    it('rejects month 0', () => {
      expect(() => parseSaleDate('2026-00-15')).toThrow(/month out of range/);
    });

    it('rejects month 13', () => {
      expect(() => parseSaleDate('2026-13-15')).toThrow(/month out of range/);
    });

    it('rejects day 0', () => {
      expect(() => parseSaleDate('2026-05-00')).toThrow(/day out of range/);
    });

    it('rejects day 32', () => {
      expect(() => parseSaleDate('2026-05-32')).toThrow(/day out of range/);
    });

    it('rejects Feb 30 (not a real calendar date)', () => {
      expect(() => parseSaleDate('2026-02-30')).toThrow(/not a valid calendar date/);
    });

    it('rejects Feb 29 in non-leap year', () => {
      expect(() => parseSaleDate('2027-02-29')).toThrow(/not a valid calendar date/);
    });

    it('accepts Feb 29 in leap year', () => {
      const d = parseSaleDate('2028-02-29');
      expect(d.getUTCDate()).toBe(29);
    });

    it('rejects empty string', () => {
      expect(() => parseSaleDate('')).toThrow();
    });

    it('rejects non-string', () => {
      // @ts-expect-error — runtime probe
      expect(() => parseSaleDate(20260522)).toThrow();
    });
  });

  describe('roundtrip', () => {
    it('parse → format roundtrip preserves YYYY-MM-DD value when formatted in UTC', () => {
      const inputs = ['2026-01-01', '2026-12-31', '2028-02-29', '2030-07-15'];
      for (const iso of inputs) {
        const parsed = parseSaleDate(iso);
        const reformatted = formatSaleDate(parsed, 'UTC');
        expect(reformatted).toBe(iso);
      }
    });
  });

  describe('isValidSaleDate boundary', () => {
    it('accepts all roundtrip-valid dates', () => {
      expect(isValidSaleDate('2026-01-01')).toBe(true);
      expect(isValidSaleDate('2026-12-31')).toBe(true);
      expect(isValidSaleDate('2028-02-29')).toBe(true);
    });

    it('rejects all malformed inputs', () => {
      expect(isValidSaleDate('')).toBe(false);
      expect(isValidSaleDate('2026/05/22')).toBe(false);
      expect(isValidSaleDate('2026-13-01')).toBe(false);
      expect(isValidSaleDate('2026-02-30')).toBe(false);
      expect(isValidSaleDate('2027-02-29')).toBe(false);
    });
  });
});
