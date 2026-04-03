import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { parseProductCsv } from '@/lib/csv/product-csv';
import { productRepository } from '@/server/repositories/product.repository';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// POST /api/products/import — import products from CSV (OWNER, MANAGER only)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireRole('OWNER', 'MANAGER');

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(error('Request must be multipart/form-data'), { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(error('No file provided'), { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(error('File size exceeds 5 MB limit'), { status: 413 });
    }

    const text = await file.text();
    const { rows, errors: rowErrors } = parseProductCsv(text);

    let created = 0;
    let updated = 0;
    const importErrors = [...rowErrors];

    for (const row of rows) {
      try {
        // Check if a product with this stockCode already exists in the shop
        const existing = await productRepository.findMany(
          user.shopId,
          { search: row.stockCode, categoryId: undefined, isActive: undefined },
          { page: 1, limit: 1 }
        );

        const match = existing.items.find((p) => p.stockCode === row.stockCode);

        let attributes: Record<string, string> = {};
        if (row.attributes) {
          try {
            const parsed: unknown = JSON.parse(row.attributes);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              attributes = parsed as Record<string, string>;
            }
          } catch {
            // Invalid JSON — treat as empty attributes
          }
        }

        const price = row.price;
        const costPrice = row.costPrice || undefined;
        const quantity = row.quantity ? parseInt(row.quantity, 10) : 0;
        const lowStockAt = row.lowStockAt ? parseInt(row.lowStockAt, 10) : undefined;

        if (match) {
          // Upsert the variant on the existing product
          await productRepository.upsertVariant(match.id, {
            sku: row.sku,
            attributes,
            price,
            costPrice,
            quantity,
            lowStockAt,
          });
          updated += 1;
        } else {
          // Create new product with the variant
          await productRepository.create(user.shopId, {
            stockCode: row.stockCode,
            saleCode: row.saleCode || undefined,
            name: row.name,
            description: row.description || undefined,
            categoryId: undefined,
            variants: [
              {
                sku: row.sku,
                attributes,
                price,
                costPrice,
                quantity,
                lowStockAt,
              },
            ],
          });
          created += 1;
        }
      } catch (rowErr: unknown) {
        const appErr = toAppError(rowErr);
        importErrors.push(Object.freeze({ line: 0, message: `Row (${row.stockCode}): ${appErr.message}` }));
      }
    }

    return NextResponse.json(
      ok({ created, updated, errors: importErrors }),
      { status: 200 }
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
