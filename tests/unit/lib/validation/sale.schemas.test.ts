/**
 * Unit tests for /api/sale/* validation schemas.
 *
 * Covers the four schemas exported from src/lib/validation/sale.schemas.ts:
 *   - createOrderFromBookingsBodySchema (V1 + V2 dispatch + cap)
 *   - saleLiveSessionsQuerySchema
 *   - saleBookingsQuerySchema
 *   - saleCustomerSearchQuerySchema
 *
 * Sale schemas back /api/sale/* routes that the Tier 1+ workspace uses.
 * Until this PR there was no per-schema test file (existing
 * tests/unit/lib/validation covers broadcast-product / order / payment
 * etc but not these four). Adding coverage hardens the route validation
 * surface that the new tests in PR #22 mock at the repository layer.
 */
import { describe, it, expect } from 'vitest';
import {
  createOrderFromBookingsBodySchema,
  saleLiveSessionsQuerySchema,
  saleBookingsQuerySchema,
  saleCustomerSearchQuerySchema,
} from '@/lib/validation/sale.schemas';

// ─── createOrderFromBookingsBodySchema ───────────────────────────────────

describe('createOrderFromBookingsBodySchema', () => {
  describe('V2 (bookingIds only) — dispatch path', () => {
    it('accepts bookingIds with no liveSessionId/customerId', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        bookingIds: ['cm-booking-1'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts up to 100 bookingIds', () => {
      const ids = Array.from({ length: 100 }, (_, i) => `cm-bk-${i}`);
      const result = createOrderFromBookingsBodySchema.safeParse({
        bookingIds: ids,
      });
      expect(result.success).toBe(true);
    });

    it('rejects 101 bookingIds (cap)', () => {
      const ids = Array.from({ length: 101 }, (_, i) => `cm-bk-${i}`);
      const result = createOrderFromBookingsBodySchema.safeParse({
        bookingIds: ids,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty bookingIds array', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        bookingIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty string bookingId', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        bookingIds: [''],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('V1 (liveSessionId + customerId + bookingIds) — legacy path', () => {
    it('accepts the full legacy body', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        liveSessionId: 'live-1',
        customerId: 'cust-1',
        bookingIds: ['cm-bk-1'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty liveSessionId when provided', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        liveSessionId: '',
        customerId: 'cust-1',
        bookingIds: ['cm-bk-1'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty customerId when provided', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        liveSessionId: 'live-1',
        customerId: '',
        bookingIds: ['cm-bk-1'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('refine() — V1/V2 mutual-exclusion contract', () => {
    it('rejects liveSessionId alone (must pair with customerId or omit both)', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        liveSessionId: 'live-1',
        bookingIds: ['cm-bk-1'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects customerId alone (must pair with liveSessionId or omit both)', () => {
      const result = createOrderFromBookingsBodySchema.safeParse({
        customerId: 'cust-1',
        bookingIds: ['cm-bk-1'],
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── saleLiveSessionsQuerySchema ─────────────────────────────────────────

describe('saleLiveSessionsQuerySchema', () => {
  it('uses defaults when query is empty', () => {
    const result = saleLiveSessionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.status).toBeUndefined();
    }
  });

  it('coerces string page/limit (querystring origin)', () => {
    const result = saleLiveSessionsQuerySchema.safeParse({
      page: '3',
      limit: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects page < 1', () => {
    const result = saleLiveSessionsQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit > 100', () => {
    const result = saleLiveSessionsQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('accepts status SCHEDULED/LIVE/ENDED', () => {
    for (const status of ['SCHEDULED', 'LIVE', 'ENDED'] as const) {
      const result = saleLiveSessionsQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    const result = saleLiveSessionsQuerySchema.safeParse({ status: 'CANCELLED' });
    expect(result.success).toBe(false);
  });
});

// ─── saleBookingsQuerySchema ─────────────────────────────────────────────

describe('saleBookingsQuerySchema', () => {
  it('requires liveSessionId', () => {
    const result = saleBookingsQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimum required liveSessionId', () => {
    const result = saleBookingsQuerySchema.safeParse({ liveSessionId: 'live-1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects empty liveSessionId', () => {
    const result = saleBookingsQuerySchema.safeParse({ liveSessionId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects liveSessionId > 128 chars', () => {
    const result = saleBookingsQuerySchema.safeParse({
      liveSessionId: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all 5 BookingStatus enum values', () => {
    for (const status of [
      'PENDING_REVIEW',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'CONVERTED_TO_ORDER',
    ] as const) {
      const result = saleBookingsQuerySchema.safeParse({
        liveSessionId: 'live-1',
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown booking status', () => {
    const result = saleBookingsQuerySchema.safeParse({
      liveSessionId: 'live-1',
      status: 'PACKED',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty customerId', () => {
    const result = saleBookingsQuerySchema.safeParse({
      liveSessionId: 'live-1',
      customerId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects customerId > 128 chars', () => {
    const result = saleBookingsQuerySchema.safeParse({
      liveSessionId: 'live-1',
      customerId: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('caps limit at 100', () => {
    const result = saleBookingsQuerySchema.safeParse({
      liveSessionId: 'live-1',
      limit: '101',
    });
    expect(result.success).toBe(false);
  });
});

// ─── saleCustomerSearchQuerySchema ───────────────────────────────────────

describe('saleCustomerSearchQuerySchema', () => {
  it('requires q', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects q < 2 chars', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({ q: 'a' });
    expect(result.success).toBe(false);
  });

  it('accepts q of exactly 2 chars', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({ q: 'ab' });
    expect(result.success).toBe(true);
  });

  it('trims q before validation', () => {
    // '   ab   ' trims to 'ab' (2 chars) → pass
    const result = saleCustomerSearchQuerySchema.safeParse({ q: '   ab   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('ab');
    }
  });

  it('rejects trimmed q < 2 chars', () => {
    // '   a   ' trims to 'a' (1 char) → fail
    const result = saleCustomerSearchQuerySchema.safeParse({ q: '   a   ' });
    expect(result.success).toBe(false);
  });

  it('rejects q > 128 chars', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({
      q: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('caps limit at 20 (smaller than other sale schemas)', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({
      q: 'test',
      limit: '21',
    });
    expect(result.success).toBe(false);
  });

  it('defaults limit to 20 when omitted', () => {
    const result = saleCustomerSearchQuerySchema.safeParse({ q: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });
});
