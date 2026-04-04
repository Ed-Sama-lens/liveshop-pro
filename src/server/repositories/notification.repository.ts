import { prisma } from '@/lib/db/prisma';
import type { NotificationType } from '@/generated/prisma';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface NotificationRow {
  readonly id: string;
  readonly shopId: string;
  readonly userId: string | null;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly link: string | null;
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serialize(n: {
  id: string;
  shopId: string;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRow {
  return Object.freeze({
    id: n.id,
    shopId: n.shopId,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    readAt: n.readAt,
    createdAt: n.createdAt,
  });
}

// ─── Repository ──────────────────────────────────────────────────────────────

interface CreateNotificationInput {
  readonly shopId: string;
  readonly userId?: string | null;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly link?: string | null;
}

interface NotificationRepository {
  findMany(
    shopId: string,
    filters: { unreadOnly: boolean; type?: string },
    pagination: { page: number; limit: number }
  ): Promise<{ items: readonly NotificationRow[]; total: number }>;

  countUnread(shopId: string): Promise<number>;

  create(data: CreateNotificationInput): Promise<NotificationRow>;

  markRead(shopId: string, ids: readonly string[]): Promise<number>;

  markAllRead(shopId: string): Promise<number>;
}

export const notificationRepository: NotificationRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: { unreadOnly: boolean; type?: string },
    pagination: { page: number; limit: number }
  ) {
    const { unreadOnly, type } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(type ? { type: type as NotificationType } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serialize)),
      total,
    });
  },

  async countUnread(shopId: string) {
    return prisma.notification.count({
      where: { shopId, isRead: false },
    });
  },

  async create(data: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        shopId: data.shopId,
        userId: data.userId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link ?? null,
      },
    });

    return serialize(notification);
  },

  async markRead(shopId: string, ids: readonly string[]) {
    const result = await prisma.notification.updateMany({
      where: { id: { in: [...ids] }, shopId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return result.count;
  },

  async markAllRead(shopId: string) {
    const result = await prisma.notification.updateMany({
      where: { shopId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return result.count;
  },
});
