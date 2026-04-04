import { z } from 'zod';

// ─── Enum values ──────────────────────────────────────────────────────────
const SHIPPING_PROVIDERS = ['KEX', 'JNT', 'MANUAL'] as const;
const SHIPMENT_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const;

// ─── Create Shipment Schema ──────────────────────────────────────────────
export const createShipmentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  provider: z.enum(SHIPPING_PROVIDERS).default('MANUAL'),
  trackingNumber: z.string().optional(),
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

// ─── Update Shipment Schema ──────────────────────────────────────────────
export const updateShipmentSchema = z.object({
  trackingNumber: z.string().optional(),
  labelUrl: z.string().url().optional(),
});

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

// ─── Shipment Status Transition Schema ───────────────────────────────────
export const transitionShipmentSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
});

export type TransitionShipmentInput = z.infer<typeof transitionShipmentSchema>;

// ─── Shipment Query Schema ───────────────────────────────────────────────
export const shipmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  provider: z.enum(SHIPPING_PROVIDERS).optional(),
  search: z.string().optional(),
});

export type ShipmentQuery = z.infer<typeof shipmentQuerySchema>;

// ─── Valid Status Transitions ────────────────────────────────────────────
export const VALID_SHIPMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  PENDING: ['ASSIGNED'],
  ASSIGNED: ['PICKED_UP', 'RETURNED'],
  PICKED_UP: ['IN_TRANSIT', 'RETURNED'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED'],
  DELIVERED: [],
  RETURNED: [],
});
