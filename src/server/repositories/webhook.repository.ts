import { prisma } from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/errors';
import { randomBytes, createHmac } from 'crypto';
import type { CreateWebhookInput, UpdateWebhookInput } from '@/lib/validation/webhook.schemas';
import type { Prisma } from '@/generated/prisma';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface WebhookRow {
  readonly id: string;
  readonly shopId: string;
  readonly url: string;
  readonly secret: string;
  readonly events: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookLogRow {
  readonly id: string;
  readonly webhookId: string;
  readonly event: string;
  readonly payload: unknown;
  readonly statusCode: number | null;
  readonly response: string | null;
  readonly success: boolean;
  readonly attempts: number;
  readonly error: string | null;
  readonly createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeWebhook(w: {
  id: string;
  shopId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WebhookRow {
  return Object.freeze({
    id: w.id,
    shopId: w.shopId,
    url: w.url,
    secret: w.secret,
    events: Object.freeze([...w.events]),
    isActive: w.isActive,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  });
}

function serializeLog(l: {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  statusCode: number | null;
  response: string | null;
  success: boolean;
  attempts: number;
  error: string | null;
  createdAt: Date;
}): WebhookLogRow {
  return Object.freeze({
    id: l.id,
    webhookId: l.webhookId,
    event: l.event,
    payload: l.payload,
    statusCode: l.statusCode,
    response: l.response,
    success: l.success,
    attempts: l.attempts,
    error: l.error,
    createdAt: l.createdAt,
  });
}

// ─── Repository ──────────────────────────────────────────────────────────────

interface WebhookRepository {
  findMany(shopId: string): Promise<readonly WebhookRow[]>;
  findById(shopId: string, id: string): Promise<WebhookRow | null>;
  findActiveByEvent(shopId: string, event: string): Promise<readonly WebhookRow[]>;
  create(shopId: string, data: CreateWebhookInput): Promise<WebhookRow>;
  update(shopId: string, id: string, data: UpdateWebhookInput): Promise<WebhookRow>;
  remove(shopId: string, id: string): Promise<void>;
  getLogs(
    webhookId: string,
    pagination: { page: number; limit: number }
  ): Promise<{ items: readonly WebhookLogRow[]; total: number }>;
  createLog(data: {
    webhookId: string;
    event: string;
    payload: Prisma.InputJsonValue;
    statusCode: number | null;
    response: string | null;
    success: boolean;
    attempts: number;
    error: string | null;
  }): Promise<WebhookLogRow>;
}

export const webhookRepository: WebhookRepository = Object.freeze({
  async findMany(shopId: string) {
    const webhooks = await prisma.webhook.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
    return Object.freeze(webhooks.map(serializeWebhook));
  },

  async findById(shopId: string, id: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id, shopId },
    });
    if (!webhook) return null;
    return serializeWebhook(webhook);
  },

  async findActiveByEvent(shopId: string, event: string) {
    const webhooks = await prisma.webhook.findMany({
      where: {
        shopId,
        isActive: true,
        events: { has: event },
      },
    });
    return Object.freeze(webhooks.map(serializeWebhook));
  },

  async create(shopId: string, data: CreateWebhookInput) {
    const secret = randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: {
        shopId,
        url: data.url,
        secret,
        events: [...data.events],
      },
    });
    return serializeWebhook(webhook);
  },

  async update(shopId: string, id: string, data: UpdateWebhookInput) {
    const existing = await prisma.webhook.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundError('Webhook not found');

    const updateData: Record<string, unknown> = {};
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = [...data.events];
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const webhook = await prisma.webhook.update({
      where: { id },
      data: updateData,
    });
    return serializeWebhook(webhook);
  },

  async remove(shopId: string, id: string) {
    const existing = await prisma.webhook.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundError('Webhook not found');

    await prisma.webhook.delete({ where: { id } });
  },

  async getLogs(webhookId: string, pagination: { page: number; limit: number }) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where: { webhookId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.webhookLog.count({ where: { webhookId } }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeLog)),
      total,
    });
  },

  async createLog(data: {
    webhookId: string;
    event: string;
    payload: Prisma.InputJsonValue;
    statusCode: number | null;
    response: string | null;
    success: boolean;
    attempts: number;
    error: string | null;
  }) {
    const log = await prisma.webhookLog.create({ data });
    return serializeLog(log);
  },
});

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
