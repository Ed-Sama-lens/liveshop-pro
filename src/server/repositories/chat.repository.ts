import { prisma } from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/errors';
import type { ChatQuery, MessageQuery } from '@/lib/validation/chat.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface ChatRow {
  readonly id: string;
  readonly shopId: string;
  readonly customerId: string;
  readonly assignedUserId: string | null;
  readonly unreadCount: number;
  readonly lastMessageAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly customer?: { readonly id: string; readonly name: string; readonly facebookId: string | null };
  readonly assignedUser?: { readonly id: string; readonly name: string | null } | null;
  readonly lastMessage?: ChatMessageRow | null;
}

export interface ChatMessageRow {
  readonly id: string;
  readonly chatId: string;
  readonly direction: string;
  readonly content: string;
  readonly mediaUrl: string | null;
  readonly isRead: boolean;
  readonly fbMessageId: string | null;
  readonly createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeMessage(m: {
  id: string;
  chatId: string;
  direction: string;
  content: string;
  mediaUrl: string | null;
  isRead: boolean;
  fbMessageId: string | null;
  createdAt: Date;
}): ChatMessageRow {
  return Object.freeze({
    id: m.id,
    chatId: m.chatId,
    direction: m.direction,
    content: m.content,
    mediaUrl: m.mediaUrl,
    isRead: m.isRead,
    fbMessageId: m.fbMessageId,
    createdAt: m.createdAt,
  });
}

function serializeChat(c: {
  id: string;
  shopId: string;
  customerId: string;
  assignedUserId: string | null;
  unreadCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; name: string; facebookId: string | null };
  assignedUser?: { id: string; name: string | null } | null;
  messages?: Array<{
    id: string;
    chatId: string;
    direction: string;
    content: string;
    mediaUrl: string | null;
    isRead: boolean;
    fbMessageId: string | null;
    createdAt: Date;
  }>;
}): ChatRow {
  const base = {
    id: c.id,
    shopId: c.shopId,
    customerId: c.customerId,
    assignedUserId: c.assignedUserId,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };

  const extras: Record<string, unknown> = {};

  if (c.customer) {
    extras.customer = Object.freeze({
      id: c.customer.id,
      name: c.customer.name,
      facebookId: c.customer.facebookId,
    });
  }

  if (c.assignedUser !== undefined) {
    extras.assignedUser = c.assignedUser
      ? Object.freeze({ id: c.assignedUser.id, name: c.assignedUser.name })
      : null;
  }

  if (c.messages && c.messages.length > 0) {
    extras.lastMessage = serializeMessage(c.messages[0]);
  }

  return Object.freeze({ ...base, ...extras }) as ChatRow;
}

// ─── Repository ───────────��───────────────────────────────────────────────────

const LIST_INCLUDE = {
  customer: { select: { id: true, name: true, facebookId: true } },
  assignedUser: { select: { id: true, name: true } },
  messages: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      chatId: true,
      direction: true,
      content: true,
      mediaUrl: true,
      isRead: true,
      fbMessageId: true,
      createdAt: true,
    },
  },
} as const;

interface ChatRepository {
  findMany(
    shopId: string,
    filters: Pick<ChatQuery, 'search' | 'assignedUserId' | 'unreadOnly'>,
    pagination: Pick<ChatQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly ChatRow[]; total: number }>;
  findById(shopId: string, id: string): Promise<ChatRow | null>;
  findOrCreateByCustomer(shopId: string, customerId: string): Promise<ChatRow>;
  getMessages(
    shopId: string,
    chatId: string,
    pagination: Pick<MessageQuery, 'page' | 'limit' | 'before'>
  ): Promise<{ items: readonly ChatMessageRow[]; total: number }>;
  sendMessage(shopId: string, chatId: string, content: string, mediaUrl?: string): Promise<ChatMessageRow>;
  receiveMessage(shopId: string, customerId: string, content: string, fbMessageId?: string, mediaUrl?: string): Promise<ChatMessageRow>;
  markAsRead(shopId: string, chatId: string): Promise<void>;
  assignUser(shopId: string, chatId: string, userId: string | null): Promise<ChatRow>;
}

