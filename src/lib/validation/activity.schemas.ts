import { z } from 'zod';

export const activityLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  entity: z.string().max(50).optional(),
  action: z.string().max(50).optional(),
  userId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>;
