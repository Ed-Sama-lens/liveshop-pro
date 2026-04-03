import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { generateProductCsv } from '@/lib/csv/product-csv';
import { productRepository } from '@/server/repositories/product.repository';

// GET /api/products/export — download all products as CSV (OWNER, MANAGER, WAREHOUSE)
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireRole('OWNER', 'MANAGER', 'WAREHOUSE');

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    // Fetch all products with variants — paginate internally to avoid memory spikes
    const PAGE_SIZE = 100;
    let page = 1;
    let total = Infinity;
    const allProducts: Awaited<ReturnType<typeof productRepository.findById>>[] = [];

    while ((page - 1) * PAGE_SIZE < total) {
      const { items, total: fetchedTotal } = await productRepository.findMany(
        user.shopId,
        { search: undefined, categoryId: undefined, isActive: undefined },
        { page, limit: PAGE_SIZE }
      );
      total = fetchedTotal;

      // Fetch full product with variants for each item
      const withVariants = await Promise.all(
        items.map((p) => productRepository.findById(user.shopId as string, p.id))
      );

      for (const product of withVariants) {
        if (product !== null) {
          allProducts.push(product);
        }
      }

      page += 1;
    }

    const csv = generateProductCsv(allProducts.filter((p): p is NonNullable<typeof p> => p !== null));

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products.csv"',
      },
    });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
