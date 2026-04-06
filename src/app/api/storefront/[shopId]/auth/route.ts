import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { z } from 'zod';

const facebookAuthSchema = z.object({
  accessToken: z.string().min(1, 'Facebook access token is required'),
});

interface FacebookProfile {
  id: string;
  name: string;
  email?: string;
  picture?: { data?: { url?: string } };
}

// POST /api/storefront/[shopId]/auth — exchange Facebook token for customer ID
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');

    const body = await request.json();
    const parsed = facebookAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(error('Invalid request'), { status: 400 });
    }

    // Verify token with Facebook Graph API
    const fbRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${parsed.data.accessToken}`
    );

    if (!fbRes.ok) {
      return NextResponse.json(error('Invalid Facebook token'), { status: 401 });
    }

    const profile: FacebookProfile = await fbRes.json();

    if (!profile.id || !profile.name) {
      return NextResponse.json(error('Could not retrieve Facebook profile'), { status: 401 });
    }


    // Find or create customer by facebookId in this shop
    const existing = await prisma.customer.findFirst({
      where: { shopId, facebookId: profile.id },
      select: { id: true, name: true },
    });

    if (existing) {
      return NextResponse.json(ok({
        customerId: existing.id,
        customerName: existing.name,
        facebookId: profile.id,
        isNew: false,
      }));
    }

    // Create new customer
    const newCustomer = await prisma.customer.create({
      data: {
        shopId,
        facebookId: profile.id,
        name: profile.name,
        email: profile.email ?? null,
        channel: 'FACEBOOK',
      },
      select: { id: true, name: true },
    });

    return NextResponse.json(ok({
      customerId: newCustomer.id,
      customerName: newCustomer.name,
      facebookId: profile.id,
      isNew: true,
    }), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
