import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { paymentRepository } from '@/server/repositories/payment.repository';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_SLIP_SIZE = 5 * 1024 * 1024; // 5 MB

// POST /api/orders/[id]/payment/slip — upload payment slip image
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    await requireAuth();

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(error('Request must be multipart/form-data'), { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(error('No file provided'), { status: 400 });
    }

    if (file.size > MAX_SLIP_SIZE) {
      return NextResponse.json(error('File size exceeds 5 MB limit'), { status: 413 });
    }

    const { id: orderId } = await context.params;

    // Save slip to uploads directory
    const ext = file.name.split('.').pop() ?? 'jpg';
    const filename = `slip-${orderId}-${Date.now()}.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'slips');
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, filename), buffer);

    const slipUrl = `/uploads/slips/${filename}`;
    const payment = await paymentRepository.uploadSlip(orderId, slipUrl);

    return NextResponse.json(ok(payment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
