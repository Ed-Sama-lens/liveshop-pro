/**
 * Type-safe job data interfaces for all 4 Bull queues.
 * Processors will be implemented in their respective phase:
 * - OrderJobData: Phase 4
 * - MessageJobData: Phase 5
 * - InventoryJobData: Phase 2
 * - AnalyticsJobData: Phase 8
 */

export interface OrderJobData {
  readonly type: 'order:created' | 'order:confirmed' | 'order:cancelled';
  readonly orderId: string;
  readonly shopId: string;
  readonly customerId: string;
}

export interface MessageJobData {
  readonly type: 'message:send' | 'message:webhook';
  readonly shopId: string;
  readonly customerId: string;
  readonly content: string;
  readonly fbPageId?: string;
}

export interface InventoryJobData {
  readonly type: 'stock:reserve' | 'stock:release' | 'stock:update';
  readonly shopId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly orderId?: string;
}

export interface AnalyticsJobData {
  readonly type: 'analytics:order' | 'analytics:live' | 'analytics:daily';
  readonly shopId: string;
  readonly eventData: Record<string, unknown>;
}

export interface ReservationExpiryJobData {
  readonly type: 'reservation:expire';
  readonly shopId: string;
}

export type AnyJobData =
  | OrderJobData
  | MessageJobData
  | InventoryJobData
  | AnalyticsJobData
  | ReservationExpiryJobData;

export function isOrderJob(data: AnyJobData): data is OrderJobData {
  return data.type.startsWith('order:');
}

export function isMessageJob(data: AnyJobData): data is MessageJobData {
  return data.type.startsWith('message:');
}

export function isInventoryJob(data: AnyJobData): data is InventoryJobData {
  return data.type.startsWith('stock:');
}

export function isAnalyticsJob(data: AnyJobData): data is AnalyticsJobData {
  return data.type.startsWith('analytics:');
}

export function isReservationExpiryJobData(data: AnyJobData): data is ReservationExpiryJobData {
  return data.type === 'reservation:expire';
}
