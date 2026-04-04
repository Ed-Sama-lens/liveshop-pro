import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { StorefrontAuthWrapper } from '@/components/storefront/StorefrontAuthWrapper';

interface ShopLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ shopId: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shopId: string }>;
}): Promise<Metadata> {
  const { shopId } = await params;

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      name: true,
      branding: {
        select: { description: true, logo: true },
      },
    },
  });

  if (!shop) {
    return { title: 'Shop Not Found' };
  }

  return {
    title: shop.name,
    description: shop.branding?.description ?? `Shop at ${shop.name} — Powered by LiveShop Pro`,
    openGraph: {
      title: shop.name,
      description: shop.branding?.description ?? `Shop at ${shop.name}`,
      ...(shop.branding?.logo ? { images: [{ url: shop.branding.logo }] } : {}),
    },
  };
}

export default async function ShopLayout({ children, params }: ShopLayoutProps) {
  const { shopId } = await params;
  const facebookAppId = process.env.FACEBOOK_APP_ID ?? '';

  return (
    <div className="min-h-screen bg-background">
      <StorefrontAuthWrapper shopId={shopId} facebookAppId={facebookAppId}>
        {children}
      </StorefrontAuthWrapper>
    </div>
  );
}
