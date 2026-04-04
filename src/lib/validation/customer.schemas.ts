import { z } from 'zod';

// ─── Enum values (matching Prisma schema) ──────────────────────────────────

const SALE_CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;
const SHIPPING_TYPES = ['STANDARD', 'EXPRESS', 'PICKUP', 'COD'] as const;

// ─── Customer Schemas ──────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  facebookId: z.string().optional(),
  address: z.string().optional(),
  district: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  labels: z.array(z.string()).default([]),
  shippingType: z.enum(SHIPPING_TYPES).optional(),
  notes: z.string().optional(),
  channel: z.enum(SALE_CHANNELS).default('MANUAL'),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ─── Ban Schema ────────────────────────────────────────────────────────────

export const banCustomerSchema = z.object({
  reason: z.string().optional(),
});

export type BanCustomerInput = z.infer<typeof banCustomerSchema>;

// ─── Query Schema ──────────────────────────────────────────────────────────

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
  label: z.string().optional(),
  isBanned: z.coerce.boolean().optional(),
});

export type CustomerQuery = z.infer<typeof customerQuerySchema>;
