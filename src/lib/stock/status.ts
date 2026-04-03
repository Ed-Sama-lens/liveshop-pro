export type StockStatus = 'OUT_OF_STOCK' | 'PARTIAL' | 'FULL';

/**
 * Determine stock status from quantity and reserved count.
 * OUT_OF_STOCK: available (quantity - reservedQty) <= 0
 * PARTIAL: available > 0 AND reservedQty > 0 (some items reserved)
 * FULL: quantity > 0 AND reservedQty === 0 (full stock, nothing reserved)
 * Edge case: quantity === 0 AND reservedQty === 0 → OUT_OF_STOCK
 */
export function getStockStatus(quantity: number, reservedQty: number): StockStatus {
  const available = quantity - reservedQty;

  if (available <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (reservedQty > 0) {
    return 'PARTIAL';
  }

  return 'FULL';
}

export const STOCK_STATUS_COLOR: Readonly<Record<StockStatus, string>> = Object.freeze({
  OUT_OF_STOCK: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950',
  PARTIAL: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950',
  FULL: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
});

export const STOCK_STATUS_LABEL: Readonly<Record<StockStatus, string>> = Object.freeze({
  OUT_OF_STOCK: 'Out of Stock',
  PARTIAL: 'Partially Reserved',
  FULL: 'In Stock',
});
