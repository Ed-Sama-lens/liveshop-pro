import { prisma } from '@/lib/db/prisma';
import { NotFoundError, AppError } from '@/lib/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryRow {
  readonly id: string;
  readonly shopId: string;
  readonly name: string;
  readonly createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeCategory(c: {
  id: string;
  shopId: string;
  name: string;
  createdAt: Date;
}): CategoryRow {
  return Object.freeze({
    id: c.id,
    shopId: c.shopId,
    name: c.name,
    createdAt: c.createdAt,
  });
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const categoryRepository = Object.freeze({
  async findByShop(shopId: string): Promise<readonly CategoryRow[]> {
    const categories = await prisma.productCategory.findMany({
      where: { shopId },
      orderBy: { name: 'asc' },
    });

    return Object.freeze(categories.map(serializeCategory));
  },

  async create(shopId: string, name: string): Promise<CategoryRow> {
    const category = await prisma.productCategory.create({
      data: { shopId, name },
    });

    return serializeCategory(category);
  },

  async update(id: string, name: string): Promise<CategoryRow> {
    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const category = await prisma.productCategory.update({
      where: { id },
      data: { name },
    });

    return serializeCategory(category);
  },

  async remove(id: string): Promise<void> {
    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const productCount = await prisma.product.count({
      where: { categoryId: id, isActive: true },
    });

    if (productCount > 0) {
      throw new AppError(
        `Cannot delete category: ${productCount} product(s) are still assigned to it`,
        'CATEGORY_IN_USE',
        409
      );
    }

    await prisma.productCategory.delete({ where: { id } });
  },
});
