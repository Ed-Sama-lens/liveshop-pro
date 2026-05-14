import { z } from 'zod';

/**
 * Validation schemas for /api/sale/broadcast-products (Tier 3 PR 4).
 *
 * POST body shape:
 * - variantId: required
 * - displayCode: required, 1..32 chars, [A-Za-z0-9_-]
 * - liveSessionId: optional. Absent = evergreen (requires
 *   ALLOW_EVERGREEN_BROADCAST_PRODUCT=true at repository layer)
 * - priceOverride: optional, decimal string with up to 2 places
 * - isPinned: optional, default false
 *
 * GET query shape:
 * - scope: live | evergreen | all (default: all)
 * - liveSessionId: optional — only meaningful with scope=live
 * - q: optional search string against displayCode, product name, SKU
 * - limit: 1..200, default 50
 */

const DISPLAY_CODE_REGEX = /^[A-Za-z0-9_-]+$/;
const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

export const createBroadcastProductBodySchema = z.object({
  variantId: z.string().min(1, 'variantId is required').max(128, 'variantId is too long'),
  displayCode: z
    .string()
    .min(1, 'displayCode is required')
    .max(32, 'displayCode must be 32 characters or fewer')
    .regex(DISPLAY_CODE_REGEX, 'displayCode must contain only A-Z, a-z, 0-9, _, -'),
  liveSessionId: z
    .string()
    .min(1, 'liveSessionId must be non-empty when provided')
    .max(128, 'liveSessionId is too long')
    .optional(),
  priceOverride: z
    .string()
    .regex(PRICE_REGEX, 'priceOverride must be a decimal with up to 2 places')
    .optional(),
  isPinned: z.boolean().optional(),
});

export type CreateBroadcastProductBody = z.infer<typeof createBroadcastProductBodySchema>;

export const BROADCAST_PRODUCT_SCOPES = ['live', 'evergreen', 'all'] as const;

export const listBroadcastProductsQuerySchema = z.object({
  scope: z.enum(BROADCAST_PRODUCT_SCOPES).default('all'),
  liveSessionId: z
    .string()
    .min(1, 'liveSessionId must be non-empty when provided')
    .max(128, 'liveSessionId is too long')
    .optional(),
  q: z.string().trim().max(128, 'q is too long').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListBroadcastProductsQuery = z.infer<typeof listBroadcastProductsQuerySchema>;

/**
 * PATCH body for `/api/sale/broadcast-products/[id]` (Tier 3.5).
 *
 * Only safe fields are editable:
 * - `priceOverride` — decimal string with up to 2 places, OR explicit
 *   null to clear an existing override (uses variant.price as fallback)
 * - `isPinned` — boolean
 * - `displayOrder` — int 0..9999
 *
 * Identity-bearing fields (`displayCode` / `variantId` / `liveSessionId`
 * / `productId`) are intentionally NOT editable to preserve booking
 * audit trail and uniqueness invariants.
 *
 * Empty body rejected by `.refine()` — at least one field required.
 */
export const updateBroadcastProductBodySchema = z
  .object({
    priceOverride: z
      .union([
        z.string().regex(PRICE_REGEX, 'priceOverride must be a decimal with up to 2 places'),
        z.null(),
      ])
      .optional(),
    isPinned: z.boolean().optional(),
    displayOrder: z
      .number()
      .int('displayOrder must be an integer')
      .min(0, 'displayOrder must be ≥ 0')
      .max(9999, 'displayOrder must be ≤ 9999')
      .optional(),
  })
  .refine(
    (data) =>
      data.priceOverride !== undefined ||
      data.isPinned !== undefined ||
      data.displayOrder !== undefined,
    { message: 'At least one field must be provided', path: ['body'] }
  );

export type UpdateBroadcastProductBody = z.infer<typeof updateBroadcastProductBodySchema>;
