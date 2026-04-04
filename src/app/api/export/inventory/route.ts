import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { buildCsv } from '@/lib/export/csv';

// GET /api/export/inventory — export inventory as CSV
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'WAREHOUSE'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const products = await prisma.product.findMany({
      where: { shopId: user.shopId },
      include: {
        category: { select: { name: true } },
        variants: {
          select: {
            sku: true,
            attributes: true,
            price: true,
            costPrice: true,
            quantity: true,
            reservedQty: true,
            lowStockAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Flatten: one row per variant
    const rows = products.flatMap((product) =>
      product.variants.map((variant) => ({
        stockCode: product.stockCode,
        saleCode: product.saleCode ?? '',
        productName: product.name,
        category: product.category?.name ?? '',
        sku: variant.sku,
        attributes: typeof variant.attributes === 'object'
          ? Object.entries(variant.attributes as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(', ')
          : '',
        price: Number(variant.price).toFixed(2),
        costPrice: variant.costPrice ? Number(variant.costPrice).toFixed(2) : '',
        quantity: variant.quantity,
        reserved: variant.reservedQty,
        available: variant.quantity - variant.reservedQty,
        lowStockAt: variant.lowStockAt ?? '',
        isActive: product.isActive ? 'Yes' : 'No',
      }))
    );

    const csv = buildCsv(rows, [
      { key: 'stockCode', header: 'Stock Code' },
      { key: 'saleCode', header: 'Sale Code' },
      { key: 'productName', header: 'Product Name' },
      { key: 'category', header: 'Category' },
      { key: 'sku', header: 'SKU' },
      { key: 'attributes', header: 'Attributes' },
      { key: 'price', header: 'Price (฿)' },
      { key: 'costPrice', header: 'Cost Price (฿)' },
      { key: 'quantity', header: 'Total Qty' },
      { key: 'reserved', header: 'Reserved' },
      { key: 'available', header: 'Available' },
      { key: 'lowStockAt', header: 'Low Stock Threshold' },
      { key: 'isActive', header: 'Active' },
    ]);

    const filename = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
