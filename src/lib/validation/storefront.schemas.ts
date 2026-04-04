import { z } from 'zod';

// ─── Storefront Product Queries ─────────────────────────────────────────────

export const storefrontProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  search: z.string().max(200).optional(),
});

export type StorefrontProductQuery = z.infer<typeof storefrontProductQuerySchema>;

// ─── Storefront Product Management (Admin) ──────────────────────────────────

export const publishProductSchema = z.object({
  productId: z.string().min(1),
  isVisible: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type PublishProductInput = z.infer<typeof publishProductSchema>;

export const updateStorefrontProductSchema = z.object({
  isVisible: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export type UpdateStorefrontProductInput = z.infer<typeof updateStorefrontProductSchema>;

// ─── Cart Operations ────────────────────────────────────────────────────────

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(999),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

// ─── Shop Branding ──────────────────────────────────────────────────────────

export const shopBrandingSchema = z.object({
  logo: z.string().url().max(500).nullable().optional(),
  banner: z.string().url().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  // Payment config
  promptpayQrUrl: z.string().url().max(500).nullable().optional(),
  promptpayNote: z.string().max(2000).nullable().optional(),
  bankName: z.string().max(100).nullable().optional(),
  bankAccount: z.string().max(50).nullable().optional(),
  bankAccountName: z.string().max(200).nullable().optional(),
  bankNote: z.string().max(2000).nullable().optional(),
});

export type ShopBrandingInput = z.infer<typeof shopBrandingSchema>;

// ─── Checkout ───────────────────────────────────────────────────────────────

export const checkoutSchema = z.object({
  shippingType: z.enum(['STANDARD', 'EXPRESS', 'PICKUP', 'COD']).default('STANDARD'),
  notes: z.string().max(1000).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
