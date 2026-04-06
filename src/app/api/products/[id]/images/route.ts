import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError, NotFoundError, ValidationError } from '@/lib/errors';
import { productRepository } from '@/server/repositories/product.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_FILES = 5;
const MAX_WIDTH = 1200;

// POST /api/products/[id]/images — upload images (OWNER, MANAGER only)
export async function POST(
  request: NextRequest,
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

    const { id: productId } = await context.params;

    const product = await productRepository.findById(user.shopId, productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const formData = await request.formData();
    // Accept both 'files' and 'images' field names
    let files = formData.getAll('files') as File[];
    if (files.length === 0) {
      files = formData.getAll('images') as File[];
    }

    if (files.length === 0) {
      throw new ValidationError('No images provided');
    }

    if (files.length > MAX_FILES) {
      throw new ValidationError(`Maximum ${MAX_FILES} images allowed per upload`);
    }

    // Validate all files before processing
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new ValidationError(
          `Invalid file type: ${file.type}. Allowed: jpeg, png, webp`
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new ValidationError(
          `File ${file.name} exceeds maximum size of 4MB`
        );
      }
    }

    const newUrls: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());

      // Optimize image with sharp
      const optimized = await sharp(buffer)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const filename = `products/${productId}/${crypto.randomUUID()}.webp`;

      // Upload to Vercel Blob
      const blob = await put(filename, optimized, {
        access: 'public',
        contentType: 'image/webp',
      });

      newUrls.push(blob.url);
    }

    // Immutable update: read current images, concat new, write back
    const updatedImages = [...product.images, ...newUrls];
    await productRepository.update(user.shopId, productId, { images: updatedImages });

    return NextResponse.json(ok({ images: updatedImages }), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
