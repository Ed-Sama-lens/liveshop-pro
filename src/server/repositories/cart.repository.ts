import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import type { AddToCartInput, UpdateCartItemInput } from '@/lib/validation/storefront.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface CartItemRow {
  readonly id: string;
  readonly cartId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly product: {
    readonly name: string;
    readonly images: readonly string[];
  };
  readonly variant: {
    readonly sku: string;
    readonly attributes: unknown;
    readonly price: string;
    readonly quantity: number;
    readonly reservedQty: number;
  };
}

export interface CartRow {
  readonly id: string;
  readonly shopId: string;
  readonly customerId: string;
  readonly items: readonly CartItemRow[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cartInclude = {
  items: {
    include: {
      product: { select: { name: true, images: true } },
      variant: {
        select: { sku: true, attributes: true, price: true, quantity: true, reservedQty: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

function serializeCartItem(item: {
  id: string;
  cartId: string;
  productId: string;
  variantId: string;
  quantity: number;
  product: { name: string; images: string[] };
  variant: { sku: string; attributes: unknown; price: unknown; quantity: number; reservedQty: number };
}): CartItemRow {
  return Object.freeze({
    id: item.id,
    cartId: item.cartId,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    product: Object.freeze({
      name: item.product.name,
      images: Object.freeze([...item.product.images]),
    }),
    variant: Object.freeze({
      sku: item.variant.sku,
      attributes: item.variant.attributes,
      price: String(item.variant.price),
      quantity: item.variant.quantity,
      reservedQty: item.variant.reservedQty,
    }),
  });
}

function serializeCart(cart: {
  id: string;
  shopId: string;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    cartId: string;
    productId: string;
    variantId: string;
    quantity: number;
    product: { name: string; images: string[] };
    variant: { sku: string; attributes: unknown; price: unknown; quantity: number; reservedQty: number };
  }[];
}): CartRow {
  return Object.freeze({
    id: cart.id,
    shopId: cart.shopId,
    customerId: cart.customerId,
    items: Object.freeze(cart.items.map(serializeCartItem)),
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  });
}

// ─── Repository Interface ───────────────────────────────────────────────────

interface CartRepository {
  getOrCreate(shopId: string, customerId: string): Promise<CartRow>;
  addItem(shopId: string, customerId: string, input: AddToCartInput): Promise<CartRow>;
  updateItem(cartItemId: string, customerId: string, input: UpdateCartItemInput): Promise<CartRow>;
  removeItem(cartItemId: string, customerId: string): Promise<CartRow>;
  clear(shopId: string, customerId: string): Promise<void>;
  getItemCount(shopId: string, customerId: string): Promise<number>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const cartRepository: CartRepository = Object.freeze({
  async getOrCreate(shopId: string, customerId: string) {
    const cart = await prisma.cart.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: { shopId, customerId },
      update: {},
      include: cartInclude,
    });
    return serializeCart(cart);
  },

  async addItem(shopId: string, customerId: string, input: AddToCartInput) {
    // Verify variant exists and has stock
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { select: { shopId: true, isActive: true } } },
    });
    if (!variant || variant.product.shopId !== shopId || !variant.product.isActive) {
      throw new NotFoundError('Product variant not found');
    }

    const available = variant.quantity - variant.reservedQty;
    if (input.quantity > available) {
      throw new ValidationError('Insufficient stock', {
        quantity: [`Only ${available} available`],
      });
    }

    // Upsert cart
    const cart = await prisma.cart.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: { shopId, customerId },
      update: {},
    });

    // Check if item already exists
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    });

    if (existing) {
      const newQty = existing.quantity + input.quantity;
      if (newQty > available) {
        throw new ValidationError('Insufficient stock', {
          quantity: [`Only ${available} available, ${existing.quantity} already in cart`],
        });
      }
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
        },
      });
    }

    // Return updated cart
    const updated = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: cartInclude,
    });
    return serializeCart(updated);
  },

  async updateItem(cartItemId: string, customerId: string, input: UpdateCartItemInput) {
    const item = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: {
        cart: { select: { id: true, customerId: true } },
        variant: { select: { quantity: true, reservedQty: true } },
      },
    });
    if (!item || item.cart.customerId !== customerId) {
      throw new NotFoundError('Cart item not found');
    }

    if (input.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: cartItemId } });
    } else {
      const available = item.variant.quantity - item.variant.reservedQty;
      if (input.quantity > available) {
        throw new ValidationError('Insufficient stock', {
          quantity: [`Only ${available} available`],
        });
      }
      await prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity: input.quantity },
      });
    }

    const cart = await prisma.cart.findUniqueOrThrow({
      where: { id: item.cart.id },
      include: cartInclude,
    });
    return serializeCart(cart);
  },

  async removeItem(cartItemId: string, customerId: string) {
    const item = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: { select: { id: true, customerId: true } } },
    });
    if (!item || item.cart.customerId !== customerId) {
      throw new NotFoundError('Cart item not found');
    }

    await prisma.cartItem.delete({ where: { id: cartItemId } });

    const cart = await prisma.cart.findUniqueOrThrow({
      where: { id: item.cart.id },
      include: cartInclude,
    });
    return serializeCart(cart);
  },

  async clear(shopId: string, customerId: string) {
    const cart = await prisma.cart.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
    });
    if (!cart) return;

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  },

  async getItemCount(shopId: string, customerId: string) {
    const cart = await prisma.cart.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
      include: { items: { select: { quantity: true } } },
    });
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  },
});
