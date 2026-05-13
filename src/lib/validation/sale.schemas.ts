import { z } from 'zod';

/**
 * Validation schemas for /api/sale/* routes.
 *
 * Companion to existing per-domain schema files in `src/lib/validation/`.
 *
 * See:
 * - docs/superpowers/2026-04-06-sale-mvp-dissent.md (Boss decisions)
 * - docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md (locked design)
 * - src/server/repositories/booking.repository.ts (convertToOrder repo entry)
 */

// ─── POST /api/sale/orders/from-bookings ──────────────────────────────────

/**
 * Maximum number of bookings the route accepts in a single conversion.
 * Practical Phase 1 cap; admin UIs should batch larger sets across calls.
 */
const MAX_BOOKINGS_PER_CONVERSION = 100;

export const createOrderFromBookingsBodySchema = z.object({
  liveSessionId: z.string().min(1, 'liveSessionId is required'),
  customerId: z.string().min(1, 'customerId is required'),
  bookingIds: z
    .array(z.string().min(1, 'bookingId must be non-empty'))
    .min(1, 'bookingIds must contain at least one booking ID')
    .max(
      MAX_BOOKINGS_PER_CONVERSION,
      `bookingIds may contain at most ${MAX_BOOKINGS_PER_CONVERSION} entries`
    ),
});

export type CreateOrderFromBookingsBody = z.infer<typeof createOrderFromBookingsBodySchema>;

// ─── GET /api/sale/live-sessions (Commit 2P) ──────────────────────────────

export const SALE_LIVE_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const;

export const saleLiveSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SALE_LIVE_STATUSES).optional(),
});

export type SaleLiveSessionsQuery = z.infer<typeof saleLiveSessionsQuerySchema>;

// ─── GET /api/sale/bookings (Commit 2R) ───────────────────────────────────

export const SALE_BOOKING_STATUSES = [
  'PENDING_REVIEW',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
] as const;

export const saleBookingsQuerySchema = z.object({
  liveSessionId: z
    .string()
    .min(1, 'liveSessionId is required')
    .max(128, 'liveSessionId is too long'),
  status: z.enum(SALE_BOOKING_STATUSES).optional(),
  customerId: z
    .string()
    .min(1, 'customerId must be non-empty')
    .max(128, 'customerId is too long')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SaleBookingsQuery = z.infer<typeof saleBookingsQuerySchema>;

// ─── GET /api/sale/customers/search (Manual Create harden) ────────────────
//
// Minimal PII-safe customer lookup for the Manual Create dialog. Replaces
// the previous reuse of `/api/customers?search=` which returned the full
// CustomerRow shape including address / labels / notes / channel /
// facebookId / bannedReason / timestamps. Manual Create UI only needs
// 6 fields; the route returns only those.
//
// Capped limit at 20 (vs admin /api/customers max 100) — the dialog only
// renders a typeahead dropdown; larger pages don't help admin and only
// expand the PII surface unnecessarily.

export const saleCustomerSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'q must be at least 2 characters')
    .max(128, 'q is too long'),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export type SaleCustomerSearchQuery = z.infer<typeof saleCustomerSearchQuerySchema>;
