import { prisma } from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/errors';
import type { CreateProductInput, UpdateProductInput, ProductQuery } from '@/lib/validation/product.schemas';
import type { CreateVariantInput, UpdateVariantInput } from '@/lib/validation/product.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface VariantRow {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly attributes: Record<string, string>;
  readonly price: string;
  readonly costPrice: string | null;
  readonly quantity: number;
  readonly reservedQty: number;
  readonly lowStockAt: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductRow {
  readonly id: string;
  readonly shopId: string;
  readonly stockCode: string;
  readonly saleCode: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly images: string[];
  readonly categoryId: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly category: { readonly id: string; readonly name: string } | null;
  readonly variants?: readonly VariantRow[];
  readonly _count?: { readonly variants: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeVariant(v: {
  id: string;
  productId: string;
  sku: string;
  attributes: unknown;
  price: { toString(): string };
  costPrice: { toString(): string } | null;
  quantity: number;
  reservedQty: number;
  lowStockAt: number | null;
  createdAt: Date;
  updatedAt: Date;
}): VariantRow {
  return Object.freeze({
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    attributes: v.attributes as Record<string, string>,
    price: v.price.toString(),
    costPrice: v.costPrice ? v.costPrice.toString() : null,
    quantity: v.quantity,
    reservedQty: v.reservedQty,
    lowStockAt: v.lowStockAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  });
}

function serializeProduct(
  p: {
    id: string;
    shopId: string;
    stockCode: string;
    saleCode: string | null;
    name: string;
    description: string | null;
    images: string[];
    categoryId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string } | null;
    variants?: Array<{
      id: string;
      productId: string;
      sku: string;
      attributes: unknown;
      price: { toString(): string };
      costPrice: { toString(): string } | null;
      quantity: number;
      reservedQty: number;
      lowStockAt: number | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    _count?: { variants: number };
  }
): ProductRow {
  const base = {
    id: p.id,
    shopId: p.shopId,
    stockCode: p.stockCode,
    saleCode: p.saleCode,
    name: p.name,
    description: p.description,
    images: p.images,
    categoryId: p.categoryId,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    category: p.category ? Object.freeze({ id: p.category.id, name: p.category.name }) : null,
  };

  if (p.variants !== undefined) {
    return Object.freeze({
      ...base,
      variants: Object.freeze(p.variants.map(serializeVariant)),
    });
  }

  if (p._count !== undefined) {
    return Object.freeze({
      ...base,
      _count: Object.freeze({ variants: p._count.variants }),
    });
  }

  return Object.freeze(base);
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const productRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<ProductQuery, 'search' | 'categoryId' | 'isActive'>,
    pagination: Pick<ProductQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly ProductRow[]; total: number }> {
    const { search, categoryId, isActive } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { stockCode: { contains: search, mode: 'insensitive' as const } },
              { saleCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          variants: { orderBy: { createdAt: 'asc' } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeProduct)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<ProductRow | null> {
    const product = await prisma.product.findFirst({
      where: { id, shopId },
      include: {
        category: { select: { id: true, name: true } },
        variants: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) return null;
    return serializeProduct(product);
  },

  async create(shopId: string, data: CreateProductInput): Promise<ProductRow> {
    const { variants, ...productData } = data;

    const product = await prisma.$transaction(async (tx) => {
      return tx.product.create({
        data: {
          ...productData,
          shopId,
          variants: variants.length > 0
            ? {
                create: variants.map((v) => ({
                  sku: v.sku,
                  attributes: v.attributes,
                  price: v.price,
                  costPrice: v.costPrice ?? null,
                  quantity: v.quantity,
                  lowStockAt: v.lowStockAt ?? null,
                })),
              }
            : undefined,
        },
        include: {
          category: { select: { id: true, name: true } },
          variants: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    return serializeProduct(product);
  },

  async update(shopId: string, id: string, data: UpdateProductInput): Promise<ProductRow> {
    const existing = await prisma.product.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    const product = await prisma.product.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true } },
        variants: { orderBy: { createdAt: 'asc' } },
      },
    });

    return serializeProduct(product);
  },

  async remove(shopId: string, id: string): Promise<ProductRow> {
    const existing = await prisma.product.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { variants: true } },
      },
    });

    return serializeProduct(product);
  },

  async upsertVariant(productId: string, data: CreateVariantInput | UpdateVariantInput): Promise<VariantRow> {
    const payload = data as CreateVariantInput;
    const variant = await prisma.productVariant.upsert({
      where: { productId_sku: { productId, sku: payload.sku ?? '' } },
      create: {
        productId,
        sku: payload.sku ?? '',
        attributes: payload.attributes ?? {},
        price: payload.price ?? '0',
        costPrice: payload.costPrice ?? null,
        quantity: payload.quantity ?? 0,
        lowStockAt: payload.lowStockAt ?? null,
      },
      update: {
        ...(payload.attributes !== undefined ? { attributes: payload.attributes } : {}),
        ...(payload.price !== undefined ? { price: payload.price } : {}),
        ...(payload.costPrice !== undefined ? { costPrice: payload.costPrice } : {}),
        ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
        ...(payload.lowStockAt !== undefined ? { lowStockAt: payload.lowStockAt } : {}),
      },
    });

    return serializeVariant(variant);
  },

  async removeVariant(productId: string, variantId: string): Promise<void> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });

    if (!variant) {
      throw new NotFoundError('Variant not found');
    }

    await prisma.productVariant.delete({ where: { id: variantId } });
  },
});
