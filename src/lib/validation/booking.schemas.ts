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
