import { z } from 'zod';

export const adjustStockSchema = z.object({
  variantId: z.string(),
  delta: z.int(),
  reason: z.string(),
});

export const reserveStockSchema = z.object({
  variantId: z.string(),
  quantity: z.int().min(1),
  orderId: z.string().optional(),
});

export const releaseReservationSchema = z.object({
  reservationId: z.string(),
});

export const updateLowStockSchema = z.object({
  variantId: z.string(),
  lowStockAt: z.int().min(0).nullable(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
export type UpdateLowStockInput = z.infer<typeof updateLowStockSchema>;
