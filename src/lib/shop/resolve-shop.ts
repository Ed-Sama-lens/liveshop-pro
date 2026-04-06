import { prisma } from '@/lib/db/prisma';

/**
 * Resolve a shop identifier (slug or cuid) to the actual shop ID.
 * Tries slug first, then falls back to ID lookup.
 */
export async function resolveShopId(identifier: string): Promise<string | null> {
  // Try slug first (slugs are shorter and readable)
  const bySlug = await prisma.shop.findUnique({
    where: { slug: identifier },
    select: { id: true },
  });

  if (bySlug) return bySlug.id;

  // Fall back to ID (for backwards compatibility)
  const byId = await prisma.shop.findUnique({
    where: { id: identifier },
    select: { id: true },
  });

  return byId?.id ?? null;
}