export const chatRepository: ChatRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<ChatQuery, 'search' | 'assignedUserId' | 'unreadOnly'>,
    pagination: Pick<ChatQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly ChatRow[]; total: number }> {
    const { search, assignedUserId, unreadOnly } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(unreadOnly ? { unreadCount: { gt: 0 } } : {}),
      ...(search
        ? {
            customer: {
              name: { contains: search, mode: 'insensitive' as const },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.chat.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        include: LIST_INCLUDE,
      }),
      prisma.chat.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeChat)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<ChatRow | null> {
    const chat = await prisma.chat.findFirst({
      where: { id, shopId },
      include: {
        customer: { select: { id: true, name: true, facebookId: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    if (!chat) return null;
    return serializeChat(chat);
  },

  async findOrCreateByCustomer(shopId: string, customerId: string): Promise<ChatRow> {
    const existing = await prisma.chat.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
      include: {
        customer: { select: { id: true, name: true, facebookId: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    if (existing) return serializeChat(existing);

    const created = await prisma.chat.create({
      data: { shopId, customerId },
      include: {
        customer: { select: { id: true, name: true, facebookId: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    return serializeChat(created);
  },

  async getMessages(
    shopId: string,
    chatId: string,
    pagination: Pick<MessageQuery, 'page' | 'limit' | 'before'>
  ): Promise<{ items: readonly ChatMessageRow[]; total: number }> {
    // Verify chat belongs to shop
    const chat = await prisma.chat.findFirst({ where: { id: chatId, shopId } });
    if (!chat) throw new NotFoundError('Chat not found');

    const { page, limit, before } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      chatId,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.chatMessage.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeMessage)),
      total,
    });
  },

  async sendMessage(
    shopId: string,
    chatId: string,
    content: string,
    mediaUrl?: string
  ): Promise<ChatMessageRow> {
    // Verify chat belongs to shop
    const chat = await prisma.chat.findFirst({ where: { id: chatId, shopId } });
    if (!chat) throw new NotFoundError('Chat not found');

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          chatId,
          direction: 'OUTBOUND',
          content,
          mediaUrl: mediaUrl ?? null,
          isRead: true,
        },
      }),
      prisma.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return serializeMessage(message);
  },

  async receiveMessage(
    shopId: string,
    customerId: string,
    content: string,
    fbMessageId?: string,
    mediaUrl?: string
  ): Promise<ChatMessageRow> {
    // Idempotency check for webhook messages
    if (fbMessageId) {
      const existing = await prisma.chatMessage.findUnique({
        where: { fbMessageId },
      });
      if (existing) return serializeMessage(existing);
    }

    // Find or create chat
    const chat = await prisma.chat.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: { shopId, customerId },
      update: {},
    });

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          chatId: chat.id,
          direction: 'INBOUND',
          content,
          mediaUrl: mediaUrl ?? null,
          fbMessageId: fbMessageId ?? null,
        },
      }),
      prisma.chat.update({
        where: { id: chat.id },
        data: {
          unreadCount: { increment: 1 },
          lastMessageAt: new Date(),
        },
      }),
    ]);

    return serializeMessage(message);
  },

  async markAsRead(shopId: string, chatId: string): Promise<void> {
    const chat = await prisma.chat.findFirst({ where: { id: chatId, shopId } });
    if (!chat) throw new NotFoundError('Chat not found');

    await prisma.$transaction([
      prisma.chatMessage.updateMany({
        where: { chatId, isRead: false },
        data: { isRead: true },
      }),
      prisma.chat.update({
        where: { id: chatId },
        data: { unreadCount: 0 },
      }),
    ]);
  },

  async assignUser(shopId: string, chatId: string, userId: string | null): Promise<ChatRow> {
    const chat = await prisma.chat.findFirst({ where: { id: chatId, shopId } });
    if (!chat) throw new NotFoundError('Chat not found');

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: { assignedUserId: userId },
      include: {
        customer: { select: { id: true, name: true, facebookId: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    return serializeChat(updated);
  },
});
