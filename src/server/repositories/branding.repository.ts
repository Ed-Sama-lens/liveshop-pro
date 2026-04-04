import { prisma } from '@/lib/db/prisma';
import type { ShopBrandingInput } from '@/lib/validation/storefront.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface BrandingRow {
  readonly id: string;
  readonly shopId: string;
  readonly logo: string | null;
  readonly banner: string | null;
  readonly primaryColor: string | null;
  readonly accentColor: string | null;
  readonly description: string | null;
  readonly promptpayQrUrl: string | null;
  readonly promptpayNote: string | null;
  readonly bankName: string | null;
  readonly bankAccount: string | null;
  readonly bankAccountName: string | null;
  readonly bankNote: string | null;
  readonly shopName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeBranding(b: {
  id: string;
  shopId: string;
  logo: string | null;
  banner: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  description: string | null;
  promptpayQrUrl: string | null;
  promptpayNote: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  bankNote: string | null;
  shop: { name: string };
}): BrandingRow {
  return Object.freeze({
    id: b.id,
    shopId: b.shopId,
    logo: b.logo,
    banner: b.banner,
    primaryColor: b.primaryColor,
    accentColor: b.accentColor,
    description: b.description,
    promptpayQrUrl: b.promptpayQrUrl,
    promptpayNote: b.promptpayNote,
    bankName: b.bankName,
    bankAccount: b.bankAccount,
    bankAccountName: b.bankAccountName,
    bankNote: b.bankNote,
    shopName: b.shop.name,
  });
}

// ─── Repository Interface ───────────────────────────────────────────────────

interface BrandingRepository {
  findByShopId(shopId: string): Promise<BrandingRow | null>;
  upsert(shopId: string, input: ShopBrandingInput): Promise<BrandingRow>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const brandingRepository: BrandingRepository = Object.freeze({
  async findByShopId(shopId: string) {
    const branding = await prisma.shopBranding.findUnique({
      where: { shopId },
      include: { shop: { select: { name: true } } },
    });
    if (!branding) return null;
    return serializeBranding(branding);
  },

  async upsert(shopId: string, input: ShopBrandingInput) {
    const data = {
      ...(input.logo !== undefined ? { logo: input.logo } : {}),
      ...(input.banner !== undefined ? { banner: input.banner } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.promptpayQrUrl !== undefined ? { promptpayQrUrl: input.promptpayQrUrl } : {}),
      ...(input.promptpayNote !== undefined ? { promptpayNote: input.promptpayNote } : {}),
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.bankAccount !== undefined ? { bankAccount: input.bankAccount } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName } : {}),
      ...(input.bankNote !== undefined ? { bankNote: input.bankNote } : {}),
    };

    const branding = await prisma.shopBranding.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: data,
      include: { shop: { select: { name: true } } },
    });
    return serializeBranding(branding);
  },
});
