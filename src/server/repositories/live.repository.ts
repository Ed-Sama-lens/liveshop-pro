import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import type { CreateLiveSessionInput, UpdateLiveSessionInput, LiveSessionQuery } from '@/lib/validation/live.schemas';
import { VALID_LIVE_TRANSITIONS } from '@/lib/validation/live.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface LiveSessionRow {
  readonly id: string;
  readonly shopId: string;
  readonly title: string | null;
  readonly fbLiveId: string | null;
  readonly status: string;
  readonly scheduledAt: Date | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly viewerCount: number;
  readonly orderCount: number;
  readonly totalRevenue: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeLiveSession(s: {
  id: string;
  shopId: string;
  title: string | null;
  fbLiveId: string | null;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  viewerCount: number;
  orderCount: number;
  totalRevenue: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): LiveSessionRow {
  return Object.freeze({
    id: s.id,
    shopId: s.shopId,
    title: s.title,
    fbLiveId: s.fbLiveId,
    status: s.status,
    scheduledAt: s.scheduledAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    viewerCount: s.viewerCount,
    orderCount: s.orderCount,
    totalRevenue: s.totalRevenue.toString(),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  });
}

// ─── Repository ───────────────────────────────────────────────────────────────

interface LiveRepository {
  findMany(
    shopId: string,
    filters: Pick<LiveSessionQuery, 'status'>,
    pagination: Pick<LiveSessionQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly LiveSessionRow[]; total: number }>;
  findById(shopId: string, id: string): Promise<LiveSessionRow | null>;
  create(shopId: string, data: CreateLiveSessionInput): Promise<LiveSessionRow>;
  update(shopId: string, id: string, data: UpdateLiveSessionInput): Promise<LiveSessionRow>;
  transition(shopId: string, id: string, newStatus: string): Promise<LiveSessionRow>;
  updateStats(shopId: string, id: string, stats: { viewerCount?: number; orderCount?: number; totalRevenue?: string }): Promise<LiveSessionRow>;
  remove(shopId: string, id: string): Promise<void>;
}

export const liveRepository: LiveRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<LiveSessionQuery, 'status'>,
    pagination: Pick<LiveSessionQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly LiveSessionRow[]; total: number }> {
    const { status } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.liveSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.liveSession.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeLiveSession)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<LiveSessionRow | null> {
    const session = await prisma.liveSession.findFirst({
      where: { id, shopId },
    });

    if (!session) return null;
    return serializeLiveSession(session);
  },

  async create(shopId: string, data: CreateLiveSessionInput): Promise<LiveSessionRow> {
    const session = await prisma.liveSession.create({
      data: {
        shopId,
        title: data.title,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      },
    });

    return serializeLiveSession(session);
  },

  async update(shopId: string, id: string, data: UpdateLiveSessionInput): Promise<LiveSessionRow> {
    const existing = await prisma.liveSession.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundError('Live session not found');

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = new Date(data.scheduledAt);

    const session = await prisma.liveSession.update({
      where: { id },
      data: updateData,
    });

    return serializeLiveSession(session);
  },

  async transition(shopId: string, id: string, newStatus: string): Promise<LiveSessionRow> {
    const existing = await prisma.liveSession.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundError('Live session not found');

    const allowed = VALID_LIVE_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new ConflictError(
        `Cannot transition from ${existing.status} to ${newStatus}`
      );
    }

    const timestampData: Record<string, unknown> = {};
    if (newStatus === 'LIVE') timestampData.startedAt = new Date();
    if (newStatus === 'ENDED') timestampData.endedAt = new Date();

    const session = await prisma.liveSession.update({
      where: { id },
      data: {
        status: newStatus as 'SCHEDULED' | 'LIVE' | 'ENDED',
        ...timestampData,
      },
    });

    return serializeLiveSession(session);
  },

  async updateStats(
    shopId: string,
    id: string,
    stats: { viewerCount?: number; orderCount?: number; totalRevenue?: string }
  ): Promise<LiveSessionRow> {
    const existing = await prisma.liveSession.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundError('Live session not found');

    const updateData: Record<string, unknown> = {};
    if (stats.viewerCount !== undefined) updateData.viewerCount = stats.viewerCount;
    if (stats.orderCount !== undefined) updateData.orderCount = stats.orderCount;
    if (stats.totalRevenue !== undefined) updateData.totalRevenue = parseFloat(stats.totalRevenue);

    const session = await prisma.liveSession.update({
      where: { id },
      data: updateData,
    });

    return serializeLiveSession(session);
  },

  async remove(shopId: string, id: string): Promise<void> {
    const existing = await prisma.liveSession.findFirst({ where: { id, shopId } });
    if (!existing) throw new NotFoundError('Live session not found');

    if (existing.status === 'LIVE') {
      throw new ConflictError('Cannot delete a live session that is currently streaming');
    }

    await prisma.liveSession.delete({ where: { id } });
  },
});
