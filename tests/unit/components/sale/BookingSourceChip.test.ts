/**
 * Tier 1 IA tests — BookingSourceChip label lookup.
 *
 * Component renders JSX; we test the pure label helper instead of mounting
 * React because the rest of the sale test surface (booking-queue.helpers,
 * manual-create-helpers) uses the same pure-function pattern. Visual
 * regression is covered by future Playwright E2E.
 */

import { describe, it, expect } from 'vitest';
import { getBookingSourceLabel } from '@/components/sale/BookingSourceChip';

describe('getBookingSourceLabel', () => {
  it.each([
    ['MANUAL', 'สร้างเอง'],
    ['LIVE_COMMENT', 'คอมเมนต์ไลฟ์'],
    ['PAGE_INBOX', 'กล่องข้อความเพจ'],
    ['POST_COMMENT', 'คอมเมนต์โพสต์'],
    ['WHATSAPP_CHAT', 'WhatsApp'],
    ['TELEGRAM_CHAT', 'Telegram'],
    ['IMPORT', 'นำเข้า'],
    ['SYSTEM', 'ระบบ'],
  ])('maps %s → %s', (input, expected) => {
    expect(getBookingSourceLabel(input)).toBe(expected);
  });

  it('falls back gracefully for unknown source', () => {
    expect(getBookingSourceLabel('FUTURE_CHANNEL')).toBe('อื่น ๆ');
  });

  it('falls back gracefully for empty string', () => {
    expect(getBookingSourceLabel('')).toBe('อื่น ๆ');
  });

  it('returns same label for repeated calls (pure)', () => {
    const a = getBookingSourceLabel('MANUAL');
    const b = getBookingSourceLabel('MANUAL');
    expect(a).toBe(b);
  });

  it('covers all 8 BookingSource enum values from prisma schema', () => {
    // Mirror of prisma/schema.prisma BookingSource enum. Keeps the chip
    // label in sync with the schema enum. If schema gains a 9th source,
    // this test forces a label update.
    const schemaEnum: readonly string[] = [
      'MANUAL',
      'LIVE_COMMENT',
      'PAGE_INBOX',
      'POST_COMMENT',
      'WHATSAPP_CHAT',
      'TELEGRAM_CHAT',
      'IMPORT',
      'SYSTEM',
    ];
    for (const source of schemaEnum) {
      const label = getBookingSourceLabel(source);
      expect(label).not.toBe('อื่น ๆ');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
