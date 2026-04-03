import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError, NotFoundError } from '@/lib/errors';
import { productRepository } from '@/server/repositories/product.repository';

interface RouteContext {
  params: Promise<{ id: string; filename: string }>;
}

// DELETE /api/products/[id]/images/[filename] — remove image (OWNER, MANAGER only)
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const { id: productId, filename } = await context.params;

    const product = await productRepository.findById(user.shopId, productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Find the image URL that ends with this filename
    const imageUrl = product.images.find((img) => img.endsWith(`/${filename}`));
    if (!imageUrl) {
      throw new NotFoundError('Image not found');
    }

    // Immutable update: filter out the removed image
    const updatedImages = product.images.filter((img) => img !== imageUrl);
    await productRepository.update(user.shopId, productId, { images: updatedImages });

    // Delete file from disk (best-effort — don't fail if already gone)
    try {
      const filePath = join(process.cwd(), 'public', 'uploads', 'products', productId, filename);
      await unlink(filePath);
    } catch {
      // File may not exist on disk; repository update already succeeded
    }

    return NextResponse.json(ok({ images: updatedImages }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
