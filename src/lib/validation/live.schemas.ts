import { z } from 'zod';

// ─── Enum values (matching Prisma schema) ──────────────────────────────────
const LIVE_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const;

// ─── Create Live Session Schema ───────────────────────────────────────────
export const createLiveSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  scheduledAt: z.string().optional(),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;

// ─── Update Live Session Schema ───────────────────────────────────────────
export const updateLiveSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  scheduledAt: z.string().optional(),
});

export type UpdateLiveSessionInput = z.infer<typeof updateLiveSessionSchema>;

// ─── Live Session Query Schema ────────────────────────────────────────────
export const liveSessionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LIVE_STATUSES).optional(),
});

export type LiveSessionQuery = z.infer<typeof liveSessionQuerySchema>;

// ─── Valid Status Transitions ─────────────────────────────────────────────
export const VALID_LIVE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SCHEDULED: ['LIVE', 'ENDED'],
  LIVE: ['ENDED'],
  ENDED: [],
});
