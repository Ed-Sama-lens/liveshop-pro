/**
 * Cross-file invariant tests asserting sale-component label maps stay
 * in sync with prisma/schema.prisma enums.
 *
 * If the Prisma schema gains a new BookingSource / BookingStatus
 * value, these tests force the corresponding label table in the
 * sale-component layer to be updated before merge — preventing the
 * "raw enum value leaks to the UI" UX bug.
 *
 * Each test reads the Prisma client's generated enum type at runtime
 * and asserts every member has a labeled chip.
 */
import { describe, it, expect } from 'vitest';
import { getBookingSourceLabel } from '@/components/sale/BookingSourceChip';
import { BookingSource, BookingStatus } from '@/generated/prisma';
import { SALE_BOOKING_STATUSES } from '@/lib/validation/sale.schemas';
import {
  CANCEL_TARGET_STATUSES,
  CREATE_BOOKING_STATUSES,
  CLIENT_SUPPLIED_BOOKING_SOURCES,
} from '@/lib/validation/booking.schemas';

describe('BookingSource enum ↔ chip label sync', () => {
  it('every BookingSource enum value has a labeled chip', () => {
    const enumValues = Object.values(BookingSource);
    expect(enumValues.length).toBeGreaterThan(0);
    for (const value of enumValues) {
      const label = getBookingSourceLabel(value);
      expect(label).toBeTruthy();
      // The fallback label is 'อื่น ๆ'. A real coverage gap shows up
      // here: if a new enum value lands and the chip map isn't
      // updated, this assertion fails.
      expect(label).not.toBe('อื่น ๆ');
    }
  });

  it('chip returns fallback for unknown source', () => {
    expect(getBookingSourceLabel('FUTURE_CHANNEL_NOT_IN_SCHEMA')).toBe('อื่น ๆ');
  });

  it('exactly 8 BookingSource enum values (matches schema 2026-05-19)', () => {
    expect(Object.values(BookingSource).length).toBe(8);
  });
});

describe('BookingStatus enum ↔ validation schema sync', () => {
  it('SALE_BOOKING_STATUSES query enum covers every BookingStatus value', () => {
    const enumValues = new Set(Object.values(BookingStatus));
    const schemaValues = new Set(SALE_BOOKING_STATUSES);
    for (const v of enumValues) {
      expect(schemaValues.has(v as (typeof SALE_BOOKING_STATUSES)[number])).toBe(true);
    }
  });

  it('SALE_BOOKING_STATUSES has no value missing from BookingStatus', () => {
    const enumValues = new Set<string>(Object.values(BookingStatus));
    for (const v of SALE_BOOKING_STATUSES) {
      expect(enumValues.has(v)).toBe(true);
    }
  });

  it('exactly 5 BookingStatus enum values (matches schema 2026-05-19)', () => {
    expect(Object.values(BookingStatus).length).toBe(5);
  });
});

describe('Client-supplied booking source allow-list (Q-17 invariant)', () => {
  it('exactly one allowed source: MANUAL', () => {
    expect(CLIENT_SUPPLIED_BOOKING_SOURCES).toEqual(['MANUAL']);
  });

  it('all other BookingSource enum values are NOT client-supplied', () => {
    const allowed = new Set<string>(CLIENT_SUPPLIED_BOOKING_SOURCES);
    const enumValues = Object.values(BookingSource);
    for (const v of enumValues) {
      if (v === 'MANUAL') continue;
      expect(allowed.has(v as string)).toBe(false);
    }
  });
});

describe('Cancel target statuses ↔ BookingStatus sync', () => {
  it('every CANCEL_TARGET_STATUS is a valid BookingStatus enum value', () => {
    const enumValues = new Set<string>(Object.values(BookingStatus));
    for (const v of CANCEL_TARGET_STATUSES) {
      expect(enumValues.has(v)).toBe(true);
    }
  });

  it('cancel targets are only CANCELLED + EXPIRED (terminal, not CONFIRMED/PENDING/CONVERTED)', () => {
    const cancelSet = new Set<string>(CANCEL_TARGET_STATUSES);
    expect(cancelSet.has('CANCELLED')).toBe(true);
    expect(cancelSet.has('EXPIRED')).toBe(true);
    expect(cancelSet.has('CONFIRMED')).toBe(false);
    expect(cancelSet.has('PENDING_REVIEW')).toBe(false);
    expect(cancelSet.has('CONVERTED_TO_ORDER')).toBe(false);
  });
});

describe('Create booking status allow-list', () => {
  it('exactly two client-supplied create statuses: PENDING_REVIEW + CONFIRMED', () => {
    expect(new Set(CREATE_BOOKING_STATUSES)).toEqual(
      new Set(['PENDING_REVIEW', 'CONFIRMED'])
    );
  });

  it('CONVERTED_TO_ORDER / CANCELLED / EXPIRED not client-supplied', () => {
    const allowed = new Set<string>(CREATE_BOOKING_STATUSES);
    expect(allowed.has('CONVERTED_TO_ORDER')).toBe(false);
    expect(allowed.has('CANCELLED')).toBe(false);
    expect(allowed.has('EXPIRED')).toBe(false);
  });
});
