import { z } from 'zod';

// ─── Enum values (matching Prisma schema) ──────────────────────────────────

const ORDER_STATUSES = ['RESERVED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
const SALE_CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'LINE', 'TIKTOK', 'MANUAL', 'STOREFRONT'] as const;
const PAYMENT_METHODS = ['TRANSFER', 'QR_CODE', 'COD'] as const;

// ─── Order Item Schema ─────────────────────────────────────────────────────

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().min(1, 'Variant ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be >= 1'),
  unitPrice: z.string().min(1, 'Unit price is required'),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

// ─── Create Order Schema ───────────────────────────────────────────────────

export const createOrderSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  channel: z.enum(SALE_CHANNELS).default('MANUAL'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  shippingFee: z.string().default('0'),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ─── Update Order Schema ───────────────────────────────────────────────────

export const updateOrderSchema = z.object({
  notes: z.string().optional(),
  shippingFee: z.string().optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// ─── Status Transition Schema ──────────────────────────────────────────────

export const transitionOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

// ─── Payment Schema ────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS).default('TRANSFER'),
  amount: z.string().min(1, 'Amount is required'),
  idempotencyKey: z.string().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const verifyPaymentSchema = z.object({
  verified: z.boolean(),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

// ─── Query Schema ──────────────────────────────────────────────────────────

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
  customerId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type OrderQuery = z.infer<typeof orderQuerySchema>;

// ─── Search by Product Query ──────────────────────────────────────────────

export const searchByProductSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  productCode: z.string().min(1, 'Product code is required'),
  dateFrom: z.string().min(1, 'Start date is required'),
  dateTo: z.string().min(1, 'End date is required'),
  status: z.enum(ORDER_STATUSES).optional(),
});

export type SearchByProductQuery = z.infer<typeof searchByProductSchema>;

// ─── Valid Status Transitions ──────────────────────────────────────────────

export const VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  RESERVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
});
