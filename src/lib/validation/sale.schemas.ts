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

/**
 * Conversion request body. PR 2 AR-3 introduces V2 bookingIds-only
 * path that coexists with V1 legacy path. Per Q-15, the simplest
 * readable shape is a single schema with refine():
 * - V1 legacy: liveSessionId + customerId + bookingIds (all required)
 * - V2 omnichannel: bookingIds only (liveSessionId + customerId omitted)
 *
 * The route handler dispatches based on which fields are present.
 * Repository validates feature-flag gating + tenant scoping.
 */
export const createOrderFromBookingsBodySchema = z
  .object({
    liveSessionId: z
      .string()
      .min(1, 'liveSessionId must be non-empty when provided')
      .optional(),
    customerId: z
      .string()
      .min(1, 'customerId must be non-empty when provided')
      .optional(),
    bookingIds: z
      .array(z.string().min(1, 'bookingId must be non-empty'))
      .min(1, 'bookingIds must contain at least one booking ID')
      .max(
        MAX_BOOKINGS_PER_CONVERSION,
        `bookingIds may contain at most ${MAX_BOOKINGS_PER_CONVERSION} entries`
      ),
  })
  .refine(
    (data) => {
      // V1 legacy: both liveSessionId + customerId provided
      const hasLegacy =
        typeof data.liveSessionId === 'string' && typeof data.customerId === 'string';
      // V2 omnichannel: neither provided (route flag-gated separately)
      const hasV2 =
        data.liveSessionId === undefined && data.customerId === undefined;
      return hasLegacy || hasV2;
    },
    {
      message:
        'Provide either (liveSessionId + customerId) for V1 legacy or omit both for V2 bookingIds-only path',
      path: ['liveSessionId'],
    }
  );

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

export const saleBookingsQuerySchema = z
  .object({
    // Tier 3.9-B-Fix-2 — Either liveSessionId OR saleDate required.
    // Date-first model uses saleDate filter to join BroadcastProduct;
    // legacy callers still pass liveSessionId. Bookings without BP
    // (which is all of them by schema) are filtered via BP.saleDate.
    liveSessionId: z
      .string()
      .min(1, 'liveSessionId must be non-empty when provided')
      .max(128, 'liveSessionId is too long')
      .optional(),
    saleDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD')
      .optional(),
    status: z.enum(SALE_BOOKING_STATUSES).optional(),
    customerId: z
      .string()
      .min(1, 'customerId must be non-empty')
      .max(128, 'customerId is too long')
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (data) => Boolean(data.liveSessionId) || Boolean(data.saleDate),
    {
      message: 'Provide either liveSessionId or saleDate',
      path: ['saleDate'],
    }
  );

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

// ─── POST /api/sale/quick-product-codes (Tier 3.8) ────────────────────────
//
// Boss live-selling workflow: bulk-create N Product + ProductVariant +
// BroadcastProduct rows in a single transaction. Solves first-time
// admin onboarding where stock is empty and the admin must currently
// switch /sale → /inventory → /sale to get a saleable code.
//
// Single mode: omit startNo + endNo → creates exactly one trio.
// Bulk mode: include startNo + endNo → creates `endNo - startNo + 1`
//   trios numbered sequentially.
//
// Defaults (when blank):
//   name = '' (repo fills placeholder from saleCode → stockCode)
//   price = '0' (accepts '0' / '0.00' / empty)
//   quantity = 1 (Boss's preferred placeholder; 0 also accepted)
//   category = uncategorized (categoryId null)
//
// Range cap: 100 per request to keep transactions bounded.

/** Max products per single bulk request. Larger requires multiple calls. */
export const QUICK_BULK_MAX_RANGE = 100;

export const quickBulkProductCodesBodySchema = z
  .object({
    stockCodeBase: z
      .string()
      .min(1, 'stockCodeBase is required')
      .max(128, 'stockCodeBase is too long'),
    saleCodeBase: z
      .string()
      .min(1, 'saleCodeBase is required')
      .max(128, 'saleCodeBase is too long'),
    categoryId: z.string().min(1).max(128).optional(),
    productName: z.string().max(256).optional().default(''),
    productDetails: z.string().max(2000).optional().default(''),
    imageUrl: z.string().url('imageUrl must be a valid URL').optional(),
    startNo: z.number().int().min(0, 'startNo must be >= 0').optional(),
    endNo: z.number().int().min(0, 'endNo must be >= 0').optional(),
    quantity: z
      .number()
      .int()
      .min(0, 'quantity must be >= 0')
      .max(999_999, 'quantity is too large')
      .optional()
      .default(1),
    lowStockAt: z.number().int().min(0).optional(),
    // Price + cost accept any non-negative decimal string. Empty
    // string transforms to '0'. Mirrors product.schemas.ts relaxation
    // (Tier 3.8 PR-A).
    price: z
      .string()
      .optional()
      .transform((val) => (val === undefined || val.trim() === '' ? '0' : val.trim()))
      .refine(
        (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
        'price must be a non-negative number'
      ),
    cost: z
      .string()
      .optional()
      .transform((val) => (val === undefined || val.trim() === '' ? undefined : val.trim()))
      .refine(
        (val) => val === undefined || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0),
        'cost must be a non-negative number'
      ),
    // Tier 3.9 — Sale Date (YYYY-MM-DD). All trios in the batch share
    // the same saleDate. Repository defaults to today in shop timezone
    // when omitted (D-Date-5 verdict).
    saleDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD')
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Bulk mode requires BOTH startNo and endNo (or neither).
    const hasStart = data.startNo !== undefined;
    const hasEnd = data.endNo !== undefined;
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: 'custom',
        message: 'startNo and endNo must be provided together',
        path: hasStart ? ['endNo'] : ['startNo'],
      });
      return;
    }
    if (hasStart && hasEnd && data.startNo !== undefined && data.endNo !== undefined) {
      if (data.endNo < data.startNo) {
        ctx.addIssue({
          code: 'custom',
          message: 'endNo must be >= startNo',
          path: ['endNo'],
        });
        return;
      }
      const count = data.endNo - data.startNo + 1;
      if (count > QUICK_BULK_MAX_RANGE) {
        ctx.addIssue({
          code: 'custom',
          message: `Bulk range too large: ${count} > ${QUICK_BULK_MAX_RANGE}`,
          path: ['endNo'],
        });
      }
    }
  });

export type QuickBulkProductCodesBody = z.infer<typeof quickBulkProductCodesBodySchema>;
