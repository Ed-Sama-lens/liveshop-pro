import { describe, it, expect } from 'vitest';
import {
  isOrderJob,
  isMessageJob,
  isInventoryJob,
  isAnalyticsJob,
  type OrderJobData,
  type MessageJobData,
  type InventoryJobData,
  type AnalyticsJobData,
  type AnyJobData,
} from '@/server/queues/processors';

describe('Job type guards', () => {
  const orderJob: OrderJobData = {
    type: 'order:created',
    orderId: 'order-1',
    shopId: 'shop-1',
    customerId: 'customer-1',
  };

  const messageJob: MessageJobData = {
    type: 'message:send',
    shopId: 'shop-1',
    customerId: 'customer-1',
    content: 'Hello',
  };

  const inventoryJob: InventoryJobData = {
    type: 'stock:reserve',
    shopId: 'shop-1',
    variantId: 'variant-1',
    quantity: 5,
  };

  const analyticsJob: AnalyticsJobData = {
    type: 'analytics:order',
    shopId: 'shop-1',
    eventData: { revenue: 100 },
  };

  describe('isOrderJob()', () => {
    it('correctly identifies OrderJobData', () => {
      expect(isOrderJob(orderJob)).toBe(true);
    });

    it('returns false for non-order jobs', () => {
      expect(isOrderJob(messageJob)).toBe(false);
      expect(isOrderJob(inventoryJob)).toBe(false);
      expect(isOrderJob(analyticsJob)).toBe(false);
    });

    it('matches all order type variants', () => {
      const types = ['order:created', 'order:confirmed', 'order:cancelled'] as const;
      for (const type of types) {
        const job: OrderJobData = { ...orderJob, type };
        expect(isOrderJob(job)).toBe(true);
      }
    });
  });

  describe('isMessageJob()', () => {
    it('correctly identifies MessageJobData', () => {
      expect(isMessageJob(messageJob)).toBe(true);
    });

    it('returns false for non-message jobs', () => {
      expect(isMessageJob(orderJob)).toBe(false);
      expect(isMessageJob(inventoryJob)).toBe(false);
      expect(isMessageJob(analyticsJob)).toBe(false);
    });

    it('matches all message type variants', () => {
      const types = ['message:send', 'message:webhook'] as const;
      for (const type of types) {
        const job: MessageJobData = { ...messageJob, type };
        expect(isMessageJob(job)).toBe(true);
      }
    });
  });

  describe('isInventoryJob()', () => {
    it('correctly identifies InventoryJobData', () => {
      expect(isInventoryJob(inventoryJob)).toBe(true);
    });

    it('returns false for non-inventory jobs', () => {
      expect(isInventoryJob(orderJob)).toBe(false);
      expect(isInventoryJob(messageJob)).toBe(false);
      expect(isInventoryJob(analyticsJob)).toBe(false);
    });

    it('matches all stock type variants', () => {
      const types = ['stock:reserve', 'stock:release', 'stock:update'] as const;
      for (const type of types) {
        const job: InventoryJobData = { ...inventoryJob, type };
        expect(isInventoryJob(job)).toBe(true);
      }
    });
  });

  describe('isAnalyticsJob()', () => {
    it('correctly identifies AnalyticsJobData', () => {
      expect(isAnalyticsJob(analyticsJob)).toBe(true);
    });

    it('returns false for non-analytics jobs', () => {
      expect(isAnalyticsJob(orderJob)).toBe(false);
      expect(isAnalyticsJob(messageJob)).toBe(false);
      expect(isAnalyticsJob(inventoryJob)).toBe(false);
    });

    it('matches all analytics type variants', () => {
      const types = ['analytics:order', 'analytics:live', 'analytics:daily'] as const;
      for (const type of types) {
        const job: AnalyticsJobData = { ...analyticsJob, type };
        expect(isAnalyticsJob(job)).toBe(true);
      }
    });
  });

  describe('Job data shapes — required fields', () => {
    it('OrderJobData has required fields: type, orderId, shopId, customerId', () => {
      expect(orderJob.type).toBe('order:created');
      expect(orderJob.orderId).toBe('order-1');
      expect(orderJob.shopId).toBe('shop-1');
      expect(orderJob.customerId).toBe('customer-1');
    });

    it('MessageJobData has required fields: type, shopId, customerId, content', () => {
      expect(messageJob.type).toBe('message:send');
      expect(messageJob.shopId).toBe('shop-1');
      expect(messageJob.customerId).toBe('customer-1');
      expect(messageJob.content).toBe('Hello');
    });

    it('InventoryJobData has required fields: type, shopId, variantId, quantity', () => {
      expect(inventoryJob.type).toBe('stock:reserve');
      expect(inventoryJob.shopId).toBe('shop-1');
      expect(inventoryJob.variantId).toBe('variant-1');
      expect(inventoryJob.quantity).toBe(5);
    });

    it('AnalyticsJobData has required fields: type, shopId, eventData', () => {
      expect(analyticsJob.type).toBe('analytics:order');
      expect(analyticsJob.shopId).toBe('shop-1');
      expect(analyticsJob.eventData).toEqual({ revenue: 100 });
    });
  });

  describe('AnyJobData union type — type guards are exhaustive', () => {
    it('every job is identified by exactly one type guard', () => {
      const jobs: AnyJobData[] = [orderJob, messageJob, inventoryJob, analyticsJob];
      const guards = [isOrderJob, isMessageJob, isInventoryJob, isAnalyticsJob];

      for (const job of jobs) {
        const matchCount = guards.filter((g) => g(job)).length;
        expect(matchCount).toBe(1);
      }
    });
  });

  describe('InventoryJobData — optional orderId field', () => {
    it('accepts orderId when provided', () => {
      const job: InventoryJobData = { ...inventoryJob, orderId: 'order-123' };
      expect(job.orderId).toBe('order-123');
      expect(isInventoryJob(job)).toBe(true);
    });

    it('works without orderId (optional)', () => {
      const job: InventoryJobData = { type: 'stock:update', shopId: 'shop-1', variantId: 'v-1', quantity: 10 };
      expect(isInventoryJob(job)).toBe(true);
    });
  });

  describe('MessageJobData — optional fbPageId field', () => {
    it('accepts fbPageId when provided', () => {
      const job: MessageJobData = { ...messageJob, fbPageId: 'fb-page-1' };
      expect(job.fbPageId).toBe('fb-page-1');
      expect(isMessageJob(job)).toBe(true);
    });
  });
});
