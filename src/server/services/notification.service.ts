import { notificationRepository } from '@/server/repositories/notification.repository';

/**
 * Create notifications for business events.
 * All methods are fire-and-forget — failures are logged, never thrown.
 */

export async function notifyNewOrder(
  shopId: string,
  orderNumber: string,
  customerName: string,
  totalAmount: string
): Promise<void> {
  try {
    await notificationRepository.create({
      shopId,
      type: 'NEW_ORDER',
      title: `New Order ${orderNumber}`,
      body: `${customerName} placed an order for ฿${Number(totalAmount).toLocaleString()}`,
      link: `/orders?search=${orderNumber}`,
    });
  } catch {
    // Non-critical — don't block business logic
  }
}

export async function notifyLowStock(
  shopId: string,
  productName: string,
  sku: string,
  available: number
): Promise<void> {
  try {
    await notificationRepository.create({
      shopId,
      type: 'LOW_STOCK',
      title: 'Low Stock Alert',
      body: `${productName} (${sku}) has only ${available} units left`,
      link: '/inventory',
    });
  } catch {
    // Non-critical
  }
}

export async function notifyNewChat(
  shopId: string,
  customerName: string,
  chatId: string
): Promise<void> {
  try {
    await notificationRepository.create({
      shopId,
      type: 'NEW_CHAT',
      title: 'New Message',
      body: `${customerName} sent a new message`,
      link: '/chat',
    });
  } catch {
    // Non-critical
  }
}

export async function notifyShipmentUpdate(
  shopId: string,
  orderNumber: string,
  status: string
): Promise<void> {
  try {
    await notificationRepository.create({
      shopId,
      type: 'SHIPMENT_UPDATE',
      title: 'Shipment Update',
      body: `Order ${orderNumber} shipment status: ${status}`,
      link: `/shipping`,
    });
  } catch {
    // Non-critical
  }
}

export async function notifyPaymentReceived(
  shopId: string,
  orderNumber: string,
  amount: string
): Promise<void> {
  try {
    await notificationRepository.create({
      shopId,
      type: 'PAYMENT_RECEIVED',
      title: 'Payment Received',
      body: `Payment of ฿${Number(amount).toLocaleString()} for ${orderNumber}`,
      link: `/orders?search=${orderNumber}`,
    });
  } catch {
    // Non-critical
  }
}
