import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import type {
  StorefrontProductQuery,
  PublishProductInput,
  UpdateStorefrontProductInput,
} from '@/lib/validation/storefront.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface StorefrontProductRow {
  readonly id: string;
  readonly shopId: string;
  readonly productId: string;
  readonly isVisible: boolean;
  readonly sortOrder: number;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly product: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly images: readonly string[];
    readonly category: { readonly name: string } | null;
    readonly variants: readonly {
      readonly id: string;
      readonly sku: string;
      readonly attributes: unknown;
      readonly price: string;
      readonly quantity: number;
      readonly reservedQty: number;
    }[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeStorefrontProduct(sp: {
  id: string;
  shopId: string;
  productId: string;
  isVisible: boolean;
  sortOrder: number;
  publishedAt: Date | null;
  createdAt: Date;
  product: {
    id: string;
    name: string;
    description: string | null;
    images: string[];
    category: { name: string } | null;
    variants: {
      id: string;
      sku: string;
      attributes: unknown;
      price: unknown;
      quantity: number;
      reservedQty: number;
    }[];
  };
}): StorefrontProductRow {
  return Object.freeze({
    id: sp.id,
    shopId: sp.shopId,
    productId: sp.productId,
    isVisible: sp.isVisible,
    sortOrder: sp.sortOrder,
    publishedAt: sp.publishedAt,
    createdAt: sp.createdAt,
    product: Object.freeze({
      id: sp.product.id,
      name: sp.product.name,
      description: sp.product.description,
      images: Object.freeze([...sp.product.images]),
      category: sp.product.category ? Object.freeze({ name: sp.product.category.name }) : null,
      variants: Object.freeze(
        sp.product.variants.map((v) =>
          Object.freeze({
            id: v.id,
            sku: v.sku,
            attributes: v.attributes,
            price: String(v.price),
            quantity: v.quantity,
            reservedQty: v.reservedQty,
          })
        )
      ),
    }),
  });
}

const productInclude = {
  product: {
    include: {
      category: { select: { name: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          attributes: true,
          price: true,
          quantity: true,
          reservedQty: true,
        },
      },
    },
  },
} as const;

// ─── Repository Interface ───────────────────────────────────────────────────

interface StorefrontRepository {
  findPublic(shopId: string, query: StorefrontProductQuery): Promise<{
    items: readonly StorefrontProductRow[];
    total: number;
  }>;
  findPublicById(shopId: string, productId: string): Promise<StorefrontProductRow>;
  findAll(shopId: string): Promise<readonly StorefrontProductRow[]>;
  publish(shopId: string, input: PublishProductInput): Promise<StorefrontProductRow>;
  update(shopId: string, id: string, input: UpdateStorefrontProductInput): Promise<StorefrontProductRow>;
  unpublish(shopId: string, id: string): Promise<void>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const storefrontRepository: StorefrontRepository = Object.freeze({
  async findPublic(shopId: string, query: StorefrontProductQuery) {
    const where = {
      shopId,
      isVisible: true,
      product: {
        isActive: true,
        ...(query.category ? { category: { name: query.category } } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      },
    };

    const [items, total] = await Promise.all([
      prisma.storefrontProduct.findMany({
        where,
        include: productInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.storefrontProduct.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeStorefrontProduct)),
      total,
    });
  },

  async findPublicById(shopId: string, productId: string) {
    const sp = await prisma.storefrontProduct.findFirst({
      where: { shopId, productId, isVisible: true, product: { isActive: true } },
      include: productInclude,
    });
    if (!sp) throw new NotFoundError('Product not found');
    return serializeStorefrontProduct(sp);
  },

  async findAll(shopId: string) {
    const items = await prisma.storefrontProduct.findMany({
      where: { shopId },
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return Object.freeze(items.map(serializeStorefrontProduct));
  },

  async publish(shopId: string, input: PublishProductInput) {
    // Verify product belongs to shop
    const product = await prisma.product.findFirst({
      where: { id: input.productId, shopId, isActive: true },
    });
    if (!product) throw new NotFoundError('Product not found');

    // Check for duplicate
    const existing = await prisma.storefrontProduct.findUnique({
      where: { shopId_productId: { shopId, productId: input.productId } },
    });
    if (existing) throw new ConflictError('Product is already published to storefront');

    const sp = await prisma.storefrontProduct.create({
      data: {
        shopId,
        productId: input.productId,
        isVisible: input.isVisible,
        sortOrder: input.sortOrder,
        publishedAt: new Date(),
      },
      include: productInclude,
    });
    return serializeStorefrontProduct(sp);
  },

  async update(shopId: string, id: string, input: UpdateStorefrontProductInput) {
    const existing = await prisma.storefrontProduct.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundError('Storefront product not found');

    const sp = await prisma.storefrontProduct.update({
      where: { id },
      data: {
        ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: productInclude,
    });
    return serializeStorefrontProduct(sp);
  },

  async unpublish(shopId: string, id: string) {
    const existing = await prisma.storefrontProduct.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundError('Storefront product not found');

    await prisma.storefrontProduct.delete({ where: { id } });
  },
});
