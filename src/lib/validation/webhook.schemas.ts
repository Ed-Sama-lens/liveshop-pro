import { z } from 'zod/v4';

export const WEBHOOK_EVENTS = [
  'order.created',
  'order.confirmed',
  'order.packed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'shipment.updated',
  'payment.received',
  'payment.verified',
  'customer.created',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const createWebhookSchema = z.object({
  url: z.url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Select at least one event'),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.url().max(500).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type WebhookLogQuery = z.infer<typeof webhookLogQuerySchema>;
