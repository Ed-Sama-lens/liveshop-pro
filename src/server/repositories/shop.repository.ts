import { prisma } from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/errors';
import type { UpdateShopInput, InviteMemberInput, UpdateMemberRoleInput } from '@/lib/validation/settings.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface ShopRow {
  readonly id: string;
  readonly name: string;
  readonly facebookPageId: string | null;
  readonly defaultCurrency: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ShopMemberRow {
  readonly id: string;
  readonly userId: string;
  readonly role: string;
  readonly invitedAt: Date;
  readonly joinedAt: Date | null;
  readonly user: {
    readonly name: string;
    readonly email: string | null;
    readonly image: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeShop(s: {
  id: string;
  name: string;
  facebookPageId: string | null;
  defaultCurrency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ShopRow {
  return Object.freeze({
    id: s.id,
    name: s.name,
    facebookPageId: s.facebookPageId,
    defaultCurrency: s.defaultCurrency,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  });
}

function serializeMember(m: {
  id: string;
  userId: string;
  role: string;
  invitedAt: Date;
  joinedAt: Date | null;
  user: { name: string; email: string | null; image: string | null };
}): ShopMemberRow {
  return Object.freeze({
    id: m.id,
    userId: m.userId,
    role: m.role,
    invitedAt: m.invitedAt,
    joinedAt: m.joinedAt,
    user: Object.freeze({
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    }),
  });
}

// ─── Repository Interface ───────────────────────────────────────────────────

interface ShopRepository {
  findById(shopId: string): Promise<ShopRow>;
  update(shopId: string, input: UpdateShopInput): Promise<ShopRow>;
  getMembers(shopId: string): Promise<readonly ShopMemberRow[]>;
  inviteMember(shopId: string, input: InviteMemberInput): Promise<ShopMemberRow>;
  updateMemberRole(shopId: string, memberId: string, input: UpdateMemberRoleInput): Promise<ShopMemberRow>;
  removeMember(shopId: string, memberId: string): Promise<void>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const shopRepository: ShopRepository = Object.freeze({
  async findById(shopId: string) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundError('Shop not found');
    return serializeShop(shop);
  },

  async update(shopId: string, input: UpdateShopInput) {
    const existing = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!existing) throw new NotFoundError('Shop not found');

    const shop = await prisma.shop.update({
      where: { id: shopId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.facebookPageId !== undefined ? { facebookPageId: input.facebookPageId } : {}),
        ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return serializeShop(shop);
  },

  async getMembers(shopId: string) {
    const members = await prisma.shopMember.findMany({
      where: { shopId },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
      orderBy: { invitedAt: 'asc' },
    });
    return Object.freeze(members.map(serializeMember));
  },

  async inviteMember(shopId: string, input: InviteMemberInput) {
    // Find user by email
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new NotFoundError('User not found with that email');

    // Check if already a member
    const existing = await prisma.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId: user.id } },
    });
    if (existing) throw new NotFoundError('User is already a member of this shop');

    const member = await prisma.shopMember.create({
      data: {
        shopId,
        userId: user.id,
        role: input.role,
        joinedAt: new Date(),
      },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
    });
    return serializeMember(member);
  },

  async updateMemberRole(shopId: string, memberId: string, input: UpdateMemberRoleInput) {
    const existing = await prisma.shopMember.findFirst({
      where: { id: memberId, shopId },
    });
    if (!existing) throw new NotFoundError('Member not found');

    const member = await prisma.shopMember.update({
      where: { id: memberId },
      data: { role: input.role },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
    });
    return serializeMember(member);
  },

  async removeMember(shopId: string, memberId: string) {
    const existing = await prisma.shopMember.findFirst({
      where: { id: memberId, shopId },
    });
    if (!existing) throw new NotFoundError('Member not found');

    await prisma.shopMember.delete({ where: { id: memberId } });
  },
});
