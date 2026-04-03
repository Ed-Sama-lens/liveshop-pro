import { z } from 'zod';

// ─── Variant Schemas ────────────────────────────────────────────────────────

export const createVariantSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  attributes: z.record(z.string(), z.string()),
  price: z
    .string()
    .min(1, 'Price is required')
    .refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
      'Price must be a positive number'
    ),
  costPrice: z.string().optional(),
  quantity: z.number().int().min(0, 'Quantity must be >= 0'),
  lowStockAt: z.number().int().min(0, 'Low stock threshold must be >= 0').optional(),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema.partial();

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ─── Product Schemas ────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  stockCode: z.string().min(1, 'Stock code is required'),
  saleCode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  variants: z.array(createVariantSchema).default([]),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ variants: true })
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
