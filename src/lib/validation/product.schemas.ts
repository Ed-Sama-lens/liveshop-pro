import { z } from 'zod';

// ─── Variant Schemas ────────────────────────────────────────────────────────

/**
 * Variant create/update schema.
 *
 * Tier 3.8 relaxation (2026-05-20) for Boss's live-selling workflow:
 * - `price` accepts `'0'` / `'0.00'` (was `> 0`). Live-selling Boss
 *   bulk-creates codes with placeholder price 0, fills price at sale
 *   time.
 * - `price` empty string ⇒ defaults to `'0'`. Form may submit blank.
 * - `quantity` accepts 0 (already allowed). Boss's "out of stock"
 *   placeholder pattern.
 * - `costPrice` empty string normalized to undefined.
 */
export const createVariantSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  attributes: z.record(z.string(), z.string()),
  price: z
    .string()
    .transform((val) => (val.trim() === '' ? '0' : val.trim()))
    .refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
      'Price must be a non-negative number'
    ),
  costPrice: z
    .string()
    .optional()
    .transform((val) => (val === undefined || val.trim() === '' ? undefined : val.trim()))
    .refine(
      (val) => val === undefined || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0),
      'Cost price must be a non-negative number'
    ),
  quantity: z.number().int().min(0, 'Quantity must be >= 0'),
  lowStockAt: z.number().int().min(0, 'Low stock threshold must be >= 0').optional(),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema.partial();

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ─── Product Schemas ────────────────────────────────────────────────────────

/**
 * Product create schema.
 *
 * Tier 3.8 relaxation (2026-05-20):
 * - `name` accepts empty string (was `.min(1)`). DB still requires
 *   non-null; repository fills placeholder from `saleCode ?? stockCode`
 *   when name is blank, so Boss can bulk-create empty codes and edit
 *   name later. Placeholder is visible + obvious so admin knows to
 *   replace it.
 * - `stockCode` still required (the operational anchor).
 * - `saleCode` / `description` / `categoryId` already optional.
 */
export const createProductSchema = z.object({
  name: z.string().optional().default(''),
  stockCode: z.string().min(1, 'Stock code is required'),
  saleCode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  variants: z.array(createVariantSchema).default([]),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ variants: true })
  .extend({ images: z.array(z.string().url()).optional() })
  .partial();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── Query Schemas ──────────────────────────────────────────────────────────

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;
