import { z } from 'zod';

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'VERIFIED', 'FAILED', 'REFUNDED']).optional(),
  method: z.enum(['TRANSFER', 'QR_CODE', 'COD']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;

export const verifyPaymentSchema = z.object({
  action: z.enum(['VERIFY', 'REJECT']),
  note: z.string().max(500).optional(),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
