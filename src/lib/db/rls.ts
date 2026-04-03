import { prisma } from './prisma';
import { logger } from '@/lib/logging/logger';

// Models with a direct shopId column. ProductVariant inherits shop scope
// via Product relation — do NOT include it here (it has no shopId field).
const SHOP_SCOPED_MODELS = [
  'Product',
  'ProductCategory',
  'Customer',
  'Order',
  'Chat',
  'ChatMessage',
  'LiveSession',
  'StorefrontProduct',
  'Cart',
] as const;

type ShopScopedModel = (typeof SHOP_SCOPED_MODELS)[number];

export const RLS_SETUP_SQL = `
-- Tables with direct shopId column
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorefrontProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;

-- Tables without shopId (inherit via parent relation)
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_shop_isolation ON "Product"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY product_category_shop_isolation ON "ProductCategory"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY customer_shop_isolation ON "Customer"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY order_shop_isolation ON "Order"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY chat_shop_isolation ON "Chat"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY live_session_shop_isolation ON "LiveSession"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY storefront_product_shop_isolation ON "StorefrontProduct"
  USING ("shopId" = current_setting('app.current_shop_id', true));

CREATE POLICY cart_shop_isolation ON "Cart"
  USING ("shopId" = current_setting('app.current_shop_id', true));
`;

export async function applyRLS(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(RLS_SETUP_SQL);
    logger.info('[RLS] Row-Level Security policies applied');
  } catch (err) {
    logger.warn({ err }, '[RLS] RLS setup warning (policies may already exist)');
  }
}

/**
 * Prisma middleware that enforces shopId on write operations for shop-scoped models.
 * Rejects creates/updates without a shopId to prevent cross-shop data leakage.
 */
export function createShopMiddleware() {
  const writeOps = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

  return async (params: { model?: string; action: string; args: Record<string, unknown> }, next: (params: unknown) => Promise<unknown>) => {
    const isShopScoped = SHOP_SCOPED_MODELS.includes(params.model as ShopScopedModel);
    const isWrite = writeOps.includes(params.action);

    if (isShopScoped && isWrite) {
      const data = params.args?.['data'] as Record<string, unknown> | undefined;
      const where = params.args?.['where'] as Record<string, unknown> | undefined;

      if (params.action === 'create' || params.action === 'upsert') {
        if (!data?.['shopId']) {
          throw new Error(`shopId is required for ${params.model}.${params.action}`);
        }
      }

      if (params.action === 'update' || params.action === 'delete') {
        if (!where?.['shopId'] && !where?.['id']) {
          logger.warn(
            { model: params.model, action: params.action },
            '[RLS] Write operation without shopId scope'
          );
        }
      }
    }

    return next(params);
  };
}
