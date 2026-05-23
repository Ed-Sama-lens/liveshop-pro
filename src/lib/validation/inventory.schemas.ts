import { z } from 'zod';
import { QUICK_BULK_MAX_RANGE } from './sale.schemas';

/**
 * Tier 3.9-D2-A — Inventory bulk product creation.
 *
 * Body schema for POST /api/inventory/quick-product-bulk.
 *
 * Composes the same field shapes as `quickBulkProductCodesBodySchema`
 * (sale flow) but deliberately OMITS:
 *
 *   - `saleDate` — inventory bulk is stock-managed; admin attaches
 *     items to a saleDate later via /sale AddFromStock or sale
 *     quick-create.
 *   - `imageUrl` — Boss explicitly excluded image upload from this PR
 *     (Decision 3, 2026-05-23).
 *
 * Inventory bulk reuses the shared core
 * `createOrReuseProductVariantPairs` to create Product + ProductVariant
 * pairs only. NO `BroadcastProduct` rows are written by this flow.
 *
 * Cap: `QUICK_BULK_MAX_RANGE` (100) — shared constant with sale flow.
 *
 * Cross-references:
 * - Plan: docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md
 * - Sale schema: src/lib/validation/sale.schemas.ts quickBulkProductCodesBodySchema
 * - Repository: src/server/repositories/inventory-bulk.repository.ts
 * - Route: src/app/api/inventory/quick-product-bulk/route.ts
 */
export const inventoryBulkBodySchema = z
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
    // Price + cost relax to allow empty string (Tier 3.8 PR-A pattern).
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
    // saleDate — DELIBERATELY OMITTED (inventory is stock-only)
    // imageUrl — DELIBERATELY OMITTED (Boss Decision 3 exclusion)
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

export type InventoryBulkBody = z.infer<typeof inventoryBulkBodySchema>;
