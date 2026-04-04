import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { StorefrontCheckoutInput } from '@/lib/validation/settings.schemas';
import { sendEmail } from '@/lib/email/client';
import { orderConfirmationEmail } from '@/lib/email/templates';
import { notifyNewOrder } from '@/server/services/notification.service';
import { dispatchWebhook } from '@/server/services/webhook.service';

export interface CheckoutResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly totalAmount: string;
  readonly itemCount: number;
}

interface CheckoutRepository {
  checkout(shopId: string, customerId: string, input: StorefrontCheckoutInput): Promise<CheckoutResult>;
}

export const checkoutRepository: CheckoutRepository = Object.freeze({
  async checkout(shopId: string, customerId: string, input: StorefrontCheckoutInput) {
    // Get cart with items
    const cart = await prisma.cart.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
      include: {
        items: {
          include: {
            variant: { select: { id: true, price: true, quantity: true, reservedQty: true } },
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new ValidationError('Cart is empty');
    }

    // Validate stock availability for all items
    for (const item of cart.items) {
      const available = item.variant.quantity - item.variant.reservedQty;
      if (item.quantity > available) {
        throw new ValidationError(`Insufficient stock for ${item.product.name}`, {
          [item.variant.id]: [`Only ${available} available, requested ${item.quantity}`],
        });
      }
    }

    // Find or create customer record
    let customer = await prisma.customer.findFirst({
      where: { id: customerId, shopId },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          id: customerId,
          shopId,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          address: input.address,
          district: input.district ?? null,
          province: input.province ?? null,
          postalCode: input.postalCode ?? null,
          channel: 'STOREFRONT',
          shippingType: input.shippingType,
        },
      });
    } else {
      // Update customer info
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email ?? customer.email,
          address: input.address,
          district: input.district ?? customer.district,
          province: input.province ?? customer.province,
          postalCode: input.postalCode ?? customer.postalCode,
          shippingType: input.shippingType,
        },
      });
    }

    // Calculate total
    const totalAmount = cart.items.reduce(
      (sum, item) => sum + Number(item.variant.price) * item.quantity,
      0
    );

    // Generate order number
    const orderCount = await prisma.order.count({ where: { shopId } });
    const orderNumber = `ORD-${String(orderCount + 1).padStart(6, '0')}`;

    // Create order with items + reserve stock in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          shopId,
          customerId: customer.id,
          orderNumber,
          status: 'RESERVED',
          channel: 'STOREFRONT',
          totalAmount,
          shippingFee: 0,
          notes: input.notes ?? null,
          items: {
            create: cart.items.map((item) => ({
              productId: item.product.id,
              variantId: item.variant.id,
              quantity: item.quantity,
              unitPrice: item.variant.price,
              totalPrice: Number(item.variant.price) * item.quantity,
            })),
          },
        },
      });

      // Reserve stock for each item
      for (const item of cart.items) {
        await tx.productVariant.update({
          where: { id: item.variant.id },
          data: { reservedQty: { increment: item.quantity } },
        });

        // Create stock reservation record
        await tx.stockReservation.create({
          data: {
            variantId: item.variant.id,
            orderId: newOrder.id,
            quantity: item.quantity,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
          },
        });
      }

      // Create audit log
      await tx.orderAudit.create({
        data: {
          orderId: newOrder.id,
          action: 'CREATED',
          toStatus: 'RESERVED',
          metadata: { source: 'storefront_checkout' },
        },
      });

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // Send order confirmation email (non-blocking — don't fail checkout if email fails)
    if (customer.email) {
      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: { name: true },
      });

      const emailData = orderConfirmationEmail({
        customerName: customer.name,
        orderNumber,
        items: cart.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: String(item.variant.price),
        })),
        totalAmount: String(totalAmount),
        shopName: shop?.name ?? 'LiveShop',
      });

      sendEmail({
        to: customer.email,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      }).catch(() => {
        // Email failure should not block checkout
      });
    }

    // In-app notification (non-blocking)
    notifyNewOrder(shopId, orderNumber, customer.name, String(totalAmount)).catch(() => {});

    // Webhook dispatch (non-blocking)
    dispatchWebhook(shopId, 'order.created', {
      orderId: order.id,
      orderNumber,
      customerName: customer.name,
      totalAmount: String(totalAmount),
      itemCount: cart.items.length,
    }).catch(() => {});

    return Object.freeze({
      orderId: order.id,
      orderNumber,
      totalAmount: String(totalAmount),
      itemCount: cart.items.length,
    });
  },
});
