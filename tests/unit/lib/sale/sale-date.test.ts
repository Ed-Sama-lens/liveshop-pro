import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHOP_TIMEZONE,
  formatSaleDate,
  todaySaleDate,
  parseSaleDate,
  isValidSaleDate,
} from '@/lib/sale/sale-date';

describe('sale-date helpers', () => {
  describe('DEFAULT_SHOP_TIMEZONE', () => {
    it('is Asia/Kuala_Lumpur per D-Date-2 verdict', () => {
      expect(DEFAULT_SHOP_TIMEZONE).toBe('Asia/Kuala_Lumpur');
    });
  });

  describe('formatSaleDate', () => {
    it('returns YYYY-MM-DD for a known UTC instant in Asia/Kuala_Lumpur', () => {
      // 2026-05-21T08:00:00Z = 2026-05-21 16:00 in Kuala Lumpur (UTC+8)
      const utc = new Date(Date.UTC(2026, 4, 21, 8, 0, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2026-05-21');
    });

    it('rolls to next day when UTC is late + tz is ahead', () => {
      // 2026-05-21T17:30:00Z = 2026-05-22 01:30 in Kuala Lumpur
      const utc = new Date(Date.UTC(2026, 4, 21, 17, 30, 0));
      expect(formatSaleDate(utc, 'Asia/Kuala_Lumpur')).toBe('2026-05-22');
    });

    it('handles UTC timezone correctly', () => {
      const utc = new Date(Date.UTC(2026, 4, 21, 12, 0, 0));
      expect(formatSaleDate(utc, 'UTC')).toBe('2026-05-21');
    });

    it('handles Asia/Bangkok timezone', () => {
      // 2026-05-21T17:00:00Z = 2026-05-22 00:00 in Bangkok (UTC+7)
      const utc = new Date(Date.UTC(2026, 4, 21, 17, 0, 0));
      expect(formatSaleDate(utc, 'Asia/Bangkok')).toBe('2026-05-22');
    });
  });

  describe('todaySaleDate', () => {
    it('returns a string in YYYY-MM-DD format', () => {
      const out = todaySaleDate('Asia/Kuala_Lumpur');
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('uses default timezone when none provided', () => {
      const out = todaySaleDate();
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseSaleDate', () => {
    it('parses 2026-05-21 to UTC midnight Date', () => {
      const d = parseSaleDate('2026-05-21');
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(4); // May = 4 (zero-indexed)
      expect(d.getUTCDate()).toBe(21);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    });

    it('parses leap-year Feb 29', () => {
      const d = parseSaleDate('2028-02-29');
      expect(d.getUTCDate()).toBe(29);
    });

    it('throws on missing leading zero (strict regex)', () => {
      expect(() => parseSaleDate('2026-5-21')).toThrow(/YYYY-MM-DD/);
    });

    it('throws on out-of-range month', () => {
      expect(() => parseSaleDate('2026-13-01')).toThrow(/month out of range/);
    });

    it('throws on out-of-range day', () => {
      expect(() => parseSaleDate('2026-05-32')).toThrow(/day out of range/);
    });

    it('throws on Feb 30 (invalid calendar date)', () => {
      expect(() => parseSaleDate('2026-02-30')).toThrow(/not a valid calendar date/);
    });

    it('throws on non-string input', () => {
      // @ts-expect-error — runtime probe
      expect(() => parseSaleDate(20260521)).toThrow(/must be a string/);
    });

    it('throws on empty string', () => {
      expect(() => parseSaleDate('')).toThrow(/YYYY-MM-DD/);
    });
  });

  describe('isValidSaleDate', () => {
    it('returns true for valid date', () => {
      expect(isValidSaleDate('2026-05-21')).toBe(true);
    });

    it('returns false for invalid format', () => {
      expect(isValidSaleDate('2026/05/21')).toBe(false);
    });

    it('returns false for invalid calendar date', () => {
      expect(isValidSaleDate('2026-02-30')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidSaleDate('')).toBe(false);
    });
  });
});
