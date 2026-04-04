import { z } from 'zod/v4';

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  type: z
    .enum(['NEW_ORDER', 'LOW_STOCK', 'NEW_CHAT', 'SHIPMENT_UPDATE', 'PAYMENT_RECEIVED', 'SYSTEM'])
    .optional(),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
