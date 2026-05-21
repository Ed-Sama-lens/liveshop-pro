import { describe, it, expect } from 'vitest';
import {
  groupBookingsForOrderItems,
  type ConfirmedBookingSnapshot,
} from '@/lib/sale/booking-rules';

/**
 * Order item grouping invariants — Tier 3.9-W6 (2026-05-22).
 *
 * Locks the (productId, variantId, unitPrice) consolidation behavior
 * Boss observed in UI smoke 2026-05-22 (KAI x1 shown in Order #ORD-000001).
 *
 * Without these tests, future refactor of groupBookingsForOrderItems
 * could silently lose data or duplicate OrderItems. Boss called this
 * out as "data loss" risk during smoke — these invariants prove the
 * grouping is by design + correct.
 *
 * Pure-function tests. No DB. No Prisma. No mock.
 */

function snapshot(
  id: string,
  productId: string,
  variantId: string,
  quantity: number,
  unitPrice: string
): ConfirmedBookingSnapshot {
  return {
    id,
    status: 'CONFIRMED',
    productId,
    variantId,
    quantity,
    unitPrice,
  };
}

describe('groupBookingsForOrderItems — Tier 3.9-W6 invariants', () => {
  describe('single-booking baseline', () => {
    it('1 booking → 1 OrderItemGroup with same productId/variantId/qty/unitPrice', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI-default', 1, '1.00'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        productId: 'prod-KAI',
        variantId: 'var-KAI-default',
        quantity: 1,
        unitPrice: '1.00',
        sourceBookingIds: ['b1'],
      });
    });

    it('1 booking → totalPrice = unitPrice * quantity', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'p', 'v', 3, '5.50'),
      ]);
      expect(result[0].totalPrice).toBe('16.50');
    });
  });

  describe('same-product-variant-price grouping', () => {
    it('2 bookings with same (productId, variantId, unitPrice) → 1 OrderItemGroup', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b2', 'prod-KAI', 'var-KAI', 1, '1.00'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(2);
      expect(result[0].sourceBookingIds).toEqual(['b1', 'b2']);
    });

    it('4 bookings KAI x1 each → 1 OrderItemGroup with quantity 4', () => {
      // This is Boss's UI smoke scenario. If Boss had selected 4 KAI
      // bookings (same variant + same unitPrice), the Order would
      // correctly show ONE OrderItem with quantity 4 (not 4 separate
      // rows, not 1 row with data loss).
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b2', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b3', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b4', 'prod-KAI', 'var-KAI', 1, '1.00'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(4);
      expect(result[0].totalPrice).toBe('4.00');
      expect(result[0].sourceBookingIds).toHaveLength(4);
    });

    it('3 bookings KAI x2 each → 1 OrderItemGroup with quantity 6', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 2, '1.00'),
        snapshot('b2', 'prod-KAI', 'var-KAI', 2, '1.00'),
        snapshot('b3', 'prod-KAI', 'var-KAI', 2, '1.00'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(6);
      expect(result[0].totalPrice).toBe('6.00');
    });
  });

  describe('different-variant splitting', () => {
    it('2 bookings same product different variants → 2 OrderItemGroups', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod', 'var-S', 1, '1.00'),
        snapshot('b2', 'prod', 'var-L', 1, '1.00'),
      ]);
      expect(result).toHaveLength(2);
    });

    it('different products → distinct OrderItemGroups', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b2', 'prod-CCTV', 'var-CCTV', 1, '5.00'),
      ]);
      expect(result).toHaveLength(2);
      const codes = result.map((r) => r.productId).sort();
      expect(codes).toEqual(['prod-CCTV', 'prod-KAI']);
    });

    it('different unitPrice on same variant → SEPARATE groups (price-override scenario)', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b2', 'prod-KAI', 'var-KAI', 1, '0.50'), // priceOverride applied later
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe('mixed scenarios', () => {
    it('mixed: 2 KAI same price + 1 CCTV + 1 KAI different price → 3 OrderItemGroups', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b2', 'prod-KAI', 'var-KAI', 1, '1.00'),
        snapshot('b3', 'prod-CCTV', 'var-CCTV', 1, '5.00'),
        snapshot('b4', 'prod-KAI', 'var-KAI', 1, '0.50'),
      ]);
      expect(result).toHaveLength(3);
      const kaiFull = result.find((r) => r.productId === 'prod-KAI' && r.unitPrice === '1.00');
      expect(kaiFull?.quantity).toBe(2);
      const kaiDiscount = result.find((r) => r.productId === 'prod-KAI' && r.unitPrice === '0.50');
      expect(kaiDiscount?.quantity).toBe(1);
      const cctv = result.find((r) => r.productId === 'prod-CCTV');
      expect(cctv?.quantity).toBe(1);
    });
  });

  describe('order preservation invariant', () => {
    it('output order is stable: groups appear in first-seen order', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'prod-A', 'var-A', 1, '1.00'),
        snapshot('b2', 'prod-B', 'var-B', 1, '1.00'),
        snapshot('b3', 'prod-A', 'var-A', 1, '1.00'), // appended to first group
        snapshot('b4', 'prod-C', 'var-C', 1, '1.00'),
      ]);
      expect(result.map((r) => r.productId)).toEqual(['prod-A', 'prod-B', 'prod-C']);
    });
  });

  describe('no-data-loss invariant (Boss D2 lock)', () => {
    it('total quantity across all groups equals total of input bookings', () => {
      const inputs = [
        snapshot('b1', 'prod-A', 'var-A', 1, '1.00'),
        snapshot('b2', 'prod-A', 'var-A', 1, '1.00'),
        snapshot('b3', 'prod-B', 'var-B', 2, '2.00'),
        snapshot('b4', 'prod-C', 'var-C', 3, '3.00'),
      ];
      const result = groupBookingsForOrderItems(inputs);
      const totalInputQty = inputs.reduce((sum, b) => sum + b.quantity, 0);
      const totalOutputQty = result.reduce((sum, g) => sum + g.quantity, 0);
      expect(totalOutputQty).toBe(totalInputQty);
    });

    it('every booking id appears in exactly one group sourceBookingIds', () => {
      const inputs = [
        snapshot('b1', 'prod-A', 'var-A', 1, '1.00'),
        snapshot('b2', 'prod-A', 'var-A', 1, '1.00'),
        snapshot('b3', 'prod-B', 'var-B', 1, '1.00'),
      ];
      const result = groupBookingsForOrderItems(inputs);
      const allIds = result.flatMap((g) => g.sourceBookingIds);
      expect(allIds.sort()).toEqual(['b1', 'b2', 'b3']);
      const idSet = new Set(allIds);
      expect(idSet.size).toBe(allIds.length); // no duplicate id
    });

    it('total amount across groups equals sum of all booking line totals', () => {
      const inputs = [
        snapshot('b1', 'prod-A', 'var-A', 2, '3.00'), // line 6.00
        snapshot('b2', 'prod-A', 'var-A', 1, '3.00'), // line 3.00, joins b1 → group 9.00
        snapshot('b3', 'prod-B', 'var-B', 1, '5.00'), // line 5.00
      ];
      const result = groupBookingsForOrderItems(inputs);
      const totalAmount = result.reduce((sum, g) => sum + Number(g.totalPrice), 0);
      expect(totalAmount).toBe(14);
    });
  });

  describe('edge cases', () => {
    it('empty input → empty array', () => {
      expect(groupBookingsForOrderItems([])).toEqual([]);
    });

    it('frozen output (immutability)', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'p', 'v', 1, '1.00'),
      ]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result[0])).toBe(true);
    });

    it('preserves decimal precision in totalPrice', () => {
      const result = groupBookingsForOrderItems([
        snapshot('b1', 'p', 'v', 3, '0.33'),
      ]);
      // 0.33 * 3 = 0.99 exactly with 2-dp
      expect(result[0].totalPrice).toBe('0.99');
    });
  });
});
