import { activityRepository, type CreateActivityInput } from '@/server/repositories/activity.repository';

/**
 * Log an admin activity. Fire-and-forget — never blocks the caller.
 */
export function logActivity(input: CreateActivityInput): Promise<void> {
  return activityRepository.create(input).then(() => undefined);
}

// ─── Convenience Loggers ──────────────────────────────────────────────────

export function logOrderStatusChange(
  shopId: string,
  userId: string | null,
  userName: string | null,
  orderNumber: string,
  orderId: string,
  fromStatus: string,
  toStatus: string
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'STATUS_CHANGE',
    entity: 'order',
    entityId: orderId,
    description: `Order ${orderNumber} status changed from ${fromStatus} to ${toStatus}`,
    metadata: { orderNumber, fromStatus, toStatus },
  });
}

export function logPaymentVerified(
  shopId: string,
  userId: string | null,
  userName: string | null,
  orderNumber: string,
  orderId: string,
  amount: string
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'PAYMENT_VERIFIED',
    entity: 'payment',
    entityId: orderId,
    description: `Payment verified for order ${orderNumber} — ${amount}`,
    metadata: { orderNumber, amount },
  });
}

export function logProductCreated(
  shopId: string,
  userId: string | null,
  userName: string | null,
  productName: string,
  productId: string
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'CREATED',
    entity: 'product',
    entityId: productId,
    description: `Product "${productName}" created`,
  });
}

export function logProductUpdated(
  shopId: string,
  userId: string | null,
  userName: string | null,
  productName: string,
  productId: string
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'UPDATED',
    entity: 'product',
    entityId: productId,
    description: `Product "${productName}" updated`,
  });
}

export function logShipmentCreated(
  shopId: string,
  userId: string | null,
  userName: string | null,
  orderNumber: string,
  shipmentId: string,
  provider: string,
  trackingNumber: string | null
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'SHIPMENT_CREATED',
    entity: 'shipment',
    entityId: shipmentId,
    description: `Shipment created for order ${orderNumber} via ${provider}${trackingNumber ? ` (${trackingNumber})` : ''}`,
    metadata: { orderNumber, provider, trackingNumber },
  });
}

export function logSettingsUpdated(
  shopId: string,
  userId: string | null,
  userName: string | null,
  section: string
): Promise<void> {
  return logActivity({
    shopId,
    userId,
    userName,
    action: 'SETTINGS_UPDATED',
    entity: 'settings',
    description: `${section} settings updated`,
    metadata: { section },
  });
}
