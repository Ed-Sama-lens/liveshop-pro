import { z } from 'zod';

/**
 * Validation schemas for /api/sale/bookings/*.
 *
 * See:
 * - docs/superpowers/2026-04-06-sale-mvp-dissent.md (Boss decisions)
 * - docs/superpowers/2026-05-09-sale-booking-runtime-design.md (runtime design)
 * - src/server/repositories/booking.repository.ts (repo entry points)
 *
 * Booking confirm has no body in Phase 1 — bookingId comes from the URL,
 * shopId + changedById come from the authenticated session.
 *
 * Booking cancel takes a small body: targetStatus (CANCELLED|EXPIRED) and
 * an optional admin reason capped at 500 chars.
 */

// ─── Confirm ──────────────────────────────────────────────────────────────

export const confirmBookingBodySchema = z
  .object({})
  .passthrough()
  .optional();

export type ConfirmBookingBody = z.infer<typeof confirmBookingBodySchema>;

// ─── Cancel ───────────────────────────────────────────────────────────────

export const CANCEL_TARGET_STATUSES = ['CANCELLED', 'EXPIRED'] as const;

export const cancelBookingBodySchema = z.object({
  targetStatus: z.enum(CANCEL_TARGET_STATUSES, {
    message: 'targetStatus must be CANCELLED or EXPIRED',
  }),
  reason: z.string().trim().max(500, 'reason must be 500 characters or fewer').optional(),
});

export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;

// ─── Manual Create (Commit 2N) ────────────────────────────────────────────
//
// POST /api/sale/bookings — admin manual booking creation.
//
// shopId + changedById come from the authenticated session. The body
// only carries the booking inputs the admin chose in the UI. Validation
// matches the repository contract in
// src/server/repositories/booking.repository.ts (createManual()).

export const CREATE_BOOKING_STATUSES = ['PENDING_REVIEW', 'CONFIRMED'] as const;

/**
 * Booking source enum mirror — must stay in sync with Prisma
 * `BookingSource`. Listed explicitly here so zod can validate
 * client-supplied values without coupling validation to generated
 * Prisma types. Source MANUAL is the only acceptable client-supplied
 * value for admin POST /api/sale/bookings; future inbound runtimes
 * (LIVE_COMMENT / MESSENGER_INBOX / etc) MUST be set internally from
 * trusted channel context, not from client input — see Q-17.
 */
export const CLIENT_SUPPLIED_BOOKING_SOURCES = ['MANUAL'] as const;

export const createBookingBodySchema = z.object({
  // PR 2 AR-2: liveSessionId becomes optional. When omitted/null, the
  // route requires ALLOW_NON_LIVE_BOOKING flag + evergreen BP path.
  liveSessionId: z
    .string()
    .min(1, 'liveSessionId must be non-empty when provided')
    .max(128, 'liveSessionId is too long')
    .optional(),
  customerId: z
    .string()
    .min(1, 'customerId is required')
    .max(128, 'customerId is too long'),
  broadcastProductId: z
    .string()
    .min(1, 'broadcastProductId is required')
    .max(128, 'broadcastProductId is too long'),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1')
    .max(999, 'quantity must be at most 999'),
  status: z.enum(CREATE_BOOKING_STATUSES, {
    message: 'status must be PENDING_REVIEW or CONFIRMED',
  }),
  // PR 2 AR-2: source is admin-facing optional. Defaults to MANUAL
  // at repository when omitted. Per Q-17, only MANUAL is acceptable
  // from client input; other sources are reserved for internal
  // trusted runtimes.
  source: z.enum(CLIENT_SUPPLIED_BOOKING_SOURCES).optional(),
  idempotencyKey: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]{8,128}$/,
      'idempotencyKey must be 8-128 chars of A-Z, a-z, 0-9, underscore, dash'
    )
    .optional(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
