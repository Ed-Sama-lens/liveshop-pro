import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@/generated/prisma';
import type { ActivityLogQuery } from '@/lib/validation/activity.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface ActivityLogRow {
  readonly id: string;
  readonly shopId: string;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string | null;
  readonly description: string;
  readonly metadata: unknown;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeLog(log: {
  id: string;
  shopId: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  metadata: Prisma.JsonValue;
  ipAddress: string | null;
  createdAt: Date;
}): ActivityLogRow {
  return Object.freeze({
    id: log.id,
    shopId: log.shopId,
    userId: log.userId,
    userName: log.userName,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    description: log.description,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  });
}

// ─── Repository Interface ───────────────────────────────────────────────────

export interface CreateActivityInput {
  readonly shopId: string;
  readonly userId?: string | null;
  readonly userName?: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId?: string | null;
  readonly description: string;
  readonly metadata?: Prisma.InputJsonValue;
  readonly ipAddress?: string | null;
}

interface ActivityLogRepository {
  findMany(shopId: string, query: ActivityLogQuery): Promise<{
    readonly data: readonly ActivityLogRow[];
    readonly total: number;
  }>;
  create(input: CreateActivityInput): Promise<ActivityLogRow>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const activityRepository: ActivityLogRepository = Object.freeze({
  async findMany(shopId: string, query: ActivityLogQuery) {
    const where: Prisma.ActivityLogWhereInput = { shopId };

    if (query.entity) where.entity = query.entity;
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return Object.freeze({
      data: Object.freeze(logs.map(serializeLog)),
      total,
    });
  },

  async create(input: CreateActivityInput) {
    const log = await prisma.activityLog.create({
      data: {
        shopId: input.shopId,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        description: input.description,
        metadata: input.metadata ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return serializeLog(log);
  },
});
