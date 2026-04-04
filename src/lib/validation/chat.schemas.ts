import { z } from 'zod';

// ─── Message Direction ────────────────────────────────────────────────────
const MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;

// ─── Send Message Schema ─────────────────────────────────────��────────────
export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(4000),
  mediaUrl: z.string().url().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ─── Chat Query Schema ───────────────���────────────────────────────────────
export const chatQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  assignedUserId: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export type ChatQuery = z.infer<typeof chatQuerySchema>;

// ─── Message Query Schema ────────���─────────────────────────────���──────────
export const messageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

export type MessageQuery = z.infer<typeof messageQuerySchema>;

// ─── Assign Chat Schema ──────────────────────────────��────────────────────
export const assignChatSchema = z.object({
  userId: z.string().min(1, 'User ID is required').optional(),
});

export type AssignChatInput = z.infer<typeof assignChatSchema>;

// ─── Chat Template Schema ─────────────────────────────────────────────────
export const chatTemplateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  content: z.string().min(1, 'Content is required').max(4000),
});

export type ChatTemplateInput = z.infer<typeof chatTemplateSchema>;
